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

/**
 * The selling-unit id that may be STORED on a sale line: the client's id, but
 * only when the scoped join (`psu.id = ? AND psu.product_id = p.id`) actually
 * matched. A unit id belonging to another product yields NULL here, so the
 * snapshot columns go NULL together rather than recording a unit whose real
 * ratio was not the one used. These columns are what the void path and BIR
 * reports read back.
 */
export function resolveLineSellingUnitId(soldProd: any, clientUnitId: string | null | undefined): string | null {
  return soldProd?.psu_qty_base != null ? (clientUnitId || null) : null;
}
