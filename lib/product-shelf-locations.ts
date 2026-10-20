import { query, withTransaction } from '@/lib/mysql';
import { checkApprovalRequired, submitToApprovalQueue } from '@/lib/approvals';
import {
  assertProductInScope,
  BranchResolutionError,
  type BranchScope,
} from '@/lib/branch-context';

export type ShelfLocationUpdate = {
  productId: string;
  shelfLocationId?: string | null;
  sourceShelfId?: string | null;
  targetShelfId?: string | null;
  quantity?: number;
};

/**
 * Branch-guarded shelf-location batch - the TRUSTED entry point.
 *
 * This module deliberately has NO 'use server' directive: it is not an HTTP
 * endpoint, so `scope` can only come from server code that resolved it itself.
 * Today the only caller is the public `updateProductShelfLocations` action,
 * which passes the signed session's scope. Phase 2c Task 7 adds a second
 * trusted caller: the approval processor, passing a scope derived from the
 * queue row's DB-stored created_by. Never re-export this from a 'use server'
 * file: every parameter of a server action is attacker-controlled, and
 * `{ scope: 'all' }` would bypass the guard.
 *
 * ALL-OR-NOTHING: every distinct target product is asserted BEFORE the
 * approval queue is touched and BEFORE the transaction opens, so one
 * out-of-branch target refuses the whole batch and writes nothing (a partial
 * apply would leave a half-done move with no record of what was skipped).
 * `scope === null` means "no trustworthy identity" and the batch proceeds
 * exactly as before the guard existed (never fail closed). A refusal returns
 * `{ success: false, message }`; it never throws. isInternalFinalization is
 * caller-settable, so it is not a trust boundary and does not exempt the check.
 */
export async function updateProductShelfLocationsWithScope(
  updates: ShelfLocationUpdate[],
  userId: string,
  isInternalFinalization: boolean,
  scope: BranchScope | null,
) {
  try {
    if (scope) {
      const productIds = [...new Set(updates.map((u) => u.productId))];
      for (const productId of productIds) {
        await assertProductInScope(productId, scope);
      }
    }

    if (!isInternalFinalization) {
      const isApprovalRequired = await checkApprovalRequired('SHELF_TRANSFER');
      if (isApprovalRequired) {
          // Enrich data for approval
          const enrichedUpdates = await Promise.all(updates.map(async u => {
              const pRows: any = await query('SELECT name, sku, barcode, stock FROM products WHERE id = ?', [u.productId]);
              const p = pRows[0];
              
              let sourceName = 'Unassigned';
              if (u.sourceShelfId && u.sourceShelfId !== 'unassigned') {
                  const sRows: any = await query('SELECT name FROM shelf_locations WHERE id = ?', [u.sourceShelfId]);
                  sourceName = sRows[0]?.name || u.sourceShelfId;
              }
              
              let targetName = 'Unassigned';
              if (u.targetShelfId && u.targetShelfId !== 'unassigned') {
                  const tRows: any = await query('SELECT name FROM shelf_locations WHERE id = ?', [u.targetShelfId]);
                  targetName = tRows[0]?.name || u.targetShelfId;
              }

              return {
                  ...u,
                  productName: p?.name || 'Unknown',
                  productSku: p?.sku || '',
                  productBarcode: p?.barcode || '',
                  sourceShelfName: sourceName,
                  targetShelfName: targetName,
              };
          }));

          const { queueId, pendingApproval } = await submitToApprovalQueue('SHELF_TRANSFER', {
              updates: enrichedUpdates,
              items: enrichedUpdates.map(u => ({
                  productId: u.productId,
                  productName: u.productName,
                  sku: u.productSku,
                  barcode: u.productBarcode,
                  quantity: u.quantity,
                  sourceShelfName: u.sourceShelfName,
                  targetShelfName: u.targetShelfName,
                  notes: `Transfer from ${u.sourceShelfName} to ${u.targetShelfName}`
              }))
          }, userId);

          if (pendingApproval) {
              return { success: true, pendingApproval: true, queueId, message: 'Shelf transfer submitted for approval.' };
          }
      }
    }

    await withTransaction(async (connection) => {
      for (const update of updates) {
        // Handle Legacy/Bulk move (entire stock to a new shelf or unassigned)
        if (update.shelfLocationId !== undefined) {
          // Clear all existing shelf assignments for this product
          await connection.query('DELETE FROM product_shelves WHERE product_id = ?', [update.productId]);
          
          // Update the legacy column as well for backward compatibility
          await connection.query('UPDATE products SET shelf_location_id = ? WHERE id = ?', [update.shelfLocationId, update.productId]);

          // Add new assignment if not unassigned
          if (update.shelfLocationId && update.shelfLocationId !== 'unassigned' && update.shelfLocationId !== 'none') {
            const [product]: any = await connection.query('SELECT stock FROM products WHERE id = ?', [update.productId]);
            const stock = (product as any[])[0]?.stock || 0;
            await connection.query('INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)', [update.productId, update.shelfLocationId, stock]);
          }
          continue;
        }

        // Handle Partial Transfer
        const { productId, sourceShelfId, targetShelfId, quantity = 0 } = update;
        if (quantity <= 0) continue;

        // 1. Decrement from source (if not unassigned)
        if (sourceShelfId && sourceShelfId !== 'unassigned') {
          await connection.query(
            'UPDATE product_shelves SET quantity = quantity - ? WHERE product_id = ? AND shelf_id = ?',
            [quantity, productId, sourceShelfId]
          );
          // Clean up 0 quantity records
          await connection.query('DELETE FROM product_shelves WHERE product_id = ? AND shelf_id = ? AND quantity <= 0', [productId, sourceShelfId]);
        }

        // 2. Increment target (if not unassigned)
        if (targetShelfId && targetShelfId !== 'unassigned') {
          const [existingRows]: any = await connection.query(
            'SELECT quantity FROM product_shelves WHERE product_id = ? AND shelf_id = ?',
            [productId, targetShelfId]
          );

          if ((existingRows as any[]).length > 0) {
            await connection.query(
              'UPDATE product_shelves SET quantity = quantity + ? WHERE product_id = ? AND shelf_id = ?',
              [quantity, productId, targetShelfId]
            );
          } else {
            await connection.query(
              'INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)',
              [productId, targetShelfId, quantity]
            );
          }
        }

        // 3. Update legacy shelf_location_id on products table
        // We'll set it to the shelf with the highest quantity, or null if no shelves remain
        const [remainingRows]: any = await connection.query(
          'SELECT shelf_id FROM product_shelves WHERE product_id = ? ORDER BY quantity DESC LIMIT 1',
          [productId]
        );
        const topShelf = (remainingRows as any[]).length > 0 ? (remainingRows as any[])[0].shelf_id : null;
        await connection.query('UPDATE products SET shelf_location_id = ? WHERE id = ?', [topShelf, productId]);

        // 4. Record stock movement for the transfer
        const movementId = `mov_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const [pInfo]: any = await connection.query('SELECT name FROM products WHERE id = ?', [productId]);
        const pName = (pInfo as any[])[0]?.name || 'Unknown Product';
        
        let sourceName = 'Unassigned';
        if (sourceShelfId && sourceShelfId !== 'unassigned') {
            const [sInfo]: any = await connection.query('SELECT name FROM shelf_locations WHERE id = ?', [sourceShelfId]);
            sourceName = (sInfo as any[])[0]?.name || sourceShelfId;
        }

        let targetName = 'Unassigned';
        if (targetShelfId && targetShelfId !== 'unassigned') {
            const [tInfo]: any = await connection.query('SELECT name FROM shelf_locations WHERE id = ?', [targetShelfId]);
            targetName = (tInfo as any[])[0]?.name || targetShelfId;
        }

        await connection.query(
          `INSERT INTO stock_movements (
            id, product_id, product_name, movement_type, quantity_change, previous_stock, new_stock,
            reference_id, reference_type, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            movementId, productId, pName, 'transfer', 0, 0, 0, 
            productId, 'shelf_transfer', `Shelf Transfer: ${sourceName} -> ${targetName} (${quantity} units)`
          ]
        );
      }
    });
    return { success: true };
  } catch (error) {
    if (error instanceof BranchResolutionError) {
      return { success: false, message: error.message };
    }
    console.error('Error updating product shelf locations:', error);
    return { success: false, message: 'Internal server error' };
  }
}
