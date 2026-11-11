export type TaxType = 'VAT' | 'NON_VAT' | 'ZERO_RATED' | 'VAT_EXEMPT';

const STATUTORY_VAT_EXEMPT_DISCOUNTS = new Set(['senior', 'pwd', 'naac', 'solo_parent']);

/**
 * RA 9994 (Senior Citizens), RA 10754 (PWD), RA 10699 (NAAC) and RA 11861 (Solo Parents)
 * exempt the qualifying purchase from VAT, not just discount it — the statutory discount
 * must be computed on the VAT-exclusive price. A line carrying one of these discount types
 * is therefore always VAT_EXEMPT for tax purposes, overriding the product's own tax setup.
 */
export function resolveEffectiveTaxType(baseTaxType: TaxType, discountType?: string, discount?: number): TaxType {
  if (discountType && STATUTORY_VAT_EXEMPT_DISCOUNTS.has(discountType) && (discount || 0) > 0) {
    return 'VAT_EXEMPT';
  }
  return baseTaxType;
}

export const VAT_RATE = 1.12;

/** The statutory discount rate each exemption grants, as a percentage. */
const STATUTORY_RATES: Record<string, number> = {
  senior: 20,       // RA 9994
  pwd: 20,          // RA 10754
  naac: 20,         // RA 10699
  solo_parent: 10,  // RA 11861
};

export function isStatutoryDiscount(discountType?: string): boolean {
  return !!discountType && STATUTORY_VAT_EXEMPT_DISCOUNTS.has(discountType);
}

/** The headline statutory rate (20% / 10%), for display to a cashier. */
export function statutoryRate(discountType?: string): number {
  return (discountType && STATUTORY_RATES[discountType]) || 0;
}

/**
 * The discount percentage to store against a VAT-INCLUSIVE shelf price so that
 * the amount actually deducted equals the statutory rate applied to the
 * VAT-EXCLUSIVE price, as RA 9994 / 10754 / 10699 / 11861 require.
 *
 * The exemption removes VAT and the discount is computed on the net-of-VAT
 * price, so taking 20% straight off a VAT-inclusive shelf price under-discounts
 * the sale and overcharges the customer by the VAT on the discounted portion
 * (12% of the lawful net). Shelf prices in this system are VAT-inclusive
 * (`products.price`, carried to `pos_transaction_items.unit_price`), and a cart
 * line stores its discount as a single percentage of that price — so the VAT
 * removal has to be folded into the percentage for every downstream consumer
 * (cart totals, receipt, checkout, BIR books) to agree without each repeating
 * the rule.
 *
 *   net = (shelf / 1.12) * (1 - rate)  =>  pct = (1 - (1 - rate) / 1.12) * 100
 *
 * The result is independent of the shelf price: 20% becomes 28.571429% and 10%
 * becomes 19.642857%. Returns 0 for a non-statutory discount type, whose
 * percentage the cashier enters directly and which must not be rewritten.
 */
export function statutoryDiscountPercentOfGross(discountType?: string): number {
  const rate = statutoryRate(discountType);
  if (!rate) return 0;
  return (1 - (1 - rate / 100) / VAT_RATE) * 100;
}

/**
 * The discount rate to SHOW for a line: the headline statutory rate for a
 * statutory discount, otherwise the stored percentage as entered.
 *
 * A statutory line stores a grossed-up percentage (see above), which is an
 * implementation detail of VAT-inclusive shelf pricing. Showing it would tell a
 * senior citizen they received a 28.57% discount, so the rate displayed on
 * screen and on the receipt stays the 20% / 10% the law grants. The peso amount
 * deducted is unaffected by this function and is the figure that must foot.
 */
export function displayDiscountPercent(storedPercent: number, discountType?: string): number {
  return isStatutoryDiscount(discountType) ? statutoryRate(discountType) : storedPercent;
}
