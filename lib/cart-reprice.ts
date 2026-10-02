export interface PricedLine {
  price: number;
  quantity: number;
  priceLevelLabel?: string;
}

/** Prices one line at one quantity and says why (see `priceLine` in use-pos.ts). */
export type LinePricer<T extends PricedLine> = (
  item: T,
  quantity: number,
) => { price: number; priceLevelLabel?: string };

/**
 * Re-resolves the cart lines against the current price level. Returns the SAME
 * array when no line's price or badge changed, so a no-op re-run does not
 * trigger a React re-render.
 *
 * `labelsOnly` is for when the price-level LIST has just loaded (not when the
 * cashier switched level): prices are left untouched, because a restored cart may
 * hold a price the cashier typed by hand and the list arriving is no reason to
 * overwrite it. The badge is then only filled in where the resolved price equals
 * the line's current price — a badge must never claim a level set a price it did
 * not set.
 */
export function repriceCartLines<T extends PricedLine>(
  items: T[],
  priceLine: LinePricer<T>,
  options: { labelsOnly?: boolean } = {},
): T[] {
  let changed = false;

  const next = items.map((item) => {
    const resolved = priceLine(item, item.quantity);
    const price = options.labelsOnly ? item.price : resolved.price;
    const label = options.labelsOnly
      ? resolved.price === item.price
        ? resolved.priceLevelLabel
        : undefined
      : resolved.priceLevelLabel;

    if (price === item.price && label === item.priceLevelLabel) return item;
    changed = true;
    return { ...item, price, priceLevelLabel: label };
  });

  return changed ? next : items;
}
