import assert from 'node:assert/strict';
import { calculatePriceLevelPrice } from '../../lib/price-level-calc';

// Ported from app/(app)/products/__tests__/price-level-calculation.test.ts,
// which was written against vitest — a framework this project does not install.
// That file therefore never ran and only surfaced as a typecheck error
// ("Cannot find module 'vitest'"). The coverage is real and distinct from
// price-level-calc.test.ts: that one tests applyPriceLevelAdjustment (the
// percentage/fixed arithmetic), this one tests calculatePriceLevelPrice (the
// level lookup and retail-vs-cost base selection on top of it).
//
// Mock levels deliberately omit adjustmentType, matching pre-existing DB rows;
// undefined behaves as 'percentage'.
const mockPriceLevels = [
  { id: 'level1', name: 'Wholesale', percentageAdjustment: 20, isDefault: false, calculationBase: 'retail' },
  { id: 'level2', name: 'Distributor', percentageAdjustment: -10, isDefault: false, calculationBase: 'cost' },
  { id: 'level3', name: 'Retail', percentageAdjustment: 0, isDefault: true, calculationBase: 'retail' },
];

// --- percentage adjustment against the chosen base ---

assert.equal(
  calculatePriceLevelPrice('level1', 'retail', mockPriceLevels, 100, 50),
  120,
  'positive adjustment on retail base: 100 * 1.20'
);
assert.equal(
  calculatePriceLevelPrice('level2', 'cost', mockPriceLevels, 100, 50),
  45,
  'negative adjustment on cost base: 50 * 0.90'
);
assert.equal(
  calculatePriceLevelPrice('level3', 'retail', mockPriceLevels, 100, 50),
  100,
  'zero adjustment leaves the base untouched'
);

// --- calculationBase selects WHICH form field is the base ---

assert.equal(
  calculatePriceLevelPrice('level1', 'cost', mockPriceLevels, 100, 50),
  60,
  'same level against cost base uses formCost (50), not formPrice: 50 * 1.20'
);

// --- guards return 0 rather than NaN/undefined ---

assert.equal(
  calculatePriceLevelPrice('', 'retail', mockPriceLevels, 100, 50),
  0,
  'empty levelId yields 0'
);
assert.equal(
  calculatePriceLevelPrice('nonexistent', 'retail', mockPriceLevels, 100, 50),
  0,
  'unknown levelId yields 0'
);
assert.equal(
  calculatePriceLevelPrice('level1', 'retail', mockPriceLevels, undefined as any, 50),
  0,
  'undefined base price yields 0 (not NaN)'
);

// --- fractional percentages ---

const fractionalLevels = [
  { id: 'frac', name: 'Fractional', percentageAdjustment: 15.5, isDefault: false, calculationBase: 'retail' },
];
assert.ok(
  Math.abs(calculatePriceLevelPrice('frac', 'retail', fractionalLevels, 200, 100) - 231) < 1e-9,
  'fractional percentage: 200 * 1.155 = 231'
);

console.log('✓ price-level-price-calc');
