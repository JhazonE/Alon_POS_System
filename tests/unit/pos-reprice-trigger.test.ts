import assert from 'node:assert/strict';
import { repriceModeForGateChange } from '../../lib/pos-active-price-level';

// The gate flipping because the POS settings fetch first resolved at startup is
// async data arriving: badges only, never a price overwrite (a restored line may
// carry a hand-typed price that ends up on the BIR invoice).
assert.equal(
  repriceModeForGateChange(true), 'labelsOnly',
  'first resolution of the settings: labels only, hand-typed prices survive',
);

// Any later change is a cashier action (level switch, picking the default level).
assert.equal(
  repriceModeForGateChange(false), 'full',
  'a later change: full reprice',
);

console.log('pos-reprice-trigger: all assertions passed');
