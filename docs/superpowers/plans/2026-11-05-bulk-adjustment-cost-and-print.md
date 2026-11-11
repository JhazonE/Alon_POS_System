# Bulk Adjustment Cost Entry and Printable Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user type a per-product unit cost when adding stock in Bulk Stock Adjustment — updating the product's cost and pricing the new FIFO batch — and print a signed transaction report of what was posted.

**Architecture:** The typed cost is written to `products.cost` (plus the base selling unit) inside the existing `withTransaction` in `POST /api/inventory/adjust/bulk`, immediately before the stock change, so the batch-costing block in `lib/stock-movements.ts` reads it. That read currently uses the pool rather than the passed connection, so Task 1 fixes it as a standalone prerequisite. Cost entry is gated by a new `edit_product_cost` permission checked on the server. Queued (approval-pending) items carry the cost through the approval payload into `adjustStockWithScope`. The printout is a `print:block` layout in the same folder, modelled on the stock-count print layout.

**Tech Stack:** Next.js 16, React, TypeScript, raw `mysql2/promise` (no ORM), Playwright (e2e, `workers: 1`), `tsx` unit tests (`npm run test:unit`).

**Spec:** `docs/superpowers/specs/2026-11-04-bulk-adjustment-cost-and-print-design.md`

## Global Constraints

- MySQL only, raw SQL via `lib/mysql.ts`. No ORM, no new query abstraction.
- `lib/mysql.ts` uses `pool.query`, which escapes an **object** parameter as `` `key` = value ``. Never pass an unvalidated value as an id; runtime-check that ids are non-empty strings before they reach a query.
- Migrations are numbered TypeScript files with `up()`/`down()`, registered by an `import` line in `scripts/migrations/index.ts`. Next free number: **145**.
- `stock_adjustments.unit_cost` is `DECIMAL(10, 2)`, matching `products.cost` (migration 001).
- The reference series is `getNextReference('stock_adjustment')` — **company-wide**. No migration, no reset-route change; the column exists and all three reset paths already seed it.
- Cost applies to **ADD only**. REMOVE and TRANSFER must never write cost.
- A blank cost means "leave cost alone" — never coerce to 0.
- Permission check is strict: `EXISTS` against `user_permissions` for `edit_product_cost`. No `userType` shortcut.
- The branch guard in the bulk route (`resolveScopeFromBody` + both `assertWarehouseInBranch` calls) must remain unchanged and keep running before the loop.
- Clients of the bulk route must keep sending the session uid via `lib/session-uid.ts`.
- E2E tests run sequentially against `alon_pos_test` on port 3100. Never set `workers` above 1.

## Review Focus

Input classes the spec implies that no task's happy path exercises. Each has a test added to the task that owns the code.

1. **A blank cost on one row while another row has one** — the blank row's `products.cost` must be untouched, not zeroed. Owned by Task 4.
2. **A cost submitted by a caller lacking `edit_product_cost`** — the route must refuse the whole request, not drop the costs and post stock at the old valuation. Owned by Task 3.
3. **A cost submitted on a REMOVE or TRANSFER batch** — must be refused or ignored, never written; `adjustmentType` arrives from the client and cannot be trusted. Owned by Task 4.
4. **A malformed cost** (negative, `NaN`, a string, an object) — must refuse the batch rather than coerce. The object case matters specifically because of the `pool.query` escaping hazard above. Owned by Task 4.
5. **A batch where every item was queued for approval** — the print must not be offered, and no `stock_adjustments` row may claim a cost. Owned by Task 7.

---

### Task 1: Batch costing reads the caller's connection

Prerequisite bug fix, landed on its own. `updateStockAndRecordMovement` is called from every stock write path (sales, POs, transfers, counts, family sync), so this changes behaviour repo-wide: an uncommitted `products.cost` write on the same transaction becomes visible to the batch it creates.

**Files:**
- Modify: `lib/stock-movements.ts:195` (the `SELECT cost, price FROM products` inside the `--- BATCH COSTING ---` block)
- Test: `tests/e2e/adjustment-batch-cost-connection.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no signature change. `updateStockAndRecordMovement(productId, quantityChange, movementType, referenceId?, referenceType?, notes?, connection?, expirationDate?)` keeps its exact shape; only which connection the cost read uses changes.

- [ ] **Step 1: Write the failing test**

In `tests/e2e/adjustment-batch-cost-connection.spec.ts`, a test named `batch takes a cost written in the same transaction`. It must drive a real transaction: use `testQuery` from `./helpers/db` to read, and exercise the path through the bulk API so the write and the batch share one `withTransaction`. Assert against `inventory_batches.unit_cost` for the product, found by `notes` as `tests/e2e/adjustment-expiration.spec.ts` does — never by `ORDER BY created_at` alone, because `created_at` is second-precision and batch ids are random.

Because Task 4 has not landed yet, this test drives the cost write with a direct `UPDATE products SET cost` on the transaction connection in a small test-only harness, not via the route's cost field.

```ts
// asserts the batch carries 99.50, not the product's prior cost
expect(Number(batch.unit_cost)).toBe(99.50);
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx playwright test tests/e2e/adjustment-batch-cost-connection.spec.ts`
Expected: FAIL — `unit_cost` is the old cost, because the pool read cannot see the uncommitted write.

- [ ] **Step 3: Use the passed connection for the cost read**

In `lib/stock-movements.ts`, change the `costInfo` read to use `connection.query(...)` when `connection` is present and fall back to `query(...)` when it is not — matching the `productResult` read ~40 lines above in the same function, which already does exactly this. Note `connection.query` returns `[rows, fields]` while `query` returns rows; destructure accordingly.

Leave the surrounding `try/catch` alone. It swallows batch-costing failures; that is a known follow-up recorded in the spec, not part of this task.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx playwright test tests/e2e/adjustment-batch-cost-connection.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the full suites to prove no caller regressed**

Run: `npm run test:unit` then `npm run test:e2e`
Expected: PASS. This is the point of the task — every stock write path flows through this function.

- [ ] **Step 6: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/stock-movements.ts tests/e2e/adjustment-batch-cost-connection.spec.ts
git commit -m "fix(inventory): batch costing reads the caller's transaction connection"
```

---

### Task 2: Migration 145 — `stock_adjustments.unit_cost`

**Files:**
- Create: `scripts/migrations/145_add_unit_cost_to_stock_adjustments.ts`
- Modify: `scripts/migrations/index.ts` (add the `import './145_add_unit_cost_to_stock_adjustments';` line after 144)

**Interfaces:**
- Consumes: nothing.
- Produces: `stock_adjustments.unit_cost DECIMAL(10, 2) DEFAULT NULL`, read by Tasks 4, 5 and 7.

- [ ] **Step 1: Write the migration**

Follow the shape of `scripts/migrations/124_add_selling_unit_to_stock_adjustments.ts`: a local `columnExists(table, column)` helper querying `INFORMATION_SCHEMA.COLUMNS`, an early-return skip in both `up()` and `down()`, and the `registerMigration(migration)` call at the end.

- `name: '145_add_unit_cost_to_stock_adjustments'`, `timestamp: '2026-11-05_09-00-00'`
- `up()`: `ALTER TABLE stock_adjustments ADD COLUMN unit_cost DECIMAL(10, 2) DEFAULT NULL`
- `down()`: `ALTER TABLE stock_adjustments DROP COLUMN unit_cost`

Nullable because every historical row predates it and REMOVE/TRANSFER rows have no meaningful single cost. No foreign key, no index — this is a value column read alongside rows already selected by `product_id` or `reference_no`.

- [ ] **Step 2: Register it**

Add `import './145_add_unit_cost_to_stock_adjustments';` to `scripts/migrations/index.ts`, after the `144` import.

- [ ] **Step 3: Run the migration and verify the column**

Run: `npm run migrate`
Expected: the `✅ unit_cost added to stock_adjustments` line, no error.

Verify the type is exactly `decimal(10,2)` and nullable:
```sql
SELECT COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_adjustments' AND COLUMN_NAME = 'unit_cost';
```

- [ ] **Step 4: Verify the rollback, then re-apply**

Run: `npm run migrate:down` — confirm the column is gone. Then `npm run migrate` again.

- [ ] **Step 5: Reset the test database so the e2e suite has the column**

Run: `npm run test:e2e:db`

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/145_add_unit_cost_to_stock_adjustments.ts scripts/migrations/index.ts
git commit -m "feat(db): add unit_cost to stock_adjustments"
```

---

### Task 3: The `edit_product_cost` permission

**Files:**
- Modify: `app/(app)/user-management/permissions.ts` (add to `ALL_PERMISSIONS`)
- Create: `lib/cost-permission.ts`
- Modify: `app/api/inventory/adjust/bulk/route.ts` (call the assert after the branch guard)
- Modify: `tests/e2e/setup/` seed — grant the permission to the seeded admin
- Test: `tests/e2e/bulk-adjustment-cost-permission.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `assertCanEditProductCost(uid: string): Promise<void>` from `lib/cost-permission.ts` — resolves when the user holds `edit_product_cost`, throws otherwise. Tasks 4 and 5 call it. Also the permission id string `'edit_product_cost'`, used client-side in Task 6.

- [ ] **Step 1: Write the failing test**

In `tests/e2e/bulk-adjustment-cost-permission.spec.ts`, two tests posting directly to `/api/inventory/adjust/bulk` (API-level, following `tests/e2e/branch-isolation-api.spec.ts`):

- `a caller without edit_product_cost is refused when sending a cost` — posts an ADD batch with `unitCost` as a user lacking the grant; expects a 403, and asserts via `testQuery` that `products.cost` is **unchanged** and **no** `stock_adjustments` row was written. Refusing must not post the stock. (Review Focus 2)
- `a caller with edit_product_cost is accepted` — the same post as the seeded admin succeeds.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx playwright test tests/e2e/bulk-adjustment-cost-permission.spec.ts`
Expected: FAIL — no permission check exists, so the unprivileged post succeeds.

- [ ] **Step 3: Add the permission id**

In `app/(app)/user-management/permissions.ts`, add `{ id: 'edit_product_cost', label: 'Edit Product Cost' }` to `ALL_PERMISSIONS`. No migration: permissions are per-user rows and this list feeds only the user-management UI grids.

- [ ] **Step 4: Implement `assertCanEditProductCost(uid: string): Promise<void>` in `lib/cost-permission.ts`**

An `EXISTS` query against `user_permissions` for `edit_product_cost`, mirroring the shape of `assertHeadOffice` in `lib/branch-context.ts`. Strict: no `userType` shortcut, no `super_admin` bypass — `super_admin` is a dev-only localStorage artifact and is not a row in that table.

Runtime-check `uid` is a non-empty string before it reaches the query and throw if not, per the Global Constraints hazard.

Throw a typed error the route can map to 403; follow how `branchErrorResponse` maps `BranchResolutionError` in `lib/branch-context.ts` so the route's existing error handling style is preserved.

- [ ] **Step 5: Call it from the route**

In `app/api/inventory/adjust/bulk/route.ts`, after the existing branch-guard `try/catch` and before the `adjustments` array validation: if any adjustment carries a cost, `await assertCanEditProductCost(uid)` and return 403 on throw. Do not move or alter the branch guard.

- [ ] **Step 6: Grant the permission to the seeded test admin**

In the e2e seed under `tests/e2e/setup/`, insert the `edit_product_cost` row for the seeded admin user. Without it the whole feature's e2e coverage would exercise only the refusal path. Then run `npm run test:e2e:db`.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npx playwright test tests/e2e/bulk-adjustment-cost-permission.spec.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/user-management/permissions.ts lib/cost-permission.ts app/api/inventory/adjust/bulk/route.ts tests/e2e/setup tests/e2e/bulk-adjustment-cost-permission.spec.ts
git commit -m "feat(permissions): add edit_product_cost and gate the bulk adjust route"
```

---

### Task 4: Cost capture in the bulk route

The core write. Validates, updates `products.cost`, syncs the base selling unit, stores `unit_cost`, and assigns the batch reference.

**Files:**
- Create: `lib/adjustment-cost.ts`
- Modify: `app/api/inventory/adjust/bulk/route.ts`
- Test: `tests/unit/adjustment-cost.test.ts`, registered in `tests/unit/run.ts`
- Test: `tests/e2e/bulk-adjustment-cost.spec.ts`

**Interfaces:**
- Consumes: `assertCanEditProductCost` (Task 3); `stock_adjustments.unit_cost` (Task 2); the connection-aware batch read (Task 1).
- Produces: `parseUnitCost(raw: unknown): number | null` from `lib/adjustment-cost.ts` — returns `null` for absent/blank, a finite number ≥ 0 rounded to 2dp for valid input, and **throws** for malformed input. Task 5 calls it too. The route's JSON response gains `referenceNo: string` and each entry of `results` gains `barcode: string | null`, `quantity: number` (signed) and `unitCost: number | null`; Task 7 renders those.

- [ ] **Step 1: Write the failing unit test for `parseUnitCost`**

In `tests/unit/adjustment-cost.test.ts`, following the `node:assert/strict` self-executing style of `tests/unit/shelf-quantities.test.ts`:

```ts
assert.equal(parseUnitCost(undefined), null, 'absent means leave cost alone');
assert.equal(parseUnitCost(''), null, 'blank means leave cost alone');
assert.equal(parseUnitCost(null), null, 'null means leave cost alone');
assert.equal(parseUnitCost(0), 0, 'zero is a valid cost, not absence');
assert.equal(parseUnitCost('62.50'), 62.50, 'numeric string parses');
assert.equal(parseUnitCost(62.505), 62.51, 'rounds to 2dp, matching DECIMAL(10,2)');
assert.throws(() => parseUnitCost(-1), 'negative is refused');
assert.throws(() => parseUnitCost('abc'), 'non-numeric is refused');
assert.throws(() => parseUnitCost(NaN), 'NaN is refused');
assert.throws(() => parseUnitCost(Infinity), 'Infinity is refused');
assert.throws(() => parseUnitCost({ supplier_id: 0 }), 'an object is refused');
```

The object case is Review Focus 4: `pool.query` escapes an object as `` `key` = value ``, so an object must never reach a query.

Add `'adjustment-cost.test'` to `TEST_FILES` in `tests/unit/run.ts`.

- [ ] **Step 2: Run the unit test and confirm it fails**

Run: `npm run test:unit`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parseUnitCost(raw: unknown): number | null` in `lib/adjustment-cost.ts`**

Reject before coercing: an object, an array, a boolean and a non-numeric string all throw rather than becoming `0` or `NaN`. Round to 2dp.

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 5: Write the failing e2e tests**

In `tests/e2e/bulk-adjustment-cost.spec.ts`, posting to `/api/inventory/adjust/bulk` and asserting through `testQuery`:

- `a typed cost updates products.cost and prices the new batch` — asserts `products.cost`, `inventory_batches.unit_cost` (located by `notes`, per Task 1's note) and `stock_adjustments.unit_cost` all carry the typed value.
- `a blank cost leaves products.cost unchanged` — a two-row batch where only one row carries a cost; asserts the other product's `cost` is untouched and its `stock_adjustments.unit_cost` is the product's existing cost, while its stock still moved. (Review Focus 1)
- `a cost on a REMOVE batch is refused` — posts `adjustmentType: 'remove'` with a cost; asserts 4xx and that `products.cost` is unchanged. Repeat for `'transfer'`. (Review Focus 3)
- `a malformed cost refuses the whole batch` — posts `unitCost: 'abc'`; asserts 4xx and that **no** `stock_adjustments` row was written for any item in the batch, proving the all-or-nothing boundary held. (Review Focus 4)
- `the response carries a reference number used by every row` — asserts `referenceNo` is present in the JSON and that every `stock_adjustments` row from the batch shares it.
- `a user-supplied reference is used as-is` — posts `referenceNo: 'ADJ-MANUAL-1'`; asserts the rows carry exactly that and the counter was not consumed.

- [ ] **Step 6: Run the e2e tests and confirm they fail**

Run: `npx playwright test tests/e2e/bulk-adjustment-cost.spec.ts`
Expected: FAIL — the route ignores `unitCost`.

- [ ] **Step 7: Implement cost capture in the route**

In `app/api/inventory/adjust/bulk/route.ts`:

- Read `unitCost` per adjustment through `parseUnitCost`; a throw refuses the whole request with 4xx **before** `withTransaction` opens, so nothing is written. This matches the all-or-nothing batch-writer rule in CLAUDE.md.
- Refuse a cost when `adjustmentType` is not `'add'`.
- Resolve the batch reference once, before the loop: the user's `referenceNo` if non-blank, else `await getNextReference('stock_adjustment', connection)` formatted as `ADJ-<n>`. Pass it as `reference_no` on every row.
- Inside the per-item loop, when a cost was supplied and the mode is ADD, **before** the stock change: `UPDATE products SET cost = ? WHERE id = ?` on the transaction `connection`, then `await syncBaseSellingUnit(connection, productId, { cost })` from `lib/selling-unit-sync.ts`. Ordering is load-bearing — the batch created by the stock change reads `products.cost` through the same connection (Task 1).
- Write `unit_cost` on the `stock_adjustments` INSERT for every ADD row: the typed cost where given, otherwise the product's existing cost, so the row records what the batch was actually posted at.
- Extend each `results` entry with `barcode`, the signed `quantity` and `unitCost`, and add `referenceNo` to the response body.

- [ ] **Step 8: Run the e2e tests and confirm they pass**

Run: `npx playwright test tests/e2e/bulk-adjustment-cost.spec.ts`
Expected: PASS

- [ ] **Step 9: Confirm the branch guard still holds**

Run: `npx playwright test tests/e2e/branch-isolation-api.spec.ts tests/e2e/branch-write-isolation.spec.ts`
Expected: PASS — the guard must be untouched.

- [ ] **Step 10: Commit**

```bash
git add lib/adjustment-cost.ts app/api/inventory/adjust/bulk/route.ts tests/unit/adjustment-cost.test.ts tests/unit/run.ts tests/e2e/bulk-adjustment-cost.spec.ts
git commit -m "feat(inventory): capture per-product cost on bulk stock adjustments"
```

---

### Task 5: The cost travels through approval

When `STOCK_ADJUSTMENT` approval is on, the route queues the item and writes nothing. The cost must survive to finalization.

**Files:**
- Modify: `app/api/inventory/adjust/bulk/route.ts` (add cost + reference to `approvalData`)
- Modify: `lib/stock-adjust.ts` (`adjustStockWithScope` signature and its `stock_adjustments` INSERT)
- Modify: `app/api/approvals/process/route.ts:168` (pass the cost; re-check the permission)
- Test: `tests/e2e/bulk-adjustment-cost-approval.spec.ts`

**Interfaces:**
- Consumes: `parseUnitCost` and `assertCanEditProductCost`.
- Produces: `adjustStockWithScope(productId, quantity, reason, userId, isInternalFinalization, expirationDate, scope, options?)` — the cost and reference arrive in a new **optional** trailing `options?: { unitCost?: number | null; referenceNo?: string | null }` object. A trailing optional object, not two positional parameters: the function already takes seven positional arguments and the single-product caller passes nothing new.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/bulk-adjustment-cost-approval.spec.ts`, with `STOCK_ADJUSTMENT` approval enabled for the duration (restore it afterwards):

- `a queued item carries its cost to finalization` — post an ADD batch with a cost, assert no `products.cost` change and no `stock_adjustments` row yet, then approve via `/api/approvals/process` and assert `products.cost`, the base selling unit's cost, `stock_adjustments.unit_cost` and `inventory_batches.unit_cost` all carry the typed value, and the row carries the reference.
- `finalization checks the creator's permission, not the approver's` — a creator holding the grant, an approver without it: finalization succeeds.
- `finalization refuses when the creator lacks the grant` — asserts the item stays **Pending** and no stock moved. Refusing, not finalizing without the cost.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx playwright test tests/e2e/bulk-adjustment-cost-approval.spec.ts`
Expected: FAIL — the cost is dropped at queue time.

- [ ] **Step 3: Put the cost and reference in the approval payload**

In the bulk route's `isApprovalRequiredForItem` branch, add `unitCost` and `referenceNo` to `approvalData`, alongside the existing `expirationDate`, `referenceNo` and `supplierId` metadata.

- [ ] **Step 4: Extend `adjustStockWithScope`**

Add the trailing `options?` parameter. Extend its `stock_adjustments` INSERT from `(id, product_id, quantity, reason, new_stock)` to also write `unit_cost` and `reference_no` when supplied — so a queued-then-approved item is not invisible to a future reprint screen. When a cost is supplied, `UPDATE products SET cost` and call `syncBaseSellingUnit` before the stock change, exactly as Task 4 does in the route.

**Connection hazard:** this function uses `query()` (the pool) for the INSERT and opens its own `withTransaction` for the family sync. The cost update must be visible to the batch created inside that transaction — place the cost write on the same connection as the family sync, not on the pool ahead of it. Task 1 fixed the read side; this is the write side of the same hazard.

The single-product adjustment path passes no `options`, so it gains no cost behaviour — the spec's non-goal holds.

- [ ] **Step 5: Pass the cost and re-check the permission at finalization**

In `app/api/approvals/process/route.ts` at the `STOCK_ADJUSTMENT` branch (~line 168): re-parse the stored value with `parseUnitCost(txData.unitCost)` rather than trusting it — `approval_queue` payloads are stored JSON and arrive back off the wire exactly like a request body, so the same validation applies. When it is non-null, `await assertCanEditProductCost(item.created_by)` — the **creator**, consistent with `scopeForQueuedItem(item.created_by)` on the line above. On throw from either call, set `result = { success: false, error: ... }` so the item stays Pending, matching the branch-refusal precedent in that same route. Then pass `{ unitCost, referenceNo }` as `options`.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx playwright test tests/e2e/bulk-adjustment-cost-approval.spec.ts`
Expected: PASS

- [ ] **Step 7: Confirm the single-product adjustment path is unchanged**

Run: `npx playwright test tests/e2e/adjustment-expiration.spec.ts tests/e2e/add-product-approval.spec.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/api/inventory/adjust/bulk/route.ts lib/stock-adjust.ts app/api/approvals/process/route.ts tests/e2e/bulk-adjustment-cost-approval.spec.ts
git commit -m "feat(approvals): carry adjustment cost through to finalization"
```

---

### Task 6: The cost column in the UI

**Files:**
- Modify: `app/(app)/inventory/bulk-adjustment/constants.ts` (`AdjustmentItem`)
- Modify: `app/(app)/inventory/bulk-adjustment/use-bulk-adjustment.ts`
- Modify: `app/(app)/inventory/bulk-adjustment/adjustment-table-row.tsx`
- Modify: `app/(app)/inventory/bulk-adjustment/adjustment-mobile-card.tsx`
- Modify: `app/(app)/inventory/bulk-adjustment/BulkAdjustmentClient.tsx` (column header)
- Test: `tests/e2e/bulk-adjustment-cost-ui.spec.ts`

**Interfaces:**
- Consumes: the `'edit_product_cost'` id (Task 3); the route's `unitCost` field (Task 4).
- Produces: `AdjustmentItem` gains `unitCost?: string` — a **string**, because it is the raw input value and an empty string must stay distinguishable from `0`. The controller returns `canEditCost: boolean`.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/bulk-adjustment-cost-ui.spec.ts`, driving the page:

- `the cost column appears in ADD mode for a permitted user`
- `the cost column is absent in REMOVE and TRANSFER mode`
- `switching away from ADD discards typed costs` — type a cost, switch to REMOVE, switch back; the field is empty. A hidden-but-retained cost would be submitted invisibly.
- `the cost field is absent for a user without edit_product_cost`
- `the current cost is shown as read-only context next to the input`

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx playwright test tests/e2e/bulk-adjustment-cost-ui.spec.ts`
Expected: FAIL — no cost field exists.

- [ ] **Step 3: Add `unitCost?: string` to `AdjustmentItem`**

In `constants.ts`, alongside the existing `expirationDate?`.

- [ ] **Step 4: Render the column**

In `adjustment-table-row.tsx` and `adjustment-mobile-card.tsx`, a numeric input bound to `adj.unitCost`, **empty by default** — never prefilled with the product's cost, because a prefilled field makes "unchanged" indistinguishable from "confirmed unchanged". Show `adj.product.cost` beside it as read-only context. `step="0.01"`, `min="0"`.

Gate rendering on a `showCostColumn` prop, computed in the controller as `adjustmentType === 'add' && canEditCost`, mirroring how `showExpirationColumn` already gates the expiry column. Add the matching header cell in `BulkAdjustmentClient.tsx`.

- [ ] **Step 5: Wire the controller**

In `use-bulk-adjustment.ts`: derive `canEditCost` from `hasPermission('edit_product_cost')` (`app/(app)/use-app-layout.ts`); extend `changeAdjustmentType` to clear `unitCost` on every item when the new type is not `'add'`; include `unitCost` in the submit payload only when non-blank and the mode is ADD.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx playwright test tests/e2e/bulk-adjustment-cost-ui.spec.ts`
Expected: PASS

- [ ] **Step 7: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/inventory/bulk-adjustment tests/e2e/bulk-adjustment-cost-ui.spec.ts
git commit -m "feat(inventory): per-product cost field in bulk stock adjustment"
```

---

### Task 7: The printable report

**Files:**
- Create: `app/(app)/inventory/bulk-adjustment/print-layout.tsx`
- Modify: `app/(app)/inventory/bulk-adjustment/BulkAdjustmentClient.tsx`
- Modify: `app/(app)/inventory/bulk-adjustment/use-bulk-adjustment.ts`
- Modify: `app/api/inventory/adjust/bulk/route.ts` (return the branch `business_name`)
- Test: `tests/e2e/bulk-adjustment-print.spec.ts`

**Interfaces:**
- Consumes: the route's `results` entries (`productName`, `barcode`, `quantity`, `unitCost`, `newStock`), `referenceNo`, and `queuedItems` (Task 4).
- Produces: `PostedBatch` — the posted-batch shape the controller holds and the layout renders. Export it from `print-layout.tsx`.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/bulk-adjustment-print.spec.ts`:

- `a posted batch renders the print layout with its rows and totals` — asserts the reference number, each product's quantity, unit cost and line total, and the batch totals. Assert the printable block's content directly; it is `hidden print:block`, so use a content/attribute assertion rather than `toBeVisible()`.
- `the signature block is present` — Prepared by / Received by / Checked by.
- `a batch where everything was queued offers no print` — asserts the print control is absent and the pending-approval message is shown. (Review Focus 5)
- `queued items do not appear on the paper` — in a mixed response, only `results` rows render.
- `the header names the issuing branch` — the branch `business_name`, not the company name.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx playwright test tests/e2e/bulk-adjustment-print.spec.ts`
Expected: FAIL — no print layout exists.

- [ ] **Step 3: Return the branch business name from the route**

Resolve the issuing branch's `business_name` server-side from the already-resolved branch scope and include it in the response. Do not widen any client's access to `GET /api/branches`, which CLAUDE.md flags as unauthenticated and carrying the BIR identity fields — take only the name.

- [ ] **Step 4: Build the print layout**

`print-layout.tsx`, modelled on `app/(app)/inventory/stock-counts/[id]/print-layout.tsx`: `hidden print:block printable-area p-8 bg-white text-black`, plain black-on-white. No PDF library, no print route.

- Header: "STOCK ADJUSTMENT REPORT", the branch `business_name`, reference number, date/time, warehouse, mode, supplier when chosen, and who posted it.
- Table: product name, barcode, signed quantity, unit cost, total cost (quantity × unit cost), stock after.
- Footer: total quantity and total cost, then the three-way signature block.

Use `formatCurrency` from `@/lib/utils`, as the stock-count layout does. The mockup at `.superpowers/brainstorm/845-1793793333/content/printout.html` is the approved reference.

- [ ] **Step 5: Offer the print after a successful post**

In `use-bulk-adjustment.ts`, hold the posted batch in state on success instead of redirecting immediately, and render the print control only when `results.length > 0`. The current flow calls `router.push('/inventory')` on success — the redirect must not race the print. Keep the existing pending-approval toast for the queued-only case and do not offer the print there.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx playwright test tests/e2e/bulk-adjustment-print.spec.ts`
Expected: PASS

- [ ] **Step 7: Run the full suites**

Run: `npm run test:unit && npm run test:e2e && npm run typecheck && npm run lint`
Expected: all PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/inventory/bulk-adjustment app/api/inventory/adjust/bulk/route.ts tests/e2e/bulk-adjustment-print.spec.ts
git commit -m "feat(inventory): printable stock adjustment report"
```
