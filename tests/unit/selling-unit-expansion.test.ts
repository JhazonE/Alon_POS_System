import assert from 'node:assert/strict';
import { expandProductSellingUnits } from '../../src/infrastructure/repositories/product-selling-unit-expansion';

const sardines = {
  id: 'p1', name: 'Sardines', price: 25, barcode: '5200000000014',
  stock: 60, unitOfMeasure: 'Piece', priceLevels: [{ levelId: 'retail', price: 25 }],
};
const soap = { id: 'p2', name: 'Soap', price: 10, barcode: '99', stock: 5, unitOfMeasure: 'Piece' };

const units = [
  { id: 'psu-base', product_id: 'p1', unit_name: 'Piece', qty_base: '1.000000',
    barcode: '5200000000014', price: '25.00', is_base: 1, sort_order: 0 },
  { id: 'psu-case', product_id: 'p1', unit_name: 'Case', qty_base: '24.000000',
    barcode: '5200000000021', price: '580.00', is_base: 0, sort_order: 1 },
];

// (a) a product with units becomes one row per unit
{
  const out = expandProductSellingUnits([sardines], units);
  assert.equal(out.length, 2, 'two units produce two rows');

  const [base, kase] = out;
  assert.equal(base.id, 'p1', 'the product id is PRESERVED — it is the FK for sale_items');
  assert.equal(base.sellingUnitId, 'psu-base');
  assert.equal(base.isBaseUnit, true);
  assert.equal(base.name, 'Sardines', 'the base unit gets no name suffix');
  assert.equal(base.price, 25);
  assert.equal(base.stock, 60, '60 base units is 60 Pieces');
  assert.equal(base.baseStock, 60, 'the base figure is carried for oversell checks');
  assert.equal(base.qtyBase, 1);

  assert.equal(kase.id, 'p1', 'both rows share the product id');
  assert.equal(kase.sellingUnitId, 'psu-case');
  assert.equal(kase.isBaseUnit, false);
  assert.equal(kase.name, 'Sardines Case', 'a non-base unit is named for its unit');
  assert.equal(kase.price, 580, "the unit's own price wins, not products.price");
  assert.equal(kase.barcode, '5200000000021', "the unit's own barcode");
  assert.equal(kase.stock, 2, '60 base units is 2 whole Cases');
  assert.equal(kase.baseStock, 60);
  assert.equal(kase.qtyBase, 24);
  assert.equal(kase.unitOfMeasure, 'Case');
}

// (b) REVIEW FOCUS 4: a product with no units is passed through untouched
{
  const out = expandProductSellingUnits([soap], units);
  assert.equal(out.length, 1, 'a unit-less product yields exactly one row');
  assert.equal(out[0].id, 'p2');
  assert.equal(out[0].sellingUnitId, undefined, 'no unit id is invented');
  assert.equal(out[0].price, 10, 'its price is untouched');
  assert.equal(out[0].stock, 5, 'its stock is untouched');
  assert.equal(out[0].name, 'Soap');
}

// (c) products are never dropped, and order is preserved
{
  const out = expandProductSellingUnits([sardines, soap], units);
  assert.equal(out.length, 3, '2 units + 1 unit-less product');
  assert.deepEqual(out.map((r: any) => r.id), ['p1', 'p1', 'p2'], 'input order is preserved');
}

// (d) rows are sorted by sort_order, not by database return order
{
  const reversed = [units[1], units[0]];
  const out = expandProductSellingUnits([sardines], reversed);
  assert.equal(out[0].sellingUnitId, 'psu-base', 'sort_order 0 comes first');
  assert.equal(out[1].sellingUnitId, 'psu-case');
}

// (e) no units at all: every product passes through
{
  const out = expandProductSellingUnits([sardines, soap], []);
  assert.equal(out.length, 2, 'an empty unit set expands nothing and drops nothing');
  assert.equal(out[0].price, 25);
}

// (f) the input rows are not mutated
{
  const input = { ...sardines };
  expandProductSellingUnits([input], units);
  assert.equal(input.price, 25, 'the source product object is left alone');
  assert.equal(input.name, 'Sardines');
  assert.equal((input as any).sellingUnitId, undefined);
}

// (g) a zero/negative qty_base does not corrupt the row (defence in depth)
{
  const bad = [{ id: 'psu-bad', product_id: 'p1', unit_name: 'Bad', qty_base: '0.000000',
    barcode: 'b1', price: '1.00', is_base: 0, sort_order: 0 }];
  const out = expandProductSellingUnits([sardines], bad);
  assert.equal(out.length, 1);
  assert.equal(out[0].stock, 60, 'a zero ratio does not divide the stock');
}

// (h) priceLevels survive expansion — the base unit still needs its tiers
{
  const out = expandProductSellingUnits([sardines], units);
  assert.deepEqual(out[0].priceLevels, [{ levelId: 'retail', price: 25 }], 'base keeps its tiers');
}

console.log('✓ selling-unit-expansion.test');
