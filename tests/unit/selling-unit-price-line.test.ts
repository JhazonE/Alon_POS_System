import assert from 'node:assert/strict';
import { priceLineForProduct } from '../../lib/selling-unit-pricing';
import { buildLineId } from '../../lib/selling-unit-qty';

// A stand-in for resolvePriceLevel: always claims a wholesale tier of 23.
let resolverCalls = 0;
const resolver = (_p: any, _q: number) => {
  resolverCalls += 1;
  return { price: 23, priceLevelLabel: 'Wholesale' };
};

// (a) a NON-BASE unit uses its own price and never consults the level resolver.
// product_price_levels rows are the BASE unit's prices; applying a 23 Piece
// tier to a Case of 24 would quote a sachet's price for a whole case.
{
  resolverCalls = 0;
  const kase = { id: 'p1', price: 580, sellingUnitId: 'psu-case', isBaseUnit: false, qtyBase: 24 };
  const out = priceLineForProduct(kase, 3, resolver);
  assert.equal(out.price, 580, "the unit's own price is used");
  assert.equal(out.priceLevelLabel, undefined, 'no level badge is shown for a non-base unit');
  assert.equal(resolverCalls, 0, 'the level resolver is not consulted at all');
}

// (b) a BASE unit keeps the full existing tier behaviour
{
  resolverCalls = 0;
  const piece = { id: 'p1', price: 25, sellingUnitId: 'psu-base', isBaseUnit: true, qtyBase: 1 };
  const out = priceLineForProduct(piece, 10, resolver);
  assert.equal(out.price, 23, 'the resolved tier price wins');
  assert.equal(out.priceLevelLabel, 'Wholesale', 'the badge is shown');
  assert.equal(resolverCalls, 1, 'the resolver IS consulted');
}

// (c) a product with no selling units is unchanged — the October 2 tier work
// must not regress for the overwhelmingly common case.
{
  resolverCalls = 0;
  const plain = { id: 'p2', price: 10 };
  const out = priceLineForProduct(plain, 5, resolver);
  assert.equal(out.price, 23);
  assert.equal(out.priceLevelLabel, 'Wholesale');
  assert.equal(resolverCalls, 1);
}

// (d) a hand-edited cart line re-priced later still routes by unit, not by id
{
  resolverCalls = 0;
  const kase = { id: 'p1', price: 540, sellingUnitId: 'psu-case', isBaseUnit: false, qtyBase: 24 };
  assert.equal(priceLineForProduct(kase, 1, resolver).price, 540, 'the line price is respected');
  assert.equal(resolverCalls, 0);
}

// A discount must target the CART LINE, not the product. An expanded product's
// BASE row already carries a sellingUnitId, so its lineId is composite - passing
// the product id would match no line and silently drop the discount.
{
  const baseRow = { id: 'p1', sellingUnitId: 'psu-base', isBaseUnit: true };
  const caseRow = { id: 'p1', sellingUnitId: 'psu-case', isBaseUnit: false };
  assert.equal(buildLineId(baseRow.id, baseRow.sellingUnitId), 'p1::psu-base', 'a base row of an expanded product still has a composite lineId');
  assert.notEqual(buildLineId(baseRow.id, baseRow.sellingUnitId), baseRow.id, 'the base row lineId is NOT the bare product id');
  assert.notEqual(buildLineId(baseRow.id, baseRow.sellingUnitId), buildLineId(caseRow.id, caseRow.sellingUnitId), 'two units of one product never share a lineId');
}

console.log('✓ selling-unit-price-line.test');
