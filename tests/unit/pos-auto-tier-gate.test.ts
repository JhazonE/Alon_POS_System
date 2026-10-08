import assert from 'node:assert/strict';
import { shouldAutoApplyTiers } from '../../lib/pos-active-price-level';

// The toggle is the master switch.
assert.equal(shouldAutoApplyTiers(false, undefined, ''), false, 'OFF: never applies');
assert.equal(shouldAutoApplyTiers(false, undefined, 'pl_wholesale'), false, 'OFF: a pick does not enable it');

// ON + walk-in with no pick: the case the feature exists for.
assert.equal(shouldAutoApplyTiers(true, undefined, ''), true, 'ON + walk-in, no pick: applies');
assert.equal(shouldAutoApplyTiers(true, null, null), true, 'ON + null customer level and null pick: applies');
assert.equal(shouldAutoApplyTiers(true, '', ''), true, 'ON + empty customer level: treated as unassigned');

// A declared customer level must win, so the automatic step is suppressed.
assert.equal(
  shouldAutoApplyTiers(true, 'pl_premium', ''), false,
  "a customer's declared level suppresses the automatic step",
);

// A cashier's manual pick is deliberate and must also win.
assert.equal(
  shouldAutoApplyTiers(true, undefined, 'pl_wholesale'), false,
  'a manual pick suppresses the automatic step',
);

console.log('pos-auto-tier-gate: all assertions passed');
