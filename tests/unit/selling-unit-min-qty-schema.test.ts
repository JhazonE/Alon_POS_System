import assert from 'node:assert/strict';
import { sellingUnitSchema } from '../../app/(app)/products/add-product/product-schema';

const base = {
  unitName: 'Piece',
  qtyBase: 1,
  barcode: '123',
  isBase: true,
};

// a valid min quantity is accepted and coerced to a number
const ok = sellingUnitSchema.safeParse({
  ...base,
  prices: { 'retail-level': { price: 100, minQuantity: 10 } },
});
assert.equal(ok.success, true, 'accepts a positive min quantity');
assert.equal(ok.success && ok.data.prices['retail-level'].minQuantity, 10, 'min quantity survives parsing as a number');

// a string from a form input is coerced, not rejected
const coerced = sellingUnitSchema.safeParse({
  ...base,
  prices: { 'retail-level': { price: 100, minQuantity: '10' } },
});
assert.equal(coerced.success, true, 'coerces a string min quantity from a form input');
assert.equal(coerced.success && coerced.data.prices['retail-level'].minQuantity, 10, 'coerced min quantity is the number 10');

// omitted min quantity stays optional
const omitted = sellingUnitSchema.safeParse({
  ...base,
  prices: { 'retail-level': { price: 100 } },
});
assert.equal(omitted.success, true, 'min quantity is optional');
assert.equal(omitted.success && omitted.data.prices['retail-level'].minQuantity, undefined, 'omitted min quantity stays undefined');

// a negative min quantity is rejected
const negative = sellingUnitSchema.safeParse({
  ...base,
  prices: { 'retail-level': { price: 100, minQuantity: -1 } },
});
assert.equal(negative.success, false, 'rejects a negative min quantity');

console.log('selling-unit-min-qty-schema: all assertions passed');
