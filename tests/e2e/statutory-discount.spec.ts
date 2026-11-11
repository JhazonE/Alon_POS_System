import { test, expect } from '@playwright/test';
import {
  statutoryDiscountPercentOfGross,
  statutoryRate,
  isStatutoryDiscount,
  displayDiscountPercent,
  resolveEffectiveTaxType,
  VAT_RATE,
} from '../../lib/tax-utils';

/**
 * Statutory discounts: RA 9994 (Senior), RA 10754 (PWD), RA 10699 (NAAC),
 * RA 11861 (Solo Parent).
 *
 * Ang exemption mo-kuha sa VAT, ug ang discount gi-compute sa VAT-EXCLUSIVE
 * nga presyo. Ang shelf price niini nga sistema kay VAT-inclusive, ug ang cart
 * line mo-store sa discount isip usa ka porsyento sa shelf price — mao nga ang
 * pagkuha ug tul-id nga 20% sa shelf price mag-undercharge sa discount ug
 * mag-OVERCHARGE sa senior ug 12% sa subay-balaod nga net.
 *
 * Gi-lock niini nga spec ang aktuwal nga bayronon, dili ang porsyento, kay
 * ang kwarta mao ang importante sa customer ug sa BIR.
 */

/** Unsa ang gipabayad sa checkout: price*qty - (price*qty * pct/100). */
function netCharged(shelfInclVat: number, qty: number, storedPct: number): number {
  const gross = shelfInclVat * qty;
  return gross - gross * (storedPct / 100);
}

/** Unsa ang gipatuman sa balaod: kuhaa ang VAT, dayon i-apply ang rate. */
function netLawful(shelfInclVat: number, qty: number, ratePct: number): number {
  return (shelfInclVat / VAT_RATE) * qty * (1 - ratePct / 100);
}

const SHELF_PRICES = [112.0, 100.0, 59.75, 1250.5, 7.0];

test.describe('statutory discount — ang gi-charge subay sa balaod', () => {
  for (const type of ['senior', 'pwd', 'naac', 'solo_parent']) {
    test(`${type}: ang net nga bayronon = statutory rate sa VAT-exclusive price`, () => {
      const stored = statutoryDiscountPercentOfGross(type);
      const rate = statutoryRate(type);

      for (const shelf of SHELF_PRICES) {
        for (const qty of [1, 3]) {
          expect(netCharged(shelf, qty, stored)).toBeCloseTo(netLawful(shelf, qty, rate), 6);
        }
      }
    });
  }

  test('senior: ₱112.00 nga shelf → ₱80.00 ang bayronon, dili ₱89.60', () => {
    const stored = statutoryDiscountPercentOfGross('senior');
    expect(netCharged(112.0, 1, stored)).toBeCloseTo(80.0, 6);

    // Ang daan nga buhat (tul-id nga 20% sa VAT-inclusive price) — mao ni ang bug.
    expect(netCharged(112.0, 1, 20)).toBeCloseTo(89.6, 6);
  });

  test('solo parent: 10% sa VAT-exclusive → ₱90.00 sa ₱112.00', () => {
    const stored = statutoryDiscountPercentOfGross('solo_parent');
    expect(netCharged(112.0, 1, stored)).toBeCloseTo(90.0, 6);
  });

  test('ang gi-store nga porsyento kay independente sa presyo', () => {
    expect(statutoryDiscountPercentOfGross('senior')).toBeCloseTo(28.571429, 5);
    expect(statutoryDiscountPercentOfGross('solo_parent')).toBeCloseTo(19.642857, 5);
  });

  test('ang dili-statutory nga discount DILI ma-usab', () => {
    expect(statutoryDiscountPercentOfGross('percent')).toBe(0);
    expect(statutoryDiscountPercentOfGross('amount')).toBe(0);
    expect(statutoryDiscountPercentOfGross(undefined)).toBe(0);
    expect(isStatutoryDiscount('percent')).toBe(false);
    expect(isStatutoryDiscount(undefined)).toBe(false);
  });
});

test.describe('statutory discount — unsa ang gipakita', () => {
  test('ang gipakita kay ang headline rate, dili ang grossed-up', () => {
    const stored = statutoryDiscountPercentOfGross('senior');
    // Ang senior dili angay sultihan nga 28.57% ang iyang discount.
    expect(displayDiscountPercent(stored, 'senior')).toBe(20);
    expect(displayDiscountPercent(statutoryDiscountPercentOfGross('solo_parent'), 'solo_parent')).toBe(10);
  });

  test('ang manual nga discount gipakita sumala sa gi-enter', () => {
    expect(displayDiscountPercent(15, 'percent')).toBe(15);
    expect(displayDiscountPercent(7.5, undefined)).toBe(7.5);
  });
});

test.describe('statutory discount — VAT exempt gihapon', () => {
  test('ang statutory nga linya kay VAT_EXEMPT, bisan unsa ang tax setup sa produkto', () => {
    const stored = statutoryDiscountPercentOfGross('senior');
    expect(resolveEffectiveTaxType('VAT', 'senior', stored)).toBe('VAT_EXEMPT');
    expect(resolveEffectiveTaxType('NON_VAT', 'pwd', stored)).toBe('VAT_EXEMPT');
  });

  test('walay discount → walay override', () => {
    expect(resolveEffectiveTaxType('VAT', 'senior', 0)).toBe('VAT');
  });
});
