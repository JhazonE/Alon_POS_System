import assert from 'node:assert/strict';
import { repriceCartLines } from '../../lib/cart-reprice';

type Line = { id: string; price: number; quantity: number; priceLevelLabel?: string };

// A stand-in pricer: wholesale price 90 labelled 'Wholesale', or base price 100 with no badge.
const wholesale = (_item: Line, _qty: number) => ({ price: 90, priceLevelLabel: 'Wholesale' });
const base = (item: Line, _qty: number) => ({ price: item.price, priceLevelLabel: undefined });

// (a) nothing differs -> the same array identity comes back
{
  const items: Line[] = [{ id: 'a', price: 90, quantity: 1, priceLevelLabel: 'Wholesale' }];
  assert.equal(repriceCartLines(items, wholesale), items, 'identity is preserved when nothing differs');
  assert.equal(repriceCartLines(items, wholesale, { labelsOnly: true }), items, 'identity is preserved in labelsOnly mode too');
}

// (b) a label-only change at the same price is detected
{
  const items: Line[] = [{ id: 'a', price: 90, quantity: 1, priceLevelLabel: 'Retail' }];
  const out = repriceCartLines(items, wholesale);
  assert.notEqual(out, items, 'a new array is returned when only the label changed');
  assert.equal(out[0].price, 90);
  assert.equal(out[0].priceLevelLabel, 'Wholesale', 'the label is updated');
}

// a full reprice (real level switch) does overwrite the price
{
  const items: Line[] = [{ id: 'a', price: 100, quantity: 1 }];
  const out = repriceCartLines(items, wholesale);
  assert.equal(out[0].price, 90, 'a level switch reprices the line');
  assert.equal(out[0].priceLevelLabel, 'Wholesale');
}

// (c) the level list arrives late: labels are filled in, prices are preserved
{
  const items: Line[] = [
    { id: 'a', price: 90, quantity: 1 }, // restored line priced by the level, label not yet known
    { id: 'b', price: 77, quantity: 1 }, // restored line the cashier priced by hand
  ];
  const out = repriceCartLines(items, wholesale, { labelsOnly: true });
  assert.equal(out[0].price, 90);
  assert.equal(out[0].priceLevelLabel, 'Wholesale', 'a line whose price matches the level gets its badge');
  assert.equal(out[1].price, 77, 'a hand-edited price survives the level list arriving');
  assert.equal(out[1].priceLevelLabel, undefined, 'a hand-edited line does not get a badge it has not earned');
  assert.equal(items[1].price, 77, 'the input is not mutated');
}

// labelsOnly never touches a price even when the pricer disagrees
{
  const items: Line[] = [{ id: 'a', price: 55, quantity: 3, priceLevelLabel: 'Wholesale' }];
  const out = repriceCartLines(items, wholesale, { labelsOnly: true });
  assert.equal(out[0].price, 55, 'price is untouched');
  assert.equal(out[0].priceLevelLabel, undefined, 'a stale badge is cleared when the price no longer matches');
}

// a base-price line stays badge-free
{
  const items: Line[] = [{ id: 'a', price: 100, quantity: 1 }];
  assert.equal(repriceCartLines(items, base), items, 'base-price line is a no-op');
}

// an empty cart is a no-op
{
  const items: Line[] = [];
  assert.equal(repriceCartLines(items, wholesale), items, 'empty cart returns the same array');
}

console.log('cart-reprice: all assertions passed');
