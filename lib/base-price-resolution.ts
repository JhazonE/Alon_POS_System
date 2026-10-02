import { baseUnitPriceLevelRows } from './base-unit-price-level-rows';

/**
 * What counts as a base price, and what is a quantity tier.
 *
 * `product_price_levels` holds one row per (product, level). A row with a real
 * minimum (2 or more) is a quantity TIER: lib/pricing.ts applies it through
 * resolvePriceLevel when the quantity is reached. It is not a base price, so it
 * must never be stored in, or substituted for, `products.price` — otherwise the
 * tier price is charged at quantity 1. null, 0 and 1 all mean "no minimum"
 * (the same set lib/pricing.ts normalises to 0).
 */
export function isTieredMinQuantity(raw: unknown): boolean {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1;
}

type PriceEntries = Record<string, { price?: unknown; minQuantity?: unknown }> | undefined;

/**
 * The default level's price from a unit's submitted prices, but only when that
 * entry has no real minimum. A tiered default-level entry yields undefined.
 */
export function defaultLevelFlatPrice(
  prices: PriceEntries,
  defaultLevelId: string | null,
): number | undefined {
  if (!defaultLevelId) return undefined;
  return baseUnitPriceLevelRows(prices).find(
    (r) => r.levelId === defaultLevelId && !isTieredMinQuantity(r.minQuantity),
  )?.price;
}

/**
 * The price that becomes a selling unit's price (and, for the base unit,
 * `products.price`). In order:
 *   1. the default level's entry, if it has no minimum;
 *   2. the price already stored on the unit;
 *   3. any other level's entry that has no minimum;
 *   4. when EVERY entry is tiered, the LOWEST tier — never 0. A 0 in a price
 *      column is a free sale waiting to happen; the lowest tier is at worst a
 *      discount the shopkeeper already authorised, a bounded error;
 *   5. undefined, so the caller can fall back to the form's own price.
 */
export function resolveBaseUnitPrice(
  prices: PriceEntries,
  defaultLevelId: string | null,
  storedPrice: number | undefined,
): number | undefined {
  const flatDefault = defaultLevelFlatPrice(prices, defaultLevelId);
  if (flatDefault !== undefined) return flatDefault;
  if (storedPrice !== undefined) return storedPrice;

  const entries = baseUnitPriceLevelRows(prices);
  const anyFlat = entries.find((r) => !isTieredMinQuantity(r.minQuantity));
  if (anyFlat) return anyFlat.price;

  if (entries.length === 0) return undefined;
  return Math.min(...entries.map((r) => r.price));
}

/**
 * The `product_price_levels` row allowed to stand in for `products.price` on
 * read: the default level's row, and only when it has no real minimum. A tiered
 * row is not a base price (see isTieredMinQuantity). When none qualifies the
 * caller keeps `products.price`. Shared by the products API repository and
 * getProducts so the two read paths cannot drift.
 */
export function baseOverrideRow<T extends { levelId: string; price: number; minQuantity?: unknown }>(
  rows: T[],
  defaultLevelId: string | null,
): T | undefined {
  if (!defaultLevelId) return undefined;
  return rows
    .filter((r) => r.levelId === defaultLevelId && !isTieredMinQuantity(r.minQuantity))
    .sort((a, b) => (Number(a.minQuantity) || 0) - (Number(b.minQuantity) || 0))[0];
}
