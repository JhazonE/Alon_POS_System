import assert from 'node:assert/strict';
import type { Product } from '../../lib/types';
import {
  UNASSIGNED_SHELF_ID,
  shelfQuantityOf,
  productsOnShelf,
} from '../../app/(app)/inventory/bulk-adjustment/shelf-quantities';

/** Minimal nga product — ang mga field nga gi-gamit ra sa shelf math. */
function product(over: Partial<Product>): Product {
  return { id: 'p1', name: 'P', stock: 0, price: 0, ...over } as Product;
}

// --- shelfQuantityOf ---

const twoShelves = product({ stock: 100, shelfQuantities: { a1: 3, b2: 10 } });
assert.equal(shelfQuantityOf(twoShelves, 'a1'), 3, 'quantity sa gipili nga shelf');
assert.equal(shelfQuantityOf(twoShelves, 'b2'), 10, 'quantity sa laing shelf');
assert.equal(shelfQuantityOf(twoShelves, 'zz'), 0, '0 kung wala sa shelf');
assert.equal(shelfQuantityOf(twoShelves, UNASSIGNED_SHELF_ID), 87, 'unassigned = stock olos sa assigned');

// Review Focus 3: ang unassigned mahimong 0 bisan dako ang total stock.
const fullyShelved = product({ stock: 13, shelfQuantities: { a1: 3, b2: 10 } });
assert.equal(shelfQuantityOf(fullyShelved, UNASSIGNED_SHELF_ID), 0, 'unassigned = 0 kung assigned na ang tanan');

const overAssigned = product({ stock: 5, shelfQuantities: { a1: 10 } });
assert.equal(shelfQuantityOf(overAssigned, UNASSIGNED_SHELF_ID), 0, 'wala mo-negative');

const noShelves = product({ stock: 42 });
assert.equal(shelfQuantityOf(noShelves, UNASSIGNED_SHELF_ID), 42, 'walay assignment: tanan unassigned');
assert.equal(shelfQuantityOf(noShelves, 'a1'), 0, 'walay assignment: 0 sa bisan unsang shelf');

// --- productsOnShelf ---

const onShelfCases = [
  product({ id: 'has', stock: 50, shelfQuantities: { a1: 5 } }),
  product({ id: 'zero', stock: 50, shelfQuantities: { a1: 0 } }),
  product({ id: 'other', stock: 50, shelfQuantities: { b2: 5 } }),
];
assert.deepEqual(
  productsOnShelf(onShelfCases, 'a1').map(p => p.id),
  ['has'],
  'ang naa ra gyuy stock sa shelf ang mogawas',
);

const unassignedCases = [
  product({ id: 'loose', stock: 10, shelfQuantities: { a1: 4 } }),
  product({ id: 'allshelved', stock: 10, shelfQuantities: { a1: 10 } }),
];
assert.deepEqual(
  productsOnShelf(unassignedCases, UNASSIGNED_SHELF_ID).map(p => p.id),
  ['loose'],
  'unassigned: ang naa pay wala ma-assign ang mogawas',
);

console.log('✓ shelf-quantities');
