import assert from 'node:assert/strict';
import { resolvePriceLevel } from '../../lib/pricing';

const DEFAULT = 'retail-level';
const WHOLESALE = 'pl_wholesale';
const PREMIUM = 'pl_premium';
const DEALER = 'pl_dealer';
const AUTO = { autoQuantityTiers: true };

// REBISCO CRACKERS as configured in production: base P200, Retail P200 flat,
// Wholesale P110 at a minimum of 10.
const rebisco: any = {
  id: 'rebisco', price: 200,
  priceLevels: [
    { levelId: WHOLESALE, price: 110, minQuantity: 10 },
    { levelId: DEFAULT, price: 200, minQuantity: 1 },
  ],
};

// --- Toggle OFF: today's behaviour, preserved exactly (regression guard) ---
for (const qty of [1, 9, 10, 20]) {
  assert.equal(
    resolvePriceLevel(rebisco, qty, DEFAULT, DEFAULT).price, 200,
    `toggle OFF: walk-in at qty ${qty} stays at the retail price`,
  );
}
assert.equal(
  resolvePriceLevel(rebisco, 10, WHOLESALE, DEFAULT).price, 110,
  'toggle OFF: a declared Wholesale customer still earns the tier',
);

// --- Toggle ON: the walk-in earns the tier automatically ---
assert.equal(resolvePriceLevel(rebisco, 1, DEFAULT, DEFAULT, AUTO).price, 200, 'qty 1 earns nothing');
assert.equal(resolvePriceLevel(rebisco, 9, DEFAULT, DEFAULT, AUTO).price, 200, 'qty 9 has not reached the minimum');

const hit = resolvePriceLevel(rebisco, 10, DEFAULT, DEFAULT, AUTO);
assert.equal(hit.price, 110, 'qty 10 automatically earns the Wholesale tier');
assert.equal(hit.levelId, WHOLESALE, 'the badge names the level that set the price');
assert.equal(hit.minQuantity, 10, 'the badge reports the minimum that fired');

// --- Review Focus 1: a manual pick (non-default active level) suppresses it ---
assert.equal(
  resolvePriceLevel(rebisco, 10, PREMIUM, DEFAULT, AUTO).price, 200,
  'a non-default active level suppresses the automatic step (falls back to the default row)',
);

// --- Review Focus 2: cheapest wins when two levels qualify at the same qty ---
const twoTiers: any = {
  id: 'two', price: 200,
  priceLevels: [
    { levelId: WHOLESALE, price: 110, minQuantity: 10 },
    { levelId: DEALER, price: 105, minQuantity: 10 },
  ],
};
const cheapest = resolvePriceLevel(twoTiers, 10, DEFAULT, DEFAULT, AUTO);
assert.equal(cheapest.price, 105, 'the cheapest qualifying tier wins');
assert.equal(cheapest.levelId, DEALER, 'and the badge names that level');

// --- Review Focus 3: a markup-only tier never raises the price ---
const markupOnly: any = {
  id: 'markup', price: 200,
  priceLevels: [{ levelId: PREMIUM, price: 250, minQuantity: 10 }],
};
assert.equal(
  resolvePriceLevel(markupOnly, 10, DEFAULT, DEFAULT, AUTO).price, 200,
  'an automatic tier never raises the price above the base',
);

// --- The P70 leak guard: a FLAT row on another level never leaks ---
const flatOtherLevel: any = {
  id: 'leak', price: 200,
  priceLevels: [
    { levelId: WHOLESALE, price: 70, minQuantity: 0 },
    { levelId: DEFAULT, price: 200, minQuantity: 1 },
  ],
};
for (const qty of [1, 10, 50]) {
  assert.equal(
    resolvePriceLevel(flatOtherLevel, qty, DEFAULT, DEFAULT, AUTO).price, 200,
    `a flat row on another level never leaks (qty ${qty})`,
  );
}
assert.equal(
  resolvePriceLevel(
    { id: 'one', price: 200, priceLevels: [{ levelId: WHOLESALE, price: 70, minQuantity: 1 }] } as any,
    10, DEFAULT, DEFAULT, AUTO,
  ).price,
  200,
  'minQuantity of 1 means "no minimum" and is not an eligible tier',
);

// --- Review Focus 4: a string minQuantity still compares as a number ---
assert.equal(
  resolvePriceLevel(
    { id: 's', price: 200, priceLevels: [{ levelId: WHOLESALE, price: 110, minQuantity: '10' }] } as any,
    10, DEFAULT, DEFAULT, AUTO,
  ).price,
  110,
  'a string minimum from the driver is coerced before comparing',
);

// --- Review Focus 5: absent or empty priceLevels fall through, never throw ---
assert.equal(
  resolvePriceLevel({ id: 'n', price: 200 } as any, 10, DEFAULT, DEFAULT, AUTO).price, 200,
  'a product with no priceLevels array falls through to the base price',
);
assert.equal(
  resolvePriceLevel({ id: 'e', price: 200, priceLevels: [] } as any, 10, DEFAULT, DEFAULT, AUTO).price, 200,
  'an empty priceLevels array falls through to the base price',
);

console.log('auto-quantity-tier: all assertions passed');
