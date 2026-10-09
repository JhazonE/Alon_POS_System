/**
 * lib/selling-unit-pricing.ts
 *
 * Decides whether a cart line is priced by its selling unit or by the
 * product's price levels. Pure, so the decision is testable without React.
 */

export interface PricedLine {
  price: number;
  priceLevelLabel?: string;
}

/**
 * The price and badge for one cart line.
 *
 * A NON-BASE selling unit carries its own price and takes no price-level tier:
 * the rows in `product_price_levels` are the BASE unit's prices, so applying a
 * Piece's wholesale tier to a Case of 24 would quote a sachet's price for a
 * whole case. Base units and products with no selling units fall through to
 * the resolver, keeping the existing tier behaviour exactly.
 *
 * Re-pointing pricing at `product_selling_unit_prices` (per the 2026-09-11
 * spec) is deliberately NOT done here; see the 2026-10-07 spec's Deviations.
 */
export function priceLineForProduct(
  product: any,
  qty: number,
  resolve: (product: any, qty: number) => PricedLine,
): PricedLine {
  if (product?.sellingUnitId && !product.isBaseUnit) {
    return { price: product.price, priceLevelLabel: undefined };
  }
  return resolve(product, qty);
}
