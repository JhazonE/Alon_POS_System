import assert from 'node:assert/strict';
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput } from '../../lib/selling-units-migration';

function makeIdGen(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
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
  assert.equal(boxUnit.qtyBase, 12, 'conversion_factors row (12) wins over conversionFactor scalar (999)');
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
  assert.equal(boxUnit.qtyBase, 12, 'direct child factor');
  assert.equal(caseUnit.qtyBase, 60, 'composed: 12 (grandparent->parent) * 5 (parent->child), not just 5');
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

console.log('selling-units-migration: all assertions passed');
