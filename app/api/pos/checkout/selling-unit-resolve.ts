import { safeQtyBase } from '@/lib/selling-unit-qty';

/**
 * The `qty_base` multiplier for one checkout line, read from the joined
 * `product_selling_units` row.
 *
 * Deliberately takes the DATABASE row, never the request body: a
 * client-supplied multiplier directly scales a stock deduction. The join is
 * scoped `AND psu.product_id = p.id`, so a unit id belonging to another
 * product arrives here as NULL and falls back to 1 rather than deducting by a
 * foreign product's ratio.
 */
export function resolveLineQtyBase(soldProd: any): number {
  return safeQtyBase(soldProd?.psu_qty_base);
}
