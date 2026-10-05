/**
 * Applies a price level's adjustment to a resolved base price.
 *
 * - 'percentage' (or an unset/legacy adjustmentType, for rows written before
 *   this field existed): basePrice * (1 + value / 100).
 * - 'fixed': basePrice + value (value is a positive peso amount).
 *
 * Both adjustment types are positive-only by house rule — this function
 * does not enforce that itself (callers validate on save); it just applies
 * whatever value it's given.
 */
export function applyPriceLevelAdjustment(
  adjustmentType: 'percentage' | 'fixed' | undefined,
  value: number | undefined,
  basePrice: number,
): number {
  const v = Number(value) || 0;
  if (adjustmentType === 'fixed') {
    return basePrice + v;
  }
  return basePrice * (1 + v / 100);
}

/**
 * Resolves a price level's price from the add/edit product form's current
 * retail and cost values: looks the level up, picks the base that level
 * calculates from, and applies its adjustment.
 *
 * Returns 0 — not NaN or undefined — for an absent level or base price, so a
 * half-filled form renders a blank-ish price rather than "NaN".
 *
 * Lives here rather than in the product form hooks: it is pure, it wraps
 * applyPriceLevelAdjustment directly above it, and both the add and edit
 * forms need it. It previously existed as two byte-identical copies inside
 * 'use client' hook modules, which also made it untestable in this project's
 * unit runner (importing either hook pulls in React and the toast provider).
 */
export function calculatePriceLevelPrice(
  levelId: string,
  calculationBase: 'retail' | 'cost',
  priceLevels: any[],
  formPrice: number,
  formCost: number,
): number {
  if (!levelId) return 0;

  const level = priceLevels.find(l => l.id === levelId);
  if (!level) return 0;

  const basePrice = calculationBase === 'retail' ? formPrice : formCost;
  if (basePrice === undefined || basePrice === null) return 0;

  return applyPriceLevelAdjustment(level.adjustmentType, level.percentageAdjustment, basePrice);
}
