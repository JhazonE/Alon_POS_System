import { checkApprovalRequired, submitToApprovalQueue } from '@/lib/approvals';
import { query, withTransaction } from '@/lib/mysql';
import {
  assertProductInScope,
  BranchResolutionError,
  type BranchScope,
} from '@/lib/branch-context';
import { deductFamilyStock, addFamilyStock, findUltimateRoot } from '@/lib/family-sync';

/** Converts a branch refusal into the action's own failure shape; null for any other error. */
function branchRefusal(error: unknown): { success: false; error: string } | null {
  if (error instanceof BranchResolutionError) {
    return { success: false, error: error.message };
  }
  return null;
}

/**
 * Branch-guarded stock adjustment - the TRUSTED entry point.
 *
 * This module deliberately has NO 'use server' directive: it is not an HTTP
 * endpoint, so `scope` can only come from server code that resolved it itself.
 * Today the only caller is the public `adjustStock` action, which passes the
 * signed session's scope. Phase 2c Task 7 adds a second trusted caller: the
 * approval processor, passing a scope derived from the queue row's DB-stored
 * created_by. Never re-export this from a 'use server' file: every parameter
 * of a server action is attacker-controlled, and `{ scope: 'all' }` would
 * bypass the guard.
 *
 * `scope === null` means "no trustworthy identity" and the adjustment proceeds
 * exactly as before the guard existed (never fail closed). `userId` is
 * attribution only and is NEVER used to derive a branch. Only the TARGET
 * product is asserted; family sync writes related members too, but
 * cross-warehouse family links do not exist in practice (Phase 2b), so members
 * are deliberately not asserted. isInternalFinalization is caller-settable, so
 * it is not a trust boundary and does not exempt the check. A refusal returns
 * `{ success: false, error }`; it never throws.
 */
export async function adjustStockWithScope(
  productId: string,
  quantity: number,
  reason: string,
  userId: string,
  isInternalFinalization: boolean,
  expirationDate: string | null | undefined,
  scope: BranchScope | null,
) {
  try {
    if (scope) {
      await assertProductInScope(productId, scope);
    }

    // 1. Check if multi-level approval is required
    const isApprovalRequired = !isInternalFinalization && await checkApprovalRequired('STOCK_ADJUSTMENT');
    
    if (isApprovalRequired) {
      // Get product info for enrichment
      const productInfoRes: any = await query(`
        SELECT p.name, p.stock, p.sku, p.barcode, w.name as warehouse_name, s.name as shelf_name
        FROM products p
        LEFT JOIN warehouses w ON p.warehouse_id = w.id
        LEFT JOIN shelf_locations s ON p.shelf_location_id = s.id
        WHERE p.id = ?
      `, [productId]);
      const productInfo = productInfoRes[0] || { name: 'Unknown', stock: 0, sku: '', barcode: '', warehouse_name: null, shelf_name: null };

      // Submit to approval queue instead of executing
      console.log('Stock adjustment submitted for approval:', { productId, quantity, reason });
      const { queueId, pendingApproval } = await submitToApprovalQueue('STOCK_ADJUSTMENT', {
        productId,
        quantity,
        reason,
        productName: productInfo.name,
        productSku: productInfo.sku,
        productBarcode: productInfo.barcode,
        warehouseName: productInfo.warehouse_name,
        shelfName: productInfo.shelf_name,
        currentStock: parseInt(productInfo.stock || 0),
        expirationDate: expirationDate || null
      }, userId);
      
      if (pendingApproval) {
        return { success: true, pendingApproval: true, queueId };
      }
      // If not pending (all steps auto-skipped), fall through to immediate execution
    }

    // Get current stock and product info
    const productResult = await query('SELECT stock, name, parent_id FROM products WHERE id = ?', [productId]);

    if (productResult.length === 0) {
      return { success: false, error: 'Product not found' };
    }

    const currentStock = parseInt(productResult[0].stock);
    const productName = productResult[0].name;
    const parentId = productResult[0].parent_id;
    const newStock = currentStock + quantity;

    // Validate new stock is not negative
    if (newStock < 0) {
      return { success: false, error: 'Stock cannot go below zero' };
    }

    // Create stock adjustment record ID (used as the reference for movements)
    const adjustmentId = `adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create stock adjustment record for the main product (before we update stock)
    const createAdjustmentSql = `
      INSERT INTO stock_adjustments (id, product_id, quantity, reason, new_stock)
      VALUES (?, ?, ?, ?, ?)
    `;
    await query(createAdjustmentSql, [adjustmentId, productId, quantity, reason, newStock]);

    // Use recursive family sync within a transaction so all levels update atomically
    const result = await withTransaction(async (connection) => {
      // Walk the FULL ancestor chain (handles grandchildren, any depth)
      const { rootId, factorToRoot } = await findUltimateRoot(productId, connection);

      if (factorToRoot > 1 || rootId !== productId) {
        // This product is NOT the root — convert to root units and sync from root
        const rootQty = Math.abs(quantity) / factorToRoot;
        if (quantity < 0) {
          await deductFamilyStock(rootId, rootQty, adjustmentId, 'adjustment', reason, connection);
        } else {
          await addFamilyStock(rootId, rootQty, adjustmentId, 'adjustment', reason, connection, 0, expirationDate, productId);
        }
      } else {
        // This IS the root — propagate down through all descendants
        if (quantity < 0) {
          await deductFamilyStock(productId, Math.abs(quantity), adjustmentId, 'adjustment', reason, connection);
        } else {
          await addFamilyStock(productId, quantity, adjustmentId, 'adjustment', reason, connection, 0, expirationDate, productId);
        }
      }
      return { success: true, adjustmentId, newStock };
    });

    return result;
  } catch (error) {
    const refused = branchRefusal(error);
    if (refused) return refused;
    console.error('Error adjusting stock:', error);
    return { success: false, error: 'Failed to adjust stock' };
  }
}
