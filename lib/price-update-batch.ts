import { withTransaction } from '@/lib/mysql';
import { checkApprovalRequired, submitToApprovalQueue } from '@/lib/approvals';
import { applyAdjustment, isValidPriceValue, type AdjustmentType } from '@/lib/price-update-math';
import { syncBaseSellingUnit } from '@/lib/selling-unit-sync';
import {
  assertProductInScope,
  BranchResolutionError,
  type BranchScope,
} from '@/lib/branch-context';

export interface PriceUpdateItem {
  productId: string;
  sku: string;
  barcode: string;
  productName: string;
  field: 'price' | 'cost' | 'priceLevel';
  priceLevelId?: string;
  priceLevelName?: string;
  oldValue: number;
  newValue: number;
  adjustmentType: AdjustmentType;
  adjustmentValue: number;
}

export interface PriceUpdateResult {
  success: boolean;
  pendingApproval?: boolean;
  queueId?: string | null;
  applied?: number;
  skipped?: { productId: string; productName: string; reason: string }[];
  message?: string;
}

/**
 * Branch-guarded price-update batch - the TRUSTED entry point.
 *
 * This module deliberately has NO 'use server' directive: it is not an HTTP
 * endpoint, so `scope` can only come from server code that resolved it itself.
 * Today the only caller is the public `submitPriceUpdateBatch` action, which
 * passes the signed session's scope. Phase 2c Task 7 adds a second trusted
 * caller: the approval processor, passing a scope derived from the queue row's
 * DB-stored created_by. Never re-export this from a 'use server' file: every
 * parameter of a server action is attacker-controlled, and `{ scope: 'all' }`
 * would bypass the guard.
 *
 * ALL-OR-NOTHING: every distinct target product is asserted BEFORE the
 * approval queue is touched and BEFORE the transaction opens, so one
 * out-of-branch (or unknown) target refuses the whole batch and writes
 * nothing (a partial apply would leave a half-done price update with no
 * record of what was skipped). `scope === null` means "no trustworthy
 * identity" and the batch proceeds exactly as before the guard existed (never
 * fail closed). A refusal returns `{ success: false, message }`; it never
 * throws. isInternalFinalization is caller-settable, so it is not a trust
 * boundary and does not exempt the check.
 */
export async function submitPriceUpdateBatchWithScope(
  warehouseId: string,
  items: PriceUpdateItem[],
  userId: string,
  isInternalFinalization: boolean,
  scope: BranchScope | null,
): Promise<PriceUpdateResult> {
  if (!items || items.length === 0) {
    return { success: false, message: 'No products selected.' };
  }

  try {
    if (scope) {
      const productIds = [...new Set(items.map((item) => item.productId))];
      for (const productId of productIds) {
        await assertProductInScope(productId, scope);
      }
    }
  } catch (error) {
    if (error instanceof BranchResolutionError) {
      return { success: false, message: error.message };
    }
    throw error;
  }

  if (!isInternalFinalization) {
    const isApprovalRequired = await checkApprovalRequired('PRICE_UPDATE');
    if (isApprovalRequired) {
      const { queueId, pendingApproval } = await submitToApprovalQueue(
        'PRICE_UPDATE',
        { warehouseId, items },
        userId,
      );
      if (pendingApproval) {
        return {
          success: true,
          pendingApproval: true,
          queueId,
          message: `Price update for ${items.length} product(s) submitted for approval.`,
        };
      }
      // All steps auto-skipped (creator can approve their own step) -> fall through to immediate apply.
    }
  }

  return applyPriceUpdateBatch(items);
}

async function applyPriceUpdateBatch(items: PriceUpdateItem[]): Promise<PriceUpdateResult> {
  const skipped: { productId: string; productName: string; reason: string }[] = [];
  let applied = 0;

  await withTransaction(async (connection) => {
    const [defaultLevelRows]: any = await connection.query(
      'SELECT id FROM price_levels WHERE is_default = 1 LIMIT 1',
    );
    const defaultLevelId: string | undefined = defaultLevelRows?.[0]?.id;

    for (const item of items) {
      const [rows]: any = await connection.query(
        'SELECT id, cost FROM products WHERE id = ?',
        [item.productId],
      );
      if (!rows || rows.length === 0) {
        skipped.push({ productId: item.productId, productName: item.productName, reason: 'Product no longer exists' });
        continue;
      }

      // Recompute at apply-time for markup-based price changes: cost may have
      // drifted since the batch was submitted (e.g. a new PO landed).
      // Percentage/fixed/exact changes are not cost-dependent, so they apply
      // the value that was already previewed.
      let newValue = item.newValue;
      if (item.adjustmentType === 'markup') {
        const liveCost = parseFloat(rows[0].cost ?? 0);
        newValue = applyAdjustment('markup', 0, item.adjustmentValue, liveCost);
      }

      // Defense in depth: no matter which caller produced this item (drawer or
      // Excel path), and no matter whether it was valid at preview-time — cost
      // can drift between preview and apply for markup-based items — a NaN or
      // negative value must never reach the DB. Skip just this one item rather
      // than throwing and aborting the whole transaction.
      if (!isValidPriceValue(newValue)) {
        skipped.push({ productId: item.productId, productName: item.productName, reason: 'Computed price is invalid' });
        continue;
      }

      if (item.field === 'price') {
        await connection.query('UPDATE products SET price = ? WHERE id = ?', [newValue, item.productId]);
        // Keep an existing default-level price-level row in sync with the base
        // price it's meant to mirror — otherwise the Edit Product dialog's
        // Price Levels tab (and any other reader of product_price_levels)
        // shows a stale value after this update. A no-op if no such row
        // exists yet; this never creates one — that's the drawer's explicit
        // Price Level target field, not an implicit side effect of updating
        // the base price.
        if (defaultLevelId) {
          await connection.query(
            'UPDATE product_price_levels SET price = ? WHERE product_id = ? AND price_level_id = ?',
            [newValue, item.productId, defaultLevelId],
          );
        }
        // The Edit Product form hydrates from the base selling unit; keep it
        // in step or the next Edit save reverts this update.
        await syncBaseSellingUnit(connection, item.productId, {
          price: newValue,
          levelPrices: defaultLevelId ? { [defaultLevelId]: newValue } : undefined,
        });
      } else if (item.field === 'cost') {
        await connection.query('UPDATE products SET cost = ? WHERE id = ?', [newValue, item.productId]);
        await syncBaseSellingUnit(connection, item.productId, { cost: newValue });
      } else if (item.field === 'priceLevel' && item.priceLevelId) {
        // product_price_levels' primary key is (product_id, price_level_id) —
        // min_quantity is NOT part of it. A SELECT-then-branch existence check
        // filtered on min_quantity can miss an existing row (e.g. one with a
        // non-zero min_quantity set via the product's Price Levels tab), take
        // the INSERT branch, and hit a duplicate-PK error that aborts the
        // whole batch. Upsert on the real PK instead; only touch `price` on
        // conflict so an existing row's min_quantity is never silently reset.
        // The product form's Selling Units tab owns min_quantity (see
        // writeBaseUnitPriceLevels in ../actions.ts): a product Save writes it from the
        // tab, so this bulk path deliberately leaves it alone.
        await connection.query(
          `INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity)
           VALUES (?, ?, ?, 0)
           ON DUPLICATE KEY UPDATE price = VALUES(price)`,
          [item.productId, item.priceLevelId, newValue],
        );
        // Update the base unit's existing price row for this level (if the
        // tab shows one) so the next Edit save doesn't write the old value
        // back into product_price_levels. For the default level also update
        // the base unit's price, which is what the tab shows for that level
        // when no per-level row exists.
        await syncBaseSellingUnit(connection, item.productId, {
          price: item.priceLevelId === defaultLevelId ? newValue : undefined,
          levelPrices: { [item.priceLevelId]: newValue },
        });
      }
      applied++;
    }
  });

  return {
    success: true,
    applied,
    skipped,
    message: `Updated ${applied} product(s).${skipped.length ? ` ${skipped.length} skipped.` : ''}`,
  };
}
