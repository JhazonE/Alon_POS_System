import assert from 'node:assert/strict';
import { resolveLineQtyBase } from '../../app/api/pos/checkout/selling-unit-resolve';
import { toBaseQty } from '../../lib/selling-unit-qty';

// (a) a matched unit row yields its ratio
assert.equal(resolveLineQtyBase({ psu_qty_base: '24.000000' }), 24, 'a matched unit ratio is used');
assert.equal(resolveLineQtyBase({ psu_qty_base: '1.000000' }), 1, 'a base unit is 1');
assert.equal(resolveLineQtyBase({ psu_qty_base: '0.250000' }), 0.25, 'a fractional ratio is used');

// (b) REVIEW FOCUS 1: a unit id belonging to ANOTHER product.
// The SQL join is scoped `AND psu.product_id = p.id`, so a foreign unit id
// yields NULL here. It must fall back to 1 — deducting by a foreign product's
// ratio would corrupt this product's stock.
assert.equal(resolveLineQtyBase({ psu_qty_base: null }), 1, 'a foreign/unmatched unit falls back to 1');
assert.equal(resolveLineQtyBase({}), 1, 'a missing column falls back to 1');
assert.equal(resolveLineQtyBase(undefined), 1, 'no row at all falls back to 1');
assert.equal(resolveLineQtyBase(null), 1, 'a null row falls back to 1');

// (c) REVIEW FOCUS 3: unusable ratios never corrupt a deduction
assert.equal(resolveLineQtyBase({ psu_qty_base: '0.000000' }), 1, 'zero never deducts nothing');
assert.equal(resolveLineQtyBase({ psu_qty_base: '-24.000000' }), 1, 'negative never ADDS stock on a sale');
assert.equal(resolveLineQtyBase({ psu_qty_base: 'abc' }), 1, 'junk falls back to 1');

// (d) the deduction quantity the FIFO ledger actually sees
assert.equal(toBaseQty(1, resolveLineQtyBase({ psu_qty_base: '24.000000' })), 24, '1 Case deducts 24');
assert.equal(toBaseQty(3, resolveLineQtyBase({ psu_qty_base: '24.000000' })), 72, '3 Cases deduct 72');
assert.equal(toBaseQty(5, resolveLineQtyBase({ psu_qty_base: null })), 5, 'an unmatched line deducts its own count');
// The regression this whole task exists to prevent:
assert.notEqual(toBaseQty(3, resolveLineQtyBase({ psu_qty_base: '24.000000' })), 3,
  '3 Cases must NOT deduct only 3 base units');

console.log('✓ checkout-selling-unit-qty.test');
