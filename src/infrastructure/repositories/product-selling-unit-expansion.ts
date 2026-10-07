import { toUnitStock, safeQtyBase } from '../../../lib/selling-unit-qty';

/**
 * Expands each product row into one row per selling unit, for the POS.
 *
 * Kept pure (no database, no connection) so the shape the POS depends on is
 * unit-testable on its own. The repository fetches the unit rows; this decides
 * what the expanded rows look like.
 *
 * `id` is deliberately NOT changed: it stays the product id, because it is the
 * FK written to `sale_items.product_id` and the key for stock, batches and
 * loyalty. Cart identity is `sellingUnitId` combined with it (see
 * `buildLineId`).
 *
 * A product with no selling-unit rows passes through untouched — that is the
 * common case today and must behave exactly as it did before this change.
 */
export function expandProductSellingUnits(products: any[], unitRows: any[]): any[] {
  if (unitRows.length === 0) return products;

  const byProduct = new Map<string, any[]>();
  for (const row of unitRows) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id)!.push(row);
  }
  for (const rows of byProduct.values()) {
    rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const expanded: any[] = [];
  for (const product of products) {
    const units = byProduct.get(product.id);
    if (!units || units.length === 0) {
      expanded.push(product);
      continue;
    }
    for (const unit of units) {
      const isBase = unit.is_base === 1 || unit.is_base === true;
      const qtyBase = safeQtyBase(unit.qty_base);
      expanded.push({
        ...product,
        sellingUnitId: unit.id,
        isBaseUnit: isBase,
        qtyBase,
        // The base-unit figure, kept so an oversell check can compare against
        // real stock rather than the unit-converted display value.
        // mysql2 returns DECIMAL as a string. This field's only purpose is
        // numeric comparison (oversell checks), and `"0.0000" <= 0` is false in
        // JS, so it must be a number before any consumer sees it.
        baseStock: Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0,
        name: isBase ? product.name : `${product.name} ${unit.unit_name}`,
        price: parseFloat(unit.price),
        barcode: unit.barcode,
        unitOfMeasure: unit.unit_name,
        stock: toUnitStock(product.stock, unit.qty_base),
      });
    }
  }
  return expanded;
}
