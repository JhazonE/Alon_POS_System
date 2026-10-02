import assert from 'node:assert/strict';
import { calculateEffectivePrice, resolvePriceLevel } from '../../lib/pricing';

const RETAIL = 'retail-level';
const WHOLESALE = 'wholesale-level';
const PREMIUM = 'premium-level';

const p = (price: number, priceLevels: any[] = []) => ({ price, priceLevels }) as any;

// --- base behaviour: no level rows at all ---
assert.equal(calculateEffectivePrice(p(100), 1, RETAIL, RETAIL), 100, 'falls back to base price with no level rows');

// --- active level wins over default ---
const twoLevels = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: WHOLESALE, price: 90, minQuantity: 0 },
]);
assert.equal(calculateEffectivePrice(twoLevels, 1, RETAIL, RETAIL), 100, 'retail customer pays retail');
assert.equal(calculateEffectivePrice(twoLevels, 1, WHOLESALE, RETAIL), 90, 'wholesale customer pays wholesale');

// --- Review Focus 1: a level priced ABOVE base must win, not be capped ---
const premium = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: PREMIUM, price: 120, minQuantity: 0 },
]);
assert.equal(calculateEffectivePrice(premium, 1, PREMIUM, RETAIL), 120, 'a level above base price is honoured, not capped at base');

// --- quantity tiers within the active level ---
const tiered = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: RETAIL, price: 85, minQuantity: 10 },
  { levelId: RETAIL, price: 75, minQuantity: 50 },
]);
assert.equal(calculateEffectivePrice(tiered, 1, RETAIL, RETAIL), 100, 'below the first tier, the base row applies');
assert.equal(calculateEffectivePrice(tiered, 9, RETAIL, RETAIL), 100, 'one short of the tier, the base row still applies');
assert.equal(calculateEffectivePrice(tiered, 10, RETAIL, RETAIL), 85, 'exactly at the tier, the tier applies');
assert.equal(calculateEffectivePrice(tiered, 49, RETAIL, RETAIL), 85, 'between tiers, the lower tier applies');
assert.equal(calculateEffectivePrice(tiered, 50, RETAIL, RETAIL), 75, 'the highest qualifying tier wins');
assert.equal(calculateEffectivePrice(tiered, 999, RETAIL, RETAIL), 75, 'above the top tier, the top tier applies');

// --- Review Focus 2: a tier on a NON-active level must never leak ---
const leak = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: WHOLESALE, price: 70, minQuantity: 10 },
]);
assert.equal(calculateEffectivePrice(leak, 10, RETAIL, RETAIL), 100, 'a wholesale tier does not apply to a retail customer');
assert.equal(calculateEffectivePrice(leak, 10, WHOLESALE, RETAIL), 70, 'the wholesale tier does apply to a wholesale customer');

// --- spec D3: strict isolation, no cross-level bargain hunting ---
const isolation = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: RETAIL, price: 85, minQuantity: 10 },
  { levelId: WHOLESALE, price: 90, minQuantity: 0 },
]);
assert.equal(calculateEffectivePrice(isolation, 10, WHOLESALE, RETAIL), 90, 'a wholesale customer keeps wholesale even when a retail tier is cheaper');

// --- Review Focus 3: active level has a tier but no base row ---
const tierOnly = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: WHOLESALE, price: 70, minQuantity: 10 },
]);
assert.equal(calculateEffectivePrice(tierOnly, 1, WHOLESALE, RETAIL), 100, 'below its only tier, an active level falls back to the default level');
assert.equal(calculateEffectivePrice(tierOnly, 10, WHOLESALE, RETAIL), 70, 'at its tier, the active level applies');

// --- Review Focus 4: numeric comparison, not lexical ---
const stringy = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: '0' },
  { levelId: RETAIL, price: 85, minQuantity: '10' },
] as any);
assert.equal(calculateEffectivePrice(stringy, 9, RETAIL, RETAIL), 100, 'string "10" compares numerically: 9 does not reach it');
assert.equal(calculateEffectivePrice(stringy, 10, RETAIL, RETAIL), 85, 'string "10" compares numerically: 10 reaches it');

// --- minQuantity of 1 and null mean "no minimum" ---
const loose = p(100, [
  { levelId: WHOLESALE, price: 90, minQuantity: 1 },
  { levelId: PREMIUM, price: 110, minQuantity: null },
] as any);
assert.equal(calculateEffectivePrice(loose, 1, WHOLESALE, RETAIL), 90, 'minQuantity 1 is a base row');
assert.equal(calculateEffectivePrice(loose, 1, PREMIUM, RETAIL), 110, 'minQuantity null is a base row');

// --- no active level given: default level applies ---
assert.equal(calculateEffectivePrice(twoLevels, 1, undefined, RETAIL), 100, 'with no active level, the default level applies');

// --- a blank/invalid price row is ignored ---
const blank = p(100, [
  { levelId: RETAIL, price: NaN, minQuantity: 0 },
] as any);
assert.equal(calculateEffectivePrice(blank, 1, RETAIL, RETAIL), 100, 'a non-numeric level price is ignored, base price applies');

// --- ties on minQuantity resolve to the lower price, deterministically ---
const tie = p(100, [
  { levelId: RETAIL, price: 95, minQuantity: 10 },
  { levelId: RETAIL, price: 85, minQuantity: 10 },
]);
assert.equal(calculateEffectivePrice(tie, 10, RETAIL, RETAIL), 85, 'a tie on minQuantity resolves to the lower price');

// --- null and blank prices are rejected, falling through to base price ---
const nullPrice = p(100, [
  { levelId: RETAIL, price: null, minQuantity: 0 },
] as any);
assert.equal(calculateEffectivePrice(nullPrice, 1, RETAIL, RETAIL), 100, 'a level row with price: null falls through to base price');

const blankPrice = p(100, [
  { levelId: RETAIL, price: '', minQuantity: 0 },
] as any);
assert.equal(calculateEffectivePrice(blankPrice, 1, RETAIL, RETAIL), 100, 'a level row with price: empty string falls through to base price');

// --- higher-minimum tier that is MORE EXPENSIVE still wins ---
const expensiveTier = p(100, [
  { levelId: RETAIL, price: 85, minQuantity: 10 },
  { levelId: RETAIL, price: 95, minQuantity: 50 },
]);
assert.equal(calculateEffectivePrice(expensiveTier, 50, RETAIL, RETAIL), 95, 'a higher-minimum tier that is more expensive still wins (highest minQuantity rule)');

// --- row-order independence: same tier set in descending order resolves identically ---
const descendingOrder = p(100, [
  { levelId: RETAIL, price: 75, minQuantity: 50 },
  { levelId: RETAIL, price: 85, minQuantity: 10 },
  { levelId: RETAIL, price: 100, minQuantity: 0 },
]);
assert.equal(calculateEffectivePrice(descendingOrder, 1, RETAIL, RETAIL), 100, 'descending order: below tier');
assert.equal(calculateEffectivePrice(descendingOrder, 10, RETAIL, RETAIL), 85, 'descending order: first tier');
assert.equal(calculateEffectivePrice(descendingOrder, 50, RETAIL, RETAIL), 75, 'descending order: highest tier');

// --- tie on minQuantity where cheaper row is listed first ---
const tieFirstCheaper = p(100, [
  { levelId: RETAIL, price: 75, minQuantity: 10 },
  { levelId: RETAIL, price: 85, minQuantity: 10 },
]);
assert.equal(calculateEffectivePrice(tieFirstCheaper, 10, RETAIL, RETAIL), 75, 'a tie on minQuantity with the cheaper row listed first resolves to the lower price');

// --- active level above base beats default level below ---
const activeAboveDefault = p(100, [
  { levelId: WHOLESALE, price: 130, minQuantity: 0 },
  { levelId: RETAIL, price: 80, minQuantity: 0 },
]);
assert.equal(calculateEffectivePrice(activeAboveDefault, 1, WHOLESALE, RETAIL), 130, 'active level priced above base beats cheaper default level');

// --- resolvePriceLevel reports what was used (for the POS badge) ---
const r1 = resolvePriceLevel(tiered, 10, RETAIL, RETAIL);
assert.equal(r1.price, 85, 'resolvePriceLevel returns the tier price');
assert.equal(r1.levelId, RETAIL, 'resolvePriceLevel reports the level used');
assert.equal(r1.minQuantity, 10, 'resolvePriceLevel reports the tier minimum that fired');

const r2 = resolvePriceLevel(p(100), 1, RETAIL, RETAIL);
assert.equal(r2.price, 100, 'resolvePriceLevel falls back to base price');
assert.equal(r2.levelId, null, 'resolvePriceLevel reports no level for a base-price fallback');
assert.equal(r2.minQuantity, 0, 'resolvePriceLevel reports no tier for a base-price fallback');

console.log('effective-price: all assertions passed');
