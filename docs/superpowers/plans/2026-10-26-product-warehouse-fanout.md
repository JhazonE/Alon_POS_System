# Product Warehouse Fan-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating a product inserts a zero-stock copy of it into every other active warehouse in the creating user's branch, so a new product no longer needs a stock transfer to exist elsewhere.

**Architecture:** The fan-out lives in `lib/product-create.ts` inside `addProductWithScope`'s existing `withTransaction`, making it atomic with the primary insert. Which warehouses it targets is derived from the already-resolved `BranchScope` (never from a caller parameter). Because N rows per product would make the products table unreadable, the products-table warehouse filter gains a default — which in turn requires decoupling warehouse filtering from the family roll-up switch that currently shares one `hasActiveFilters` flag.

**Tech Stack:** Next.js 16, TypeScript, raw `mysql2/promise` (no ORM), MySQL 8, Playwright E2E (`workers: 1`, DB `alon_pos_test`).

**Spec:** `docs/superpowers/specs/2026-10-23-product-warehouse-fanout-design.md`

## Global Constraints

- **`lib/product-create.ts` must never gain a `'use server'` directive**, and must never be re-exported from a `'use server'` file. It takes `scope` as a parameter; a scope parameter on a public server action is attacker-controlled and a complete bypass.
- **No cross-branch writes.** Fan-out targets only warehouses of a single branch. Nothing is ever written into another branch's warehouse.
- **No stock duplication.** Every fanned-out copy is `stock = 0`, `avg_daily_sales = 0`, with **no `inventory_batches` row**.
- **No field sync between copies.** `updateProduct` is unchanged.
- **`is_active` is the source of truth** for warehouse activity. Do not read, write, or reconcile the runtime-added `active` column.
- **`product_selling_units` rows are NOT copied** to fanned-out copies (migration 115 has a global `UNIQUE KEY unique_selling_unit_barcode (barcode)`, `NOT NULL`). The product's own `sku` and `barcode` scalar columns **are** copied. No migration touches table 115.
- **`product_shelves` rows are NOT copied** (shelf locations are physical to one warehouse).
- **`parent_id` and `conversion_factor` are NOT copied**; the backfill skips non-root products entirely.
- **Services never fan out** (`formData.itemType === 'service'` / `products.type = 'service'`).
- **Head office and `scope === null` both fan out within the branch owning the *selected* warehouse**, never across all branches.
- E2E tests run `workers: 1` against `alon_pos_test`. Test helper is `tests/e2e/helpers/branches.ts`; raw SQL via `testQuery` from `tests/e2e/helpers/db.ts`.
- Measured scale on the live local DB (2026-10-26): 3 products, 1 branch, 2 active warehouses, 0 children, 0 services. The backfill is a single pass — no chunking, no resumable marker, no abort ceiling.

## Review Focus

Input classes the spec implies but which no task's happy path exercises. Each has a test added to the owning task.

1. **A branch with exactly one active warehouse** — fan-out inserts nothing extra and must not error (Task 2).
2. **A product whose selected `warehouse_id` is NULL** (head-office product belonging to no branch) — no fan-out, primary insert still succeeds (Task 2).
3. **An inactive warehouse in the target branch** — skipped, so no product row is ever orphaned onto an inactive warehouse (Task 2).
4. **A warehouse-only filter on the products list** — family roll-up must survive, i.e. children must still arrive as `children[]` and not as top-level rows (Task 4).
5. **A POS terminal whose `location` is blank/NULL** — must fail closed (scope to branch warehouses or return nothing), never return every warehouse's copy of every product (Task 6).

---

## Task 1: Fan-out target resolution

Pure query helper, no writes. Separated from Task 2 so the branch-targeting rule — the part a mistake in is a security bug — gets its own test cycle and its own reviewer gate.

**Files:**
- Modify: `lib/product-create.ts`
- Test: `tests/e2e/product-fanout.spec.ts` (create)

**Interfaces:**
- Consumes: `BranchScope` from `lib/branch-context.ts`; `query` from `lib/mysql.ts`.
- Produces: `export async function fanoutTargetWarehouses(selectedWarehouseId: string | null, scope: BranchScope | null): Promise<string[]>` — returns the ids of active warehouses that should receive a copy, **always excluding `selectedWarehouseId` itself**. Returns `[]` when there is no branch to fan out within.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/product-fanout.spec.ts`, import `fanoutTargetWarehouses` from `../../lib/product-create` and `seedSecondBranch` / `cleanupSecondBranch` from `./helpers/branches`.

```ts
test('branch scope targets only its own branch warehouses, excluding the selected one', async () => {
  // seed branch B with a second active warehouse; branch A is the main branch
  const b = await seedSecondBranch();
  const extra = await addWarehouseToBranch(b.branchId, { active: true });
  const targets = await fanoutTargetWarehouses(b.warehouseId, { scope: 'single', branchId: b.branchId });
  expect(targets).toEqual([extra]);
  expect(targets).not.toContain(b.warehouseId);
});

test('null selected warehouse yields no targets', async () => {
  expect(await fanoutTargetWarehouses(null, { scope: 'all' })).toEqual([]);
});

test('head office targets the selected warehouse branch only', async () => {
  const b = await seedSecondBranch();
  const extra = await addWarehouseToBranch(b.branchId, { active: true });
  const targets = await fanoutTargetWarehouses(b.warehouseId, { scope: 'all' });
  expect(targets.sort()).toEqual([extra].sort()); // nothing from the main branch
});

test('null scope behaves as head office', async () => {
  const b = await seedSecondBranch();
  const extra = await addWarehouseToBranch(b.branchId, { active: true });
  expect(await fanoutTargetWarehouses(b.warehouseId, null)).toEqual([extra]);
});

test('inactive warehouses are not targets', async () => {
  const b = await seedSecondBranch();
  await addWarehouseToBranch(b.branchId, { active: false });
  expect(await fanoutTargetWarehouses(b.warehouseId, { scope: 'single', branchId: b.branchId })).toEqual([]);
});

test('a branch with one active warehouse yields no targets', async () => {
  const b = await seedSecondBranch();
  expect(await fanoutTargetWarehouses(b.warehouseId, { scope: 'single', branchId: b.branchId })).toEqual([]);
});
```

Add to `tests/e2e/helpers/branches.ts`:
`export async function addWarehouseToBranch(branchId: string, opts?: { active?: boolean }): Promise<string>` — inserts one `warehouses` row (uuid id, unique name, `is_active` from `opts.active ?? true`) and returns its id. `warehouses.name` is `UNIQUE`, so derive the name from the generated uuid.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/product-fanout.spec.ts --reporter=line`
Expected: FAIL — `fanoutTargetWarehouses` is not exported.

- [ ] **Step 3: Implement `fanoutTargetWarehouses` in `lib/product-create.ts`**

Resolve the branch to fan out within:
- `scope.scope === 'single'` → `scope.branchId`.
- `scope === null` or `scope.scope === 'all'` → the `branch_id` of `selectedWarehouseId`, read from `warehouses`.

Then select `id FROM warehouses WHERE branch_id = ? AND is_active = 1 AND id <> ?`. Return `[]` immediately when `selectedWarehouseId` is falsy, or when the branch cannot be resolved. Do **not** use `warehouseIdsForBranch` — it does not filter on `is_active`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/product-fanout.spec.ts --reporter=line`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/product-create.ts tests/e2e/product-fanout.spec.ts tests/e2e/helpers/branches.ts
git commit -m "feat(products): resolve fan-out target warehouses within one branch"
```

---

## Task 2: Fan-out on product create

**Files:**
- Modify: `lib/product-create.ts`
- Test: `tests/e2e/product-fanout.spec.ts`

**Interfaces:**
- Consumes: `fanoutTargetWarehouses` (Task 1).
- Produces: `addProductWithScope` keeps its exact existing signature `(formData: ProductFormData, userId: string, isInternalFinalization: boolean, scope: BranchScope | null)` and return shape. No new parameters — callers are unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
test('a created product appears in every active warehouse of the branch at zero stock', async () => {
  // create via addProductWithScope with stock 25 into b.warehouseId
  const rows = await testQuery(
    'SELECT warehouse_id, stock FROM products WHERE sku = ? ORDER BY stock DESC', [sku]);
  expect(rows).toHaveLength(2);
  expect(Number(rows[0].stock)).toBe(25);          // selected warehouse keeps the quantity
  expect(Number(rows[1].stock)).toBe(0);           // the copy is zero
  expect(rows[1].warehouse_id).toBe(extra);
});

test('no inventory batch is created for a fanned-out copy', async () => {
  const batches = await testQuery(
    `SELECT b.id FROM inventory_batches b JOIN products p ON b.product_id = p.id
     WHERE p.sku = ? AND p.warehouse_id = ?`, [sku, extra]);
  expect(batches).toHaveLength(0);
});

test('a service product does not fan out', async () => {
  // itemType: 'service'
  const rows = await testQuery('SELECT id FROM products WHERE sku = ?', [sku]);
  expect(rows).toHaveLength(1);
});

test('selling units are not copied to the fanned-out copy', async () => {
  const units = await testQuery(
    `SELECT u.id FROM product_selling_units u JOIN products p ON u.product_id = p.id
     WHERE p.sku = ? AND p.warehouse_id = ?`, [sku, extra]);
  expect(units).toHaveLength(0);
});

test('a NULL-warehouse product creates one row and does not fan out', async () => {
  // head-office create with formData.warehouse omitted → scope { scope: 'all' }
  const rows = await testQuery('SELECT id FROM products WHERE sku = ?', [sku]);
  expect(rows).toHaveLength(1);
});

test('a fan-out failure rolls back the primary insert', async () => {
  // Force failure by pre-inserting a row that collides on (sku, warehouse_id)
  // in the TARGET warehouse, then create the product in the selected warehouse.
  // Assert the selected warehouse has NO row for that sku afterwards.
});
```

Reuse the branch + extra-warehouse setup from Task 1.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/product-fanout.spec.ts --reporter=line`
Expected: FAIL — only one row exists; no copies are written.

- [ ] **Step 3: Implement the fan-out inside the existing `withTransaction` in `addProductWithScope`**

Place it **after** the primary insert and its batch/shelves/selling-units/supplier-mappings writes, still inside the same `withTransaction` callback so it is atomic.

- Skip entirely when `isServiceProduct` is true or `resolvedWarehouseId` is falsy.
- Call `fanoutTargetWarehouses(resolvedWarehouseId, scope)`.
- For each target, `INSERT INTO products` with a fresh id in the same `product_${Date.now()}_${random}` format, copying: `name`, `description`, `additional_description`, `category`, `brand`, `department`, `subcategory`, `supplier_id`, `reorder_point`, `price`, `cost`, `sku`, `barcode`, `image_url`, `image_hint`, `unit_of_measure`, `income_account`, `expense_account`, `vat_status`, `availability`, `earns_points`, `is_perishable`, `type`; setting `warehouse_id` to the target and `stock` / `avg_daily_sales` to `0`; omitting `shelf_location_id`.
- Copy `product_price_levels` rows for each copy (matching `TransferStockService`).
- **No try/catch around the fan-out.** A swallowed failure produces a partially-created product, which the spec lists as an anti-goal. Let it propagate so `withTransaction` rolls back.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/product-fanout.spec.ts --reporter=line`
Expected: PASS (all tests from Tasks 1 and 2)

- [ ] **Step 5: Commit**

```bash
git add lib/product-create.ts tests/e2e/product-fanout.spec.ts
git commit -m "feat(products): fan a new product out to its branch warehouses at zero stock"
```

---

## Task 3: Backfill migration for existing products

**Files:**
- Create: `scripts/migrations/144_backfill_product_warehouse_fanout.ts`
- Modify: `scripts/migrations/index.ts` — add `import './144_backfill_product_warehouse_fanout';` after the `143_per_terminal_sta_lucia_claim` import (line ~146)
- Test: `tests/e2e/product-fanout-backfill.spec.ts` (create)

**Interfaces:**
- Consumes: `registerMigration`, `Migration` from `./runner`; `query` from `lib/mysql`.
- Produces: a migration named `144_backfill_product_warehouse_fanout` with `up()` and `down()`.

- [ ] **Step 1: Write the failing tests**

```ts
test('backfill fans existing products into their branch warehouses at zero stock', async () => {
  // seed a product in b.warehouseId, plus an extra active warehouse
  await runBackfill();
  const rows = await testQuery('SELECT warehouse_id, stock FROM products WHERE sku = ?', [sku]);
  expect(rows).toHaveLength(2);
  expect(rows.every((r: any) => r.warehouse_id === extra ? Number(r.stock) === 0 : true)).toBe(true);
});

test('backfill is idempotent across two runs', async () => {
  await runBackfill();
  await runBackfill();
  const rows = await testQuery('SELECT id FROM products WHERE sku = ?', [sku]);
  expect(rows).toHaveLength(2);
});

test('backfill skips services, non-root products and NULL-warehouse products', async () => {
  // one service row, one row with parent_id set, one row with warehouse_id NULL
  await runBackfill();
  // each must still have exactly one row
});

test('backfill creates no inventory batches', async () => {
  const before = await testQuery('SELECT COUNT(*) n FROM inventory_batches');
  await runBackfill();
  const after = await testQuery('SELECT COUNT(*) n FROM inventory_batches');
  expect(Number(after[0].n)).toBe(Number(before[0].n));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/product-fanout-backfill.spec.ts --reporter=line`
Expected: FAIL — migration 144 does not exist.

- [ ] **Step 3: Implement the migration**

`up()`: for each candidate product — `warehouse_id IS NOT NULL`, `type <> 'service'`, `parent_id IS NULL` — find the active warehouses of its warehouse's branch, and insert a zero-stock copy into each one that does not already hold the product. Identity match is **`sku` first, then `name`**, mirroring `TransferStockService` (`sku` is nullable and NULLs never collide in a unique index, so `sku` alone is not sufficient). Copy the same column list as Task 2. Single pass; no chunking.

`down()`: delete only rows that are unambiguously backfill-created — `stock = 0`, no `inventory_batches` row, and no `stock_movements` row. A row that has since received stock or been sold from **must not** be deleted. Follow migration 142's precedent and `throw` with a clear message rather than deleting anything ambiguous.

Write a leading comment block in the style of migration 142 explaining why non-root products and services are skipped.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/product-fanout-backfill.spec.ts --reporter=line`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/migrations/144_backfill_product_warehouse_fanout.ts scripts/migrations/index.ts tests/e2e/product-fanout-backfill.spec.ts
git commit -m "feat(products): backfill existing products into their branch warehouses"
```

---

## Task 4: Decouple the warehouse filter from the family roll-up

The largest and riskiest task. It must land **before** Task 5, because Task 5's default is what would otherwise trigger the regression this task prevents.

**Files:**
- Modify: `app/(app)/products/actions.ts` (`getProducts` ~`:115`, `:167-168`, `:185`; `getProductsCount` ~`:423`, `:434-435`)
- Test: `tests/e2e/products-family-rollup.spec.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getProducts` and `getProductsCount` keep their existing signatures and return shapes. Behaviour change only: a **warehouse-only** filter no longer suppresses family roll-up.

- [ ] **Step 1: Write the failing tests**

Seed a parent product and a child (`parent_id` = parent's id) in the same warehouse.

```ts
test('with no filters, children arrive nested and not as top-level rows', async () => {
  const res = await getProducts({}, 50, 0);
  expect(res.map((p: any) => p.id)).toContain(parentId);
  expect(res.map((p: any) => p.id)).not.toContain(childId);
  expect(res.find((p: any) => p.id === parentId).children.map((c: any) => c.id)).toContain(childId);
});

test('with ONLY a warehouse filter, the family roll-up survives', async () => {
  const res = await getProducts({ warehouse: warehouseId }, 50, 0);
  expect(res.map((p: any) => p.id)).not.toContain(childId);   // still nested
  expect(res.find((p: any) => p.id === parentId).children.map((c: any) => c.id)).toContain(childId);
});

test('a non-warehouse filter still flattens, as before', async () => {
  const res = await getProducts({ search: 'Child' }, 50, 0);
  expect(res.map((p: any) => p.id)).toContain(childId);
});

test('getProductsCount agrees with getProducts under a warehouse-only filter', async () => {
  const rows = await getProducts({ warehouse: warehouseId }, 50, 0);
  const count = await getProductsCount({ warehouse: warehouseId });
  expect(count).toBe(rows.length);
});
```

The last test is the one that catches a desynchronised page count.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/products-family-rollup.spec.ts --reporter=line`
Expected: FAIL — the warehouse-only cases return the child as a top-level row with no `children[]`.

- [ ] **Step 3: Split the flag in both functions**

Introduce two distinct booleans where one `hasActiveFilters` is used today:
- `hasRowFilters` — the existing expression **minus** `filters.warehouse`. This is what gates the search/brand/category/etc. flattening behaviour.
- `suppressRollup` — equals `hasRowFilters` (i.e. a warehouse filter alone does **not** suppress).

Use `suppressRollup` for both the `p.parent_id IS NULL` clause and the recursive-CTE branch, in `getProducts` **and** `getProductsCount`. Keep the warehouse `WHERE` clause itself exactly as it is — it still filters rows; it just no longer flips the roll-up.

The two functions must use identical logic or the count and the page disagree.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/products-family-rollup.spec.ts --reporter=line`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the existing products suites for regressions**

Run: `npx playwright test tests/e2e/add-product.spec.ts tests/e2e/products-table-selling-units.spec.ts --reporter=line`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/products/actions.ts" tests/e2e/products-family-rollup.spec.ts
git commit -m "fix(products): keep family roll-up under a warehouse-only filter"
```

---

## Task 5: Default the products-table warehouse filter

**Files:**
- Modify: `app/(app)/products/page.tsx:326` (and the `productOptions.warehouses` consumer around `:644-653` if the default needs resolving from it)
- Test: `tests/e2e/products-warehouse-default.spec.ts` (create)

**Interfaces:**
- Consumes: `getProducts` / `getProductsCount` behaviour from Task 4.
- Produces: no exported interface change.

- [ ] **Step 1: Write the failing test**

```ts
test('the products page lands on a single warehouse, not All', async ({ page }) => {
  // sign in, open /products
  // the warehouse filter control shows a specific warehouse name, not "All"
  // and a product fanned out to two warehouses appears exactly once in the table
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/products-warehouse-default.spec.ts --reporter=line`
Expected: FAIL — default is `'all'`, and the fanned-out product appears twice.

- [ ] **Step 3: Set the default warehouse**

Replace the `useState<string>('all')` initial value with a resolved default warehouse. Constraints from the spec:
- It must be a warehouse of the user's own branch.
- It must **not** depend on `warehouses.is_main` unless that column gets a real migration in this task (there is none today; the column is added at runtime by `app/api/warehouses/route.ts`). Prefer not depending on it.
- A user whose branch has no warehouses gets an empty list, not an unfiltered one.
- `'all'` must remain selectable, and the existing filter chips and count badges must keep working.

Since `productOptions.warehouses` arrives asynchronously, the default has to be applied once options load rather than in the `useState` initialiser; pick the first warehouse of that list and do not overwrite a choice the user has already made.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/products-warehouse-default.spec.ts --reporter=line`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/products/page.tsx" tests/e2e/products-warehouse-default.spec.ts
git commit -m "feat(products): default the products table to a single warehouse"
```

---

## Task 6: POS fails closed on an unresolvable terminal location

**Files:**
- Modify: `src/infrastructure/repositories/MySqlProductRepository.ts:66` and `:196`
- Test: `tests/e2e/pos-warehouse-failclosed.spec.ts` (create)

**Interfaces:**
- Consumes: `pos_terminals.branch_id` (populated; the server-side source of branch truth).
- Produces: no signature change to `findAll` / its count sibling.

- [ ] **Step 1: Write the failing tests**

```ts
test('a blank warehouse filter does not return every warehouse copy', async () => {
  // product fanned out to 2 warehouses, then query with warehouseId = ''
  // expect: NOT 2 rows for the same sku
});

test('an unresolvable warehouse id returns nothing rather than everything', async () => {
  // warehouseId = 'Store' (the literal default from app/api/pos-terminals/route.ts)
  // expect: 0 rows
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/pos-warehouse-failclosed.spec.ts --reporter=line`
Expected: FAIL on the first test — `if (filters.warehouseId)` is falsy for `''`, so the filter is dropped and both copies return.

- [ ] **Step 3: Make the filter fail closed**

The current guard is a truthiness check, so `''` / `null` silently drops the `AND products.warehouse_id = ?` clause and returns every warehouse's copy of every product — duplicate same-barcode rows in a cashier's search.

Distinguish "no warehouse filter requested" from "a warehouse filter that did not resolve". When a `warehouseId` was supplied but is blank or does not match a `warehouses.id`, the query must match **nothing** rather than everything. Apply the same change at both `:66` and `:196` so the list and its count agree.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/pos-warehouse-failclosed.spec.ts --reporter=line`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the POS suites for regressions**

Run: `npx playwright test tests/e2e/pos-sale.spec.ts tests/e2e/pos-search-focus.spec.ts --reporter=line`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/repositories/MySqlProductRepository.ts tests/e2e/pos-warehouse-failclosed.spec.ts
git commit -m "fix(pos): fail closed when a terminal warehouse does not resolve"
```

---

## Task 7: Stop business-metric counts multiplying

Only the two **business metrics** change. The `reports/inventory` counts are **pagination counts** and must stay `COUNT(*)`, or `totalPages` desynchronises from the listed rows.

**Files:**
- Modify: `app/api/reports/stats/route.ts:174` (`low_stock_items`), `:175` (`total_items`)
- Test: `tests/e2e/reports-distinct-counts.spec.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: no response-shape change; `total_items` and `low_stock_items` keep their names and types.

- [ ] **Step 1: Write the failing tests**

```ts
test('total_items counts a fanned-out product once', async () => {
  // one product fanned out to 2 warehouses in the branch
  // GET /api/reports/stats → total_items increases by 1, not 2
});

test('total_items counts a NULL-sku product', async () => {
  // a product with sku NULL must still be counted (COUNT(DISTINCT sku) would drop it)
});

test('low_stock_items counts a product once even when several copies are low', async () => {
  // two copies of one product, both below reorder_point → counted once
});

test('reports/inventory pagination count still matches the rows listed', async () => {
  // GET /api/reports/inventory → total equals the number of rows on an unpaginated fetch
});
```

The second test is the one that catches a naive `COUNT(DISTINCT sku)`. The fourth guards the count that must *not* change.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/reports-distinct-counts.spec.ts --reporter=line`
Expected: FAIL — `total_items` and `low_stock_items` are inflated by the warehouse count.

- [ ] **Step 3: Make the two business metrics distinct**

In the `summaryQuery` in `app/api/reports/stats/route.ts`, change `total_items` and `low_stock_items` from `COUNT(*)` to a `COUNT(DISTINCT …)` over a **coalesced identity**, because `sku` is nullable and `COUNT(DISTINCT sku)` silently drops every NULL-SKU product. Use the `sku`-then-`name` identity the backfill and `TransferStockService` use, e.g. `COUNT(DISTINCT COALESCE(sku, CONCAT('name:', name)))`. Confirm the expression against the real column nullability.

Leave `app/api/reports/inventory/route.ts:87` and `:123` as `COUNT(*)` — verified pagination counts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/reports-distinct-counts.spec.ts --reporter=line`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/reports/stats/route.ts tests/e2e/reports-distinct-counts.spec.ts
git commit -m "fix(reports): count products once per branch, not once per warehouse"
```

---

## Task 8: Documentation and full-suite verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-23-product-warehouse-fanout-design.md` (record the follow-up)

- [ ] **Step 1: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 2: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS. Report any failure with its output rather than claiming success.

- [ ] **Step 3: Document the feature in `CLAUDE.md`**

Add to the Key Domain Patterns area, in the existing voice (state what is guaranteed and what is deliberately left open):
- A created product fans out to every active warehouse of its branch at zero stock; the fan-out shares `addProductWithScope`'s transaction and is all-or-nothing.
- Selling units, shelf locations, `parent_id` and `conversion_factor` are not copied; services and non-root products do not fan out.
- Copies are independent: there is no field sync, by design.
- `is_active` is the source of truth for warehouse activity; the runtime-added `active` column is stale and deliberately untouched.
- **Still open:** `getProducts` / `getProductsCount` apply no branch filtering at all, so selecting "All warehouses" shows other branches' products — a pre-existing read-isolation gap this work did not widen and deliberately did not fix, alongside the unauthenticated `GET /api/branches`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-23-product-warehouse-fanout-design.md
git commit -m "docs: record product warehouse fan-out and its open read-isolation gap"
```
