/**
 * Turns the base selling unit's submitted `prices` map into the rows the
 * legacy `product_price_levels` table needs.
 *
 * A row with no usable price is skipped (the tab writes `undefined` for a
 * blank field). A missing, blank, negative or non-numeric minimum becomes 0,
 * which the POS treats as "no minimum" — writing 0 rather than omitting the
 * field is deliberate: it clears a tier the user blanked out instead of
 * leaving the stored one in place.
 */
export interface BaseUnitPriceLevelRow {
  levelId: string;
  price: number;
  minQuantity: number;
}

export function baseUnitPriceLevelRows(
  prices: Record<string, { price?: unknown; minQuantity?: unknown }> | undefined,
): BaseUnitPriceLevelRow[] {
  const rows: BaseUnitPriceLevelRow[] = [];

  for (const [levelId, entry] of Object.entries(prices || {})) {
    if (entry == null || entry.price == null || entry.price === '') continue;
    const price = Number(entry.price);
    if (!Number.isFinite(price)) continue;

    const rawMin = Number(entry.minQuantity);
    const minQuantity = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0;

    rows.push({ levelId, price, minQuantity });
  }

  return rows;
}
