# Multi-Branch Phase 3 — Operability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the multi-branch machinery operable — an admin can manage branches from the UI, and two terminals in one store can both close their day.

**Architecture:** Two independent pieces. **A** swaps the global `UNIQUE(reading_number)` on `z_readings`/`x_readings` for a composite `(terminal_id, reading_number)`, and re-keys the Sta. Lucia claim per terminal so the fix does not silently stop reporting a terminal's sales to the mall. **B** adds a branch-administration settings page plus the `PATCH`/reassignment endpoints it needs, all gated on the `all_branches` grant.

**Tech Stack:** Next.js 16 App Router, MySQL 8 via raw `mysql2/promise`, Playwright E2E, the project's custom `node:assert` unit runner.

**Spec:** `docs/superpowers/specs/2026-10-21-multi-branch-phase3-operability-design.md`

## Global Constraints

- MySQL 8 only; raw **parameterised** SQL via `query()` / `withTransaction()` from `lib/mysql.ts`. No ORM, no string-interpolated values.
- **MySQL DDL implicitly commits** — a constraint swap cannot be atomic. **ADD the new key before DROPping the old one**, never the reverse. Mirror `scripts/migrations/141_composite_bir_unique_keys.ts`, including its idempotence: tolerate `ER_DUP_KEYNAME`/errno 1061 on ADD and errno 1091 on DROP, and resolve index names via `INFORMATION_SCHEMA` rather than assuming them.
- Migrations are numbered TS files in `scripts/migrations/` with `up()` and `down()`. **Last is 141; this phase starts at 142.**
- `lib/branch-context.ts` is the only place a branch is resolved. Append only — never reorder or rename its existing exports (40+ call sites).
- **Never give a `'use server'` export a `scope` parameter** — Phase 2c's Critical bypass. Every parameter of a server action is attacker-controlled.
- Writes are **refused** (403), never filtered. A cross-branch target is never silently ignored.
- BIR numbering is legally significant: never gap, duplicate, or renumber a series. No existing `reading_number` may change.
- E2E `workers: 1`. **Cebuano test descriptions, English code.**
- Unit tests use the project's custom runner (`npm run test:unit`, flat `node:assert/strict`, self-executing on import, no `test()`/`expect()`). `tests/unit/run.ts` has **no auto-discovery** — a new test file must be registered there or it silently never runs.
- `npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"` must stay empty. `npm run lint` is broken repo-wide on Next 16 and is **waived**.
- Baseline to preserve: **346 passed / 23 failed / 1 skipped / 6 did not run**. The 23 are pre-existing and individually attributed; attribute any new failure before merge.
- **Do not touch** these four files (15 of the 23 known failures live there): `products/add-product/tabs/selling-units-tab.tsx`, `products/edit-product/tabs/selling-units-tab.tsx`, `products/components/supplier-mappings-panel.tsx`, `products/supplier-mapping/AddSupplierMappingDialog.tsx`.
- Commits authored as JhazonE. No `Co-Authored-By: Claude` trailer, no "Generated with Claude Code".

## Review Focus

Failure modes the spec implies that no happy path exercises. Each has its test placed in the task owning the code.

1. **A second terminal's Z-reading must stop silently vanishing from the mall report.** Once two terminals share `Z-20261021-001`, the Sta. Lucia claim INSERT collides and reads as "already submitted". This is the phase's most expensive failure (mall rent is a percentage of reported sales) and the one a passing constraint-swap test would hide. (Task 2)
2. **A branch-scoped (non-head-office) user must be refused by every new endpoint, with the row verified unchanged in the DB** — status alone is not enough. Phase 2b's review found four tests asserting only status that would have passed if the write happened before the refusal. (Tasks 4, 5, 6)
3. **Deactivating a branch that still has warehouses, users or terminals must be refused** — orphaning rows onto an inactive branch is a silent lockout (the failure migration 134 exists to prevent). (Task 5)
4. **A reassignment that would leave zero `all_branches` holders must be refused** — otherwise one move locks every admin out of the branch page, recoverable only by hand-editing MySQL. (Task 6)
5. **The migration must not alter any existing `reading_number`** — these are on filed BIR documents. (Task 1)

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/migrations/142_per_terminal_reading_unique_keys.ts` | **Create.** Swap both reading tables' unique keys to `(terminal_id, reading_number)`. |
| `scripts/migrations/143_per_terminal_sta_lucia_claim.ts` | **Create.** Re-key `sta_lucia_submissions` so a claim is per (terminal, reading number). |
| `lib/integrations/sta-lucia/send-z-reading.ts` | **Modify.** Claim and look up by terminal + reading number. |
| `lib/branch-context.ts` | **Modify (append).** `assertHeadOffice(uid)` — the one authorisation helper the admin endpoints share. |
| `app/api/branches/route.ts` | **Modify.** Retrofit the head-office check onto the existing `POST`. |
| `app/api/branches/[id]/route.ts` | **Create.** `PATCH` — edit fields, activate/deactivate (with the attached-rows guard). |
| `app/api/branches/reassign/route.ts` | **Create.** `POST` — move a warehouse, user or terminal to another branch. |
| `app/(app)/settings/branches/page.tsx` + components | **Create.** The branch administration page. |
| `app/api/pos-terminals/route.ts` | **Modify.** Accept a `branchId` on create instead of hard-coding `mainBranchId()`. |
| `tests/unit/reading-number-uniqueness.test.ts` | **Create.** Red-first collision proof (register in `tests/unit/run.ts`). |
| `tests/e2e/branch-admin.spec.ts` | **Create.** Endpoint authorisation + guard tests. |
| `CLAUDE.md` | **Modify.** Final task: record the composite keys, the Sta. Lucia re-key and its remaining mall-side limitation. |

---

### Task 1: Per-terminal reading uniqueness

**Files:**
- Create: `scripts/migrations/142_per_terminal_reading_unique_keys.ts`
- Create: `tests/unit/reading-number-uniqueness.test.ts`
- Modify: `tests/unit/run.ts` (register `'reading-number-uniqueness.test'` — no auto-discovery)

**Interfaces:**
- Consumes: `getNextZReadingNumber(terminalId)` / `getNextXReadingNumber(terminalId)` from `lib/mysql.ts` (already per-terminal; unchanged).
- Produces: a schema where `(terminal_id, reading_number)` is unique on `z_readings` and `x_readings`, and `reading_number` alone is not.

- [ ] **Step 1: Write the failing test**

Seed two `pos_terminals` rows, then for each of `z_readings` and `x_readings` insert the **same** `reading_number` under two different `terminal_id`s.

```ts
// tests/unit/reading-number-uniqueness.test.ts — node:assert style, see tests/unit/aes-gcm.test.ts
// Two terminals, same day, same number: must INSERT successfully once the key is composite.
assert.equal(await insertReading('z_readings', 'T1', 'Z-20261021-001'), true, 'terminal 1 inserts');
assert.equal(await insertReading('z_readings', 'T2', 'Z-20261021-001'), true, 'terminal 2 inserts too');
// Same terminal reusing its own number is still a duplicate.
assert.equal(await insertReading('z_readings', 'T1', 'Z-20261021-001'), false, 'same terminal is refused');
```

Add the identical trio for `x_readings`. Clean up seeded rows in a `finally`.

- [ ] **Step 2: Run it and confirm it fails for the RIGHT reason**

Run: `npm run test:unit`
Expected: FAIL on the **second** insert with a duplicate-key error (errno 1062) — that is the production defect reproduced. If it fails anywhere else, fix the test before writing the migration.

- [ ] **Step 3: Write migration 142**

For each of `z_readings`, `x_readings`: resolve the existing single-column unique index name on `reading_number` via `INFORMATION_SCHEMA.STATISTICS`; **ADD** `UNIQUE (terminal_id, reading_number)`; **then DROP** the old one. `down()` reverses it (ADD global, then DROP composite) and must **fail loudly** if duplicates now exist — restoring a global unique key over duplicate data is not possible, so do not coerce. Comment that. Mirror migration 141's idempotence (tolerate 1061 on ADD, 1091 on DROP).

Note `terminal_id` is nullable and has had collation drift (`scripts/fix_z_readings_schema.ts`) — do not assume a collation. NULL `terminal_id` rows are legacy and the composite key does not constrain them; say so in a comment.

- [ ] **Step 4: Migrate, verify, and prove reversibility**

Run: `npm run migrate` → `npm run test:unit` (PASS) → `npm run migrate:down` → `npm run migrate`
Also assert existing `reading_number` values are byte-identical before and after (**Review Focus 5**): capture them, migrate, compare.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrations/142_per_terminal_reading_unique_keys.ts tests/unit/reading-number-uniqueness.test.ts tests/unit/run.ts
git commit -m "fix(bir): make reading numbers unique per terminal, not globally"
```

---

### Task 2: Keep the Sta. Lucia sender correct per terminal

**Files:**
- Create: `scripts/migrations/143_per_terminal_sta_lucia_claim.ts`
- Modify: `lib/integrations/sta-lucia/send-z-reading.ts` (`claimZReading` ~:287, the lookup at ~:343, payload `id` at ~:84)
- Modify: `tests/unit/reading-number-uniqueness.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's composite reading key.
- Produces: a claim that is unique per (terminal, reading number), so each terminal claims and resends independently.

**Why this task exists — do not skip it or reorder it before Task 1.** `sta_lucia_submissions.z_reading_id` is the table's PRIMARY KEY and is filled with the bare `reading_number`. Once Task 1 lets two terminals share `Z-20261021-001`, the second terminal's claim INSERT collides, the sender reads that as **"already submitted"**, and that terminal's sales are **silently never reported to the mall**. Mall rent is commonly a percentage of reported sales. Task 1 alone converts a loud duplicate-key error into a silent revenue under-report — strictly worse.

- [ ] **Step 1: Write the failing test — Review Focus 1**

```ts
// Two terminals, same reading number: BOTH must be able to claim.
assert.equal(await claimFor('T1', 'Z-20261021-001'), true, 'terminal 1 claims');
assert.equal(await claimFor('T2', 'Z-20261021-001'), true, 'terminal 2 claims too, not "already submitted"');
assert.equal(await claimFor('T1', 'Z-20261021-001'), false, 'a repeat claim by the same terminal is still refused');
```

- [ ] **Step 2: Run it and confirm the second claim is refused today**

Run: `npm run test:unit`
Expected: FAIL — terminal 2's claim is rejected as a duplicate. That is the silent-under-report bug reproduced.

- [ ] **Step 3: Write migration 143 and update the sender**

Migration: re-key `sta_lucia_submissions` so uniqueness is `(terminal_id, z_reading_id)` — add the column if absent, backfill from `z_readings`, then the same ADD-then-DROP swap on the primary/unique constraint. Keep `succeeded` and `claimed_at` semantics and the 15-minute stale-claim takeover intact.

Sender: `claimZReading` and the `:343` lookup take the terminal into account, so the lookup cannot return another terminal's row via `LIMIT 1`.

- [ ] **Step 4: Verify**

Run: `npm run migrate` → `npm run test:unit` (PASS). Confirm the stale-takeover path still works (the existing Sta. Lucia unit tests must stay green).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrations/143_per_terminal_sta_lucia_claim.ts lib/integrations/sta-lucia/send-z-reading.ts tests/unit/reading-number-uniqueness.test.ts
git commit -m "fix(sta-lucia): claim and look up Z-readings per terminal"
```

---

### Task 3: `assertHeadOffice` — one authorisation helper

**Files:**
- Modify: `lib/branch-context.ts` (append)

**Interfaces:**
- Consumes: existing `ALL_BRANCHES_PERMISSION`, `BranchResolutionError`, `query`.
- Produces: `assertHeadOffice(uid: string): Promise<void>` — throws `BranchResolutionError` (403) unless the user holds `all_branches`. Tasks 4–6 all use it.

Per the spec: the check is the **grant alone**, not `users.branch_id IS NULL`. Migration 134 left admins branchless-with-grant, but a branch-assigned user holding the grant is a legitimate branch manager who also administers.

**Reject a non-string uid up front**, exactly as `assertProductInScope` does — Phase 2c proved an object id escapes as `` `key` = value `` and matches many rows.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/branch-admin.spec.ts` (created here): a head-office uid passes; a branch-scoped uid throws 403; an object/empty uid throws.

- [ ] **Step 2: Run it — FAIL, function not defined**

- [ ] **Step 3: Implement `assertHeadOffice(uid: string): Promise<void>` in `lib/branch-context.ts`**

- [ ] **Step 4: Run it — PASS.** Then `npm run typecheck 2>&1 | grep -E "^(app|lib)/"` → empty.

- [ ] **Step 5: Commit**

```bash
git add lib/branch-context.ts tests/e2e/branch-admin.spec.ts
git commit -m "feat(branches): add assertHeadOffice for branch administration"
```

---

### Task 4: Branch edit endpoint

**Files:**
- Create: `app/api/branches/[id]/route.ts`
- Modify: `app/api/branches/route.ts` (retrofit the head-office check on `POST`)
- Modify: `tests/e2e/branch-admin.spec.ts`

**Interfaces:**
- Consumes: `assertHeadOffice` (Task 3), `branchErrorResponse`.
- Produces: `PATCH /api/branches/[id]` accepting `name`, `business_name`, `address`, `tin`, `contact_number`, `permit_no`, `min_number`, `serial_number`, `operated_by`. **`code` is immutable.** Editing a BIR identity field (`permit_no`, `min_number`, `serial_number`, `tin`, `business_name`) writes an audit record — these appear on filed documents, and a silent change makes a filed document unexplainable. **Reuse the existing audit trail, do not invent one:** the `user_activity_logs` table (`user_uid`, `user_name`, `action`, `module`, `description`, `reference_id`) and the `logActivity` helper in `lib/client-activity-logger.ts:47` already serve this purpose elsewhere in the app. Record the field changed and both the old and new values in `description`, with the branch id as `reference_id`. Edits are **not** blocked once invoices exist (a typo in a permit number must be fixable).

- [ ] **Step 1: Write the failing tests — Review Focus 2**

A head-office user edits successfully; a **branch-scoped user is refused 403 AND the row is verified unchanged via `testQuery`**; `code` is rejected or ignored; a BIR-field edit produces an audit row.

- [ ] **Step 2: Run them — FAIL (route does not exist / `POST` accepts anyone)**

- [ ] **Step 3: Implement the route and retrofit `POST`**

Take the uid by the convention already used for a request of that shape (`resolveScopeFromRequest` / `lib/session-uid.ts` for bodyless, the body otherwise). Map `BranchResolutionError` via `branchErrorResponse`.

- [ ] **Step 4: Run them — PASS**

- [ ] **Step 5: Commit**

```bash
git add "app/api/branches/[id]/route.ts" app/api/branches/route.ts tests/e2e/branch-admin.spec.ts
git commit -m "feat(branches): add the branch edit endpoint and guard branch creation"
```

---

### Task 5: Activate / deactivate with the attached-rows guard

**Files:**
- Modify: `app/api/branches/[id]/route.ts`
- Modify: `tests/e2e/branch-admin.spec.ts`

**Interfaces:**
- Consumes: Task 4's route.
- Produces: `is_active` toggling on the same `PATCH`.

Rules: a branch with active warehouses, users or terminals **cannot** be deactivated — refuse naming the counts, so the admin knows what to move first. The **main branch** (`is_main = 1`) can never be deactivated. Deactivation **keeps** `branch_number_series` and resets nothing: reactivation must not re-issue invoice numbers already on filed documents.

- [ ] **Step 1: Write the failing tests — Review Focus 3**

Deactivating a branch with an attached warehouse is refused and `is_active` is **verified unchanged** in the DB; deactivating the main branch is refused; deactivating an empty non-main branch succeeds; reactivating does not alter `branch_number_series` (snapshot it, toggle twice, compare).

- [ ] **Step 2: Run them — FAIL**

- [ ] **Step 3: Implement the guard**

- [ ] **Step 4: Run them — PASS**

- [ ] **Step 5: Commit**

```bash
git add "app/api/branches/[id]/route.ts" tests/e2e/branch-admin.spec.ts
git commit -m "feat(branches): guard branch deactivation against attached rows"
```

---

### Task 6: Reassignment endpoint (warehouse, user, terminal)

**Files:**
- Create: `app/api/branches/reassign/route.ts`
- Modify: `app/api/pos-terminals/route.ts:219-220` (accept `branchId` instead of hard-coding `mainBranchId()`)
- Modify: `tests/e2e/branch-admin.spec.ts`

**Interfaces:**
- Consumes: `assertHeadOffice`.
- Produces: `POST /api/branches/reassign` with `{ kind: 'warehouse' | 'user' | 'terminal', id, branchId }`.

Rules per the spec:
- **User:** sets a real branch only. May **not** set `branch_id = NULL` and may **not** grant/revoke `all_branches` — branchless-without-grant is the silent-lockout state migration 134 prevents, and permissions belong to user management.
- **Last-administrator guard:** refuse any reassignment that would leave zero users holding `all_branches`.
- **Warehouse:** **refused**, not warned, while it has pending approvals, open shifts or open orders — name the counts. The main branch's last warehouse may not be moved out. Moving a warehouse moves its products and stock into another branch's view while past sales keep their stamped `sales_transactions.branch_id`; that asymmetry must appear in the UI copy (Task 7).
- **Terminal:** plain reassignment. Also let `POST /api/pos-terminals` accept a `branchId`, defaulting to `mainBranchId()` when omitted so existing callers are unaffected.

- [ ] **Step 1: Write the failing tests — Review Focus 2 and 4**

A branch-scoped user is refused for all three kinds **with the row verified unchanged**; a reassignment leaving zero `all_branches` holders is refused; a warehouse with a pending approval is refused; `branch_id = NULL` on a user is rejected; a terminal moves successfully and can then take a Z-reading in its new branch.

- [ ] **Step 2: Run them — FAIL**

- [ ] **Step 3: Implement the route and the `pos-terminals` change**

- [ ] **Step 4: Run them — PASS**

- [ ] **Step 5: Commit**

```bash
git add app/api/branches/reassign/route.ts app/api/pos-terminals/route.ts tests/e2e/branch-admin.spec.ts
git commit -m "feat(branches): reassign warehouses, users and terminals between branches"
```

---

### Task 7: The branch administration page

**Files:**
- Create: `app/(app)/settings/branches/page.tsx` and its components
- Modify: `tests/e2e/branch-admin.spec.ts`

**Interfaces:**
- Consumes: `GET`/`POST /api/branches`, `PATCH /api/branches/[id]`, `POST /api/branches/reassign`.
- Produces: no new server interface.

Lists branches with warehouse / user / terminal counts; create, edit, activate/deactivate; reassign a warehouse, user or terminal. Follow the existing settings pages (`app/(app)/settings/pos-terminals/` is the closest analogue). **Every write must send the session uid** via `lib/session-uid.ts` (`getSessionUid` / `appendSessionUid`) — Phase 1 shipped a filtered API whose own UI then 403'd because its clients sent no uid.

The warehouse-reassignment control must state in copy that stock and history move with the warehouse while filed sales stay with the branch that issued them.

- [ ] **Step 1: Write a page-level test**

Drive the page: create a branch, then confirm the outgoing request **carries `uid`** (intercept with `page.route` and assert the body/query), and that the branch appears in the list. Phase 2b proved a server-contract test still passes when a client silently drops its uid — only a page-level test catches that.

- [ ] **Step 2: Run it — FAIL (page does not exist)**

- [ ] **Step 3: Build the page**

- [ ] **Step 4: Run it — PASS.** Then `npx playwright test tests/e2e/branch-admin.spec.ts --reporter=line` all green.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/settings/branches" tests/e2e/branch-admin.spec.ts
git commit -m "feat(branches): add the branch administration settings page"
```

---

### Task 8: Document, then gate on the full suite

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Branches and Sta. Lucia sections**

Record: reading numbers are unique **per terminal** (both tables), so two registers can close the same day; the Sta. Lucia claim is keyed per (terminal, reading number) and **why** (the bare-`reading_number` PK would have made a second terminal's sales silently unreported); branch administration lives at `settings/branches` and is gated on `all_branches`; terminals now carry an assignable branch.

State the limitation plainly: **if the mall's API dedupes on the payload `id`, two terminals' same-numbered Z-readings may still collide on their side — we cannot see their semantics.** Do not claim this is fully solved.

- [ ] **Step 2: Spot-check at least three claims against the code**

Phase 2b and 2c both shipped a CLAUDE.md overclaim that a review caught. Verify each sentence.

- [ ] **Step 3: Full suite as the phase gate**

Precondition: `powershell -c "(Get-Process node).Count"` is 0 (`playwright.config.ts` sets `reuseExistingServer`; a stale server invalidates guard tests).
Run: `npm run test:e2e`
Expected: **≥346 passed**, and **every** failure outside the known 23 attributed individually before merge. Do not accept "probably pre-existing".

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record per-terminal reading numbers and branch administration"
```

---

## Self-Review

**1. Spec coverage.** Piece A → Tasks 1–2 (the Sta. Lucia half is Task 2, which the spec's post-builder-check correction made mandatory). Piece B → Tasks 3–7. Docs/gate → Task 8. Every post-builder-check decision appears: terminal assignment (Task 6), grant-only head-office check (Task 3), `POST /api/branches` retrofit (Task 4), user reassignment restrictions + last-admin guard (Task 6), warehouse refusal-not-warning (Task 6), deactivation keeps the series (Task 5), `code` immutable + audited BIR edits (Task 4), `INFORMATION_SCHEMA` index lookup (Task 1), API-level red test (Tasks 1–2).

**2. Step scan.** Each code step names a file and the decisions the implementer cannot make alone; test steps carry assertions with the spec's values. No step says "handle edge cases".

**3. Type consistency.** `assertHeadOffice(uid: string): Promise<void>` is defined in Task 3 and used by that name in 4, 5, 6. The reassign payload `{ kind, id, branchId }` is used identically in Task 6 and Task 7. `BranchResolutionError` / `branchErrorResponse` match `lib/branch-context.ts` as read.

**4. Review Focus.** All five mapped: 1→T2, 2→T4/T5/T6, 3→T5, 4→T6, 5→T1.

**5. Proportion.** Eight tasks over ~13 files for a spec of comparable length; no task restates another's code.

**Noted during review:** Task 2 must not be reordered before Task 1 — its test only reproduces the bug once the composite reading key exists. Task 1 shipped alone would be a regression (silent mall under-reporting), so the two must land together or not at all.
