# Warehouse Tabs + Multi-Warehouse Product Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the products table's warehouse selector out of the filter panel into a branch-scoped tab strip, and let product creation target several chosen warehouses with per-warehouse opening stock instead of fanning out to every warehouse at zero stock.

**Architecture:** A new session-resolving server action (`getBranchWarehouses`) becomes the single source of the warehouse list for both the tab strip and the create form, replacing the unfiltered `getWarehouses()` in those two places. `addProductWithScope` replaces its `fanoutTargetWarehouses` call with an explicit, fully-pre-validated multi-insert inside the existing `withTransaction`, writing a product row, an opening batch and a `stock_movements` row per selected warehouse — all-or-nothing.

**Tech Stack:** Next.js 16 server actions, raw `mysql2/promise` via `lib/mysql.ts`, Zod schemas, react-query, shadcn components, Playwright E2E (port 3100, `alon_pos_test`, `workers: 1`).

**Spec:** `docs/superpowers/specs/2026-10-27-warehouse-tabs-and-multi-warehouse-create-design.md`

## Global Constraints

- **`is_active` is the source of truth** for whether a warehouse is active. The runtime-added `active` column is stale and must be left untouched.
- **`scope === null` (no valid cookie) falls back to pre-guard behaviour** everywhere, never fails closed. For the warehouse list this means today's unfiltered list.
- **Never give a `'use server'` export a `scope` parameter.** Scope-accepting implementations stay in non-`'use server'` modules (`lib/product-create.ts`), imported server-to-server.
- **Runtime id validation stays.** `assertWarehouseInBranch` throws `BranchResolutionError` for a non-string or empty id *before* the head-office early return; `lib/mysql.ts` uses `pool.query`, which escapes an object parameter as a match-many predicate. Validate **every** entry in the new collection, not just the first.
- **All-or-nothing writes.** Every warehouse target is validated *before* any transaction opens; one refusal writes nothing — not a product row, not a batch, not a `stock_movements` row.
- **Do not modify migration 144.** Its backfill is historical fact and its `down()` is deliberately strict.
- **E2E tests are sequential** (`workers: 1`); never add parallelism.
- **Do not touch these — they are correct and the spec lists them as unchanged.** If a task seems to need one changed, stop and raise it instead:
  - `getDefaultProductWarehouse()` and its server-side resolution, including its uid-keyed react-query cache and `staleTime: Infinity`.
  - `MySqlProductRepository.resolveWarehouseFilter()`'s *absent* (`undefined`/`null` → no filter) vs *unresolved* (non-string/blank → `AND 1=0`) split, in both `findAll` and its count sibling.
  - POS's fail-closed `useProducts(warehouseId?, …, enabled)` behaviour and **all four** POS product queries (list, debounced search, F9 `ProductSearchDialog`, `PriceInquiryDialog`).
  - `ProductFilters.flat` and the `use-bulk-price-update.ts` opt-out; `rollupSuppressed(filters)` keeps excluding a warehouse-only filter.
  - `getWarehouses()` stays unfiltered — only the products tab strip and the create picker move to `getBranchWarehouses()`.

## Review Focus

1. **Duplicate `warehouseId` in one submission** — two entries for the same warehouse would create two product rows in one warehouse and double its opening stock. Zod must reject it (Task 3).
2. **Non-string / object `warehouseId`** (`{}`, `0`, `null`, `'  '`) — `pool.query` turns an object parameter into a match-many predicate, so a write keyed by it could hit every row. Must be refused per entry before any transaction (Tasks 3, 5).
3. **A branch user who selects zero warehouses** — `assertWarehouseForWrite` refuses NULL for a branch caller, so the submit dies with a message the user cannot act on. The form must enforce min-1 for non-head-office callers (Task 4).
4. **Opening stock of 0 for a selected warehouse** — must create the product row but **no** batch and **no** movement row, or valuation reports gain a phantom zero-cost batch (Task 5).
5. **"Clear filters" after switching warehouse tabs** — the warehouse is no longer a filter; if clearing resets it, the user is silently moved to another warehouse's catalogue (Task 2).

---

## Task 1: Branch-scoped active warehouse list

**Files:**
- Modify: `app/(app)/products/actions.ts` (add beside `getDefaultProductWarehouse`, ~line 1156)
- Test: `tests/e2e/branch-warehouse-list.spec.ts` (create)

**Interfaces:**
- Consumes: `resolveScopeFromSession()`, `mainBranchId()`, `BranchResolutionError` from `lib/branch-context.ts`; `query` from `lib/mysql.ts`.
- Produces: `getBranchWarehouses(): Promise<{ warehouses: Warehouse[]; isHeadOffice: boolean }>` — the single warehouse source for Tasks 2 and 4. `Warehouse` is the existing interface at `lib/types.ts:287`, the same type `getWarehouses()` returns (`{ id, name, location, isActive, createdAt }`). `isHeadOffice` is `true` for `{ scope: 'all' }`, `false` for `{ scope: 'single' }`, and `true` when `scope === null` (the unguarded fallback must not impose a min-1 rule the old path never had).

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/branch-warehouse-list.spec.ts`, reusing `seedSecondBranch`, `cleanupSecondBranch`, `addWarehouseToBranch` from `./helpers/branches` and `testQuery` from `./helpers/db` (same setup shape as `tests/e2e/product-fanout.spec.ts`). These call the action directly — no `page` fixture.

```ts
test('a branch scope returns only that branch\'s active warehouses', async () => {
  // seed branch B with an active and an inactive warehouse; assert the
  // inactive one and the main branch's warehouses are absent, and
  // isHeadOffice === false
});

test('head office returns active warehouses of every branch', async () => {
  // assert both the main branch's and branch B's active warehouse are
  // present, the inactive one is absent, and isHeadOffice === true
});

test('an inactive warehouse is never listed', async () => { ... });
```

The scope is resolved from the session cookie, so each test must drive `resolveScopeFromSession`'s input the way `tests/e2e/helpers/auth.ts` already does for cookie-bearing tests. If no helper exists to set a branch-user cookie for a direct (non-`page`) action call, add one to `tests/e2e/helpers/auth.ts` as part of this task — Tasks 2 and 4 need it too.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/branch-warehouse-list.spec.ts`
Expected: FAIL — `getBranchWarehouses is not a function`.

- [ ] **Step 3: Implement `getBranchWarehouses()` in `app/(app)/products/actions.ts`**

Model it on `getDefaultProductWarehouse()` immediately above, including its error discipline: a `BranchResolutionError` with `status < 500` means "genuinely none" and returns an empty list with `isHeadOffice: false`; any other error is **re-thrown** so react-query's `isError` can fire (swallowing it is what the fan-out work had to fix once already).

- Branch scope: `SELECT ... FROM warehouses WHERE branch_id = ? AND is_active = 1 ORDER BY name`.
- Head office and `scope === null`: `SELECT ... FROM warehouses WHERE is_active = 1 ORDER BY name`.
- Map rows with the same shape `getWarehouses()` uses.

Leave `getWarehouses()` itself untouched — other callers depend on the unfiltered list.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/branch-warehouse-list.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/products/actions.ts" tests/e2e/branch-warehouse-list.spec.ts tests/e2e/helpers/auth.ts
git commit -m "feat(products): add branch-scoped active warehouse list action"
```

---

## Task 2: Warehouse tab strip in the products table

**Files:**
- Modify: `app/(app)/products/page.tsx` (warehouse `<Select>` ~line 701; active-filter chip ~line 830; filter/badge counters)
- Test: `tests/e2e/products-warehouse-tabs.spec.ts` (create)

**Interfaces:**
- Consumes: `getBranchWarehouses()` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

```ts
test('the resolved default warehouse tab is selected on load', async ({ page }) => { ... });
test('clicking a warehouse tab filters the table to that warehouse', async ({ page }) => { ... });
test('Clear filters does not change the selected warehouse tab', async ({ page }) => { ... });
test('the warehouse no longer appears as a filter chip', async ({ page }) => { ... });
test('a branch with no warehouses shows an empty table, not an unfiltered one', async ({ page }) => { ... });
```

The last one is the fail-closed property: assert the table is empty, **not** that it shows another branch's products.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/products-warehouse-tabs.spec.ts`
Expected: FAIL — no tab strip in the DOM.

- [ ] **Step 3: Replace the warehouse `<Select>` with a tab strip in `app/(app)/products/page.tsx`**

- Render the strip above the products table, below the page header. Use the project's existing shadcn `Tabs` (or a button row, implementer's call) with one tab per `getBranchWarehouses()` warehouse plus an **"All warehouses"** tab.
- Clicking a tab calls the existing `chooseWarehouse` — do not add a second state path.
- Keep `selectedWarehouse`, `NO_WAREHOUSE`, `warehouseDefaultReady`, the `enabled: warehouseDefaultReady` query gate, `getDefaultProductWarehouse()` and its `defaultWarehouseFailed` fallback **unchanged**. Render the strip in a skeleton state while the default resolves, so it never visibly shows "All" and then jumps.
- When head office, make the branch distinguishable where two branches have similarly-named warehouses (group or label — implementer's call).
- **Remove** the warehouse `<Select>` from the filter panel, **remove** the "Warehouse: …" chip from the active-filters row, and make "Clear filters" leave `selectedWarehouse` alone.
- The warehouse must **stop** counting toward the active-filter count badge. `rollupSuppressed(filters)` already excludes a warehouse-only filter — leave it as it is.
- **Overflow:** the strip never wraps to a second row, scrolls horizontally when it overflows, scrolls the selected tab into view on mount and on change, and is usable at phone width.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx playwright test tests/e2e/products-warehouse-tabs.spec.ts` → PASS (5 tests)
Run: `npm run typecheck` → no errors
Run: `npm run lint` → no new errors

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/products/page.tsx" tests/e2e/products-warehouse-tabs.spec.ts
git commit -m "feat(products): replace the warehouse filter with a branch-scoped tab strip"
```

---

## Task 3: Multi-warehouse schema

**Files:**
- Modify: `app/(app)/products/add-product/product-schema.ts` (`standardProductSchema` ~line 174, `serviceProductSchema` ~line 205)
- Test: `tests/e2e/product-multi-warehouse-schema.spec.ts` (create)

**Interfaces:**
- Produces: on `standardProductSchema`, `warehouses: Array<{ warehouseId: string; stock: number; isPrimary?: boolean }>`. `cost` and `reorderPoint` keep their existing single-field shapes. Tasks 4 and 5 both consume this shape.
- **`ProductFormData` gains `warehouses?` and keeps `warehouse?` and `stock?`.** Both existing fields are already optional **and are shared with `updateProduct`**, which the spec keeps single-warehouse (Non-goal 1). So the collection is **added alongside** them, never a replacement — removing them would break Edit Product. The *create* schema is where `warehouses` becomes the real input; `addProductWithScope` reads `warehouses` when present and otherwise normalises the legacy pair (Task 5, step 3.1).

- [ ] **Step 1: Write the failing tests**

Pure schema tests — parse and assert, no DB, no `page`.

```ts
test('accepts several warehouses each with its own stock', ...);
test('rejects a duplicate warehouseId in one submission', ...);
test('rejects a non-string or blank warehouseId', ...);   // '', '  ', 0, {}, null
test('rejects a negative or fractional stock', ...);
test('accepts an empty warehouse collection', ...);       // head-office NULL-warehouse case
test('a service cannot carry warehouses or stock', ...);  // the pinned z.undefined()/z.literal(0)
test('normalises the legacy single-warehouse shape to one entry', ...);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/product-multi-warehouse-schema.spec.ts`
Expected: FAIL — no `warehouses` field.

- [ ] **Step 3: Implement the schema change**

- `standardProductSchema`: replace `warehouse: z.string().optional()` and `stock: ...` with the `warehouses` array above. Per entry: `warehouseId` a non-empty, trimmed string; `stock` a non-negative integer. Reject duplicate `warehouseId`s across the array (a `.superRefine` or `.refine` on the array).
- The **primary** is the entry with `isPrimary: true`, defaulting to the first entry. It is **optional when the array is empty** (no primary exists, `products.warehouse_id` is NULL — a legitimate head-office state). Reject more than one `isPrimary: true`.
- `serviceProductSchema`: pin the new field as tightly as the old one was — a service must be unable to carry warehouses or stock even if the UI is bypassed. **Keep** the existing `warehouse: z.undefined()` and `stock: z.literal(0)` pins (they stay on `ProductFormData`, see Interfaces) and **add** a pin forcing `warehouses` to an empty array.
- Export a normaliser that maps a legacy `{ warehouse, stock }` payload to `[{ warehouseId: warehouse, stock, isPrimary: true }]`, so an **already-queued** approval item replays correctly. Task 5 calls it on entry.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/product-multi-warehouse-schema.spec.ts` → PASS (7 tests)
Run: `npm run typecheck` → expect errors in the form and `product-create.ts` (Tasks 4, 5 fix them); no errors inside the schema file itself.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/products/add-product/product-schema.ts" "app/(app)/products/actions.ts" tests/e2e/product-multi-warehouse-schema.spec.ts
git commit -m "feat(products): multi-warehouse create schema with per-warehouse stock"
```

---

## Task 4: Multi-warehouse picker in the add-product inventory tab

**Files:**
- Modify: `app/(app)/products/add-product/tabs/inventory-tab.tsx` (warehouse combobox ~line 232, `stock` field ~line 317)
- Modify: `app/(app)/products/add-product/use-add-product-form.ts` (~line 223, `setWarehouses` from `externalProductOptions`)
- Test: `tests/e2e/product-multi-warehouse-form.spec.ts` (create)

**Interfaces:**
- Consumes: `getBranchWarehouses()` (Task 1), the `warehouses` field (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

```ts
test('selecting two warehouses shows a stock input for each', async ({ page }) => { ... });
test('the first selected warehouse is the primary by default and the primary can be changed', async ({ page }) => { ... });
test('a branch user cannot submit with zero warehouses selected', async ({ page }) => { ... });
test('head office can submit with zero warehouses selected', async ({ page }) => { ... });
test('the picker lists only the branch\'s active warehouses', async ({ page }) => { ... });
test('cost and reorder point appear once, not per warehouse', async ({ page }) => { ... });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/product-multi-warehouse-form.spec.ts`
Expected: FAIL — single-select combobox, one `stock` field.

- [ ] **Step 3: Implement the multi-warehouse section**

- `use-add-product-form.ts`: feed the warehouse list from `getBranchWarehouses()` instead of `externalProductOptions.warehouses`, and keep its `isHeadOffice` so the form can enforce min-1 for a non-head-office caller (Review Focus 3). Leave the other `externalProductOptions` fields alone.
- `inventory-tab.tsx`: the combobox becomes multi-select; each selected warehouse gets a row with its own **initial stock** input and a primary marker (radio or similar). **Keep** the inline "Add Warehouse" / "Edit Warehouse" affordances.
- **Cost and reorder point stay single fields** shared by the whole submission. Consider moving them visually next to the warehouse section so their shared-ness is obvious (implementer's call).
- The whole section stays hidden for services, as today.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx playwright test tests/e2e/product-multi-warehouse-form.spec.ts` → PASS (6 tests)
Run: `npm run typecheck` → no errors in these two files
Run: `npm run lint` → no new errors

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/products/add-product/" tests/e2e/product-multi-warehouse-form.spec.ts
git commit -m "feat(products): pick several warehouses with per-warehouse opening stock"
```

---

## Task 5: Multi-warehouse write path in `addProductWithScope`

**Files:**
- Modify: `lib/product-create.ts` (queue summary ~line 122; batch insert ~line 240; fan-out block ~line 300; delete `fanoutTargetWarehouses` ~line 62)
- Modify: `components/approvals/approvals-kanban.tsx` (generic `PRODUCT_CREATE` `ItemsTable` cols ~line 328)
- Rewrite: `tests/e2e/product-fanout.spec.ts` → `tests/e2e/product-multi-warehouse-create.spec.ts`

**Interfaces:**
- Consumes: the `warehouses` field and legacy normaliser (Task 3); `assertWarehouseForWrite` (already in this file); `recordStockMovement(movement, connection?)` from `lib/stock-movements.ts` — note it takes an optional `connection`, which is **required** here so the movement joins the transaction.
- Produces: `addProductWithScope(formData, userId, isInternalFinalization, scope)` keeps its signature. `fanoutTargetWarehouses` is **removed**.

- [ ] **Step 1: Rewrite the test file**

Rename `tests/e2e/product-fanout.spec.ts` to `tests/e2e/product-multi-warehouse-create.spec.ts`.

**Delete** the entire `test.describe('fanoutTargetWarehouses')` block (6 tests) — the function goes with it.

From `addProductWithScope fan-out`, **delete** the two contradicted tests: *"a created product appears in every active warehouse of the branch at zero stock"* and *"no inventory batch is created for a fanned-out copy"*.

**Port** (same assertions, new input shape): *"the copy carries the descriptive columns of the original"*, *"the copy takes its scalar columns from the post-sync primary, not from the form"*, *"product_price_levels rows are copied … under its own product id"*, *"selling units are not copied"*, *"a service product does not fan out"* (now: a service takes no warehouse collection), *"a NULL-warehouse product creates one row"*, and *"a fan-out failure rolls back the primary insert"* — rename the last to reflect the multi-insert; it is the all-or-nothing property and matters more now.

**Add:**

```ts
test('each selected warehouse gets a product row, a batch and a movement row', ...);
test('a warehouse with zero opening stock gets a row but no batch and no movement', ...);  // Review Focus 4
test('an out-of-branch warehouse refuses the whole submission and writes nothing', ...);
  // assert zero rows in products, inventory_batches AND stock_movements, and that
  // the message names the offending warehouse
test('a duplicate warehouseId is refused', ...);           // Review Focus 1
test('a non-string warehouseId is refused before any write', ...);  // Review Focus 2
test('head office may select warehouses in two different branches', ...);
test('a legacy single-warehouse payload still creates correctly', ...);  // queued-approval replay
test('a queued multi-warehouse create records one items[] row per warehouse', ...);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/product-multi-warehouse-create.spec.ts`
Expected: FAIL — `formData.warehouses` unread; `fanoutTargetWarehouses` still imported by nothing.

- [ ] **Step 3: Implement the multi-warehouse write path in `lib/product-create.ts`**

In order:

1. **Normalise on entry** — call Task 3's legacy normaliser so a queued old-shape payload becomes a single-entry collection.
2. **Validate every target before the transaction opens.** Call `assertWarehouseForWrite(entry.warehouseId, scope)` for **each** entry. One refusal returns `{ success: false, message }` naming that warehouse; nothing is written. Services keep their existing path: warehouse assigned from the branch's main warehouse, then asserted.
3. **Queue summary** — emit **one `items[]` row per warehouse**, each with the warehouse **name** (resolve it; the approvals UI renders this to a human) and that warehouse's own quantity. Replaces today's single row with `quantity: formData.stock || 0`.
4. **Inside the existing `withTransaction`**, for each entry: insert the product row (primary entry → `products.warehouse_id`, owns `shelfLocationIds` / `product_shelves` and `product_selling_units`; non-primary entries → the fan-out's existing 23 scalar columns plus `product_price_levels`, read back from the post-sync primary exactly as the current fan-out block does). Then, **when that entry's stock > 0**, insert its `inventory_batches` row (shared `cost`, product `price`, `source_type: 'adjustment'`, notes `'Initial Stock'`) **and** a `stock_movements` row via `recordStockMovement({...}, connection)` — passing `connection` so it is covered by the rollback.
5. **Make the batch insert fatal.** Remove the `try/catch` that currently only `console.warn`s `[BatchCosting] Could not create batch…`. A product must never exist with stock that FIFO cannot deduct from. Call this out in the commit message.
6. **No try/catch around the per-warehouse inserts** — a failure must roll the primary back, exactly as the fan-out does today.
7. **Still not carried** to a non-primary row, each for its existing reason: `product_shelves` / `shelf_location_id`, `product_selling_units` (global `UNIQUE(barcode)`, `NOT NULL`), `parent_id` / `conversion_factor`, `supplier_product_mapping`.
8. **Delete `fanoutTargetWarehouses`** and its JSDoc. It has no remaining caller — migration 144 reimplements the logic inline and does not import it. **Do not touch migration 144.**
9. **No field sync** between warehouse rows, before or after creation.

In `components/approvals/approvals-kanban.tsx`, add a **Warehouse** column to the generic `PRODUCT_CREATE` `ItemsTable` cols (~line 328), so the per-warehouse rows are distinguishable. The table already renders N rows generically; no other UI change is needed.

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx playwright test tests/e2e/product-multi-warehouse-create.spec.ts` → PASS
Run: `npm run typecheck` → no errors
Run: `npm run lint` → no new errors

- [ ] **Step 5: Commit**

```bash
git add lib/product-create.ts components/approvals/approvals-kanban.tsx tests/e2e/
git commit -m "feat(products): create into several warehouses with per-warehouse opening stock

Replaces the unconditional branch-wide fan-out with an explicit, fully
pre-validated multi-insert: one product row, opening batch and stock
movement per selected warehouse, all-or-nothing.

BEHAVIOUR CHANGE: the opening inventory_batches insert is now fatal
instead of a swallowed console.warn. A product could previously be
created with stock that no batch backed, which FIFO cannot deduct from.

Deletes fanoutTargetWarehouses — no remaining caller (migration 144
reimplements the logic inline and is left untouched)."
```

---

## Task 6: Full-suite regression and documentation

**Files:**
- Modify: `CLAUDE.md` (the product-warehouse fan-out section)

- [ ] **Step 1: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS. Pay particular attention to `tests/e2e/branch-write-isolation.spec.ts` and `tests/e2e/reports-distinct-counts.spec.ts`. The latter matters because per-warehouse stock means additional warehouse rows are **no longer necessarily zero-value**, so the valuation reports' `SUM`s now legitimately include them at creation rather than only after a transfer. That is correct behaviour — confirm the DISTINCT-count assertions still hold, and if one breaks, verify which side is wrong before changing either.

- [ ] **Step 2: Update `CLAUDE.md`**

Rewrite the fan-out section to describe the new behaviour, and record these, which the spec decided deliberately:
- The fan-out is replaced by explicit multi-warehouse selection with per-warehouse opening stock; one shared cost, one shared reorder point.
- The warehouse list for the products tabs and the create picker is branch-scoped and active-only via `getBranchWarehouses()`; `getWarehouses()` stays unfiltered for its other callers.
- **An inactive warehouse holding stock loses its tab** — a small accepted capability regression; the valuation reports remain a complete unfiltered path to that stock.
- **Head office may now select warehouses across branches** in one submission (the fan-out was confined to one branch).
- The opening batch insert is now **fatal**.
- Opening stock writes `stock_movements` rows, closing an audit gap create had.
- **`getProducts` / `getProductsCount` remain branch-unfiltered** — the "All warehouses" tab still shows other branches' products. Unchanged by this work, still on the follow-up list with the unauthenticated `GET /api/branches` and the `approvals/queue` / `reports/soa` cross-branch reads.
- A queued multi-warehouse create has **more ways to become permanently unfinalizable** than a single-warehouse one: `scopeForQueuedItem(item.created_by)` re-asserts every entry against the creator's current scope, so a creator who has changed branch, been deleted or left branchless refuses the whole item and it stays Pending. Documented, no fallback added.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record multi-warehouse product creation and warehouse tabs"
```
