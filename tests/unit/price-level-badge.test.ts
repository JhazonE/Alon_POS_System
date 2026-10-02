import assert from 'node:assert/strict';
import { priceLevelLabel } from '../../lib/price-level-badge';

const levels = [
  { id: 'retail-level', name: 'Retail', isDefault: true },
  { id: 'wholesale-level', name: 'Wholesale', isDefault: false },
];

// a plain level row shows just the level name
assert.equal(
  priceLevelLabel({ price: 90, levelId: 'wholesale-level', minQuantity: 0 }, levels),
  'Wholesale',
  'a level with no tier shows just its name',
);

// a tier shows the minimum that fired
assert.equal(
  priceLevelLabel({ price: 85, levelId: 'retail-level', minQuantity: 10 }, levels),
  'Retail · 10+',
  'a tier shows the level name and the minimum that fired',
);

// a base-price fallback has no badge
assert.equal(
  priceLevelLabel({ price: 100, levelId: null, minQuantity: 0 }, levels),
  undefined,
  'a base-price fallback produces no badge',
);

// an unknown level id degrades gracefully rather than showing a raw id
assert.equal(
  priceLevelLabel({ price: 50, levelId: 'ghost-level', minQuantity: 0 }, levels),
  undefined,
  'an unknown level id produces no badge rather than a raw id',
);

// a fractional minimum is shown as entered, not rounded away
assert.equal(
  priceLevelLabel({ price: 85, levelId: 'retail-level', minQuantity: 2.5 }, levels),
  'Retail · 2.5+',
  'a fractional minimum is shown as entered',
);

// an empty level list degrades gracefully
assert.equal(
  priceLevelLabel({ price: 90, levelId: 'wholesale-level', minQuantity: 0 }, []),
  undefined,
  'no badge when the level list has not loaded yet',
);

console.log('price-level-badge: all assertions passed');
