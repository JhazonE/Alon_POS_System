/**
 * lib/selling-unit-qty.ts
 *
 * Pure conversion math between a selling unit's quantity and the product's
 * base-stock quantity. Kept free of any database or React dependency so the
 * arithmetic that drives stock deduction is unit-testable on its own.
 *
 * A product's stock, its `inventory_batches` and its cost are all denominated
 * in BASE units. A selling unit declares how many base units it equals
 * (`qty_base`), so selling N of a unit consumes `N * qty_base` base units.
 */

/**
 * Normalises a `qty_base` read from the database into a usable multiplier.
 *
 * mysql2 returns DECIMAL columns as strings, so this parses as well as
 * validates. Anything non-finite or `<= 0` falls back to `1`: a zero
 * multiplier would deduct nothing and silently leak stock, and a negative one
 * would ADD stock on a sale. Migration 120's preflight already rejects
 * `qty_base <= 0`, so this is defence in depth rather than the primary guard.
 */
export function safeQtyBase(qtyBase: unknown): number {
  const n = typeof qtyBase === 'number' ? qtyBase : parseFloat(String(qtyBase ?? ''));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/** Base-stock units consumed by selling `qty` of a unit with ratio `qtyBase`. */
export function toBaseQty(qty: number, qtyBase: unknown): number {
  return qty * safeQtyBase(qtyBase);
}

/**
 * How many whole selling units `baseStock` amounts to — what the cashier needs
 * to know ("how many Cases can I still sell"), not the base count.
 *
 * Floored, because a partial Case is not sellable as a Case. A NEGATIVE base
 * stock is floored away from zero (-48/24 -> -2, not -2 rounded up), so an
 * oversold product still reads as oversold rather than as empty.
 */
export function toUnitStock(baseStock: unknown, qtyBase: unknown): number {
  const stock = typeof baseStock === 'number' ? baseStock : parseFloat(String(baseStock ?? ''));
  if (!Number.isFinite(stock)) return 0;
  const units = stock / safeQtyBase(qtyBase);
  return units < 0 ? -Math.floor(-units) : Math.floor(units);
}

/**
 * The cart's identity for one line.
 *
 * Two selling units of the same product are two independent cart lines, so the
 * product id alone cannot identify a line. This stays SEPARATE from
 * `product.id`, which must keep its own meaning: it is the FK written to
 * `sale_items.product_id`.
 */
export function buildLineId(productId: string, sellingUnitId?: string | null): string {
  return sellingUnitId ? `${productId}::${sellingUnitId}` : productId;
}
