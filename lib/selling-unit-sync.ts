/**
 * Keeps a product's BASE selling unit in step with a direct write to
 * `products.price` / `products.cost` / `product_price_levels`.
 *
 * The Edit Product form hydrates the base row's cost and prices from
 * `product_selling_units` / `product_selling_unit_prices`, and on save writes
 * them back onto `products.price` / `products.cost` / `product_price_levels`.
 * Any other writer of those legacy columns (PO receiving, bulk price update,
 * updateProductPrice) that does not also update the base selling unit leaves a
 * stale value there, and the next unrelated Edit save silently reverts the
 * change. Callers pass only what they actually changed:
 *
 * - `price`       → `product_selling_units.price` of the base row
 * - `cost`        → `product_selling_units.cost` of the base row
 * - `levelPrices` → existing `product_selling_unit_prices` rows of the base row,
 *                   keyed by price level id. Only rows that already exist are
 *                   updated; a level with no row hydrates from elsewhere
 *                   (the default level from `product_selling_units.price`,
 *                   other levels are not shown), so nothing is created here.
 *
 * A product with no base selling unit (e.g. a service) is a no-op.
 */
export async function syncBaseSellingUnit(
  connection: { query: (sql: string, params?: any[]) => Promise<any> },
  productId: string,
  values: { price?: number; cost?: number | null; levelPrices?: Record<string, number> },
): Promise<void> {
  if (values.price !== undefined) {
    await connection.query(
      'UPDATE product_selling_units SET price = ? WHERE product_id = ? AND is_base = 1',
      [values.price, productId],
    );
  }
  if (values.cost !== undefined) {
    await connection.query(
      'UPDATE product_selling_units SET cost = ? WHERE product_id = ? AND is_base = 1',
      [values.cost, productId],
    );
  }
  for (const [levelId, price] of Object.entries(values.levelPrices ?? {})) {
    await connection.query(
      `UPDATE product_selling_unit_prices psup
         JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
          SET psup.price = ?
        WHERE psu.product_id = ? AND psu.is_base = 1 AND psup.price_level_id = ?`,
      [price, productId, levelId],
    );
  }
}
