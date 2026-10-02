import type { ResolvedPrice } from './pricing';

/**
 * The short badge shown on a POS cart line so the cashier can see why the line
 * is priced as it is — e.g. `Wholesale · 10+`.
 *
 * Returns undefined when there is nothing worth showing: the product's base
 * price was used, or the level list has not loaded (showing a raw level id
 * would be worse than showing nothing).
 */
export function priceLevelLabel(
  resolved: ResolvedPrice,
  priceLevels: { id: string; name: string }[],
): string | undefined {
  if (!resolved.levelId) return undefined;

  const level = (priceLevels || []).find((l) => l.id === resolved.levelId);
  if (!level) return undefined;

  return resolved.minQuantity > 0 ? `${level.name} · ${resolved.minQuantity}+` : level.name;
}
