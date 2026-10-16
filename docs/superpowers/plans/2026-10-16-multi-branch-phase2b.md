# Multi-Branch Phase 2b — Write-Path Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a request reaching another branch's stock, invoices, orders or Z-readings, by rejecting cross-branch write targets on the 12 routes that matter.

**Architecture:** Writes already name their target, so the server asserts ownership and returns 403 rather than re-scoping queries. Every primitive already exists and already runs in production at the read routes: `resolveScopeFromRequest`, `assertWarehouseInBranch`, `assertTerminalInBranch`, `branchErrorResponse`, and `appendSessionUid` for clients. Six routes with no branch-deriving input start requiring `uid`.

**Tech Stack:** Next.js 16 App Router, raw `mysql2/promise` via `lib/mysql.ts`, Playwright E2E on port 3100 against `alon_pos_test`, `tsx tests/unit/run.ts` for unit tests.

**Spec:** [docs/superpowers/specs/2026-10-16-multi-branch-phase2b-write-isolation-design.md](../specs/2026-10-16-multi-branch-phase2b-write-isolation-design.md)

**Builds on:** [Phase 2a spec](../specs/2026-10-14-multi-branch-phase2a-numbering-design.md) and [Phase 1 outcome](2026-10-12-multi-branch-phase1-outcome.md) — read the latter's "Load-bearing contracts" before starting.

## Scope

Phase 2b of five. This plan closes the write hole. **Not in scope:** the 9
master-data routes (Phase 1's D8 keeps suppliers, customers, categories and
lookups company-wide — isolating them would be wrong), ~6 admin/dev utility
write routes, `approvals/queue` and `reports/soa` (documented exemptions), the
scheduler lease (Phase 3), transfers and approvals (Phase 4), and reports/UI
(Phase 5).

## Global Constraints

- **MySQL only, raw SQL** via `query()` / `withTransaction()` from `lib/mysql.ts`. No ORM.
- **E2E tests run with `workers: 1`.** Never add parallelism.
- **Test descriptions are written in Cebuano**, matching existing specs. Code, identifiers and why-comments stay English.
- `npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"` must return **nothing**. It is currently clean; keep it that way. (It also prints harmless parse noise from the gitignored stale `.next-test/dev/types/validator.ts`.)
- **`npm run lint` is broken repo-wide** (`next lint` removed in Next 16) and is **waived**.
- `npm run test:unit` (`tsx tests/unit/run.ts`, **63 files**) must stay green. Run it in every task.
- **Do NOT touch `transaction_references` or `branch_number_series`.** This phase adds no migration and issues no invoice numbers.
- **Do NOT add a `Co-Authored-By: Claude` trailer.** Author as JhazonE.
- **A script importing `lib/mysql` never exits on its own** — the connection pool holds the event loop. `npm run migrate` and `tsx` one-liners may return exit 124 **on success**; judge by database state. Keep `process.exit(0)` in one-liners and use one query per invocation piped through `tail -2`.
- **Never run `DB_NAME=alon_pos_test npm run migrate`** — the test DB's `migrations` table is empty, so the runner replays history and dies at 023. Use `npm run test:e2e:db` to re-clone.
- **Before any Playwright run, check memory:** `powershell -c "(Get-Process node -ErrorAction SilentlyContinue).Count"` and free GB. Lingering `next dev` servers starve the machine and cause `ECONNREFUSED` cascades that look like real failures. Playwright's `webServer` panicked all through Phase 2a (Turbopack on `app/globals.css`, `exit code: 0xc0000142`) but worked once memory was freed; if it panics, start `next dev -p 3100` manually, run through a throwaway config with no `webServer`, then delete it and kill the server.

## Review Focus

Five conditions the spec implies that no obvious task would exercise. Each has
its test pinned to the task that owns the code.

1. **A same-branch write must still succeed.** An over-eager assertion that
   blocks normal operation is worse than the hole it closes — every task
   asserts this alongside its 403 case. → every task.
2. **Head office must write to any branch.** `assertWarehouseInBranch` and
   `assertTerminalInBranch` return early for `scope: 'all'`, but a route that
   resolves the scope wrongly would still block it. → Tasks 2, 3, 6.
3. **A transfer must assert BOTH warehouses.** `inventory/adjust/bulk` carries
   `warehouseId` **and** `targetWarehouseId`; asserting only the source lets a
   caller move stock *into* another branch. → Task 2.
4. **A client that loses its uid must fail visibly, not silently.** Phase 2a's
   reviewer noted a server-contract test still passes when a client drops its
   `appendSessionUid` call. → Task 7, with a page-level test.
5. **A void/deliver of another branch's document must be refused even when the
   document id is valid.** Existence is not authorisation — the same mistake
   `assertWarehouseInBranch` was written to prevent. → Tasks 4, 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/branch-context.ts` | Gains `resolveScopeFromBody` — the body-oriented sibling of `resolveScopeFromRequest` |
| `app/api/sales/z-reading/route.ts` | Assert the terminal belongs to the caller's branch |
| `app/api/inventory/adjust/bulk/route.ts` | Assert source **and** target warehouse |
| `app/api/sales/orders/route.ts` | Assert `warehouse` (note: not `warehouseId`) |
| `app/api/pos/void-transaction/route.ts` | Derive from `voidedByUserId`, prefer the sale's own branch |
| `app/api/products/[id]/route.ts`, `app/api/stock-adjustments/route.ts` | Require `uid`; assert the product's warehouse |
| `app/api/sales/invoices/route.ts`, `app/api/sales/invoices/[id]/void/route.ts` | Require `uid`; assert the invoice's branch |
| `app/api/sales/orders/[id]/route.ts`, `app/api/sales/orders/[id]/deliver/route.ts` | Require `uid`; assert the order's branch |
| `app/api/sales/route.ts` + `src/core/sales/application/CreateSaleUseCase.ts` | Thread the branch through the use case |
| `app/api/data-management/import/products/route.ts` | Scope the default-warehouse lookup to the importer's branch |
| `app/api/pos-transactions/route.ts` | Prefer the referenced sale's branch over the terminal's |
| 7 client files under `app/(app)/` | Send the uid via `appendSessionUid` / `getSessionUid` |
| `tests/e2e/branch-write-isolation.spec.ts` | All the 403 / same-branch / head-office cases |
| `tests/e2e/helpers/branches.ts` | Any seeding helper a task needs |

---

### Task 1: Add `resolveScopeFromBody`

Writes POST a JSON body, so the uid arrives in the body rather than the query
string. `resolveScopeFromRequest(params, bodyUid)` already supports that, but
every write route would have to construct an empty `URLSearchParams` to use
it. One small helper removes that wart from 13 call sites.

**Files:**
- Modify: `lib/branch-context.ts`
- Modify: `tests/e2e/branch-context.spec.ts`

**Interfaces:**
- Consumes: `resolveUserBranch(uid, viewBranchId?)`, `BranchScope`, `BranchResolutionError` — all already exported.
- Produces: `async function resolveScopeFromBody(body: { uid?: string; viewBranchId?: string | null }): Promise<BranchScope>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/branch-context.spec.ts`:

```typescript
import { resolveScopeFromBody } from '../../lib/branch-context';

test.describe('resolveScopeFromBody', () => {
  test('mo-resolve sa branch sa user gikan sa body', async () => {
    const a = await seedSecondBranch();
    try {
      const scope = await resolveScopeFromBody({ uid: a.userUid });
      expect(scope).toEqual({ branchId: a.branchId, scope: 'single' });
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('mo-fail closed kung walay uid sa body', async () => {
    await expect(resolveScopeFromBody({})).rejects.toThrow(/no uid supplied/i);
  });

  test('gi-reject ang viewBranchId kung walay all_branches', async () => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      await expect(
        resolveScopeFromBody({ uid: a.userUid, viewBranchId: b.branchId })
      ).rejects.toThrow(/not permitted to view other branches/i);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `timeout 540 npx playwright test tests/e2e/branch-context.spec.ts -g "resolveScopeFromBody" --reporter=line`
Expected: FAIL — `resolveScopeFromBody` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/branch-context.ts`:

```typescript
/**
 * Resolve a write request's scope from its JSON body.
 *
 * The body-oriented sibling of resolveScopeFromRequest: writes POST JSON, so
 * the uid arrives in the body rather than the query string. Same guarantees —
 * the branch is re-read from users.branch_id by uid and never taken from a
 * branch the caller claims, and a viewBranchId without the all_branches
 * permission is refused rather than silently downgraded.
 */
export async function resolveScopeFromBody(
  body: { uid?: string; viewBranchId?: string | null }
): Promise<BranchScope> {
  return resolveUserBranch(body?.uid || '', body?.viewBranchId ?? null);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branch-context.spec.ts --reporter=line`
Expected: PASS — the file's existing tests plus the 3 new ones.
Record the exact total in your report.

- [ ] **Step 5: Typecheck, unit tests, commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
timeout 400 npm run test:unit
git add lib/branch-context.ts tests/e2e/branch-context.spec.ts
git commit -m "feat(branches): add resolveScopeFromBody for write routes"
```

---

### Task 2: Isolate the stock-adjustment and order writes (warehouse-derived)

These two already carry a warehouse in their POST body, so they need an
assertion only. `inventory/adjust/bulk` is one of the three routes that
actually write `products.stock`, which makes it the highest-value route in the
phase.

**Files:**
- Modify: `app/api/inventory/adjust/bulk/route.ts`
- Modify: `app/api/sales/orders/route.ts`
- Create: `tests/e2e/branch-write-isolation.spec.ts`

**Interfaces:**
- Consumes: `resolveScopeFromBody` (Task 1), `assertWarehouseInBranch`, `branchErrorResponse`.
- Produces: no new exports. Establishes the assertion pattern the later route tasks copy.

- [ ] **Step 1: Confirm each route's real input before editing**

Run:
```bash
grep -n "export async function POST" app/api/inventory/adjust/bulk/route.ts app/api/sales/orders/route.ts
```
Then read each POST handler's own destructure. Expected (verified 2026-10-16):
`adjust/bulk` destructures `adjustments, notes, userId, warehouseId,
targetWarehouseId, referenceNo, supplierId, adjustmentType`;
`sales/orders` destructures a field named **`warehouse`**, not `warehouseId`.
**If either differs, stop and report it** — this table has been wrong twice.

- [ ] **Step 2: Write the failing tests**

Create `tests/e2e/branch-write-isolation.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  grantPermission,
  setUserBranch,
} from './helpers/branches';
import { ALL_BRANCHES_PERMISSION } from '../../lib/branch-context';

/**
 * Ang write kay gi-REJECT, dili gi-filter: ang caller mismo nag-ingon unsa
 * ang target, mao nga ang server mo-403 kung sakop sa laing branch.
 */
test.describe('POST /api/inventory/adjust/bulk — branch isolation', () => {
  test('gi-403 ang adjustment sa warehouse sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(b.warehouseId, `WI-${Date.now()}`);
      const res = await request.post('/api/inventory/adjust/bulk', {
        data: {
          uid: a.userUid,
          userId: a.userUid,
          warehouseId: b.warehouseId,
          adjustmentType: 'add',
          adjustments: [{ productId, quantity: 1, reason: 'test' }],
        },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang transfer nga ang TARGET warehouse sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-T-${Date.now()}`);
      const res = await request.post('/api/inventory/adjust/bulk', {
        data: {
          uid: a.userUid,
          userId: a.userUid,
          warehouseId: a.warehouseId,        // kaugalingon — OK
          targetWarehouseId: b.warehouseId,  // laing branch — dili OK
          adjustmentType: 'transfer',
          adjustments: [{ productId, quantity: 1, reason: 'test' }],
        },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang adjustment sa kaugalingong warehouse', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-OK-${Date.now()}`);
      const res = await request.post('/api/inventory/adjust/bulk', {
        data: {
          uid: a.userUid,
          userId: a.userUid,
          warehouseId: a.warehouseId,
          adjustmentType: 'add',
          adjustments: [{ productId, quantity: 1, reason: 'test' }],
        },
      });
      // Ang importante: DILI 403. Ang 400/500 gikan sa laing validation kay
      // lain nga isyu — pero kinahanglan dili ma-block sa branch check.
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office makasulod sa bisan unsang warehouse', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      await grantPermission(a.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(a.userUid, null);
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-HO-${Date.now()}`);
      const res = await request.post('/api/inventory/adjust/bulk', {
        data: {
          uid: a.userUid,
          userId: a.userUid,
          warehouseId: a.warehouseId,
          adjustmentType: 'add',
          adjustments: [{ productId, quantity: 1, reason: 'test' }],
        },
      });
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts --reporter=line`
Expected: the two 403 tests FAIL (the route currently returns something else —
record what). The same-branch and head-office tests may already pass; that is
fine, they are regression guards.

- [ ] **Step 4: Add the assertion to `inventory/adjust/bulk`**

Add the import:

```typescript
import {
  resolveScopeFromBody,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '@/lib/branch-context';
```

Immediately after the body destructure and before the `adjustments` validation,
insert:

```typescript
    // Branch isolation. A write names its own target, so the server refuses a
    // cross-branch one rather than filtering. BOTH warehouses are asserted:
    // checking only the source would still let a caller move stock INTO
    // another branch. The scope comes from users.branch_id via uid, never
    // from a branch the caller claims.
    try {
      const scope = await resolveScopeFromBody(body);
      if (warehouseId) await assertWarehouseInBranch(warehouseId, scope);
      if (targetWarehouseId) await assertWarehouseInBranch(targetWarehouseId, scope);
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }
```

- [ ] **Step 5: Add the assertion to `sales/orders` POST**

Same import. After that handler's destructure, insert the same block but
asserting the `warehouse` field — note the name:

```typescript
    // Branch isolation. NOTE: this route's field is `warehouse`, not
    // `warehouseId`. See the spec's group table: an earlier draft had this
    // wrong twice.
    try {
      const scope = await resolveScopeFromBody(body);
      if (warehouse) await assertWarehouseInBranch(warehouse, scope);
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }
```

If `warehouse` turns out to be an object rather than an id string, assert
`warehouse.id` and say so in your report.

- [ ] **Step 6: Run tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts --reporter=line`
Expected: PASS, 4 tests.

- [ ] **Step 7: Typecheck, unit tests, commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
timeout 400 npm run test:unit
git add app/api/inventory/adjust/bulk/route.ts app/api/sales/orders/route.ts tests/e2e/branch-write-isolation.spec.ts
git commit -m "feat(branches): reject cross-branch stock adjustments and order writes"
```

---

### Task 3: Isolate the Z-reading write (terminal-derived)

The highest-stakes route in the phase: a Z-reading is a BIR filing. It is also
the lightest change, because the route already threads `terminalId` through 33
references and already rejects `terminalId === 'all'`.

**Files:**
- Modify: `app/api/sales/z-reading/route.ts`
- Modify: `tests/e2e/branch-write-isolation.spec.ts`

**Interfaces:**
- Consumes: `resolveScopeFromBody`, `assertTerminalInBranch`, `branchErrorResponse`.
- Produces: no new exports.

- [ ] **Step 1: Read the POST handler's existing terminal validation**

Run: `grep -n "export async function POST" app/api/sales/z-reading/route.ts`
then read ~20 lines from there. Confirm it destructures `terminalId` from the
body and already rejects `'all'`. **Do not duplicate that validation** — add
only the branch assertion after it.

- [ ] **Step 2: Write the failing test**

Append to `tests/e2e/branch-write-isolation.spec.ts`:

```typescript
test.describe('POST /api/sales/z-reading — branch isolation', () => {
  test('gi-403 ang Z-reading sa terminal sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const res = await request.post('/api/sales/z-reading', {
        data: { uid: a.userUid, terminalId: b.terminalId, cashierName: 'Test' },
      });
      // Ang Z-reading kay BIR filing — dili pwede mo-file para sa laing
      // establishment.
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-403 ang Z-reading sa kaugalingong terminal', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const res = await request.post('/api/sales/z-reading', {
        data: { uid: a.userUid, terminalId: a.terminalId, cashierName: 'Test' },
      });
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts -g "Z-reading" --reporter=line`
Expected: the 403 test FAILS. Record what status it returns instead.

- [ ] **Step 4: Add the assertion**

Add the import, then insert immediately **after** the existing
`if (!terminalId || terminalId === 'all')` rejection:

```typescript
        // Branch isolation. A Z-reading is a per-establishment BIR filing, so
        // a terminal in another branch must be refused outright. The existing
        // 'all' rejection above is a separate concern and stays as it is.
        try {
          const scope = await resolveScopeFromBody(body);
          await assertTerminalInBranch(terminalId, scope);
        } catch (error) {
          const mapped = branchErrorResponse(error);
          if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
          throw error;
        }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts --reporter=line`
Expected: PASS, 6 tests.

- [ ] **Step 6: Confirm no BIR figure changed**

Run: `git diff app/api/sales/z-reading/route.ts | grep -E "^[+-]" | grep -v "^[+-][+-]" | grep -iE "SUM|total|vat|discount|si_number|or_number|z_counter"`
Expected: **no output.** This task adds an assertion; it must not touch a
single computed figure or counter in a BIR report.

- [ ] **Step 7: Typecheck, unit tests, commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
timeout 400 npm run test:unit
git add app/api/sales/z-reading/route.ts tests/e2e/branch-write-isolation.spec.ts
git commit -m "feat(branches): refuse a Z-reading for another branch's terminal"
```

---

### Task 4: Isolate the product and stock-adjustment writes (uid-required)

These two have no branch-deriving input today, so they start requiring `uid`
(spec D4) and assert the affected product's warehouse.

**Files:**
- Modify: `app/api/products/[id]/route.ts` (PATCH)
- Modify: `app/api/stock-adjustments/route.ts` (POST)
- Modify: `tests/e2e/branch-write-isolation.spec.ts`

**Interfaces:**
- Consumes: `resolveScopeFromBody`, `assertWarehouseInBranch`, `branchErrorResponse`.
- Produces: no new exports. Both routes now require `uid` in the body.

- [ ] **Step 1: Find each route's product reference**

Run:
```bash
grep -n "export async function PATCH" "app/api/products/[id]/route.ts"
grep -n "export async function POST" app/api/stock-adjustments/route.ts
```
Read each handler. `products/[id]` takes the id from the route params;
`stock-adjustments` takes a product id in its body. Note the exact field names
and report them — do not assume.

- [ ] **Step 2: Write the failing tests**

Append to `tests/e2e/branch-write-isolation.spec.ts`:

```typescript
test.describe('uid-required write routes — branch isolation', () => {
  test('gi-403 ang PATCH sa produkto sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(b.warehouseId, `WI-P-${Date.now()}`);
      const res = await request.patch(`/api/products/${productId}`, {
        data: { uid: a.userUid, price: 99 },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-403 ang PATCH sa kaugalingong produkto', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-P-OK-${Date.now()}`);
      const res = await request.patch(`/api/products/${productId}`, {
        data: { uid: a.userUid, price: 99 },
      });
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang PATCH nga walay uid', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-P-NU-${Date.now()}`);
      const res = await request.patch(`/api/products/${productId}`, {
        data: { price: 99 },
      });
      // Walay uid = walay ma-resolve nga branch. Mo-fail closed.
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts -g "uid-required" --reporter=line`
Expected: the two 403 tests FAIL. Record the actual statuses.

- [ ] **Step 4: Add the assertion to `products/[id]` PATCH**

Add the import, then after the body is parsed:

```typescript
    // Branch isolation. This route had no branch-deriving input, so it now
    // requires `uid` (spec D4) — the same contract the 21 filtered read
    // routes already use. The product's own warehouse is what identifies its
    // branch; a valid id in another branch is still refused, because
    // existence is not authorisation.
    try {
      const scope = await resolveScopeFromBody(body);
      const owning = (await query(
        'SELECT warehouse_id FROM products WHERE id = ?',
        [id]
      )) as any[];
      const owningWarehouseId = owning[0]?.warehouse_id;
      if (owningWarehouseId) {
        await assertWarehouseInBranch(owningWarehouseId, scope);
      }
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }
```

Use the route's own variable for the product id (it comes from the route
params — read the handler's signature). A product with a NULL `warehouse_id`
has no branch to check; it falls through, which matches how Phase 1's read
filtering treats those rows.

- [ ] **Step 5: Add the same assertion to `stock-adjustments` POST**

Same shape, resolving the product id from that route's body field. Report the
field name you used.

- [ ] **Step 6: Run tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts --reporter=line`
Expected: PASS, 9 tests.

- [ ] **Step 7: Typecheck, unit tests, commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
timeout 400 npm run test:unit
git add "app/api/products/[id]/route.ts" app/api/stock-adjustments/route.ts tests/e2e/branch-write-isolation.spec.ts
git commit -m "feat(branches): require a uid and assert ownership on product and adjustment writes"
```

---

### Task 5: Isolate the invoice and order document writes (uid-required)

Four handlers across four routes, all taking a document id and all needing the
same treatment: require `uid`, resolve the document's branch, refuse a
mismatch. Grouped into one task because the change is identical in shape and a
reviewer would judge them together.

**Files:**
- Modify: `app/api/sales/invoices/route.ts` (POST)
- Modify: `app/api/sales/invoices/[id]/void/route.ts` (POST)
- Modify: `app/api/sales/orders/[id]/route.ts` (PUT and DELETE)
- Modify: `app/api/sales/orders/[id]/deliver/route.ts` (POST)
- Modify: `tests/e2e/branch-write-isolation.spec.ts`

**Interfaces:**
- Consumes: `resolveScopeFromBody`, `assertWarehouseInBranch`, `branchErrorResponse`.
- Produces: no new exports. All four routes require `uid`.

- [ ] **Step 1: Determine how each document reaches a branch**

For each route, work out the shortest honest path from the document to a
branch and report it per route. Starting points:
- `sales_transactions` now has `branch_id` directly (Phase 2a migration 138).
- A sales order has a `warehouse_id`.
- An invoice's void acts on a `sales_transactions` row.

Prefer a stored `branch_id` where one exists; fall back to the warehouse.
**Report the path you chose for each of the four.**

- [ ] **Step 2: Write the failing tests**

Append to `tests/e2e/branch-write-isolation.spec.ts`. Use
`seedSaleOnTerminal(...)` from `tests/e2e/helpers/branches.ts` to create a
branch-owned sale, then attempt the void as the other branch's user:

```typescript
test.describe('document writes — branch isolation', () => {
  test('gi-403 ang void sa invoice sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const saleId = await seedSaleOnTerminal(b.terminalId, b.userUid);
      const res = await request.post(`/api/sales/invoices/${saleId}/void`, {
        data: { uid: a.userUid, voidReason: 'test' },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-403 ang void sa kaugalingong invoice', async ({ request }) => {
    const b = await seedSecondBranch();
    try {
      const saleId = await seedSaleOnTerminal(b.terminalId, b.userUid);
      const res = await request.post(`/api/sales/invoices/${saleId}/void`, {
        data: { uid: b.userUid, voidReason: 'test' },
      });
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(b);
    }
  });
});
```

`seedSaleOnTerminal(terminalId, userUid, opts?)` returns the new sale's id and
**derives the branch from the terminal itself** (verified 2026-10-16:
`tests/e2e/helpers/branches.ts:172`) — do not pass a branch id, there is no
such parameter. Add the equivalent pair for the order routes and report the
final test count.

- [ ] **Step 3: Run tests to verify they fail**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts -g "document writes" --reporter=line`
Expected: the 403 tests FAIL.

- [ ] **Step 4: Add the assertion to each of the four handlers**

Pattern, adapted per route to the path you found in Step 1:

```typescript
    // Branch isolation. Requires `uid` (spec D4). A valid document id in
    // another branch is still refused — existence is not authorisation.
    try {
      const scope = await resolveScopeFromBody(body);
      const rows = (await query(
        'SELECT branch_id FROM sales_transactions WHERE id = ?',
        [id]
      )) as any[];
      const docBranchId = rows[0]?.branch_id;
      if (docBranchId && scope.scope === 'single' && docBranchId !== scope.branchId) {
        return NextResponse.json(
          { success: false, error: `Document ${id} does not belong to branch ${scope.branchId}` },
          { status: 403 }
        );
      }
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }
```

For a route whose document reaches a branch through a warehouse, use
`assertWarehouseInBranch` instead of the inline comparison. For `DELETE`,
which may have no body, read the uid from the query string with
`resolveScopeFromRequest(searchParams)` and say so in your report.

- [ ] **Step 5: Run tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts --reporter=line`
Expected: PASS. Record the total.

- [ ] **Step 6: Typecheck, unit tests, commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
timeout 400 npm run test:unit
git add app/api/sales tests/e2e/branch-write-isolation.spec.ts
git commit -m "feat(branches): refuse invoice and order writes across branches"
```

---

### Task 6: The void-transaction, sale use-case, importer and attribution fix

Four routes that each need their own judgment rather than the shared pattern.
Grouped because none is large alone, and each has a distinct shape a reviewer
should see together.

**Files:**
- Modify: `app/api/pos/void-transaction/route.ts`
- Modify: `app/api/sales/route.ts` and `src/core/sales/application/CreateSaleUseCase.ts`
- Modify: `app/api/data-management/import/products/route.ts`
- Modify: `app/api/pos-transactions/route.ts`
- Modify: `tests/e2e/branch-write-isolation.spec.ts`

**Interfaces:**
- Consumes: `resolveScopeFromBody`, `assertWarehouseInBranch`, `branchErrorResponse`, `mainBranchId`, `resolveTerminalBranch`.
- Produces: no new exports.

- [ ] **Step 1: `pos/void-transaction` — derive from the voiding user**

Its POST destructures `saleId, voidReason, voidedByUserId, voidedByName`.
Resolve the scope from `voidedByUserId` (or `uid` if the body carries one),
then prefer the voided sale's own `branch_id` and refuse a mismatch — the same
shape as Task 5's document check.

- [ ] **Step 2: `app/api/sales` POST — thread the branch through the use case**

This handler destructures nothing; it calls
`createSaleUseCase.execute(body)`. Read
`src/core/sales/application/CreateSaleUseCase.ts` first. Resolve the scope in
the route, then pass the branch into `execute` so the use case can assert or
stamp it. **Do not paste the five-line handler pattern here** — follow the
repository/use-case structure the file already uses, as Phase 1 did for the
products route. Report the signature change you made.

- [ ] **Step 3: The importer — scope the default warehouse to the importer's branch**

`getDefaultWarehouseId()` currently runs:

```sql
SELECT id FROM warehouses
WHERE is_active = 1
ORDER BY is_main DESC, (id = 'wh_main') DESC, created_at ASC
LIMIT 1
```

Give it a branch parameter and add `AND branch_id = ?` for a single-branch
scope, leaving the query unscoped for head office. Require `uid` on the route
(spec D6). Decide and document what happens when a branch has no active
warehouse: the current code returns null and lets products import unassigned.
A clear error is better for a branch user — state which you chose and why.

- [ ] **Step 4: `pos-transactions` — prefer the sale's branch (spec D7)**

Lines ~182-184 read:

```typescript
const txnBranchId: string = terminalId
  ? (await resolveTerminalBranch(terminalId)).branchId
  : await mainBranchId();
```

A client posting a branch-A `saleId` with a branch-B `terminalId` writes a row
stamped B against a sale stamped A. Mirror `app/api/sales/returns/route.ts`:
prefer the referenced sale's own `branch_id`, falling back to the terminal,
then the main branch.

- [ ] **Step 5: Write tests for each of the four**

Append to `tests/e2e/branch-write-isolation.spec.ts`: a cross-branch 403 and a
same-branch non-403 for `void-transaction` and `sales`; an importer test
asserting the product lands in the importing user's branch warehouse; and a
`pos-transactions` test asserting the row takes the **sale's** branch when the
terminal disagrees. Cebuano descriptions. Report the final count.

- [ ] **Step 6: Run the tests**

Run: `timeout 540 npx playwright test tests/e2e/branch-write-isolation.spec.ts --reporter=line`
Expected: PASS. Record the total.

- [ ] **Step 7: Typecheck, unit tests, commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
timeout 400 npm run test:unit
git add app/api src tests/e2e/branch-write-isolation.spec.ts
git commit -m "feat(branches): isolate the void, sale, import and attribution write paths"
```

---

### Task 7: Wire the clients, and prove they send the uid

Phase 1's lesson: filtering an API without wiring its clients 403s the UI.
Phase 2a's lesson: a server-contract test still passes when a client silently
drops its uid. This task fixes the first and tests against the second.

**Files:**
- Modify: the client files found in Step 1
- Modify: `tests/e2e/branch-write-isolation.spec.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `appendSessionUid(params)` and `getSessionUid()` from `lib/session-uid.ts` (Phase 2a).
- Produces: no new exports.

- [ ] **Step 1: Find every client of the routes this phase changed**

Run:
```bash
for r in products/ stock-adjustments sales/invoices sales/orders inventory/adjust/bulk pos/void-transaction sales/z-reading data-management/import/products; do
  echo "--- $r ---"
  grep -rln "getApiUrl(\`\?/\?$r" --include="*.tsx" --include="*.ts" "app/(app)/" 2>/dev/null
done
```

The audit on 2026-10-16 found 7 files, none uid-aware:
`sales/invoices/use-invoices-query.ts`;
`sales/manage-warehouses/WarehouseRow.tsx`;
`sales/orders/add-order/use-add-order-form.ts`;
`sales/orders/add-order/use-sales-order-by-id.ts`;
`sales/orders/use-orders-query.ts`;
`pos/z-reading-report/ZReadingDialog.tsx`;
`sales/z-reading/use-z-reading-page.tsx`.
**Report every file your own search finds**, including any not on that list.
A route whose clients you cannot find must be reported, never silently left
to 403.

- [ ] **Step 2: Add the uid at each call site**

For a query string: `appendSessionUid(params)` before building the URL.
For a JSON body: add `uid: getSessionUid()` to the posted object.
Both from `lib/session-uid.ts`. It returns `''` when there is no session and
never fabricates a uid, so an absent session surfaces as an honest 403.

- [ ] **Step 3: Write a page-level test that the uid actually travels**

A server-contract test cannot catch a client that loses its call. Use
`seedSession()` from `tests/e2e/helpers/auth.ts` (it sets `mock-user-session`
via `addInitScript`), open a page that performs one of these writes, and
assert the outgoing request carries a uid:

```typescript
test('ang client mo-apil sa uid sa write request', async ({ page }) => {
  const { seedSession } = await import('./helpers/auth');
  await seedSession(page);

  const seen: string[] = [];
  await page.route('**/api/sales/orders**', async (route) => {
    const req = route.request();
    const url = req.url();
    const body = req.method() === 'POST' ? (req.postData() ?? '') : '';
    seen.push(url + ' ' + body);
    await route.continue();
  });

  await page.goto('/sales/orders');
  await page.waitForTimeout(2000);

  expect(seen.length).toBeGreaterThan(0);
  expect(seen.some((s) => /[?&]uid=|"uid"/.test(s))).toBe(true);
});
```

Adjust the route glob and the page path to a write you actually wired. If no
page performs a write without heavy interaction, assert on a GET from the same
client file instead and say so — the point is to catch a dropped
`appendSessionUid`, and any request from that file proves the wiring.

- [ ] **Step 4: Run the tests**

Run: `timeout 900 npx playwright test tests/e2e/branch-write-isolation.spec.ts --reporter=line`
Expected: PASS. Record the total.

- [ ] **Step 5: Update CLAUDE.md**

In the **Branches** section, replace the "Still reads-only isolation"
paragraph with an accurate statement: reads are filtered, and writes are now
isolated on the stock and BIR/sale-document routes. Name what remains open —
the 9 master-data routes (shared by design, Phase 1's D8), ~6 admin/dev
utility writes, and `approvals/queue` / `reports/soa` (still cross-branch,
reasons commented in those files). Keep CLAUDE.md's existing density.

- [ ] **Step 6: Run the FULL suite**

**First check memory:**
```bash
powershell -c "(Get-Process node -ErrorAction SilentlyContinue).Count"
powershell -c "$o=Get-CimInstance Win32_OperatingSystem; [math]::Round($o.FreePhysicalMemory/1MB,2)"
```
If several node processes linger or free memory is under ~4 GB, stop them
first — otherwise Turbopack fails to spawn its worker (`exit code:
0xc0000142`) and you get an `ECONNREFUSED` cascade that looks like 100+ real
failures.

Run: `timeout 2700 npx playwright test --reporter=line`

Expected: roughly 23 pre-existing failures and **zero** `ECONNREFUSED`. Known
pre-existing, not caused by this phase: 16 stale `Retail (₱)` selector
failures (`add-product*`, `price-level-tiers`, `purchase-order-add-product`,
`selling-units` — that string appears nowhere in `app/` or `components/`), 6
UI drift (`pricing` ×2, `import-wizard`, `login`, `dashboard-matte`,
`sidebar-panel`), and `developer-page-toggles` which passes on solo re-run.
**Name every failure and say whether this phase caused it.** If you cannot
complete a full run, say so plainly and run the widest subset you can — a
truthful partial result is worth far more than a fabricated pass.

- [ ] **Step 7: Typecheck, unit tests, commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
timeout 400 npm run test:unit
git add "app/(app)" tests/e2e/branch-write-isolation.spec.ts CLAUDE.md
git commit -m "feat(branches): send the session uid from the write clients"
```

---

## Phase 2b completion criteria

- [ ] `npm run typecheck` reports no source-directory errors
- [ ] `npm run test:unit` passes all 63 files
- [ ] A cross-branch write is refused with 403 on every one of the 12 routes
- [ ] A **same-branch** write still succeeds on every one of them
- [ ] Head office can write to any branch
- [ ] A Z-reading for another branch's terminal is refused, with no BIR figure altered
- [ ] The importer lands products in the importing user's branch warehouse
- [ ] `pos-transactions` stamps the referenced sale's branch, not the terminal's
- [ ] A page-level test proves the clients send the uid
- [ ] Full suite shows only the ~23 pre-existing failures, no `ECONNREFUSED`
- [ ] `CLAUDE.md` no longer claims isolation is reads-only
