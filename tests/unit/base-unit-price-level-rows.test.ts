import assert from 'node:assert/strict';
import { baseUnitPriceLevelRows } from '../../lib/base-unit-price-level-rows';

// a price with an explicit minimum carries it through
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: 10 } }),
  [{ levelId: 'retail-level', price: 100, minQuantity: 10 }],
  'an explicit minimum is carried through',
);

// a blank minimum clears the tier back to 0 rather than preserving a stale one
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100 } }),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'an omitted minimum becomes 0, so a stored tier is cleared not preserved',
);
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: undefined } }),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'an undefined minimum becomes 0',
);

// a blank price is skipped entirely (matches the existing validPrice rule)
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: undefined, minQuantity: 10 } } as any),
  [],
  'a row with no price is skipped',
);
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: '', minQuantity: 10 } } as any),
  [],
  'a row with a blank price is skipped',
);

// strings from the form are coerced
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: '100', minQuantity: '10' } } as any),
  [{ levelId: 'retail-level', price: 100, minQuantity: 10 }],
  'string price and minimum are coerced to numbers',
);

// a non-numeric minimum degrades to 0 rather than writing NaN
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: 'abc' } } as any),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'a non-numeric minimum becomes 0, never NaN',
);

// a negative minimum is floored at 0
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: -5 } } as any),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'a negative minimum is floored at 0',
);

// several levels come back in a stable order
assert.deepEqual(
  baseUnitPriceLevelRows({
    'retail-level': { price: 100 },
    'wholesale-level': { price: 90, minQuantity: 10 },
  }),
  [
    { levelId: 'retail-level', price: 100, minQuantity: 0 },
    { levelId: 'wholesale-level', price: 90, minQuantity: 10 },
  ],
  'several levels are returned in insertion order',
);

// a non-numeric price is skipped entirely
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 'abc', minQuantity: 10 } } as any),
  [],
  'a row with a non-numeric price is skipped',
);

// minQuantity: null becomes 0
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: null } } as any),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'a null minimum becomes 0',
);

// no prices at all
assert.deepEqual(baseUnitPriceLevelRows({}), [], 'an empty prices map yields no rows');
assert.deepEqual(baseUnitPriceLevelRows(undefined), [], 'an absent prices map yields no rows');

console.log('base-unit-price-level-rows: all assertions passed');
