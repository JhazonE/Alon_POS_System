import assert from 'node:assert/strict';
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput } from '../../lib/selling-units-migration';

function makeIdGen(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** qty_base is fractional for non-base units, so compare with an epsilon. */
function assertClose(actual: number, expected: number, message: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message} (expected ~${expected}, got ${actual})`
  );
}

// --- Standalone product: no parent, no children ---
{
  const products: MigrationProductInput[] = [
    { id: 'P1', parentId: null, unitOfMeasure: 'Piece', barcode: '111', cost: 5, price: 10, conversionFactor: null },
  ];
  const plan = computeSellingUnitsPlan(products, [], makeIdGen('su'));
  assert.equal(plan.sellingUnits.length, 1, 'standalone product gets exactly one selling unit');
  assert.equal(plan.sellingUnits[0].isBase, true);
  assert.equal(plan.sellingUnits[0].qtyBase, 1);
  assert.equal(plan.sellingUnits[0].barcode, '111');
  assert.deepEqual(plan.deletedProductIds, []);
  assert.deepEqual(plan.reassignments, []);
}

// --- 2-level family: parent + 1 child, factor from conversion_factors ---
{
  const products: MigrationProductInput[] = [
    { id: 'PARENT', parentId: null, unitOfMeasure: 'Sachet', barcode: 'P-BC', cost: 1, price: 2, conversionFactor: null },
    { id: 'CHILD', parentId: 'PARENT', unitOfMeasure: 'Box', barcode: 'C-BC', cost: 10, price: 20, conversionFactor: 999 },
  ];
  const cfs: MigrationConversionFactorInput[] = [
    { productId: 'PARENT', unit: 'Box', factor: 12 },
  ];
  const plan = computeSellingUnitsPlan(products, cfs, makeIdGen('su'));
  assert.equal(plan.sellingUnits.length, 2, 'base + one derived unit');
  const boxUnit = plan.sellingUnits.find(u => u.sourceProductId === 'CHILD')!;
  // The root (PARENT) stays the base unit. A conversion_factors row means
  // "1 PARENT unit = 12 CHILD units", so one CHILD unit is 1/12 of a base unit.
  assertClose(boxUnit.qtyBase, 1 / 12, 'conversion_factors row (12) wins over conversionFactor scalar (999), inverted');
  assert.equal(boxUnit.rootProductId, 'PARENT');
  assert.deepEqual(plan.deletedProductIds, ['CHILD']);
  assert.deepEqual(plan.reassignments, [{ fromProductId: 'CHILD', toRootProductId: 'PARENT', sellingUnitId: boxUnit.id }]);
}

// --- 3-level family: composed qty_base, deepest-first deletion order ---
{
  const products: MigrationProductInput[] = [
    { id: 'GRANDPARENT', parentId: null, unitOfMeasure: 'Piece', barcode: 'GP', cost: 1, price: 2, conversionFactor: null },
    { id: 'PARENT', parentId: 'GRANDPARENT', unitOfMeasure: 'Box', barcode: 'PA', cost: 10, price: 20, conversionFactor: null },
    { id: 'CHILD', parentId: 'PARENT', unitOfMeasure: 'Case', barcode: 'CH', cost: 100, price: 200, conversionFactor: null },
  ];
  const cfs: MigrationConversionFactorInput[] = [
    { productId: 'GRANDPARENT', unit: 'Box', factor: 12 },
    { productId: 'PARENT', unit: 'Case', factor: 5 },
  ];
  const plan = computeSellingUnitsPlan(products, cfs, makeIdGen('su'));
  assert.equal(plan.sellingUnits.length, 3, 'one product ends up with 3 flat selling units');
  const boxUnit = plan.sellingUnits.find(u => u.sourceProductId === 'PARENT')!;
  const caseUnit = plan.sellingUnits.find(u => u.sourceProductId === 'CHILD')!;
  // GRANDPARENT is the root/base unit (qty_base = 1). Composed factors run
  // downward: 1 GRANDPARENT = 12 PARENT units, and 1 GRANDPARENT = 12 * 5 = 60
  // CHILD units. qty_base inverts that — one PARENT unit is 1/12 of a base
  // unit, and one CHILD unit is 1/60 of a base unit.
  assertClose(boxUnit.qtyBase, 1 / 12, 'direct child factor, inverted');
  assertClose(caseUnit.qtyBase, 1 / 60, 'composed 12 (grandparent->parent) * 5 (parent->child) = 60, inverted to 1/60');
  assert.equal(boxUnit.rootProductId, 'GRANDPARENT');
  assert.equal(caseUnit.rootProductId, 'GRANDPARENT');
  assert.deepEqual(plan.deletedProductIds, ['CHILD', 'PARENT'], 'deepest-first: CHILD before PARENT so the parent_id FK never blocks a delete');
}

// --- Barcode collisions get a deterministic synthetic fallback ---
{
  const products: MigrationProductInput[] = [
    { id: 'A', parentId: null, unitOfMeasure: 'Piece', barcode: 'DUPLICATE', cost: 1, price: 2, conversionFactor: null },
    { id: 'B', parentId: null, unitOfMeasure: 'Piece', barcode: 'DUPLICATE', cost: 1, price: 2, conversionFactor: null },
    { id: 'C', parentId: null, unitOfMeasure: 'Piece', barcode: null, cost: 1, price: 2, conversionFactor: null },
  ];
  const plan = computeSellingUnitsPlan(products, [], makeIdGen('su'));
  const barcodes = plan.sellingUnits.map(u => u.barcode);
  assert.equal(new Set(barcodes).size, 3, 'all three barcodes are unique after fallback resolution');
  assert.ok(barcodes.includes('DUPLICATE'), 'first claimant keeps its real barcode');
  assert.ok(barcodes.includes('SU-B'), 'second claimant of the same barcode falls back to SU-<id>');
  assert.ok(barcodes.includes('SU-C'), 'blank barcode falls back to SU-<id>');
}

// --- unit_name collisions inside one root get disambiguated (UNIQUE(product_id, unit_name)) ---
{
  const products: MigrationProductInput[] = [
    { id: 'R', parentId: null, unitOfMeasure: 'Piece', barcode: 'R-BC', cost: 1, price: 2, conversionFactor: null },
    { id: 'C1', parentId: 'R', unitOfMeasure: 'Piece', barcode: 'C1-BC', cost: 1, price: 2, conversionFactor: 6 },
    { id: 'C2', parentId: 'R', unitOfMeasure: 'Piece', barcode: 'C2-BC', cost: 1, price: 2, conversionFactor: 8 },
    // A second root may reuse the same names freely — the constraint is per product.
    { id: 'R2', parentId: null, unitOfMeasure: 'Piece', barcode: 'R2-BC', cost: 1, price: 2, conversionFactor: null },
  ];
  const plan = computeSellingUnitsPlan(products, [], makeIdGen('su'));
  const keys = plan.sellingUnits.map(u => `${u.rootProductId}::${u.unitName}`);
  assert.equal(new Set(keys).size, keys.length, '(product_id, unit_name) pairs are unique');
  assert.equal(plan.sellingUnits.find(u => u.sourceProductId === 'R')!.unitName, 'Piece');
  assert.equal(plan.sellingUnits.find(u => u.sourceProductId === 'C1')!.unitName, 'Piece (2)');
  assert.equal(plan.sellingUnits.find(u => u.sourceProductId === 'C2')!.unitName, 'Piece (3)');
  assert.equal(plan.sellingUnits.find(u => u.sourceProductId === 'R2')!.unitName, 'Piece', 'a different root reuses the name');
}

// --- synthetic barcode fallback keeps looking when SU-<id> is itself taken ---
{
  const products: MigrationProductInput[] = [
    { id: 'X', parentId: null, unitOfMeasure: 'Piece', barcode: 'SU-Y', cost: 1, price: 2, conversionFactor: null },
    { id: 'Y', parentId: null, unitOfMeasure: 'Piece', barcode: null, cost: 1, price: 2, conversionFactor: null },
  ];
  const plan = computeSellingUnitsPlan(products, [], makeIdGen('su'));
  const barcodes = plan.sellingUnits.map(u => u.barcode);
  assert.equal(new Set(barcodes).size, 2, 'fallback does not collide with a real barcode that looks like SU-<id>');
  assert.ok(barcodes.includes('SU-Y-2'), 'fallback suffixes until free');
}

// --- a parent_id cycle is caught rather than silently dropping products ---
{
  const products: MigrationProductInput[] = [
    { id: 'A', parentId: 'B', unitOfMeasure: 'Piece', barcode: 'A', cost: 1, price: 2, conversionFactor: null },
    { id: 'B', parentId: 'A', unitOfMeasure: 'Box', barcode: 'B', cost: 1, price: 2, conversionFactor: null },
  ];
  assert.throws(
    () => computeSellingUnitsPlan(products, [], makeIdGen('su')),
    /not reachable from any root/,
    'a parent_id cycle throws instead of orphaning products'
  );
}

console.log('selling-units-migration: all assertions passed');
