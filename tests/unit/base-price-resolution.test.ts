import assert from 'node:assert/strict';
import {
  isTieredMinQuantity,
  resolveBaseUnitPrice,
  defaultLevelFlatPrice,
  baseOverrideRow,
} from '../../lib/base-price-resolution';
import { resolvePriceLevel } from '../../lib/pricing';

const RETAIL = 'retail-level';
const WHOLESALE = 'wholesale-level';

// "no minimum" is null / undefined / 0 / 1 (and junk); a tier is 2 or more
for (const none of [null, undefined, 0, 1, '', '0', '1', 'abc', -3]) {
  assert.equal(isTieredMinQuantity(none), false, `${String(none)} is not a tier`);
}
for (const tier of [2, 10, '10', 2.5]) {
  assert.equal(isTieredMinQuantity(tier), true, `${String(tier)} is a tier`);
}

// --- write side: which price becomes the unit's / product's base price ---

// the Critical bug: Retail 85 from 10 pieces must NOT become the base price
assert.equal(
  resolveBaseUnitPrice({ [RETAIL]: { price: 85, minQuantity: 10 } }, RETAIL, 100),
  100,
  'a tiered default-level entry never becomes the base; the stored price wins',
);
assert.equal(
  defaultLevelFlatPrice({ [RETAIL]: { price: 85, minQuantity: 10 } }, RETAIL),
  undefined,
  'a tiered default-level entry is not a flat default price',
);
assert.equal(
  defaultLevelFlatPrice({ [RETAIL]: { price: 100 } }, RETAIL),
  100,
  'a flat default-level entry is the flat default price',
);

// a flat default-level entry still wins, whatever the "no minimum" spelling
for (const none of [undefined, null, 0, 1]) {
  assert.equal(
    resolveBaseUnitPrice(
      { [RETAIL]: { price: 100, minQuantity: none }, [WHOLESALE]: { price: 80, minQuantity: 5 } },
      RETAIL,
      50,
    ),
    100,
    `a default entry with minQuantity ${String(none)} is the base price`,
  );
}

// tiered default + a flat entry on another level: stored price first, then the flat entry
assert.equal(
  resolveBaseUnitPrice({ [RETAIL]: { price: 85, minQuantity: 10 }, [WHOLESALE]: { price: 90 } }, RETAIL, undefined),
  90,
  'without a stored price, any non-tiered entry is preferred',
);
assert.equal(
  resolveBaseUnitPrice({ [RETAIL]: { price: 85, minQuantity: 10 }, [WHOLESALE]: { price: 90 } }, RETAIL, 100),
  100,
  'a stored price beats a non-tiered entry on another level',
);

// every entry tiered, nothing stored: the LOWEST tier, never 0 and never undefined
assert.equal(
  resolveBaseUnitPrice(
    { [RETAIL]: { price: 85, minQuantity: 10 }, [WHOLESALE]: { price: 70, minQuantity: 20 } },
    RETAIL,
    undefined,
  ),
  70,
  'when every entry is tiered the lowest tier is used rather than 0',
);
assert.equal(
  resolveBaseUnitPrice({ [RETAIL]: { price: 85, minQuantity: 10 } }, RETAIL, undefined),
  85,
  'a lone tiered entry with nothing stored resolves to that tier, not 0',
);

// nothing at all
assert.equal(resolveBaseUnitPrice({}, RETAIL, undefined), undefined, 'no entries and no stored price is undefined');
assert.equal(resolveBaseUnitPrice(undefined, RETAIL, undefined), undefined, 'absent prices is undefined');
assert.equal(resolveBaseUnitPrice({ [RETAIL]: { price: '' } }, RETAIL, undefined), undefined, 'a blank price is ignored');
assert.equal(resolveBaseUnitPrice({ [RETAIL]: { price: 100 } }, null, undefined), 100, 'no default level id: first non-tiered entry');

// --- read side: the row allowed to override products.price ---

const rows = (...r: Array<[string, number, unknown]>) =>
  r.map(([levelId, price, minQuantity]) => ({ levelId, price, minQuantity }));

assert.equal(
  baseOverrideRow(rows([RETAIL, 85, 10]), RETAIL),
  undefined,
  'a lone tiered default row does not override the base price',
);
assert.equal(baseOverrideRow(rows([RETAIL, 90, 0]), RETAIL)?.price, 90, 'a non-tiered default row still overrides');
assert.equal(baseOverrideRow(rows([RETAIL, 90, 1]), RETAIL)?.price, 90, 'minQuantity 1 is non-tiered');
assert.equal(baseOverrideRow(rows([RETAIL, 90, null]), RETAIL)?.price, 90, 'null minQuantity is non-tiered');
assert.equal(baseOverrideRow(rows([WHOLESALE, 70, 0]), RETAIL), undefined, 'rows from other levels never override');
assert.equal(baseOverrideRow([], RETAIL), undefined, 'no rows, no override');
assert.equal(baseOverrideRow(rows([RETAIL, 85, 10]), null), undefined, 'no default level, no override');

// --- end to end through lib/pricing.ts: Retail 85 from 10 pieces, base 100 ---
// The read path hands pricing the product with price = override ?? products.price.
const stored = 100;
const priceLevels = [{ levelId: RETAIL, price: 85, minQuantity: 10 }];
const product: any = { price: baseOverrideRow(priceLevels, RETAIL)?.price ?? stored, priceLevels };
for (const qty of [1, 5, 9]) {
  const r = resolvePriceLevel(product, qty, undefined, RETAIL);
  assert.equal(r.price, 100, `qty ${qty} is the base price`);
  assert.equal(r.levelId, null, `qty ${qty} shows no tier badge`);
}
const atTen = resolvePriceLevel(product, 10, undefined, RETAIL);
assert.equal(atTen.price, 85, 'qty 10 reaches the Retail tier');
assert.equal(atTen.levelId, RETAIL, 'qty 10 reports the Retail level');

console.log('base-price-resolution: all assertions passed');
