# Multi-Branch Phase 1 — Outcome and Phase 2 Handoff

**Date:** 2026-10-14
**Branch:** `feat/multi-branch-phase1` (22 commits, 78 files, ~+2700/−91)
**Plan:** [2026-10-12-multi-branch-phase1.md](2026-10-12-multi-branch-phase1.md)
**Spec:** [../specs/2026-10-12-multi-branch-design.md](../specs/2026-10-12-multi-branch-design.md)
**Status:** All 10 tasks complete. 10 task reviews + 1 whole-branch review, all
spec-compliant. Branch deliberately **not merged** — Phase 2 lands on top of
it so writes and BIR numbering arrive together (see *Why this is not merged*).

## What shipped

- `branches` table holding per-establishment BIR identity (permit, MIN,
  serial, TIN, business name, address).
- `branch_id` on `warehouses`, `pos_terminals` (both `NOT NULL`, FK
  `RESTRICT`) and `users` (nullable, FK `SET NULL`; NULL + the
  `all_branches` permission = head office).
- `lib/branch-context.ts` — the only place a branch is resolved. Resolution
  is server-side: `pos_terminals.branch_id` for POS, a per-request
  `users.branch_id` lookup for back-office. Every failure path fails closed
  (403); no path falls back to the main branch.
- 21 GET-only API routes branch-filtered; 7 exempt with an in-code reason.
- `POST /api/branches` creates additional branches **inactive** while
  `transaction_references` is a single global row.
- Migrations 130–134, each reversible and idempotent.

## Why this is not merged

Phase 1 isolates **reads only**. Write-bearing routes were rescoped out by the
product owner on 2026-10-13 after an audit found 133 client files call the API
but only 10 read the session — filtering everything would have returned 403
across much of the app.

Merging Phase 1 alone would put `main` in a state that delivers no usable
capability (a second branch cannot be activated until Phase 2's numbering
lands) while carrying the gaps below. Holding the branch costs nothing and lets
both phases merge as one coherent change.

**Merge Phase 1 alone instead if:** other work is about to touch
`warehouses` / `users` / `pos_terminals` / the report routes (78 changed files
will conflict), or Phase 2 slips by weeks and the schema is worth banking.

## Known gaps carried into Phase 2

Ordered by how much they matter.

1. **Writes are not branch-isolated.** A crafted write can still reach another
   branch's stock. 13 write-only and 16 mixed routes are unfiltered. This is
   Phase 2's first item, with its own client-wiring step.
2. **`transaction_references` is still one global row.** A second *active*
   branch would interleave one BIR invoice series across two registered
   establishments. Task 10's guard forces new branches inactive; **do not
   remove that guard before per-branch numbering exists.**
3. **Two routes knowingly read across branches**, each commented in place:
   - `app/api/approvals/queue` — `approval_queue` has no branch column; the
     spec schedules `approval_queue.branch_id` for Phase 4 with the approval
     write path, and the warehouse a queued item concerns sits in free-form
     `transaction_data` JSON.
   - `app/api/reports/soa` — a Statement of Account balance is only correct
     over the full ledger; a branch cut would display **wrong balances**,
     which is worse than the read leak.
4. **`app/api/sales/transactions/route.ts:513` inserts `terminalId || null`.**
   A sale with a NULL `terminal_id` is head-office-visible only, so it silently
   drops out of a branch user's dashboard and BIR summary — an under-report of
   a tax figure. The fix is on a write path, hence Phase 2.
5. **Migration 134 is one-shot.** An admin-type user created *later* defaults
   to the main branch and is not auto-granted `all_branches`; promotion is
   explicit. Phase 5's branch admin UI should expose this.
6. **`terminalBranchFilter` / `saleBranchFilter` interpolate a column-name
   argument into SQL.** All 10 call sites pass hardcoded literals and the doc
   comments state the constraint, so no injection path exists today. A
   `type TerminalColumn = 'pt.terminal_id' | 'terminal_id'` union would make it
   unforgeable at compile time for ~2 lines.

## Load-bearing contracts (do not break these in Phase 2)

- `warehouseIdsForBranch(scope)` returns `string[] | null`. **`null` = head
  office = apply no filter. `[]` = a branch owning no warehouses = match
  NOTHING.** Reading `[]` as "no filter" leaks every branch. Verified
  individually across all call sites in the Phase 1 review.
- Sales-level tables (`sales_transactions`, `sale_items`, `sales_invoices`)
  have no warehouse column, so a sale belongs to a branch through the terminal
  that rang it (`pos_terminals.branch_id`). `inventory_batches` is the
  exception: it scopes through its product's `warehouse_id`.
- The four BIR routes (`sales/ejournal`, `sales/bir-summary`,
  `sales/overall-reading`, `reports/fiscal-year`) may narrow **only the set of
  rows read**. No SUM, VAT split, SI/OR range, running balance or sequence
  expression may change.
- A user with no branch and no `all_branches` gets 403 from every filtered
  route. Any new user-creation path must supply `branch_id` — three were
  missed during Phase 1 and fixed (`POST /api/users`, the cloud pull sync in
  `lib/scheduler.ts`, and migration 134 for pre-existing users).

## Pre-existing issues found but deliberately not fixed

Not caused by this branch; each is worth its own fix.

- **`npm run lint` is broken repo-wide.** `next lint` was removed in Next 16,
  so the script resolves `lint` as a directory and fails on every branch. The
  plan's "lint must pass" constraint was waived; `npm run typecheck` gated
  every commit instead.
- **~24 e2e failures on `main`**, independent of this work: stale `Retail (₱)`
  selectors (`add-product`, `price-level-tiers`, `purchase-order-add-product`,
  `selling-units`), UI drift (`pricing`, `import-wizard`, `login`,
  `dashboard-matte`, `sidebar-panel`). Proven pre-existing — those specs and
  their UI directories are byte-identical between `main` and this branch.
- **The full suite cannot currently complete in one run.** A verification run
  on 2026-10-14 reported 132 failed / 90 passed / 35 did not run, which looks
  alarming but is an infrastructure failure, not a regression: the dev server
  on port 3100 died partway through, and 110 of the 132 are
  `ECONNREFUSED ::1:3100` cascade failures from tests that had no server to
  talk to. Only **22 tests failed before the crash**, matching the ~24 known
  pre-existing failures. A contributing cause appears in the log:
  `TypeError: query is not a function` at `lib/external-api-config.ts:83`,
  raised from the `node-cron` scheduler ticks — a dynamic
  `await import('./mysql')` whose destructured `query` is undefined under this
  repo's CJS/ESM interop. That file is **unmodified by this branch**. The
  scheduler firing during tests at all is the same side effect noted above,
  and Phase 3's scheduler lease should address the root design.

  **Phase 1's own specs were verified separately and pass: 29/29** across
  `branch-context.spec.ts`, `branches-api.spec.ts` and
  `branch-isolation-api.spec.ts`. Until the server-stability issue is fixed,
  verify this branch with those three specs plus targeted runs rather than a
  single full-suite invocation.
- **Two endpoints 500 at baseline:** `transactions/all-references` (missing
  `reference` column on `purchase_orders` and `stock_adjustments`) and
  `/api/sales/by-product?terminalId=` (`u.id` should be `u.uid`).
- **`app/api/auth/signup/route.ts` is broken** — it inserts into columns absent
  from the `users` schema (`id`, `email`, `full_name`, `role`, `is_active`).
  The API-authentication spec also flags it as a second unauthenticated
  user-creation path.
- **`importing lib/mysql` starts the schedulers as a side effect**, so any
  script importing it never exits on its own. Phase 3's scheduler lease should
  address the underlying design.

## Plan defects found during execution

Recorded because the Phase 2 plan should avoid the same shape. The plan was
accurate about schema and the context library; it was weakest on integration
edges — every defect was an edge where new constraints met existing code.

1. `NOT NULL` on `branch_id` broke three production INSERT paths (warehouse and
   terminal creation) that the plan never touched.
2. A fourth broken INSERT site in `app/api/data-management/reset/route.ts`.
3. The plan filtered the API without wiring any client to send `uid`, so the
   first filtered endpoint 403'd its own report pages.
4. Migration 132 left every user's `branch_id` NULL with nothing able to set
   it — a full lockout after upgrade, caught only by the final whole-branch
   review.
