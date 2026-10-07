import assert from 'node:assert/strict';
import { restoreBaseQty } from '../../lib/selling-unit-restore';

// (a) a unit sale restores the BASE quantity, not the unit count.
// This is the bug the whole task exists to prevent: restoring 1 for a voided
// Case of 24 would destroy 23 units of real inventory.
assert.equal(restoreBaseQty({ quantity: 1, selling_unit_qty_base: '24.0000' }), 24,
  'voiding 1 Case restores 24 base units');
assert.equal(restoreBaseQty({ quantity: 3, selling_unit_qty_base: '24.0000' }), 72,
  'voiding 3 Cases restores 72');
assert.notEqual(restoreBaseQty({ quantity: 1, selling_unit_qty_base: '24.0000' }), 1,
  'voiding a Case must NOT restore only 1 base unit');

// (b) REVIEW FOCUS 2: every historical row has NULL there and must restore
// exactly its quantity, as it does today.
assert.equal(restoreBaseQty({ quantity: 5, selling_unit_qty_base: null }), 5,
  'a pre-change row restores its own quantity');
assert.equal(restoreBaseQty({ quantity: 5 }), 5, 'a missing column restores the quantity');
assert.equal(restoreBaseQty({ quantity: 5, selling_unit_qty_base: undefined }), 5,
  'undefined restores the quantity');

// (c) a base-unit sale is a no-op conversion
assert.equal(restoreBaseQty({ quantity: 7, selling_unit_qty_base: '1.0000' }), 7,
  'a base unit restores unchanged');

// (d) mysql2 DECIMAL strings and fractional ratios
assert.equal(restoreBaseQty({ quantity: '2', selling_unit_qty_base: '24.0000' }), 48,
  'a string quantity is parsed');
assert.equal(restoreBaseQty({ quantity: 4, selling_unit_qty_base: '0.2500' }), 1,
  'a fractional ratio restores down');

// (e) unusable ratios fall back rather than corrupting the restore
assert.equal(restoreBaseQty({ quantity: 5, selling_unit_qty_base: '0.0000' }), 5,
  'a zero ratio restores the quantity, not zero');
assert.equal(restoreBaseQty({ quantity: 5, selling_unit_qty_base: '-24.0000' }), 5,
  'a negative ratio never deducts on a void');

// (f) a return line (negative quantity) converts with its sign intact
assert.equal(restoreBaseQty({ quantity: -1, selling_unit_qty_base: '24.0000' }), -24,
  'a returned Case converts to -24 base units');

console.log('✓ void-selling-unit-restore.test');
