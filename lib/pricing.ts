import { Product } from './types';

/** A level row's minimum, normalised. 0, null, undefined and 1 all mean "no minimum". */
function normaliseMinQty(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 1) return 0;
  return n;
}

/** The outcome of pricing one cart line: what it costs and why. */
export interface ResolvedPrice {
  price: number;
  /** The level whose row set the price, or null when the base price was used. */
  levelId: string | null;
  /** The tier minimum that fired, or 0 when no tier applied. */
  minQuantity: number;
}

/**
 * The best row for one level at one quantity: among the rows whose minimum the
 * quantity reaches, the one with the HIGHEST minimum (the most specific tier
 * earned). Ties on the minimum resolve to the lower price, for determinism.
 * Returns null when the level has no qualifying row.
 */
function bestRowForLevel(
  product: Product,
  quantity: number,
  levelId: string,
): ResolvedPrice | null {
  let best: ResolvedPrice | null = null;

  for (const pl of product.priceLevels || []) {
    if (pl.levelId !== levelId) continue;

    const price = Number(pl.price);
    if (!Number.isFinite(price)) continue;

    const minQty = normaliseMinQty(pl.minQuantity);
    if (quantity < minQty) continue;

    if (
      best === null ||
      minQty > best.minQuantity ||
      (minQty === best.minQuantity && price < best.price)
    ) {
      best = { price, levelId, minQuantity: minQty };
    }
  }

  return best;
}

/**
 * Resolves the price for a cart line, and reports which level and tier produced
 * it so the POS can show the cashier why.
 *
 * Resolution order (see docs/superpowers/specs/2026-10-02-pos-price-level-tiers-design.md):
 *   1. The ACTIVE level's best qualifying row.
 *   2. The DEFAULT level's best qualifying row.
 *   3. The product's base price.
 *
 * Levels are strictly isolated: a tier belonging to a level the customer is not
 * on never applies, even when it is cheaper. The base price is a fallback, not
 * a competing candidate — so a level priced ABOVE the base price wins, which is
 * what makes markup levels (e.g. Premium) work.
 */
export function resolvePriceLevel(
  product: Product,
  quantity: number,
  activeLevelId?: string,
  defaultLevelId: string = 'retail-level',
): ResolvedPrice {
  const qty = Number(quantity) || 0;

  if (activeLevelId) {
    const active = bestRowForLevel(product, qty, activeLevelId);
    if (active) return active;
  }

  if (defaultLevelId && defaultLevelId !== activeLevelId) {
    const fallback = bestRowForLevel(product, qty, defaultLevelId);
    if (fallback) return fallback;
  }

  return { price: Number(product.price) || 0, levelId: null, minQuantity: 0 };
}

/**
 * The effective unit price for a cart line. Thin wrapper over
 * `resolvePriceLevel` — kept with this exact signature because the POS calls it
 * from five places.
 */
export function calculateEffectivePrice(
  product: Product,
  quantity: number,
  activeLevelId?: string,
  defaultLevelId: string = 'retail-level',
): number {
  return resolvePriceLevel(product, quantity, activeLevelId, defaultLevelId).price;
}
