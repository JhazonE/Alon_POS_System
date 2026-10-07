# POS Selling Units — Search, Cart & Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selling units visible and sellable in the POS — searchable, scannable, each with its own cart line — and carry `qty_base` through checkout into FIFO batch deduction, `sale_items`, and back out through the void paths.

**Architecture:** The repository expands one product row into one row per selling unit behind an opt-in `expandSellingUnits` flag, so only the POS sees the expanded shape and the other 10 `useProducts` consumers are untouched. Pure conversion math lives in a new `lib/selling-unit-qty.ts` so it is unit-testable without a database. Checkout resolves `qty_base` server-side from the database (never from the request) and multiplies into the existing, unmodified `deductFromBatches`.

**Tech Stack:** Next.js 16, TypeScript, raw `mysql2/promise`, custom unit test runner (`tsx tests/unit/run.ts`, assertions via `node:assert/strict`, files self-execute on import), Playwright E2E on port 3100.

**Spec:** [`docs/superpowers/specs/2026-10-07-pos-selling-units-checkout-design.md`](../specs/2026-10-07-pos-selling-units-checkout-design.md)

## Global Constraints

- **`sale_items.quantity` stores units sold, not base units.** 1 Case with `qty_base = 24` stores `quantity = 1`, `selling_unit_qty_base = 24`.
- **`qty_base` is always resolved server-side from the database.** Never read a multiplier from the request body; it scales a stock deduction.
- **Every `qty_base` lookup is scoped `AND psu.product_id = p.id`.** A unit id belonging to another product must resolve to `NULL`, not to a foreign factor.
- **A non-finite, zero or negative `qty_base` falls back to multiplier `1`.** Zero leaks stock; negative adds stock on a sale.
- **`COALESCE(selling_unit_qty_base, 1)` on every read-back.** All historical rows have `NULL` there and must restore exactly as they do today.
- **`product.id` stays the product id everywhere.** Cart identity uses the separate `lineId` field. `sale_items.product_id` is an FK to `products`.
- **Base units and unit-less products keep today's exact `resolvePriceLevel` behaviour.** The October 2 tier work must not regress.
- **New unit test files must be registered in `tests/unit/run.ts`'s `TEST_FILES` array** or they never run.
- **Migrations use the `columnExists` idempotency guard** and register via `registerMigration`, following `scripts/migrations/117_add_selling_unit_to_sale_items.ts`.

## Review Focus

Five conditions the spec implies but which no single task's happy path exercises. Each has its test assigned to the task that owns the code.

1. **A `sellingUnitId` from a different product arrives at checkout** — must fall back to multiplier `1` and deduct the unit count, never the foreign product's ratio. (Task 5)
2. **Voiding a pre-change sale, where `selling_unit_qty_base IS NULL`** — must restore exactly `quantity`, as it does today. (Task 7)
3. **A product whose `qty_base` is `0` or negative reaches the conversion** — must not zero out or invert a deduction. (Task 1)
4. **A product with zero selling-unit rows passes through expansion** — must yield exactly one row, identical to today, and never be dropped. (Task 2)
5. **`expandSellingUnits` absent** — `GET /api/products` must return one row per product for the 10 non-POS consumers. (Task 2)

---

### Task 1: Pure conversion math

**Files:**
- Create: `lib/selling-unit-qty.ts`
- Create: `tests/unit/selling-unit-qty.test.ts`
- Modify: `tests/unit/run.ts` (add to `TEST_FILES`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `toBaseQty(qty: number, qtyBase: unknown): number`
  - `toUnitStock(baseStock: unknown, qtyBase: unknown): number`
  - `buildLineId(productId: string, sellingUnitId?: string | null): string`
  - `safeQtyBase(qtyBase: unknown): number` — normaliser returning `1` for anything non-finite or `<= 0`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/selling-unit-qty.test.ts`:

```ts
import assert from 'node:assert/strict';
import { toBaseQty, toUnitStock, buildLineId, safeQtyBase } from '../../lib/selling-unit-qty';

// --- safeQtyBase: anything that cannot scale a deduction becomes 1 ---
// A zero multiplier would deduct nothing and leak stock; a negative one would
// ADD stock on a sale. Both fall back to 1 rather than corrupting inventory.
for (const bad of [0, -1, -24, NaN, Infinity, -Infinity, null, undefined, '', 'abc', {}]) {
  assert.equal(safeQtyBase(bad as unknown), 1, `${String(bad)} falls back to 1`);
}
assert.equal(safeQtyBase(24), 24, 'a valid ratio passes through');
assert.equal(safeQtyBase('24'), 24, 'a DECIMAL string from mysql2 is parsed');
assert.equal(safeQtyBase('24.000000'), 24, 'a DECIMAL(14,6) string is parsed');
assert.equal(safeQtyBase(0.25), 0.25, 'a fractional ratio is valid');

// --- toBaseQty ---
assert.equal(toBaseQty(3, 24), 72, '3 Cases of 24 is 72 base units');
assert.equal(toBaseQty(1, 1), 1, 'a base unit is unchanged');
assert.equal(toBaseQty(4, 0.25), 1, 'a fractional ratio converts down');
assert.equal(toBaseQty(5, null), 5, 'a missing ratio deducts the unit count');
assert.equal(toBaseQty(5, 0), 5, 'a zero ratio never deducts zero');
assert.equal(toBaseQty(5, -2), 5, 'a negative ratio never adds stock');

// --- toUnitStock ---
assert.equal(toUnitStock(60, 24), 2, '60 base units is 2 whole Cases');
assert.equal(toUnitStock(2.5, 0.25), 10, 'a fractional ratio converts up');
assert.equal(toUnitStock(60, 1), 60, 'a base unit shows base stock');
assert.equal(toUnitStock(23, 24), 0, 'a partial Case is not sellable as a Case');
assert.equal(toUnitStock(0, 24), 0, 'zero stays zero');
assert.equal(toUnitStock(60, 0), 60, 'a zero ratio does not divide');
assert.equal(toUnitStock('60.0000', 24), 2, 'a DECIMAL string from mysql2 is parsed');
// A negative base stock must stay negative: flooring toward 0 would hide an
// oversold product from the cashier.
assert.equal(toUnitStock(-48, 24), -2, 'negative stock stays negative');
assert.equal(toUnitStock(null, 24), 0, 'null stock reads as zero');

// --- buildLineId ---
assert.equal(buildLineId('prod-1', 'psu-7'), 'prod-1::psu-7', 'a unit gets a composite line id');
assert.equal(buildLineId('prod-1'), 'prod-1', 'no unit means the line id IS the product id');
assert.equal(buildLineId('prod-1', null), 'prod-1', 'a null unit means the product id');
assert.equal(buildLineId('prod-1', ''), 'prod-1', 'an empty unit means the product id');
// Two units of one product must never collide, and a unit line must never
// collide with its own product's unit-less line.
assert.notEqual(buildLineId('prod-1', 'psu-7'), buildLineId('prod-1', 'psu-8'));
assert.notEqual(buildLineId('prod-1', 'psu-7'), buildLineId('prod-1'));

console.log('✓ selling-unit-qty.test');
```

- [ ] **Step 2: Register the test file**

In `tests/unit/run.ts`, add `'selling-unit-qty.test',` to the end of the `TEST_FILES` array (after `'inline-editable-select-optional-value.test',`).

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../../lib/selling-unit-qty'`

- [ ] **Step 4: Write the implementation**

Create `lib/selling-unit-qty.ts`:

```ts
/**
 * lib/selling-unit-qty.ts
 *
 * Pure conversion math between a selling unit's quantity and the product's
 * base-stock quantity. Kept free of any database or React dependency so the
 * arithmetic that drives stock deduction is unit-testable on its own.
 *
 * A product's stock, its `inventory_batches` and its cost are all denominated
 * in BASE units. A selling unit declares how many base units it equals
 * (`qty_base`), so selling N of a unit consumes `N * qty_base` base units.
 */

/**
 * Normalises a `qty_base` read from the database into a usable multiplier.
 *
 * mysql2 returns DECIMAL columns as strings, so this parses as well as
 * validates. Anything non-finite or `<= 0` falls back to `1`: a zero
 * multiplier would deduct nothing and silently leak stock, and a negative one
 * would ADD stock on a sale. Migration 120's preflight already rejects
 * `qty_base <= 0`, so this is defence in depth rather than the primary guard.
 */
export function safeQtyBase(qtyBase: unknown): number {
  const n = typeof qtyBase === 'number' ? qtyBase : parseFloat(String(qtyBase ?? ''));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/** Base-stock units consumed by selling `qty` of a unit with ratio `qtyBase`. */
export function toBaseQty(qty: number, qtyBase: unknown): number {
  return qty * safeQtyBase(qtyBase);
}

/**
 * How many whole selling units `baseStock` amounts to — what the cashier needs
 * to know ("how many Cases can I still sell"), not the base count.
 *
 * Floored, because a partial Case is not sellable as a Case. A NEGATIVE base
 * stock is floored away from zero (-48/24 -> -2, not -2 rounded up), so an
 * oversold product still reads as oversold rather than as empty.
 */
export function toUnitStock(baseStock: unknown, qtyBase: unknown): number {
  const stock = typeof baseStock === 'number' ? baseStock : parseFloat(String(baseStock ?? ''));
  if (!Number.isFinite(stock)) return 0;
  const units = stock / safeQtyBase(qtyBase);
  return units < 0 ? -Math.floor(-units) : Math.floor(units);
}

/**
 * The cart's identity for one line.
 *
 * Two selling units of the same product are two independent cart lines, so the
 * product id alone cannot identify a line. This stays SEPARATE from
 * `product.id`, which must keep its own meaning: it is the FK written to
 * `sale_items.product_id`.
 */
export function buildLineId(productId: string, sellingUnitId?: string | null): string {
  return sellingUnitId ? `${productId}::${sellingUnitId}` : productId;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `✓ selling-unit-qty.test` and `All 54 unit test files passed.`

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/selling-unit-qty.ts tests/unit/selling-unit-qty.test.ts tests/unit/run.ts
git commit -m "feat(pos): add pure selling-unit quantity conversion helpers"
```

---

### Task 2: Server-side row expansion

**Files:**
- Modify: `src/core/products/domain/IProductRepository.ts:3-12` (add filter field)
- Modify: `src/infrastructure/repositories/MySqlProductRepository.ts:50-52` (search clause), `:83-129` (expansion after post-processing)
- Modify: `app/api/products/route.ts:19-25` (read the query param)
- Create: `tests/unit/selling-unit-expansion.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `toUnitStock` from `lib/selling-unit-qty.ts` (Task 1).
- Produces:
  - `expandProductSellingUnits(products: any[], unitRows: any[]): any[]` exported from `src/infrastructure/repositories/product-selling-unit-expansion.ts` — pure, so it is testable without a database.
  - `GetProductsFilters.expandSellingUnits?: boolean`
  - Expanded row fields consumed by Tasks 3–4: `sellingUnitId`, `isBaseUnit`, `qtyBase`, `baseStock`, plus overwritten `name`, `price`, `barcode`, `stock`, `unitOfMeasure`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/selling-unit-expansion.test.ts`:

```ts
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
```

- [ ] **Step 2: Register the test file**

In `tests/unit/run.ts`, add `'selling-unit-expansion.test',` to `TEST_FILES`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '.../product-selling-unit-expansion'`

- [ ] **Step 4: Write the pure expander**

Create `src/infrastructure/repositories/product-selling-unit-expansion.ts`:

```ts
import { toUnitStock, safeQtyBase } from '../../../lib/selling-unit-qty';

/**
 * Expands each product row into one row per selling unit, for the POS.
 *
 * Kept pure (no database, no connection) so the shape the POS depends on is
 * unit-testable on its own. The repository fetches the unit rows; this decides
 * what the expanded rows look like.
 *
 * `id` is deliberately NOT changed: it stays the product id, because it is the
 * FK written to `sale_items.product_id` and the key for stock, batches and
 * loyalty. Cart identity is `sellingUnitId` combined with it (see
 * `buildLineId`).
 *
 * A product with no selling-unit rows passes through untouched — that is the
 * common case today and must behave exactly as it did before this change.
 */
export function expandProductSellingUnits(products: any[], unitRows: any[]): any[] {
  if (unitRows.length === 0) return products;

  const byProduct = new Map<string, any[]>();
  for (const row of unitRows) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id)!.push(row);
  }
  for (const rows of byProduct.values()) {
    rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  const expanded: any[] = [];
  for (const product of products) {
    const units = byProduct.get(product.id);
    if (!units || units.length === 0) {
      expanded.push(product);
      continue;
    }
    for (const unit of units) {
      const isBase = unit.is_base === 1 || unit.is_base === true;
      const qtyBase = safeQtyBase(unit.qty_base);
      expanded.push({
        ...product,
        sellingUnitId: unit.id,
        isBaseUnit: isBase,
        qtyBase,
        // The base-unit figure, kept so an oversell check can compare against
        // real stock rather than the unit-converted display value.
        baseStock: product.stock,
        name: isBase ? product.name : `${product.name} ${unit.unit_name}`,
        price: parseFloat(unit.price),
        barcode: unit.barcode,
        unitOfMeasure: unit.unit_name,
        stock: toUnitStock(product.stock, unit.qty_base),
      });
    }
  }
  return expanded;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `✓ selling-unit-expansion.test`

- [ ] **Step 6: Add the filter field**

In `src/core/products/domain/IProductRepository.ts`, add to `GetProductsFilters` (after `shelfId`):

```ts
  /**
   * POS only. Returns one row per selling unit instead of one row per product.
   * Opt-in because the other 10 `useProducts` consumers (purchase orders, bad
   * orders, purchases list) must keep seeing one row per product.
   */
  expandSellingUnits?: boolean;
```

- [ ] **Step 7: Widen the search clause**

In `src/infrastructure/repositories/MySqlProductRepository.ts`, replace lines 50-52:

```ts
    if (filters.search) {
      // EXISTS, not a JOIN: `LIMIT ? OFFSET ?` below applies to PRODUCT rows and
      // the hook hard-codes limit=100, so joining would make that limit count
      // unit rows and silently drop whole products off the end of the page.
      if (filters.expandSellingUnits) {
        sql += ` AND (products.name LIKE ? OR products.sku LIKE ? OR products.barcode LIKE ?
                 OR EXISTS (SELECT 1 FROM product_selling_units psu
                             WHERE psu.product_id = products.id AND psu.barcode LIKE ?))`;
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
      } else {
        sql += ' AND (products.name LIKE ? OR products.sku LIKE ? OR products.barcode LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
      }
    }
```

- [ ] **Step 8: Expand after post-processing**

In the same file, add the import at the top:

```ts
import { expandProductSellingUnits } from './product-selling-unit-expansion';
```

Then in `findAll`, replace the final `return products;` (line 131) with:

```ts
    // Expansion runs LAST, after the `baseOverrideRow` block above has settled
    // `product.price`: a unit's own price must not then be overwritten by the
    // product-level default-price-level row. It also runs after LIMIT/OFFSET,
    // so pagination still counts products.
    if (filters.expandSellingUnits && products.length > 0) {
      try {
        const ids = products.map((p: any) => p.id);
        const unitRows = await query(
          `SELECT id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order
             FROM product_selling_units
            WHERE product_id IN (?)
            ORDER BY product_id, sort_order, unit_name`,
          [ids],
        );
        return expandProductSellingUnits(products, unitRows);
      } catch (err: any) {
        // Degrade to base rows rather than failing the request, matching how the
        // priceLevels hydration above tolerates a missing table. The POS then
        // shows what it shows today instead of an error screen.
        console.warn('[SellingUnits] Could not expand selling units:', err?.message);
      }
    }

    return products;
```

- [ ] **Step 9: Read the query param**

In `app/api/products/route.ts`, add to the `filters` object (after `shelfLocationId`):

```ts
      expandSellingUnits: searchParams.get('expandSellingUnits') === 'true',
```

- [ ] **Step 10: Verify the flag is off by default**

Run: `npm run dev` in one terminal, then:

```bash
curl -s "http://localhost:3000/api/products?limit=5" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log('rows:',r.data.length,'withUnitId:',r.data.filter(p=>p.sellingUnitId).length)})"
```

Expected: `withUnitId: 0` — REVIEW FOCUS 5, the 10 non-POS consumers are unaffected.

Then with the flag:

```bash
curl -s "http://localhost:3000/api/products?limit=5&expandSellingUnits=true" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);r.data.filter(p=>p.sellingUnitId).forEach(p=>console.log(p.name,p.price,p.barcode,'stock:',p.stock,'qtyBase:',p.qtyBase))})"
```

Expected: `REBISCO CRACKERS` appears twice — once as the base Piece and once as `REBISCO CRACKERS Case` at 3600 with barcode `06925413` and `qtyBase: 12`.

- [ ] **Step 11: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/core/products/domain/IProductRepository.ts src/infrastructure/repositories/MySqlProductRepository.ts src/infrastructure/repositories/product-selling-unit-expansion.ts app/api/products/route.ts tests/unit/selling-unit-expansion.test.ts tests/unit/run.ts
git commit -m "feat(pos): expand products into one row per selling unit behind a flag"
```

---

### Task 3: Carry the new fields through the hook and types

**Files:**
- Modify: `hooks/use-api.ts:26-78` (signature + field mapping)
- Modify: `lib/types.ts:129-138` is NOT the right type — modify `app/(app)/pos/pos-content/pos-types.ts:27-37` (`SaleItem`)
- Modify: `lib/types.ts` (`Product` interface — add the expansion fields)

**Interfaces:**
- Consumes: the expanded row fields from Task 2.
- Produces:
  - `useProducts(search?, availability?, supplierId?, warehouseId?, expandSellingUnits?)` — a fifth optional parameter, defaulting to `false`.
  - `Product` gains `sellingUnitId?`, `isBaseUnit?`, `qtyBase?`, `baseStock?`.
  - `SaleItem` gains `lineId: string`.

- [ ] **Step 1: Add the fields to `Product`**

In `lib/types.ts`, inside the `Product` interface, immediately after the `sellingUnits?: {...}[]` block (ends line 65):

```ts
  // Set only on rows from `GET /api/products?expandSellingUnits=true` (the POS
  // search/scan path). On such a row `id` is still the PRODUCT id, and these
  // describe which selling unit the row represents.
  sellingUnitId?: string;
  isBaseUnit?: boolean;
  qtyBase?: number;
  /** Stock in BASE units; `stock` on an expanded row is converted to the unit. */
  baseStock?: number;
```

- [ ] **Step 2: Add `lineId` to the POS `SaleItem`**

In `app/(app)/pos/pos-content/pos-types.ts`, inside `export type SaleItem = Product & {`:

```ts
  /**
   * Cart identity. Two selling units of one product are two independent lines,
   * so `id` (the product id, and the FK for sale_items.product_id) cannot
   * identify a line. Equals `id` when the line has no selling unit.
   */
  lineId: string;
```

- [ ] **Step 3: Thread the flag through the hook**

In `hooks/use-api.ts`, change the `useProducts` signature (line 26):

```ts
export function useProducts(search?: string, availability?: string, supplierId?: string, warehouseId?: string, expandSellingUnits?: boolean): UseProductsResult {
```

Add `expandSellingUnits` to the `queryKey` (line 28) so a flag change refetches rather than serving the unexpanded cache:

```ts
    queryKey: ['products', search, availability, supplierId, warehouseId, expandSellingUnits],
```

Add the param inside `queryFn` (after the `warehouseId` append, line 36):

```ts
      if (expandSellingUnits) params.append('expandSellingUnits', 'true');
```

- [ ] **Step 4: Map the new fields**

In the same `queryFn`'s `result.data.map(...)` (lines 49-76), add before `createdAt`:

```ts
        sellingUnitId: item.sellingUnitId,
        isBaseUnit: item.isBaseUnit,
        qtyBase: item.qtyBase,
        baseStock: item.baseStock,
```

This mapping is explicit — a field not listed here is dropped before the POS ever sees it.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors in `use-pos.ts` where `SaleItem` objects are built without `lineId` — Task 4 fixes them. Note which lines; do not fix them here.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts "app/(app)/pos/pos-content/pos-types.ts" hooks/use-api.ts
git commit -m "feat(pos): thread selling-unit fields through the products hook and types"
```

---

### Task 4: Per-unit cart lines and pricing

**Files:**
- Modify: `app/(app)/pos/pos-content/use-pos.ts` — lines 56, 70 (pass the flag), 211, 254, 264, 498, 508, 518, 528, 569, 593-632, 685-697, 699-704, 713, 837, 1117
- Modify: `app/(app)/pos/product-search/use-product-search.ts:31-35` (pass the flag), `:76-82` (select by lineId)
- Modify: `app/(app)/pos/pos-content/PosCartTable.tsx` (key and selection by `lineId`)
- Create: `tests/unit/selling-unit-price-line.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `buildLineId` (Task 1); `sellingUnitId`, `isBaseUnit`, `qtyBase` on products (Tasks 2-3).
- Produces: `priceLineForProduct(product, qty, resolver)` exported from `lib/selling-unit-pricing.ts` — the pure pricing decision, so it is testable without React.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/selling-unit-price-line.test.ts`:

```ts
import assert from 'node:assert/strict';
import { priceLineForProduct } from '../../lib/selling-unit-pricing';

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

console.log('✓ selling-unit-price-line.test');
```

- [ ] **Step 2: Register and run to verify it fails**

Add `'selling-unit-price-line.test',` to `TEST_FILES` in `tests/unit/run.ts`.

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../../lib/selling-unit-pricing'`

- [ ] **Step 3: Write the implementation**

Create `lib/selling-unit-pricing.ts`:

```ts
/**
 * lib/selling-unit-pricing.ts
 *
 * Decides whether a cart line is priced by its selling unit or by the
 * product's price levels. Pure, so the decision is testable without React.
 */

export interface PricedLine {
  price: number;
  priceLevelLabel?: string;
}

/**
 * The price and badge for one cart line.
 *
 * A NON-BASE selling unit carries its own price and takes no price-level tier:
 * the rows in `product_price_levels` are the BASE unit's prices, so applying a
 * Piece's wholesale tier to a Case of 24 would quote a sachet's price for a
 * whole case. Base units and products with no selling units fall through to
 * the resolver, keeping the existing tier behaviour exactly.
 *
 * Re-pointing pricing at `product_selling_unit_prices` (per the 2026-09-11
 * spec) is deliberately NOT done here; see the 2026-10-07 spec's Deviations.
 */
export function priceLineForProduct(
  product: any,
  qty: number,
  resolve: (product: any, qty: number) => PricedLine,
): PricedLine {
  if (product?.sellingUnitId && !product.isBaseUnit) {
    return { price: product.price, priceLevelLabel: undefined };
  }
  return resolve(product, qty);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `✓ selling-unit-price-line.test`

- [ ] **Step 5: Wire `priceLine` to it**

In `app/(app)/pos/pos-content/use-pos.ts`, add the imports near the existing ones (line 17 area):

```ts
import { buildLineId } from '@/lib/selling-unit-qty';
import { priceLineForProduct } from '@/lib/selling-unit-pricing';
```

Replace `priceLine` (lines 569-572) with:

```ts
  const priceLine = useCallback((product: any, qty: number) => {
    return priceLineForProduct(product, qty, (p, q) => {
      const resolved = resolvePriceLevel(p, q, activeLevelId, defaultLevelId);
      return { price: resolved.price, priceLevelLabel: priceLevelLabel(resolved, priceLevels) };
    });
  }, [activeLevelId, defaultLevelId, priceLevels]);
```

- [ ] **Step 6: Request expanded rows in the POS**

In the same file, line 56 — add the fifth argument:

```ts
  const { products: fetchedProducts, loading: productsLoading, refetch: refreshProducts } = useProducts('', 'Available', undefined, inventoryLocation, true);
```

And the debounced server search at line 70 — add `true` as its fifth argument in the same position.

In `app/(app)/pos/product-search/use-product-search.ts`, lines 31-35:

```ts
  const { products, loading, error, refetch: refetchProducts } = useProducts(
    debouncedSearchTerm,
    'Available',
    undefined,
    warehouseId,
    true
  );
```

- [ ] **Step 7: Switch cart identity to `lineId`**

In `use-pos.ts`, `handleAddItem` (lines 593-632) becomes:

```ts
  const handleAddItem = (product: any | undefined) => {
    if (product) {
      const lineId = buildLineId(product.id, product.sellingUnitId);
      const existing = items.find(item => item.lineId === lineId);
      // Adding an existing line (quantity bump) never changes the cart's
      // document type, so only check on a genuinely new line.
      if (!existing && items.length > 0) {
        const cartType = items[0].type === 'service' ? 'service' : 'standard';
        const newItemType = product.type === 'service' ? 'service' : 'standard';
        if (cartType !== newItemType) {
          toast({
            title: 'Cannot Mix Goods and Services',
            description: 'This sale already has a ' + (cartType === 'service' ? 'service' : 'goods') + ' item. Please complete this as two separate transactions.',
            variant: 'destructive',
          });
          setInputValue('');
          setTimeout(() => inputRef.current?.focus(), 0);
          return;
        }
      }
      setItems(prevItems => {
        const existing = prevItems.find(item => item.lineId === lineId);
        if (existing) {
          const newQty = existing.quantity + 1;
          return prevItems.map(item => item.lineId === lineId ? { ...item, quantity: newQty, ...priceLine(product, newQty) } : item);
        } else {
          const newItem: SaleItem = {
            ...product, lineId, quantity: 1, discount: 0, name: product.name,
            ...priceLine(product, 1),
            taxType: mapVatStatusToTaxType(product.vatStatus),
          };
          setSelectedItemId(newItem.lineId);
          return [...prevItems, newItem];
        }
      });
    } else {
      toast({ title: 'Error', description: 'Product not found', variant: 'destructive' });
    }
    setInputValue('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };
```

`updateQuantity` (lines 685-697) becomes:

```ts
  const updateQuantity = (lineId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(lineId);
    } else {
      setItems(prevItems => prevItems.map(item => {
        if (item.lineId === lineId) {
          // The cart line already carries the selling-unit fields, so re-price
          // from the LINE, not from a products[] lookup by product id: that
          // lookup cannot tell two units of one product apart.
          return { ...item, quantity: newQuantity, ...priceLine(item, newQuantity) };
        }
        return item;
      }));
    }
  };
```

Then replace `item.id ===` with `item.lineId ===` at lines 211, 254, 264, 498, 508, 518, 528, 699-704, 713, 837 and 1117, and change `removeItem`'s parameter to a `lineId`. `selectedItemId` now holds a `lineId`.

**Leave `products?.find(p => p.id === productId)` alone wherever it is genuinely a product lookup** (not a cart lookup), and leave the checkout payload's `item.id` alone — it is `sale_items.product_id`.

- [ ] **Step 8: Update the cart table**

In `app/(app)/pos/pos-content/PosCartTable.tsx`, change the row `key` and every click/selection comparison from `item.id` to `item.lineId`. The displayed name already carries the unit (Task 2 sets `name`), so no extra column is needed.

- [ ] **Step 9: Update the search dialog's select**

In `app/(app)/pos/product-search/use-product-search.ts`, `handleSelect` (lines 76-82) currently finds by `p.id`, which cannot distinguish two units. Change it to select by line identity:

```ts
  const handleSelect = useCallback((lineId: string) => {
    const product = displayedProducts.find(p => buildLineId(p.id, p.sellingUnitId) === lineId);
    if (product) {
      onSelectProduct(product);
      onOpenChange(false);
    }
  }, [displayedProducts, onSelectProduct, onOpenChange]);
```

Add `import { buildLineId } from '@/lib/selling-unit-qty';` and update `ProductSearchDialog.tsx`'s `CommandItem` `value`/`key` to use `buildLineId(product.id, product.sellingUnitId)`.

- [ ] **Step 10: Typecheck and lint**

Run: `npm run typecheck`
Expected: no errors — including the `lineId` errors Task 3 surfaced.

Run: `npm run lint`
Expected: no new warnings.

- [ ] **Step 11: Verify in the app**

Start the app, open `/pos`, press F9. `REBISCO CRACKERS` must appear twice — as the Piece and as `REBISCO CRACKERS Case` at ₱3600. Add both; the cart must show **two** lines, not one.

- [ ] **Step 12: Commit**

```bash
git add lib/selling-unit-pricing.ts tests/unit/selling-unit-price-line.test.ts tests/unit/run.ts "app/(app)/pos/pos-content/use-pos.ts" "app/(app)/pos/pos-content/PosCartTable.tsx" "app/(app)/pos/product-search/use-product-search.ts" "app/(app)/pos/product-search/ProductSearchDialog.tsx"
git commit -m "feat(pos): one cart line per selling unit, priced by the unit"
```

---

### Task 5: Checkout — resolve `qty_base` and deduct base quantities

**Files:**
- Modify: `app/(app)/pos/tender/use-tender.ts:253-265` (send `sellingUnitId`)
- Modify: `app/api/pos/checkout/route.ts:202-211` (join), `:226-234` (batch deduction), `:247-259` (sale_items), `:287-310` (family sync), `:429-440` (invoice items)
- Create: `tests/unit/checkout-selling-unit-qty.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `toBaseQty`, `safeQtyBase` (Task 1); `sellingUnitId` / `qtyBase` on cart lines (Task 4).
- Produces: `resolveLineQtyBase(row: any): number` exported from `app/api/pos/checkout/selling-unit-resolve.ts`, and the `lineBaseQty` / `lineUnitSnapshot` values the invoice-items loop reads.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/checkout-selling-unit-qty.test.ts`:

```ts
import assert from 'node:assert/strict';
import { resolveLineQtyBase } from '../../app/api/pos/checkout/selling-unit-resolve';
import { toBaseQty } from '../../lib/selling-unit-qty';

// (a) a matched unit row yields its ratio
assert.equal(resolveLineQtyBase({ psu_qty_base: '24.000000' }), 24, 'a matched unit ratio is used');
assert.equal(resolveLineQtyBase({ psu_qty_base: '1.000000' }), 1, 'a base unit is 1');
assert.equal(resolveLineQtyBase({ psu_qty_base: '0.250000' }), 0.25, 'a fractional ratio is used');

// (b) REVIEW FOCUS 1: a unit id belonging to ANOTHER product.
// The SQL join is scoped `AND psu.product_id = p.id`, so a foreign unit id
// yields NULL here. It must fall back to 1 — deducting by a foreign product's
// ratio would corrupt this product's stock.
assert.equal(resolveLineQtyBase({ psu_qty_base: null }), 1, 'a foreign/unmatched unit falls back to 1');
assert.equal(resolveLineQtyBase({}), 1, 'a missing column falls back to 1');
assert.equal(resolveLineQtyBase(undefined), 1, 'no row at all falls back to 1');
assert.equal(resolveLineQtyBase(null), 1, 'a null row falls back to 1');

// (c) REVIEW FOCUS 3: unusable ratios never corrupt a deduction
assert.equal(resolveLineQtyBase({ psu_qty_base: '0.000000' }), 1, 'zero never deducts nothing');
assert.equal(resolveLineQtyBase({ psu_qty_base: '-24.000000' }), 1, 'negative never ADDS stock on a sale');
assert.equal(resolveLineQtyBase({ psu_qty_base: 'abc' }), 1, 'junk falls back to 1');

// (d) the deduction quantity the FIFO ledger actually sees
assert.equal(toBaseQty(1, resolveLineQtyBase({ psu_qty_base: '24.000000' })), 24, '1 Case deducts 24');
assert.equal(toBaseQty(3, resolveLineQtyBase({ psu_qty_base: '24.000000' })), 72, '3 Cases deduct 72');
assert.equal(toBaseQty(5, resolveLineQtyBase({ psu_qty_base: null })), 5, 'an unmatched line deducts its own count');
// The regression this whole task exists to prevent:
assert.notEqual(toBaseQty(3, resolveLineQtyBase({ psu_qty_base: '24.000000' })), 3,
  '3 Cases must NOT deduct only 3 base units');

console.log('✓ checkout-selling-unit-qty.test');
```

- [ ] **Step 2: Register and run to verify it fails**

Add `'checkout-selling-unit-qty.test',` to `TEST_FILES`.

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '.../selling-unit-resolve'`

- [ ] **Step 3: Write the resolver**

Create `app/api/pos/checkout/selling-unit-resolve.ts`:

```ts
import { safeQtyBase } from '@/lib/selling-unit-qty';

/**
 * The `qty_base` multiplier for one checkout line, read from the joined
 * `product_selling_units` row.
 *
 * Deliberately takes the DATABASE row, never the request body: a
 * client-supplied multiplier directly scales a stock deduction. The join is
 * scoped `AND psu.product_id = p.id`, so a unit id belonging to another
 * product arrives here as NULL and falls back to 1 rather than deducting by a
 * foreign product's ratio.
 */
export function resolveLineQtyBase(soldProd: any): number {
  return safeQtyBase(soldProd?.psu_qty_base);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `✓ checkout-selling-unit-qty.test`

- [ ] **Step 5: Send the unit id from the client**

In `app/(app)/pos/tender/use-tender.ts`, inside `items.map(item => ({ ... }))` (lines 253-265), add after `cost: item.cost`:

```ts
            sellingUnitId: item.sellingUnitId,
            sellingUnitName: item.isBaseUnit === false ? item.unitOfMeasure : undefined,
```

`qtyBase` is deliberately NOT sent — the server resolves it from the database.

- [ ] **Step 6: Join the unit row in checkout**

In `app/api/pos/checkout/route.ts`, replace the `soldProd` query (lines 202-211):

```ts
        const [soldProdResult]: any = await connection.query(`
          SELECT
            p.id, p.parent_id, p.unit_of_measure, p.name, p.stock, p.type, p.cost,
            c.markup_percentage, p.category, p.earns_points,
            psu.qty_base AS psu_qty_base, psu.unit_name AS psu_unit_name
          FROM products p
          LEFT JOIN categories c ON p.category = c.name
          LEFT JOIN product_selling_units psu
                 ON psu.id = ? AND psu.product_id = p.id
          WHERE p.id = ?
        `, [item.sellingUnitId || null, item.id]);
```

The `AND psu.product_id = p.id` is the trust boundary: a foreign unit id yields `NULL`.

- [ ] **Step 7: Compute `baseQty` and use it for deduction**

Add the import at the top of the file:

```ts
import { resolveLineQtyBase } from './selling-unit-resolve';
import { toBaseQty } from '@/lib/selling-unit-qty';
```

After `const itemIsService = ...` (line 213), add:

```ts
        // Stock, inventory_batches and cost are all denominated in BASE units,
        // so a selling unit's line quantity must be converted before it touches
        // any of them. Resolved from the DB row, never from the request body.
        const lineQtyBase = resolveLineQtyBase(soldProd);
        const lineBaseQty = toBaseQty(item.quantity, lineQtyBase);
        const lineUnitName = item.sellingUnitId ? (soldProd?.psu_unit_name ?? null) : null;
        baseQtyByIndex.set(i, { baseQty: lineBaseQty, qtyBase: lineQtyBase, unitName: lineUnitName });
```

Declare the carrier just before the per-item loop begins (so the later
`sales_invoice_items` loop at line 431, which is a SEPARATE loop, can read it):

```ts
      // The invoice-items insert below runs in its own loop, where the
      // per-item qty_base is out of scope. Carry it across by index.
      const baseQtyByIndex = new Map<number, { baseQty: number; qtyBase: number; unitName: string | null }>();
```

Change the `deductFromBatches` call (line 226-231) to pass `lineBaseQty`:

```ts
            const deduction = await deductFromBatches(
              item.id,
              lineBaseQty,
              bcs.oversellBlock,
              connection as any
            );
```

- [ ] **Step 8: Write the snapshot to `sale_items`**

Replace the `sale_items` insert (lines 246-259):

```ts
        await connection.query(`
          INSERT INTO sale_items (
            id, sale_id, product_id, product_name, quantity, price, cost_at_sale, batch_source,
            selling_unit_id, selling_unit_name, selling_unit_qty_base, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
          itemId,
          saleId,
          item.id,
          item.name,
          // UNITS SOLD, not base units: 1 Case stores 1, with qty_base 24
          // alongside. Storing 24 here would make receipts read "24 Case".
          item.quantity,
          item.price * (1 - (item.discount || 0) / 100),
          costAtSale,
          batchSource,
          item.sellingUnitId || null,
          lineUnitName,
          item.sellingUnitId ? lineQtyBase : null,
        ]);
```

The snapshot columns are `NULL` when no unit was used, so historical and
base-unit rows read back exactly as they do today.

- [ ] **Step 9: Pass `baseQty` to family sync**

In the family-sync block (lines 287-310), replace both `item.quantity` uses with `lineBaseQty`, and add this comment above the `findUltimateRoot` call:

```ts
            // `lineBaseQty` ALREADY includes the selling-unit conversion. This
            // is safe only because migration 120 removed every parent_id: a
            // product carrying BOTH a parent_id and a non-base selling unit
            // would have the qty_base multiplier and this family cascade
            // compound (a Case of 24 under a family factor of 12 would deduct
            // 288). Removing family-sync entirely is the 2026-09-11 spec's
            // Plan 4/5; see the 2026-10-07 spec's Deviations section.
```

So `const rootQty = lineBaseQty / factorToRoot;` and the else-branch passes `lineBaseQty`.

- [ ] **Step 10: Write the snapshot to `sales_invoice_items`**

In the invoice-items loop (lines 431-440), read the carrier and widen the row:

```ts
        const lineUnit = baseQtyByIndex.get(i);

        invoiceItemRows.push([
          invoiceItemId, invoiceId, item.id, item.name, item.quantity,
          item.price * (1 - (item.discount || 0) / 100),
          item.sellingUnitId || null,
          lineUnit?.unitName ?? null,
          item.sellingUnitId ? (lineUnit?.qtyBase ?? null) : null,
        ]);
```

And the INSERT (lines 460-464):

```ts
      await connection.query(`
        INSERT INTO sales_invoice_items (
          id, sales_invoice_id, product_id, product_name, quantity, price,
          selling_unit_id, selling_unit_name, selling_unit_qty_base, created_at
        ) VALUES ${invoiceItemRows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())').join(', ')}
      `, invoiceItemRows.flat());
```

This depends on Task 6's migration. **Run Task 6 before testing this step.**

- [ ] **Step 11: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add app/api/pos/checkout/route.ts app/api/pos/checkout/selling-unit-resolve.ts "app/(app)/pos/tender/use-tender.ts" tests/unit/checkout-selling-unit-qty.test.ts tests/unit/run.ts
git commit -m "feat(pos): deduct base quantities and snapshot the selling unit at checkout"
```

---

### Task 6: Migration 128 — snapshot columns on `sales_invoice_items`

**Files:**
- Create: `scripts/migrations/128_add_selling_unit_snapshot_to_sales_invoice_items.ts`
- Modify: `scripts/migrations/index.ts` (register, if it uses an explicit import list)

**Interfaces:**
- Consumes: nothing.
- Produces: `sales_invoice_items.selling_unit_name`, `sales_invoice_items.selling_unit_qty_base` — read by Task 7's invoice void and written by Task 5 Step 10.

- [ ] **Step 1: Write the migration**

Create `scripts/migrations/128_add_selling_unit_snapshot_to_sales_invoice_items.ts`:

```ts
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

// Copied verbatim from 117, which defines its own local helper rather than
// importing a shared one. Keep the shape identical.
async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any = await query(`
    SELECT COUNT(*) as cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  return rows[0]?.cnt > 0;
}

/**
 * Migration 122 gave `sales_invoice_items` only `selling_unit_id`, not the
 * `selling_unit_name` / `selling_unit_qty_base` snapshot pair that migration
 * 117 gave `sale_items`.
 *
 * Without the snapshot, the invoice void path cannot convert a unit quantity
 * back to base units from the row alone, and resolving it through a join to
 * `product_selling_units` would read the unit's CURRENT ratio — restoring the
 * wrong quantity for any unit re-ratioed after the sale. A void that restores
 * the wrong quantity destroys real inventory, so the snapshot is required.
 */
const migration: Migration = {
  name: '128_add_selling_unit_snapshot_to_sales_invoice_items',
  timestamp: '2026-10-07_10-00-00',

  async up(): Promise<void> {
    if (await columnExists('sales_invoice_items', 'selling_unit_qty_base')) {
      console.log('⏭️  selling_unit snapshot already exists on sales_invoice_items, skipping');
      return;
    }
    await query(`
      ALTER TABLE sales_invoice_items
      ADD COLUMN selling_unit_name VARCHAR(100) DEFAULT NULL,
      ADD COLUMN selling_unit_qty_base DECIMAL(10,4) DEFAULT NULL
    `);
    console.log('✅ selling_unit snapshot columns added to sales_invoice_items');
  },

  async down(): Promise<void> {
    if (!(await columnExists('sales_invoice_items', 'selling_unit_qty_base'))) {
      console.log('⏭️  selling_unit snapshot not present on sales_invoice_items, skipping');
      return;
    }
    await query(`
      ALTER TABLE sales_invoice_items
      DROP COLUMN selling_unit_name,
      DROP COLUMN selling_unit_qty_base
    `);
    console.log('✅ selling_unit snapshot columns dropped from sales_invoice_items');
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register it**

`scripts/migrations/index.ts` uses explicit imports (line 130 is the 127
import). Add immediately after it:

```ts
import './128_add_selling_unit_snapshot_to_sales_invoice_items';
```

- [ ] **Step 3: Run the migration**

Run: `npm run migrate`
Expected: `✅ selling_unit snapshot columns added to sales_invoice_items`

- [ ] **Step 4: Verify the round trip**

```bash
npm run migrate:down && npm run migrate
```

Expected: the drop message, then the add message. The table definition is unchanged afterwards.

Confirm the columns exist:

```bash
node -e "require('dotenv').config();const m=require('mysql2/promise');(async()=>{const c=await m.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});const [r]=await c.query(\"SHOW COLUMNS FROM sales_invoice_items LIKE 'selling_unit%'\");console.log(r.map(x=>x.Field));await c.end();})()"
```

Expected: `[ 'selling_unit_id', 'selling_unit_name', 'selling_unit_qty_base' ]`

- [ ] **Step 5: Verify idempotency**

Run: `npm run migrate` again.
Expected: `⏭️  selling_unit snapshot already exists ... skipping`

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/128_add_selling_unit_snapshot_to_sales_invoice_items.ts scripts/migrations/index.ts
git commit -m "feat(db): add selling-unit snapshot columns to sales_invoice_items"
```

---

### Task 7: Void and return paths restore base quantities

**Files:**
- Modify: `app/api/pos/void-transaction/route.ts:83-96`
- Modify: `app/api/sales/invoices/[id]/void/route.ts:25-37`
- Modify: `app/api/sales/returns/route.ts:59-94`
- Create: `tests/unit/void-selling-unit-restore.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `toBaseQty`, `safeQtyBase` (Task 1); the snapshot columns (Tasks 5-6).
- Produces: `restoreBaseQty(row: { quantity: unknown; selling_unit_qty_base?: unknown }): number` exported from `lib/selling-unit-restore.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/void-selling-unit-restore.test.ts`:

```ts
import assert from 'node:assert/strict';
import { restoreBaseQty } from '../../lib/selling-unit-restore';

// (a) a unit sale restores the BASE quantity, not the unit count.
// This is the bug the whole task exists to prevent: restoring 1 for a voided
// Case of 24 would destroy 23 units of real inventory.
assert.equal(restoreBaseQty({ quantity: 1, selling_unit_qty_base: '24.0000' }), 24,
  'voiding 1 Case restores 24 base units');
assert.equal(restoreBaseQty({ quantity: 3, selling_unit_qty_base: '24.0000' }), 72,
  'voiding 3 Cases restores 72');
assert.notEqual(restoreBaseQty({ quantity: 1, selling_unit_qty_base: '24.0000' }), 1,
  'voiding a Case must NOT restore only 1 base unit');

// (b) REVIEW FOCUS 2: every historical row has NULL there and must restore
// exactly its quantity, as it does today.
assert.equal(restoreBaseQty({ quantity: 5, selling_unit_qty_base: null }), 5,
  'a pre-change row restores its own quantity');
assert.equal(restoreBaseQty({ quantity: 5 }), 5, 'a missing column restores the quantity');
assert.equal(restoreBaseQty({ quantity: 5, selling_unit_qty_base: undefined }), 5,
  'undefined restores the quantity');

// (c) a base-unit sale is a no-op conversion
assert.equal(restoreBaseQty({ quantity: 7, selling_unit_qty_base: '1.0000' }), 7,
  'a base unit restores unchanged');

// (d) mysql2 DECIMAL strings and fractional ratios
assert.equal(restoreBaseQty({ quantity: '2', selling_unit_qty_base: '24.0000' }), 48,
  'a string quantity is parsed');
assert.equal(restoreBaseQty({ quantity: 4, selling_unit_qty_base: '0.2500' }), 1,
  'a fractional ratio restores down');

// (e) unusable ratios fall back rather than corrupting the restore
assert.equal(restoreBaseQty({ quantity: 5, selling_unit_qty_base: '0.0000' }), 5,
  'a zero ratio restores the quantity, not zero');
assert.equal(restoreBaseQty({ quantity: 5, selling_unit_qty_base: '-24.0000' }), 5,
  'a negative ratio never deducts on a void');

// (f) a return line (negative quantity) converts with its sign intact
assert.equal(restoreBaseQty({ quantity: -1, selling_unit_qty_base: '24.0000' }), -24,
  'a returned Case converts to -24 base units');

console.log('✓ void-selling-unit-restore.test');
```

- [ ] **Step 2: Register and run to verify it fails**

Add `'void-selling-unit-restore.test',` to `TEST_FILES`.

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../../lib/selling-unit-restore'`

- [ ] **Step 3: Write the implementation**

Create `lib/selling-unit-restore.ts`:

```ts
import { safeQtyBase } from './selling-unit-qty';

/**
 * Base-stock units to restore for one voided or returned line.
 *
 * `sale_items.quantity` (and `sales_invoice_items.quantity`) holds UNITS SOLD,
 * not base units, so a void that restores `quantity` directly gives back 1 base
 * unit for a voided Case of 24 — destroying 23 units of real inventory on an
 * operation cashiers perform routinely.
 *
 * Every row written before this feature has `selling_unit_qty_base IS NULL`,
 * which normalises to a multiplier of 1 and restores exactly as it does today.
 * The sign is preserved, so a negative return line stays negative.
 */
export function restoreBaseQty(row: { quantity: unknown; selling_unit_qty_base?: unknown }): number {
  const qty = typeof row.quantity === 'number' ? row.quantity : parseFloat(String(row.quantity ?? ''));
  if (!Number.isFinite(qty)) return 0;
  return qty * safeQtyBase(row.selling_unit_qty_base);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `✓ void-selling-unit-restore.test`

- [ ] **Step 5: Fix the POS void**

In `app/api/pos/void-transaction/route.ts`, add the import:

```ts
import { restoreBaseQty } from '@/lib/selling-unit-restore';
```

Change the select (line 83) to fetch the snapshot:

```ts
            const [items]: any = await connection.query(
              'SELECT product_id, product_name, quantity, selling_unit_qty_base FROM sale_items WHERE sale_id = ?',
              [saleId]
            );
```

Then inside the loop, compute the base quantity before the family walk and use it in place of `item.quantity`:

```ts
                    // sale_items.quantity is UNITS SOLD; stock is in base units.
                    // Restoring the raw quantity would give back 1 base unit for
                    // a voided Case of 24.
                    const restoreQty = restoreBaseQty(item);
                    const { rootId, factorToRoot } = await findUltimateRoot(item.product_id, connection as any);
                    const quantityToAddInRootUnits = restoreQty / factorToRoot;
```

- [ ] **Step 6: Fix the invoice void**

In `app/api/sales/invoices/[id]/void/route.ts`, add the same import, change the select (line 25):

```ts
            const [items]: any = await connection.query(
              'SELECT product_id, quantity, selling_unit_qty_base FROM sales_invoice_items WHERE sales_invoice_id = ?',
              [invoiceId]
            );
```

and apply the same `restoreBaseQty(item)` substitution before `quantityToAddInRootUnits` (line 31).

- [ ] **Step 7: Fix the returns path**

In `app/api/sales/returns/route.ts`, the quantity arrives from the client, so resolve `qty_base` server-side with the same scoped lookup checkout uses. Before the stock write for each item:

```ts
        // Resolved from the DB, scoped to this product, exactly as checkout
        // does — a client-supplied multiplier would scale a stock write.
        const [unitRow]: any = await connection.query(
          `SELECT psu.qty_base, psu.unit_name
             FROM product_selling_units psu
            WHERE psu.id = ? AND psu.product_id = ?`,
          [item.sellingUnitId || null, item.productId],
        );
        const returnQtyBase = safeQtyBase(unitRow?.[0]?.qty_base);
        const returnBaseQty = item.quantity * returnQtyBase;
```

Add `import { safeQtyBase } from '@/lib/selling-unit-qty';`, use `-returnBaseQty` where the stock/batch write currently uses `-item.quantity` (lines 81, 92), keep the `sale_items` row's own `quantity` as `-item.quantity` (units sold), and write the three snapshot columns onto it:

```ts
        INSERT INTO sale_items (
          id, sale_id, product_id, product_name, quantity, price,
          selling_unit_id, selling_unit_name, selling_unit_qty_base, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
```

with `item.sellingUnitId || null`, `unitRow?.[0]?.unit_name ?? null`, and `item.sellingUnitId ? returnQtyBase : null`.

Leave line 94's monetary total (`-(item.quantity * item.price)`) on `item.quantity` — money is per unit sold, not per base unit.

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck && npm run test:unit`

```bash
git add lib/selling-unit-restore.ts tests/unit/void-selling-unit-restore.test.ts tests/unit/run.ts app/api/pos/void-transaction/route.ts "app/api/sales/invoices/[id]/void/route.ts" app/api/sales/returns/route.ts
git commit -m "fix(pos): restore base quantities when voiding or returning unit sales"
```

---

### Task 8: E2E coverage

**Files:**
- Modify: `tests/e2e/setup/prepare-test-db.ts:186-209` (add `inventory_batches` for the selling-units product)
- Create: `tests/e2e/pos-selling-units.spec.ts`

**Interfaces:**
- Consumes: everything above; `SELLING_UNITS_PRODUCT` from `tests/e2e/fixtures/test-data.ts` (Piece base ₱25 barcode `5200000000014`; Case `qtyBase: 24` ₱580 barcode `5200000000021`; stock 60).
- Produces: nothing.

- [ ] **Step 1: Seed inventory batches**

`prepare-test-db.ts` currently seeds no `inventory_batches` at all, so FIFO deduction is unobservable. After the selling-units insert block (line ~209), add:

```ts
  // Two batches at different costs so a FIFO deduction is observable: a Case of
  // 24 must consume the OLDER batch first. Totals 60, matching the product's
  // seeded stock. `selling_price` is NOT NULL with no default, so it must be
  // supplied.
  await conn.query(
    `INSERT INTO inventory_batches
       (id, product_id, received_date, quantity_in, quantity_remaining,
        unit_cost, selling_price, source_type, created_at)
     VALUES
       (?, ?, '2026-01-01', 40, 40, 18.0000, 25.00, 'seed', NOW()),
       (?, ?, '2026-02-01', 20, 20, 20.0000, 25.00, 'seed', NOW())`,
    [
      'batch-su-old', SELLING_UNITS_PRODUCT.id,
      'batch-su-new', SELLING_UNITS_PRODUCT.id,
    ],
  );
```

The columns above were read from the live schema: `id`, `product_id`,
`purchase_order_id`, `received_date` (NOT NULL), `quantity_in`,
`quantity_remaining`, `unit_cost`, `selling_price` (NOT NULL), `source_type`,
`notes`, `created_at`, `updated_at`, `expiration_date`, `selling_unit_id`.

- [ ] **Step 2: Reset the test DB**

Run: `npm run test:e2e:db`
Expected: completes with no error.

- [ ] **Step 3: Write the spec**

Create `tests/e2e/pos-selling-units.spec.ts`. Follow the existing `tests/e2e/selling-units.spec.ts` for login/navigation helpers and import them rather than re-implementing:

```ts
import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import { SELLING_UNITS_PRODUCT } from './fixtures/test-data';

const P = SELLING_UNITS_PRODUCT;
const BASE = P.units.find(u => u.isBase)!;
const CASE = P.units.find(u => !u.isBase)!;

test.describe('POS selling units', () => {
  test('search shows one row per selling unit with unit-converted stock', async ({ page }) => {
    // Open /pos, press F9 to open the search sheet, type the product name.
    // Expect BOTH rows: the base Piece at 25 and "<name> Case" at 580.
    // Expect the Case row's stock to read 2 (60 base units / 24), not 60.
  });

  test('scanning a Case barcode adds a Case line at the Case price', async ({ page }) => {
    // Type CASE.barcode into the POS input and submit.
    // Expect one cart line named "<name> Case" priced 580 — no unit picker.
  });

  test('a Case and a Piece are two separate cart lines', async ({ page }) => {
    // Scan CASE.barcode, then BASE.barcode.
    // Expect TWO cart lines, and a total of 580 + 25 = 605.
    // This is the collision the lineId field exists to prevent.
  });

  test('checking out one Case deducts 24 base units FIFO', async ({ page }) => {
    // Scan CASE.barcode, tender, complete.
    // Assert via a DB query:
    //   - products.stock dropped by 24 (60 -> 36)
    //   - batch-su-old quantity_remaining dropped by 24 (40 -> 16)
    //   - batch-su-new is untouched (FIFO took the older batch first)
    //   - sale_items has quantity = 1, selling_unit_qty_base = 24,
    //     selling_unit_name = 'Case'
  });

  test('voiding that Case sale restores all 24 base units', async ({ page }) => {
    // Sell 1 Case, note products.stock, then void the transaction.
    // Assert products.stock returns to its exact pre-sale value.
    // This is the 23-units-destroyed bug.
  });

  test('a base-unit sale and void round-trips unchanged', async ({ page }) => {
    // Scan BASE.barcode, checkout, void.
    // Assert stock returns exactly, and sale_items.selling_unit_qty_base is 1.
  });

  test('a product with no selling units behaves exactly as before', async ({ page }) => {
    // Search a plain TEST_PRODUCTS entry: exactly ONE row, its own price,
    // its base stock figure, and its price-level tiers still apply.
  });
});
```

Fill each body using the helpers the existing specs already use — `seedSession(page, DEFAULT_ADMIN)` from `./helpers/auth` for login and `testQuery(sql, params)` from `./helpers/db` for the stock and `sale_items` assertions. Read `tests/e2e/selling-units.spec.ts` and the existing POS specs before writing, and reuse their `/pos` navigation and cart selectors rather than inventing new ones or opening new DB connections.

- [ ] **Step 4: Run the new spec**

Run: `npx playwright test tests/e2e/pos-selling-units.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5: Run the whole suite for regressions**

Run: `npm run test:e2e`
Expected: no new failures. The cart-identity change touches every POS spec, so pay attention to any that select cart rows by product id.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/setup/prepare-test-db.ts tests/e2e/pos-selling-units.spec.ts
git commit -m "test(e2e): cover POS selling-unit search, scan, checkout and void"
```

---

### Task 9: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Unit tests**

Run: `npm run test:unit`
Expected: `All 58 unit test files passed.`

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new warnings.

- [ ] **Step 4: E2E**

Run: `npm run test:e2e`
Expected: no failures.

- [ ] **Step 5: Manual POS pass**

With the dev server running, at `/pos`:

1. F9, search `REBISCO` → two rows: the Piece at ₱200 and `REBISCO CRACKERS Case` at ₱3600.
2. Scan `06925413` → one Case line at ₱3600, no picker.
3. Add the Piece too → two distinct cart lines.
4. Change the Case line's quantity to 2 → ₱7200, and the Piece line is untouched.
5. Check the non-POS paths are unchanged: open a new purchase order and confirm its product selector shows ONE row per product.

- [ ] **Step 6: Confirm the base-unit path did not regress**

Add a plain product with price levels to the cart and switch the active price level. Its tier badge and price must behave exactly as before this branch — the October 2 tier work is untouched for base units.

- [ ] **Step 7: Report**

State plainly what passed and what did not, with the actual command output. Do not claim completion for anything not run.
