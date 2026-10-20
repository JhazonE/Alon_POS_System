import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { v4 as uuidv4 } from 'uuid';
import { adjustStockWithScope } from '@/lib/stock-adjust';
import { updateProductShelfLocationsWithScope } from '@/lib/product-shelf-locations';
import { addProductWithScope } from '@/lib/product-create';
import { submitPriceUpdateBatchWithScope } from '@/lib/price-update-batch';
import { resolveScopeForUid, BranchResolutionError, type BranchScope } from '@/lib/branch-context';
import { processPurchaseOrderCreation, processPurchaseOrderReceipt } from '@/lib/purchase-actions';
import { processBadOrderCreation } from '@/lib/bad-order-actions';
import { processTransferStock } from '@/lib/transfer-actions';
import { processCompleteStockCount } from '@/lib/stock-count-actions';

/**
 * The branch a queued item is finalized under: the REQUESTER's, not the
 * approver's. The write belongs to the branch that asked for it, so a
 * head-office approver finalizing a branch-A item writes into branch A, and an
 * approver from branch B is not refused. The approver's own branch is
 * deliberately never asserted here.
 *
 * `createdBy` is read from the approval_queue row in the DATABASE, never from
 * the request body, so it is server-derived and as trustworthy as a session
 * uid. (isInternalFinalization is NOT a trust boundary; a caller sets it.)
 *
 * FAIL CLOSED: a creator who cannot be resolved (deleted, branchless, inactive
 * branch, or the 'system' placeholder) refuses the item with a clear message
 * instead of falling back to unguarded. We can no longer prove which branch
 * the write belongs to, and an unguarded fallback would let such a row write
 * into any branch. The item stays Pending (the transaction rolls back), so an
 * admin can Reject it.
 */
async function scopeForQueuedItem(
  createdBy: string,
): Promise<{ scope: BranchScope } | { error: string }> {
  try {
    return { scope: await resolveScopeForUid(createdBy) };
  } catch (error) {
    if (error instanceof BranchResolutionError) {
      return {
        error: `Cannot determine the requesting branch for this item (${error.message}). Reject it and have it re-submitted.`,
      };
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { queueId, action, userId, notes } = await request.json();

    if (!queueId || !action || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    return await withTransaction(async (connection) => {
      // 1. Get the queue item
      const [queueItems]: any = await connection.query(
        'SELECT * FROM approval_queue WHERE id = ?',
        [queueId]
      );

      if (!queueItems || queueItems.length === 0) {
        throw new Error('Approval request not found');
      }

      const item = queueItems[0];
      if (item.status !== 'Pending') {
        throw new Error('This request has already been processed');
      }

      // 2. Get the current workflow step
      const [steps]: any = await connection.query(
        'SELECT * FROM approval_workflows WHERE transaction_type = ? AND step_order = ?',
        [item.transaction_type, item.current_step]
      );

      if (!steps || steps.length === 0) {
        throw new Error('Workflow step configuration not found');
      }

      const workflowStep = steps[0];

      // 3. Verify user has the required role
      const [users]: any = await connection.query(`
        SELECT u.username, ut.id as roleId, ut.name as roleName
        FROM users u 
        LEFT JOIN user_types ut ON u.user_type = ut.id OR u.user_type = ut.name
        WHERE u.uid = ?
      `, [userId]);

      if (!users || users.length === 0) {
        throw new Error('User not found');
      }
      
      const currentUserRole = users[0].roleId;
      const isAdmin = users[0].username === 'admin' || users[0].roleName === 'Admin' || users[0].roleName === 'Super Admin';

      if (!isAdmin && currentUserRole !== workflowStep.user_type_id) {
        // Find role names for better error message
        const [requiredRoles]: any = await connection.query('SELECT name FROM user_types WHERE id = ?', [workflowStep.user_type_id]);
        const requiredRoleName = requiredRoles[0]?.name || 'Unknown';
        throw new Error(`Permission denied. This step requires ${requiredRoleName} approval.`);
      }

      // 4. Record history
      await connection.query(
        'INSERT INTO approval_history (id, approval_queue_id, user_id, action, notes, step_number) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), queueId, userId, action, notes || '', item.current_step]
      );

      if (action === 'Reject') {
        await connection.query(
          "UPDATE approval_queue SET status = 'Rejected' WHERE id = ?",
          [queueId]
        );
        return NextResponse.json({ success: true, status: 'Rejected' });
      }

      // 5. Handle Approval
      // Check if there are more steps
      const [nextSteps]: any = await connection.query(
        'SELECT id FROM approval_workflows WHERE transaction_type = ? AND step_order > ? ORDER BY step_order ASC LIMIT 1',
        [item.transaction_type, item.current_step]
      );

      if (nextSteps && nextSteps.length > 0) {
        // Move to next step
        await connection.query(
          'UPDATE approval_queue SET current_step = current_step + 1 WHERE id = ?',
          [queueId]
        );
        return NextResponse.json({ success: true, status: 'Moved to next step', nextStep: item.current_step + 1 });
      } else {
        // Final Approval! Execute the transaction.
        const txData = typeof item.transaction_data === 'string' ? JSON.parse(item.transaction_data) : item.transaction_data;
        
        console.log(`Final approval reached for ${item.transaction_type}. Executing...`);
        
        let result = { success: false, error: 'Unknown transaction type' };
        
        if (item.transaction_type === 'STOCK_ADJUSTMENT') {
          // Check if this is a transfer handled within the adjustment flow (fallback)
          if (txData.adjustmentType === 'transfer' && (txData.targetWarehouseId || txData.toWarehouseId)) {
            const transferRequest = {
              sourceWarehouseId: txData.warehouseId || txData.fromWarehouseId,
              targetWarehouseId: txData.targetWarehouseId || txData.toWarehouseId,
              transferDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
              reference: txData.referenceNo || 'BULK-TRF-FINAL',
              notes: txData.reason || 'Processed from Bulk Adjustment',
              items: [{
                productId: txData.productId,
                productName: txData.productName || 'Unknown',
                quantity: txData.quantity
              }]
            };
            const trfResult = await processTransferStock(transferRequest);
            result = { success: trfResult.success, error: trfResult.error || '' };
          } else {
            // Safety: If it's a removal but quantity is somehow positive, flip it
            let adjQty = txData.quantity;
            if (txData.adjustmentType === 'remove' && adjQty > 0) {
              adjQty = -adjQty;
            }
            const resolved = await scopeForQueuedItem(item.created_by);
            if ('error' in resolved) {
              result = { success: false, error: resolved.error };
            } else {
              const adjResult = await adjustStockWithScope(txData.productId, adjQty, txData.reason, item.created_by, true, txData.expirationDate || null, resolved.scope);
              result = { success: adjResult.success, error: (adjResult as any).error || '' };
            }
          }
        } else if (item.transaction_type === 'PURCHASE_ORDER') {
          const poResult = await processPurchaseOrderCreation({ ...txData, isInternalFinalization: true }, item.created_by);
          result = { success: poResult.success, error: (poResult as any).error || '' };
        } else if (item.transaction_type === 'RECEIVE_PO') {
          if (txData.id) {
            // Receipt of existing PO
            const rcptResult = await processPurchaseOrderReceipt(txData.id, txData, item.created_by);
            result = { success: rcptResult.success, error: (rcptResult as any).error || '' };
          } else {
            // Direct receipt (creation + receipt)
            const poResult = await processPurchaseOrderCreation({ ...txData, isInternalFinalization: true }, item.created_by);
            result = { success: poResult.success, error: (poResult as any).error || '' };
          }
        } else if (item.transaction_type === 'BAD_ORDER') {
          const boResult = await processBadOrderCreation({ ...txData, isInternalFinalization: true }, item.created_by);
          result = { success: boResult.success, error: (boResult as any).error || '' };
        } else if (item.transaction_type === 'STOCK_TRANSFER') {
          const trfResult = await processTransferStock({ ...txData, isInternalFinalization: true });
          result = { success: trfResult.success, error: trfResult.error || '' };
        } else if (item.transaction_type === 'STOCK_COUNT') {
          const scResult = await processCompleteStockCount(txData.stockCountId);
          result = { success: scResult.success, error: scResult.error || '' };
        } else if (item.transaction_type === 'SHELF_TRANSFER') {
          const resolved = await scopeForQueuedItem(item.created_by);
          if ('error' in resolved) {
            result = { success: false, error: resolved.error };
          } else {
            const stResult = await updateProductShelfLocationsWithScope(
              txData.updates,
              item.created_by,
              true, // isInternalFinalization
              resolved.scope
            );
            result = { success: stResult.success, error: (stResult as any).message || '' };
          }
        } else if (item.transaction_type === 'PRODUCT_CREATE') {
          const resolved = await scopeForQueuedItem(item.created_by);
          if ('error' in resolved) {
            result = { success: false, error: resolved.error };
          } else {
            const apResult = await addProductWithScope(txData, item.created_by, true, resolved.scope);
            result = { success: apResult.success, error: (apResult as any).message || '' };
          }
        } else if (item.transaction_type === 'PRICE_UPDATE') {
          const resolved = await scopeForQueuedItem(item.created_by);
          if ('error' in resolved) {
            result = { success: false, error: resolved.error };
          } else {
            const puResult = await submitPriceUpdateBatchWithScope(txData.warehouseId, txData.items, item.created_by, true, resolved.scope);
            result = { success: puResult.success, error: (puResult as any).message || '' };
          }
        }

        if (!result.success) {
          throw new Error('Finalization failed: ' + (result as any).error);
        }

        await connection.query(
          "UPDATE approval_queue SET status = 'Approved' WHERE id = ?",
          [queueId]
        );

        return NextResponse.json({ success: true, status: 'Finalized' });
      }
    });
  } catch (error: any) {
    console.error('Error processing approval:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
