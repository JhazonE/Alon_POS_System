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

/** Opt-in behaviour for one price resolution. */
export interface ResolveOptions {
  /**
   * Let a tier declared on ANOTHER level apply to this sale. Gated by the
   * POS setting `enable_price_level_switch` and only ever passed when the
   * sale carries no declared level of its own (see the 2026-10-08 spec).
   */
  autoQuantityTiers?: boolean;
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

    if ((pl.price as unknown) == null || (pl.price as any) === '') continue;
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
 * The cheapest tier the quantity earns, from ANY level.
 *
 * Only rows with a real minimum (2 or more) are eligible: a flat row on
 * another level is not a tier, and treating it as one is exactly the "P70
 * leak" the 2026-10-02 spec removed. Returns null when nothing qualifies.
 */
function cheapestAutoTier(
  product: Product,
  quantity: number,
): ResolvedPrice | null {
  let best: ResolvedPrice | null = null;

  for (const pl of product.priceLevels || []) {
    if ((pl.price as unknown) == null || (pl.price as any) === '') continue;
    const price = Number(pl.price);
    if (!Number.isFinite(price)) continue;

    // A real minimum only. normaliseMinQty flattens 0, null and 1 to 0.
    const minQty = normaliseMinQty(pl.minQuantity);
    if (minQty < 2 || quantity < minQty) continue;

    if (best === null || price < best.price) {
      best = { price, levelId: pl.levelId, minQuantity: minQty };
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
  options: ResolveOptions = {},
): ResolvedPrice {
  const qty = Number(quantity) || 0;

  let settled: ResolvedPrice | null = null;

  if (activeLevelId) {
    settled = bestRowForLevel(product, qty, activeLevelId);
  }

  if (!settled && defaultLevelId && defaultLevelId !== activeLevelId) {
    settled = bestRowForLevel(product, qty, defaultLevelId);
  }

  const base: ResolvedPrice = settled
    ?? { price: Number(product.price) || 0, levelId: null, minQuantity: 0 };

  // Automatic cross-level tier. Runs LAST and only ever lowers the price, so
  // it cannot regress a price the rules above already settled. Suppressed
  // unless the sale is on the default level: a declared customer level or a
  // cashier's manual pick must win (spec A2, preserving D4).
  if (options.autoQuantityTiers && (!activeLevelId || activeLevelId === defaultLevelId)) {
    const auto = cheapestAutoTier(product, qty);
    if (auto && auto.price < base.price) return auto;
  }

  return base;
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
  options: ResolveOptions = {},
): number {
  return resolvePriceLevel(product, quantity, activeLevelId, defaultLevelId, options).price;
}
