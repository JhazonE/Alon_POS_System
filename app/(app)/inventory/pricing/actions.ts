'use server';

import { query } from '@/lib/mysql';
import { applyAdjustment, isValidPriceValue } from '@/lib/price-update-math';
import { addProduct } from '@/app/(app)/products/actions';
import { generateSku } from '@/lib/sku';
import { resolveScopeForAction, BranchResolutionError } from '@/lib/branch-context';
import {
  submitPriceUpdateBatchWithScope,
  type PriceUpdateItem,
  type PriceUpdateResult,
} from '@/lib/price-update-batch';

export type { PriceUpdateItem, PriceUpdateResult } from '@/lib/price-update-batch';

/**
 * Public server action. Its parameters are all attacker-controlled, so it
 * takes NO scope: the branch comes only from the signed session cookie
 * (null = no trustworthy identity, falls back to unguarded). The guarded,
 * all-or-nothing implementation lives in lib/price-update-batch.ts.
 */
export async function submitPriceUpdateBatch(
  warehouseId: string,
  items: PriceUpdateItem[],
  userId: string,
  isInternalFinalization: boolean = false,
): Promise<PriceUpdateResult> {
  try {
    const scope = await resolveScopeForAction('submitPriceUpdateBatch');
    return await submitPriceUpdateBatchWithScope(warehouseId, items, userId, isInternalFinalization, scope);
  } catch (error) {
    // A valid cookie of a deleted/branchless/inactive-branch user makes the scope
    // lookup throw; return the action's own failure shape rather than an unhandled error.
    if (error instanceof BranchResolutionError) return { success: false, message: error.message };
    throw error;
  }
}

export interface PriceListRow {
  sku: string;
  barcode: string;
  name?: string;
  brand?: string;
  category?: string;
  unitOfMeasure?: string;
  newPrice?: number;
  newCost?: number;
  newMarkupPct?: number;
}

export interface NewProductFromExcel {
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  category: string;
  unitOfMeasure: string;
  price: number;
  cost?: number;
}

export interface PriceListPreviewResult {
  matched: PriceUpdateItem[];
  toCreate: NewProductFromExcel[];
  skipped: { row: PriceListRow; reason: string }[];
}

export async function previewPriceListUpload(
  warehouseId: string,
  rows: PriceListRow[],
): Promise<PriceListPreviewResult> {
  const matched: PriceUpdateItem[] = [];
  const toCreate: NewProductFromExcel[] = [];
  const skipped: PriceListPreviewResult['skipped'] = [];
  const seenSkus = new Set<string>();

  for (const row of rows) {
    const sku = (row.sku || '').trim();
    const barcode = (row.barcode || '').trim();

    if (!sku && !barcode) {
      skipped.push({ row, reason: 'Missing SKU and barcode' });
      continue;
    }
    if (sku && seenSkus.has(sku)) {
      skipped.push({ row, reason: `Duplicate SKU "${sku}" (earlier row in this file superseded)` });
      continue;
    }

    let product: any;
    if (sku) {
      const bySku: any = await query(
        'SELECT id, name, sku, barcode, price, cost FROM products WHERE sku = ? AND warehouse_id = ? LIMIT 1',
        [sku, warehouseId],
      );
      product = bySku?.[0];
    }
    if (!product && barcode) {
      const byBarcode: any = await query(
        'SELECT id, name, sku, barcode, price, cost FROM products WHERE barcode = ? AND warehouse_id = ? LIMIT 1',
        [barcode, warehouseId],
      );
      product = byBarcode?.[0];
    }
    if (!product) {
      // Unmatched: with enough identity data + a price, treat this as a new
      // product to create rather than an unconditional skip. Reusing
      // `newPrice` as the initial price — a to-create row has no "old"
      // value to update from.
      const missing: string[] = [];
      if (!row.name) missing.push('name');
      if (!row.brand) missing.push('brand');
      if (!row.category) missing.push('category');
      if (!row.unitOfMeasure) missing.push('unit_of_measure');
      if (row.newPrice == null) missing.push('new_price');

      if (missing.length > 0) {
        skipped.push({ row, reason: `Product not found and missing required fields to create it: ${missing.join(', ')}` });
        continue;
      }
      if (!isValidPriceValue(row.newPrice!)) {
        skipped.push({ row, reason: 'new_price must be a non-negative number' });
        continue;
      }
      if (row.newCost != null && !isValidPriceValue(row.newCost)) {
        skipped.push({ row, reason: 'new_cost must be a non-negative number' });
        continue;
      }
      // A blank sku is common for a genuinely new product the uploader
      // doesn't have a code for yet — auto-generate one instead of skipping,
      // using generateSku (brand/name prefix + random suffix).
      const newSku = sku || generateSku(row.brand, row.name);
      if (seenSkus.has(newSku)) {
        skipped.push({ row, reason: `Duplicate SKU "${newSku}" (earlier row in this file superseded)` });
        continue;
      }
      seenSkus.add(newSku);
      toCreate.push({
        sku: newSku, barcode, name: row.name!, brand: row.brand!, category: row.category!, unitOfMeasure: row.unitOfMeasure!,
        price: row.newPrice!, cost: row.newCost,
      });
      continue;
    }
    if (sku) seenSkus.add(sku);

    if (row.newPrice != null) {
      if (!isValidPriceValue(row.newPrice)) {
        skipped.push({ row, reason: 'new_price must be a non-negative number' });
      } else {
        matched.push({
          productId: product.id, sku: product.sku, barcode: product.barcode || '', productName: product.name,
          field: 'price', oldValue: parseFloat(product.price), newValue: row.newPrice,
          adjustmentType: 'exact', adjustmentValue: row.newPrice,
        });
      }
    }
    if (row.newCost != null) {
      if (!isValidPriceValue(row.newCost)) {
        skipped.push({ row, reason: 'new_cost must be a non-negative number' });
      } else {
        matched.push({
          productId: product.id, sku: product.sku, barcode: product.barcode || '', productName: product.name,
          field: 'cost', oldValue: parseFloat(product.cost || 0), newValue: row.newCost,
          adjustmentType: 'exact', adjustmentValue: row.newCost,
        });
      }
    }
    if (row.newMarkupPct != null) {
      // Unlike price/cost, a markup % can legitimately be negative (a
      // markdown), so the bar here is "is it a real number" rather than
      // "is it non-negative" — but NaN (a non-numeric Excel cell) must never
      // reach `matched`.
      if (!Number.isFinite(row.newMarkupPct)) {
        skipped.push({ row, reason: 'new_markup_pct must be a number' });
      } else {
        const liveCost = parseFloat(product.cost || 0);
        const newPrice = applyAdjustment('markup', 0, row.newMarkupPct, liveCost);
        // Guards a corrupt/NaN product.cost (or any other non-finite/negative
        // result of the markup computation) from ever reaching `matched`.
        if (!isValidPriceValue(newPrice)) {
          skipped.push({ row, reason: 'Computed price from new_markup_pct is invalid (check product cost)' });
        } else {
          matched.push({
            productId: product.id, sku: product.sku, barcode: product.barcode || '', productName: product.name,
            field: 'price', oldValue: parseFloat(product.price), newValue: newPrice,
            adjustmentType: 'markup', adjustmentValue: row.newMarkupPct,
          });
        }
      }
    }
  }

  return { matched, toCreate, skipped };
}

export interface CreateProductsResult {
  created: number;
  pendingApproval: number;
  failed: { row: NewProductFromExcel; reason: string }[];
}

export async function createProductsFromExcel(
  warehouseId: string,
  rows: NewProductFromExcel[],
  userId: string,
): Promise<CreateProductsResult> {
  let created = 0;
  let pendingApproval = 0;
  const failed: CreateProductsResult['failed'] = [];

  for (const row of rows) {
    try {
      const result = await addProduct({
        name: row.name,
        brand: row.brand,
        sku: row.sku,
        barcode: row.barcode || undefined,
        description: row.name,
        category: row.category,
        warehouse: warehouseId,
        unitOfMeasure: row.unitOfMeasure,
        stock: 0,
        reorderPoint: 0,
        price: row.price,
        cost: row.cost,
      } as any, userId);

      if (!result.success) {
        failed.push({ row, reason: (result as any).message || 'Failed to create product' });
      } else if ((result as any).pendingApproval) {
        pendingApproval++;
      } else {
        created++;
      }
    } catch (error: any) {
      failed.push({ row, reason: error.message || 'Failed to create product' });
    }
  }

  return { created, pendingApproval, failed };
}
