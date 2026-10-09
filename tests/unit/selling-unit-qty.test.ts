import assert from 'node:assert/strict';
import { toBaseQty, toUnitStock, buildLineId, safeQtyBase } from '../../lib/selling-unit-qty';

// --- safeQtyBase: anything that cannot scale a deduction becomes 1 ---
// A zero multiplier would deduct nothing and leak stock; a negative one would
// ADD stock on a sale. Both fall back to 1 rather than corrupting inventory.
for (const bad of [0, -1, -24, NaN, Infinity, -Infinity, null, undefined, '', 'abc', {}]) {
  assert.equal(safeQtyBase(bad as unknown), 1, `${String(bad)} falls back to 1`);
}
assert.equal(safeQtyBase(24), 24, 'a valid ratio passes through');
assert.equal(safeQtyBase('24'), 24, 'a DECIMAL string from mysql2 is parsed');
assert.equal(safeQtyBase('24.000000'), 24, 'a DECIMAL(14,6) string is parsed');
assert.equal(safeQtyBase(0.25), 0.25, 'a fractional ratio is valid');

// --- toBaseQty ---
assert.equal(toBaseQty(3, 24), 72, '3 Cases of 24 is 72 base units');
assert.equal(toBaseQty(1, 1), 1, 'a base unit is unchanged');
assert.equal(toBaseQty(4, 0.25), 1, 'a fractional ratio converts down');
assert.equal(toBaseQty(5, null), 5, 'a missing ratio deducts the unit count');
assert.equal(toBaseQty(5, 0), 5, 'a zero ratio never deducts zero');
assert.equal(toBaseQty(5, -2), 5, 'a negative ratio never adds stock');

// --- toUnitStock ---
assert.equal(toUnitStock(60, 24), 2, '60 base units is 2 whole Cases');
assert.equal(toUnitStock(2.5, 0.25), 10, 'a fractional ratio converts up');
assert.equal(toUnitStock(60, 1), 60, 'a base unit shows base stock');
assert.equal(toUnitStock(23, 24), 0, 'a partial Case is not sellable as a Case');
assert.equal(toUnitStock(0, 24), 0, 'zero stays zero');
assert.equal(toUnitStock(60, 0), 60, 'a zero ratio does not divide');
assert.equal(toUnitStock('60.0000', 24), 2, 'a DECIMAL string from mysql2 is parsed');
// A negative base stock must stay negative: flooring away from zero prevents
// an oversold product from reading as empty.
assert.equal(toUnitStock(-48, 24), -2, 'negative stock stays negative');
// A sub-unit oversell must never read as empty: -10/24 floors to -1, not -0.
assert.equal(toUnitStock(-10, 24), -1, 'an oversell of less than one unit still reads negative');
assert.equal(toUnitStock(-50, 24), -3, 'a partial negative floors away from zero');
assert.equal(Object.is(toUnitStock(-10, 24), -0), false, 'never returns negative zero');
// Garbage baseStock reads as zero rather than NaN reaching a display.
assert.equal(toUnitStock('abc', 24), 0, 'unparseable stock reads as zero');
assert.equal(toUnitStock(undefined, 24), 0, 'undefined stock reads as zero');
assert.equal(toUnitStock(null, 24), 0, 'null stock reads as zero');

// --- buildLineId ---
assert.equal(buildLineId('prod-1', 'psu-7'), 'prod-1::psu-7', 'a unit gets a composite line id');
assert.equal(buildLineId('prod-1'), 'prod-1', 'no unit means the line id IS the product id');
assert.equal(buildLineId('prod-1', null), 'prod-1', 'a null unit means the product id');
assert.equal(buildLineId('prod-1', ''), 'prod-1', 'an empty unit means the product id');
// Two units of one product must never collide, and a unit line must never
// collide with its own product's unit-less line.
assert.notEqual(buildLineId('prod-1', 'psu-7'), buildLineId('prod-1', 'psu-8'));
assert.notEqual(buildLineId('prod-1', 'psu-7'), buildLineId('prod-1'));

console.log('✓ selling-unit-qty.test');
