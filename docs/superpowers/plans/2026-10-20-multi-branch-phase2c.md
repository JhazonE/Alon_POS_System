# Multi-Branch Phase 2c — Server-Action Write Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Branch-guard the ten `'use server'` actions that write products or stock, resting the guard on a server-trusted session cookie rather than a caller-supplied `userId`.

**Architecture:** A signed HTTP-only cookie set at login carries the `uid` only; the branch is still looked up from `users.branch_id` per call, so the branch is never client-asserted. A new `resolveScopeFromSession()` in `lib/branch-context.ts` reads that cookie via `next/headers`. Each guarded action resolves a scope, asserts its target's warehouse is in that branch, and refuses otherwise. The approval processor's finalization path passes a scope derived from the queue row's DB-stored `created_by` instead of relying on the caller-settable `isInternalFinalization` flag.

**Tech Stack:** Next.js 16 server actions, `next/headers` cookies, Node `crypto` HMAC, MySQL 8 via raw `mysql2/promise`, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-10-20-multi-branch-phase2c-server-action-writes-design.md`

## Global Constraints

- MySQL 8 only; raw parameterised SQL via `query()` / `withTransaction()` from `lib/mysql.ts`. No ORM. No string-interpolated SQL.
- All branch resolution lives in `lib/branch-context.ts`. Its settled contract: `null` = head office = no filter; `[]` = branch with no warehouses = match nothing; a cross-branch target is a refusal, never a silent ignore.
- **No branch decision may rest on a caller-supplied value.** This is the phase's reason for existing; a guard that derives a branch from a passed `userId` is a defect, not an implementation choice.
- **Missing cookie falls back to today's unguarded behaviour.** Never fail closed: that locks out pre-upgrade sessions and breaks the whole E2E suite.
- E2E `workers: 1`. Cebuano test descriptions, English code.
- `npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"` must stay empty. `npm run lint` is broken repo-wide on Next 16 and is **waived**.
- Must not touch the four files rendering `Retail (₱)` / `Cost (₱)`: `app/(app)/products/add-product/tabs/selling-units-tab.tsx`, `app/(app)/products/edit-product/tabs/selling-units-tab.tsx`, `app/(app)/products/components/supplier-mappings-panel.tsx`, `app/(app)/products/supplier-mapping/AddSupplierMappingDialog.tsx`. 15 of the suite's 23 known failures live there; touching them destroys the pre-existing attribution.
- Baseline to preserve: **297 passed / 23 failed / 1 skipped / 6 did not run**. Any new failure must be attributed before merge.
- No migration in this phase. Do not touch `transaction_references` or `branch_number_series`.
- Commits authored as JhazonE. No `Co-Authored-By: Claude` trailer.

## Review Focus

Input classes the spec implies but no task's happy path exercises. Each has its test placed in the task that owns the code.

1. **A caller passing another branch's `userId` while holding a branch-A cookie** must still be refused — the cookie wins. Without this test, the phase's whole premise is unverified. (Task 5)
2. **A forged or tampered cookie** (valid shape, wrong signature) must be rejected and treated as absent, not accepted. (Task 2)
3. **`updateProduct` setting `warehouse_id` to NULL** must be refused for a branch user — otherwise a one-way door detaches a product from branch scope permanently, the shape Phase 2b found in orders. (Task 4)
4. **A batch where only one item is out-of-branch** must write nothing at all, not partially apply. (Task 6)
5. **The approval processor finalizing a branch-A item as a head-office approver** must still write into branch A, and must keep working with no cookie present at all (server-to-server). (Task 7)

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/session-cookie.ts` | **Create.** Sign, verify and parse the session cookie. Pure crypto + encoding; no DB, no `next/headers`. |
| `lib/branch-context.ts` | **Modify.** Add `resolveScopeFromSession()` and `resolveScopeForUid()`. The only place a branch is resolved. |
| `app/api/auth/login/route.ts` | **Modify.** Set the cookie on successful login, alongside the existing JSON response. |
| `app/auth-actions.ts` | **Modify.** Clear the cookie in `handleSignOut`. |
| `app/(app)/products/actions.ts` | **Modify.** Guard 6 actions; delete 2 dormant ones. |
| `app/(app)/inventory/history/actions.ts` | **Modify.** Guard `adjustStock`; delete dormant `createStockAdjustment`. |
| `app/(app)/inventory/pricing/actions.ts` | **Modify.** Guard `submitPriceUpdateBatch`. |
| `app/api/approvals/process/route.ts` | **Modify.** Pass a `created_by`-derived scope into the four finalization calls. |
| `tests/e2e/helpers/auth.ts` | **Modify.** Issue a valid cookie alongside the `localStorage` session. |
| `tests/e2e/branch-server-action-isolation.spec.ts` | **Create.** The phase's isolation tests. |
| `tests/unit/session-cookie.test.ts` | **Create.** Sign/verify/tamper unit tests, `node:assert` style. |
| `tests/unit/run.ts` | **Modify.** Register the new test file; the runner has no auto-discovery. |
| `CLAUDE.md` | **Modify.** Final task: state what is guarded and what the fallback leaves open. |

---

### Task 1: Session cookie crypto

**Files:**
- Create: `lib/session-cookie.ts`
- Create: `tests/unit/session-cookie.test.ts`
- Modify: `tests/unit/run.ts` (register `'session-cookie.test'` in the file list — the runner
  does not auto-discover; an unregistered test never runs)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SESSION_COOKIE_NAME: string` (value: `'alon-session'`)
  - `signSession(uid: string, secret: string): string`
  - `verifySession(token: string, secret: string): string | null` — returns the uid, or `null` for any malformed, unsigned, tampered or expired token.
  - `sessionSecret(): string` — reads the secret, generating and persisting one on first call.

- [ ] **Step 1: Write the failing tests**

**Follow the existing unit-test convention** (see `tests/unit/aes-gcm.test.ts`): flat
`node:assert/strict` assertions that self-execute on import. No `test()` wrapper, no
vitest. The file must also be registered by name in `tests/unit/run.ts`'s list.

```ts
// tests/unit/session-cookie.test.ts
import assert from 'node:assert/strict';
import { signSession, verifySession } from '../../lib/session-cookie';

const t = signSession('user-abc', 'secret-1');
assert.equal(verifySession(t, 'secret-1'), 'user-abc', 'round-trips the uid');
assert.equal(verifySession(t, 'secret-2'), null, 'wrong secret returns null');

const forged = Buffer.from('{"uid":"attacker"}').toString('base64url') + '.' + t.split('.')[1];
assert.equal(verifySession(forged, 'secret-1'), null, 'tampered payload returns null');

for (const bad of ['', 'x', 'a.b.c', 'not-base64.sig']) {
  assert.equal(verifySession(bad, 'secret-1'), null, `malformed input returns null: ${bad}`);
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — cannot find module `lib/session-cookie`.

- [ ] **Step 3: Implement `lib/session-cookie.ts`**

Token format `base64url(JSON).base64url(hmac)`. Payload `{ uid, iat }`. HMAC-SHA256 over the payload string using Node `crypto`. Compare with `crypto.timingSafeEqual`, guarding the length-mismatch throw. `verifySession` returns `null` on every failure path and never throws.

`sessionSecret()` resolution order: `process.env.SESSION_SECRET`; else a secret persisted in the Electron user-data dir (`app.getPath('userData')` when available) or `.env`; else generate 32 random bytes, persist, and return. If persistence fails, return the in-memory value and `console.warn` once — per the spec the server must not refuse to start.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `session-cookie` listed among the passing files.

- [ ] **Step 5: Commit**

```bash
git add lib/session-cookie.ts tests/unit/session-cookie.test.ts
git commit -m "feat(auth): add signed session cookie primitives"
```

---

### Task 2: Resolve a branch scope from the cookie

**Files:**
- Modify: `lib/branch-context.ts` (append; do not reorder existing exports)
- Test: `tests/unit/session-cookie.test.ts` (append the forged-cookie case)

**Interfaces:**
- Consumes: Task 1's `SESSION_COOKIE_NAME`, `verifySession`, `sessionSecret`.
- Produces:
  - `resolveScopeForUid(uid: string): Promise<BranchScope>` — thin wrapper over the existing `resolveUserBranch(uid)`; no `viewBranchId` (writes take no view switch).
  - `resolveScopeFromSession(): Promise<BranchScope | null>` — reads the cookie via `next/headers`; returns `null` when the cookie is absent or invalid, signalling *fall back*, distinct from a thrown `BranchResolutionError` which means *refuse*.

The `null`-vs-throw distinction is the contract later tasks depend on: `null` = no trustworthy identity, behave as today; throw = identity known and the target is out of branch.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/session-cookie.test.ts
assert.equal(
  verifySession(signSession('u1', 'other-secret'), sessionSecret()),
  null,
  'a cookie signed with the wrong secret yields no uid, so callers fall back'
);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit`
Expected: FAIL.

- [ ] **Step 3: Implement both functions in `lib/branch-context.ts`**

`resolveScopeFromSession()` wraps its `cookies()` access in try/catch: outside a request scope Next throws, and that must read as "no session" rather than crash a server-to-server call.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm run test:unit` → PASS
Run: `npm run typecheck 2>&1 | grep -E "^(app|lib)/"` → empty

- [ ] **Step 5: Commit**

```bash
git add lib/branch-context.ts tests/unit/session-cookie.test.ts
git commit -m "feat(branches): resolve a branch scope from the session cookie"
```

---

### Task 3: Issue and clear the cookie

**Files:**
- Modify: `app/api/auth/login/route.ts:62-71` (the success response)
- Modify: `app/auth-actions.ts` (`handleSignOut`)
- Modify: `tests/e2e/helpers/auth.ts`

**Interfaces:**
- Consumes: Task 1's `signSession`, `sessionSecret`, `SESSION_COOKIE_NAME`.
- Produces: an authenticated browser session that carries the cookie. The E2E helper's exported signature does not change.

**Why the helper changes here:** `tests/e2e/helpers/auth.ts` mocks `/api/auth/login` and sets only `localStorage`, so without this no test would ever hold a cookie and every later task would test the fallback path instead of the guard.

- [ ] **Step 1: Set the cookie on login**

In the existing success `NextResponse.json({...})`, attach `response.cookies.set(SESSION_COOKIE_NAME, signSession(user.uid, sessionSecret()), { httpOnly: true, sameSite: 'lax', path: '/' })`. Keep the JSON body byte-identical — 150+ routes and the clients depend on it.

- [ ] **Step 2: Clear it on sign-out**

In `handleSignOut`, delete `SESSION_COOKIE_NAME` via `next/headers` `cookies()`.

- [ ] **Step 3: Make the E2E helper issue a real cookie**

In `seedSession`, add the cookie to the Playwright context with the same value `signSession(uid, sessionSecret())` produces, for `DEFAULT_ADMIN` and any explicitly-passed uid. The mocked `/api/auth/login` route must also return it so login-flow tests behave like production.

- [ ] **Step 4: Verify login and a session-dependent spec still pass**

Run: `npx playwright test tests/e2e/login.spec.ts tests/e2e/branch-write-isolation.spec.ts --reporter=line`
Expected: `login.spec.ts` unchanged from baseline (it is a known pre-existing failure — confirm the *same* failure, not a new one); `branch-write-isolation.spec.ts` 45 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/login/route.ts app/auth-actions.ts tests/e2e/helpers/auth.ts
git commit -m "feat(auth): issue and clear the session cookie"
```

---

### Task 4: Guard the single-product writers

**Files:**
- Modify: `app/(app)/products/actions.ts` — `updateProduct` (:905), `deleteProduct` (:1118), `setPrimarySupplier` (:1983), `addProduct` (:702)
- Create: `tests/e2e/branch-server-action-isolation.spec.ts`

**Interfaces:**
- Consumes: Task 2's `resolveScopeFromSession`, `resolveScopeForUid`; existing `assertWarehouseInBranch`, `BranchResolutionError`.
- Produces: `assertProductInScope(productId: string, scope: BranchScope): Promise<void>` — exported from `lib/branch-context.ts`; resolves the product's `warehouse_id` and delegates to `assertWarehouseInBranch`. Mirrors the inline block at `app/api/stock-adjustments/route.ts:96-104`, which is the reference pattern. Tasks 5–7 reuse it.

Each guarded action keeps its existing return contract: refusal returns that action's own `{ success: false, error }` shape, never a thrown 500.

- [ ] **Step 1: Write the failing tests (red-first, both directions)**

```ts
// tests/e2e/branch-server-action-isolation.spec.ts
test('dili mausab sa branch A ang produkto sa branch B pinaagi sa server action', ...)
// Seeds a product in B, drives the branch-A UI edit path, asserts the row is UNCHANGED.

test('gi-refuse ang pag-NULL sa warehouse_id sa produkto sa laing branch', ...)
// Review Focus 3: updateProduct with warehouse set to null must not detach B's product.

test('molampos ang pag-usab sa kaugalingong produkto', ...)
// The guard must not break the legitimate path.
```

- [ ] **Step 2: Run to verify they fail *for the right reason***

Run: `npx playwright test tests/e2e/branch-server-action-isolation.spec.ts --reporter=line`
Expected: the two isolation tests FAIL because the cross-branch write **succeeds** (the row changed). A failure for any other reason means the test does not yet prove the hole — fix the test before writing the guard.

- [ ] **Step 3: Add `assertProductInScope` to `lib/branch-context.ts`, then guard the four actions**

Pattern per action: resolve scope from the session; if `null`, proceed unguarded (fallback); otherwise assert the target product, catching `BranchResolutionError` into the action's refusal shape. On `updateProduct`, assert **both** the existing `warehouse_id` and the incoming one (`products/actions.ts:924` can set it to NULL), per the spec.

- [ ] **Step 4: Run to verify they pass**

Run: `npx playwright test tests/e2e/branch-server-action-isolation.spec.ts --reporter=line`
Expected: PASS, with the cross-branch rows verified unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/branch-context.ts "app/(app)/products/actions.ts" tests/e2e/branch-server-action-isolation.spec.ts
git commit -m "feat(branches): guard the single-product server-action writers"
```

---

### Task 5: Guard `adjustStock` and prove the cookie outranks the argument

**Files:**
- Modify: `app/(app)/inventory/history/actions.ts` — `adjustStock` (:217)
- Modify: `tests/e2e/branch-server-action-isolation.spec.ts`

**Interfaces:**
- Consumes: `assertProductInScope`, `resolveScopeFromSession`, `resolveScopeForUid`.
- Produces: `adjustStock(productId, quantity, reason, userId?, isInternalFinalization?, expirationDate?, scope?: BranchScope)` — a trailing optional `scope`. When supplied (Task 7), it is used as-is; when absent, the session is consulted. Signature stays backward-compatible so the 2 existing callers keep compiling.

- [ ] **Step 1: Write the failing test — Review Focus 1, the phase's premise**

```ts
test('ang cookie sa branch A mo-labaw sa userId sa branch B nga gi-pasa sa caller', ...)
// Branch-A cookie, but userId = a branch-B user, target = a branch-B product.
// MUST be refused and the row unchanged. If this passes while the guard
// reads the passed userId, the guard is client-asserted and worthless.

test('dili ma-adjust sa branch A ang stock sa produkto sa branch B', ...)
```

- [ ] **Step 2: Run to verify they fail with the write succeeding**

Run: `npx playwright test tests/e2e/branch-server-action-isolation.spec.ts --reporter=line`
Expected: the new tests FAIL with the stock changed.

- [ ] **Step 3: Guard `adjustStock`**

Use `scope` when passed, else the session, else fall back. Assert the **target product only** — family sync's recursive members are deliberately not asserted (spec decision).

- [ ] **Step 4: Run to verify they pass**

Run: `npx playwright test tests/e2e/branch-server-action-isolation.spec.ts --reporter=line`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inventory/history/actions.ts" tests/e2e/branch-server-action-isolation.spec.ts
git commit -m "feat(branches): guard adjustStock on the session, not the passed userId"
```

---

### Task 6: Guard the batch writers, all-or-nothing

**Files:**
- Modify: `app/(app)/inventory/pricing/actions.ts` — `submitPriceUpdateBatch` (:33)
- Modify: `app/(app)/products/actions.ts` — `updateProductShelfLocations` (:1178)
- Modify: `tests/e2e/branch-server-action-isolation.spec.ts`

**Interfaces:**
- Consumes: `assertProductInScope`, `resolveScopeFromSession`.
- Produces: both actions gain a trailing optional `scope?: BranchScope`, same convention as Task 5.

- [ ] **Step 1: Write the failing test — Review Focus 4**

```ts
test('kung usa ra sa batch ang sa laing branch, walay bisan usa nga ma-apply', ...)
// Batch of 3: two in A, one in B. Assert ALL THREE rows unchanged — a partial
// apply (the two A rows written) is the failure this test exists to catch.
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — the A rows were written.

- [ ] **Step 3: Implement**

Validate every target **before** opening the transaction, so a refusal writes nothing. Do not validate inside the per-item loop.

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inventory/pricing/actions.ts" "app/(app)/products/actions.ts" tests/e2e/branch-server-action-isolation.spec.ts
git commit -m "feat(branches): refuse cross-branch batches whole"
```

---

### Task 7: The approval finalization path

**Files:**
- Modify: `app/api/approvals/process/route.ts:127-150`
- Modify: `tests/e2e/branch-server-action-isolation.spec.ts`

**Interfaces:**
- Consumes: `resolveScopeForUid`; the `scope?` parameters from Tasks 5–6.
- Produces: nothing new.

**The decision being implemented:** `item.created_by` is read from the queue row in the database, so it is server-derived and trustworthy — unlike `isInternalFinalization`, which the caller sets. The four finalization calls pass `await resolveScopeForUid(item.created_by)`. A head-office approver finalizing a branch-A item therefore writes into branch A, which is correct: the write belongs to the branch that requested it.

- [ ] **Step 1: Write the failing test — Review Focus 5**

```ts
test('ang head office nga mo-approve sa item sa branch A mo-sulat sa branch A', ...)
// Queue an adjustment as a branch-A user, finalize as head office,
// assert the branch-A product's stock actually changed.
```

- [ ] **Step 2: Run it**

Expected: PASS before the change (nothing is guarded yet) — this is a **regression guard**, not a red-first test. Record it as such: its job is to fail if Task 7 breaks finalization.

- [ ] **Step 3: Pass the `created_by` scope into all four calls**

`adjustStock` (:127), `updateProductShelfLocations` (:135), `addProduct` (:143), `submitPriceUpdateBatch` (:146). Leave `isInternalFinalization` in place; it is no longer a trust boundary.

- [ ] **Step 4: Verify finalization still works, with no cookie present**

Run: `npx playwright test tests/e2e/branch-server-action-isolation.spec.ts --reporter=line`
Expected: PASS, including the server-to-server path.

- [ ] **Step 5: Commit**

```bash
git add app/api/approvals/process/route.ts tests/e2e/branch-server-action-isolation.spec.ts
git commit -m "feat(branches): finalize approvals under the requesting branch's scope"
```

---

### Task 8: Delete the dormant endpoints

**Files:**
- Modify: `app/(app)/products/actions.ts` — remove `updateProductPrice` (:1134), `updateProductStock` (:1168)
- Modify: `app/(app)/inventory/history/actions.ts` — remove `createStockAdjustment` (:104)

A `'use server'` export is a reachable HTTP endpoint whether the UI calls it or not. These three have zero callers, so removing the endpoint is strictly better than defending it.

- [ ] **Step 1: Prove they are unreferenced repo-wide**

Run: `grep -rn "updateProductPrice\|updateProductStock\|createStockAdjustment" --include=*.ts --include=*.tsx app components lib scripts tests | grep -v "export async function"`
Expected: no output. **If anything matches, guard that function instead of deleting it** and say so in the task report.

- [ ] **Step 2: Delete the three functions**

- [ ] **Step 3: Verify nothing broke**

Run: `npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"` → empty
Run: `timeout 400 npm run test:unit` → all files pass

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/products/actions.ts" "app/(app)/inventory/history/actions.ts"
git commit -m "refactor(branches): remove three dormant unguarded write endpoints"
```

---

### Task 9: Document honestly, then gate on the full suite

**Files:**
- Modify: `CLAUDE.md` (the Phase 2b paragraph, ~line 91)

- [ ] **Step 1: Rewrite the server-action disclosure**

State: the server-action product/stock writers are branch-guarded on a signed HTTP-only session cookie; the branch is still read from `users.branch_id`, never from the cookie or an argument; approval finalization scopes to the queue row's `created_by`; three dormant endpoints were deleted.

State the limitation plainly, per the spec: **because a missing cookie falls back to unguarded behaviour, the "at the API layer" qualifier stays until a follow-up (2d) removes the fallback.** Do not claim writes are fully isolated. Correct the writer count from nine to ten (`setPrimarySupplier` was omitted).

- [ ] **Step 2: Spot-check two claims against the code**

Confirm each sentence is true of the merged tree — Phase 2b's review caught an overclaim here.

- [ ] **Step 3: Full suite as the phase gate**

Precondition: no other work running; check `powershell -c "(Get-Process node).Count"` is 0 first.
Run: `npm run test:e2e`
Expected: **≥297 passed**, and every failure outside the known 23 attributed before merge. Do not accept "probably pre-existing" — check each one.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record phase 2c server-action write isolation and its fallback"
```

---

## Self-Review

**1. Spec coverage.** Piece 1 (server-trusted session) → Tasks 1–3. Piece 2 (guard the ten) → Tasks 4–6, 8 (6 guarded, 3 deleted, `addProduct` in Task 4). Internal path → Task 7. Documentation → Task 9. All five post-builder-check decisions appear: fallback (Tasks 2, 4), secret persistence (Task 1), all-or-nothing (Task 6), family sync (Task 5), NULL warehouse (Task 4), head-office/no-`viewBranchId` (Task 2).

Ten actions accounted for: `addProduct`, `updateProduct`, `deleteProduct`, `setPrimarySupplier` (T4), `adjustStock` (T5), `updateProductShelfLocations`, `submitPriceUpdateBatch` (T6), `updateProductPrice`, `updateProductStock`, `createStockAdjustment` (T8, deleted).

**2. Step scan.** Each code step names a signature and file; bodies appear only where the algorithm is not determined (token format in Task 1, the before-transaction validation point in Task 6).

**3. Type consistency.** `BranchScope`, `BranchResolutionError`, `assertWarehouseInBranch`, `resolveUserBranch` match `lib/branch-context.ts` as read. New names used identically across tasks: `SESSION_COOKIE_NAME`, `signSession`, `verifySession`, `sessionSecret`, `resolveScopeFromSession`, `resolveScopeForUid`, `assertProductInScope`, and the trailing `scope?: BranchScope` convention (Tasks 5, 6, 7).

**4. Review Focus.** All five mapped: 1→T5, 2→T1/T2, 3→T4, 4→T6, 5→T7.

**5. Proportion.** Nine tasks over ~10 files for a spec of comparable length; no task restates another's code.

**Noted during review:** Task 7's Step 2 expects PASS, not FAIL, because it is a regression guard rather than a red-first test. Flagged explicitly in the step so an executor following "verify it fails" does not treat the pass as a defect.
