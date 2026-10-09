import assert from 'node:assert/strict';
import { resolveActivePriceLevelId, manualPickAfterCustomerChange } from '../../lib/pos-active-price-level';

const DEFAULT = 'retail-level';
const WHOLESALE = 'pl_wholesale';
const CONTRACT = 'pl_contract';

// ---------------------------------------------------------------------------
// resolveActivePriceLevelId: which level prices the cart
// ---------------------------------------------------------------------------

// The walk-in case this feature exists for: no customer level, cashier picked
// Wholesale, so Wholesale prices the cart.
assert.equal(
  resolveActivePriceLevelId(undefined, WHOLESALE, DEFAULT),
  WHOLESALE,
  'a walk-in with a manual pick uses the manual pick',
);

// Nothing picked and no customer level -> the default level.
assert.equal(
  resolveActivePriceLevelId(undefined, '', DEFAULT),
  DEFAULT,
  'no customer level and no manual pick falls back to the default level',
);
assert.equal(
  resolveActivePriceLevelId(null, null, DEFAULT),
  DEFAULT,
  'null customer level and null manual pick fall back to the default level',
);

// A customer with their own level still wins: contract pricing is not
// overridden by a pick left over from a previous sale.
assert.equal(
  resolveActivePriceLevelId(CONTRACT, WHOLESALE, DEFAULT),
  CONTRACT,
  "a customer's own level outranks a manual pick",
);
assert.equal(
  resolveActivePriceLevelId(CONTRACT, '', DEFAULT),
  CONTRACT,
  "a customer's own level is used when nothing was picked",
);

// A blank string on the customer is "unassigned", not a level id.
assert.equal(
  resolveActivePriceLevelId('', WHOLESALE, DEFAULT),
  WHOLESALE,
  'an empty customer level is treated as unassigned',
);

// ---------------------------------------------------------------------------
// manualPickAfterCustomerChange: keeps no stale pick hidden behind a customer
// ---------------------------------------------------------------------------

// Selecting a customer who carries their own level clears the manual pick, so
// returning to walk-in does not silently resurrect it.
assert.equal(
  manualPickAfterCustomerChange(CONTRACT, WHOLESALE),
  '',
  "selecting a customer with their own level clears the manual pick",
);

// A walk-in (or any customer with no level) leaves the pick alone — that pick
// is exactly what prices the cart.
assert.equal(
  manualPickAfterCustomerChange(undefined, WHOLESALE),
  WHOLESALE,
  'a customer with no level of their own leaves the manual pick intact',
);
assert.equal(
  manualPickAfterCustomerChange('', WHOLESALE),
  WHOLESALE,
  'an empty customer level leaves the manual pick intact',
);
assert.equal(
  manualPickAfterCustomerChange(CONTRACT, ''),
  '',
  'clearing when there was no pick is a no-op',
);

console.log('✅ pos-active-price-level tests passed');
