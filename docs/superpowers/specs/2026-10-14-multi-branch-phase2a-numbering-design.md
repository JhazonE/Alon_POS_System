# Multi-Branch Phase 2a — Per-Branch BIR Numbering

**Date:** 2026-10-14
**Status:** Awaiting review
**Builds on:** [Phase 1 outcome](../plans/2026-10-12-multi-branch-phase1-outcome.md)
**Parent design:** [2026-10-12-multi-branch-design.md](2026-10-12-multi-branch-design.md)

## Problem

Phase 1 delivered branch identity and read isolation but deliberately left BIR
numbering alone. `transaction_references` is still a single global row holding
every counter, so a second **active** branch would draw invoice numbers from
the same sequence as the main branch — one interleaved SI series across two
separately BIR-registered establishments. Philippine tax law requires each
establishment to file its own gapless series, so this is a filing defect.

`POST /api/branches` therefore creates additional branches **inactive**, which
means **multi-branch is not yet usable**: this phase is what unblocks it.

Three further obstacles, all verified against the live schema on 2026-10-14:

| Obstacle | Detail |
|---|---|
| **Import cycle** | `lib/mysql.ts:10` does `import './init-scheduler'` → `scheduler.ts` → back to `lib/mysql.ts`. Under Playwright's loader this throws `Cannot require() ES Module lib/mysql.ts in a cycle`, so `branch-context.spec.ts` fails in a full-suite run while passing 29/29 alone. |
| **Five global UNIQUE constraints** | Not the two the Phase 1 spec named. `si_number` on `sales_transactions` + `pos_transactions`, `bir_or_number` on both, and `mc_number` on `pos_transactions`. Each rejects the same number legitimately issued by two branches. |
| **Sales tables have no `branch_id`** | Phase 1 scoped them through `pos_terminals.branch_id`, so a composite unique key has nothing to key on. |

## Decisions

Confirmed with the product owner (2026-10-14):

- **D1 — Only the three BIR series go per-branch:** `si_number`,
  `bir_or_number`, `mc_number`. The nine internal document series (sales
  order, purchase order, delivery receipt, etc.) and `receipt_number` stay
  company-wide. Internal documents gain no legal benefit from restarting per
  branch, and a purchase order spanning branches would become confusing.
- **D2 — `branch_id` is added to `sales_transactions` and `pos_transactions`**
  and backfilled, rather than keeping branch membership terminal-derived. A
  terminal reassigned to another branch must not retroactively change which
  establishment its past sales belong to.
- **D3 — The main branch's series continues unbroken; new branches start at
  `000001`.** Resetting or gapping an existing series is a BIR violation, and
  a newly registered establishment starts its own series at 1.
- **D4 — Scheduler startup moves out of `lib/mysql.ts`** into a Next
  `instrumentation.ts` entry point, breaking the cycle at its source.
- **D5 — Phase 2 is split.** This spec is **2a**: the cycle fix, per-branch
  counters, `branch_id` on the sales tables, and the five constraints. **2b**
  covers the 29 write routes and their clients, in its own spec.
- **D6 — The scheduler single-writer lease stays in Phase 3.** 2a only moves
  *where* the scheduler starts; the lease needs its own design.

## Scope

### In scope

The import-cycle fix; a `branch_number_series` table; `branchId` as a required
parameter on the three BIR counter functions; `branch_id` on both sales tables
with backfill; converting the five UNIQUE constraints to composite; stamping
`branch_id` at write time on the sale-creating paths; removing the Phase 1
guard that forces new branches inactive.

### Out of scope (deliberately)

- **The 29 write routes' branch isolation** — Phase 2b. Until it lands, a
  crafted write can still reach another branch's stock.
- **The scheduler single-writer lease** — Phase 3.
- **Inter-branch transfers and branch-scoped approvals** — Phase 4.
- **Reports, branch management UI, receipt identity** — Phase 5.
- **The nine internal document series** — D1 keeps them company-wide.
- **`app/api/auth/signup/route.ts`** — already broken against this schema
  (inserts `id`, `email`, `full_name`, `role`, `is_active`, none of which
  exist on `users`). Fixing it belongs with the API-authentication phase.

## Architecture

### 1. Break the import cycle — first, before anything else

```
now:    lib/mysql.ts → lib/init-scheduler.ts → lib/scheduler.ts → lib/mysql.ts  ⟲
after:  instrumentation.ts → lib/scheduler.ts → lib/mysql.ts                     (acyclic)
```

- Delete `import './init-scheduler'` from
  [lib/mysql.ts:10](../../../lib/mysql.ts#L10).
- Create `instrumentation.ts` at the repo root whose `register()` calls
  `initScheduler()`. Next 16 supports this hook and the repo has none today.
- Delete `lib/init-scheduler.ts`. Its `setImmediate` wrapper exists only to
  dodge the temporal-dead-zone symptom of this cycle; with the cycle gone the
  workaround is dead weight, and its own comment explains why it was needed.
- Electron: `main.js` spawns the Next server as a child process, so the
  instrumentation hook covers it. Confirm during implementation that the
  desktop build still starts its crons.

This is sequenced first because every later task needs a trustworthy test
suite. It also removes three long-standing nuisances: schedulers booting
inside every Playwright worker and every `tsx` one-liner (log noise that
swallows script stdout), the `TypeError: query is not a function` raised from
`lib/external-api-config.ts:83` on scheduler ticks, and
`branch-context.spec.ts`'s full-suite failure.

### 2. `branch_number_series`

A new table, rather than re-keying `transaction_references`:

```sql
branch_number_series
  branch_id      VARCHAR(50)  NOT NULL PRIMARY KEY,
  si_number      VARCHAR(20)  NOT NULL DEFAULT '000000',
  mc_number      VARCHAR(20)  NOT NULL DEFAULT '000000',
  bir_or_number  VARCHAR(20)  NOT NULL DEFAULT '000000',
  created_at     TIMESTAMP,
  updated_at     TIMESTAMP,
  CONSTRAINT fk_bns_branch FOREIGN KEY (branch_id)
    REFERENCES branches (id) ON DELETE RESTRICT
```

**Why a new table.** `transaction_references` holds 17 columns, 14 of which
stay company-wide under D1. Re-keying it would force every reader of those 14
to become branch-aware for no benefit, and `getNextReference(type)` — a generic
helper that interpolates a column name and serves nine series — would have to
change. A separate table makes the legal boundary explicit: *this* table holds
the series BIR cares about, keyed by establishment. `transaction_references`
keeps its `id = 1` row and its existing readers untouched.

`ON DELETE RESTRICT` because a branch's issued invoice series must not vanish
with the branch row.

**Seeding.** The migration copies the main branch's current `si_number`,
`mc_number` and `bir_or_number` values across from `transaction_references`,
continuing the sequence (D3). Every other existing branch seeds at `'000000'`.
The old columns stay in place, unread by the new code, as a recovery
reference; dropping them is a later cleanup, not this phase's risk to take.

### 3. Counter functions

`getNextSINumber`, `getNextMCNumber` and `getNextBirOrNumber`
([lib/mysql.ts:248, :275, :304](../../../lib/mysql.ts#L248)) each gain a
**required** `branchId: string` first parameter — required, not
optional-with-default, so every call site fails typecheck and gets reviewed
rather than silently drawing from one branch's series.

**The actual invocations are only three, in two files** — audited 2026-10-14
with `grep -rnE "await (getNextSINumber|getNextMCNumber|getNextBirOrNumber)\("`:

| File | Line | Call |
|---|---|---|
| `app/api/pos/checkout/route.ts` | 161 | `getNextSINumber(connection)` |
| `app/api/pos/checkout/route.ts` | 162 | `getNextBirOrNumber(connection)` |
| `app/api/sales/returns/route.ts` | 35 | `getNextMCNumber(connection)` |

`app/api/sales/x-reading/route.ts` and `app/api/sales/bir-summary/route.ts`
only *mention* these functions in explanatory comments; they do not call them.
Implementation must not "fix" those files.

Both call sites run inside a `withTransaction` and already pass `connection`,
so the branch must be resolved **before** the transaction opens and passed in —
resolving inside would take a second pool connection and risk a deadlock, the
same constraint Phase 1 hit in `POST /api/users`. The POS checkout resolves
from its terminal via `resolveTerminalBranch`; the returns route resolves from
the originating sale's `branch_id` (added in §4), falling back to its terminal.

**`app/api/data-management/reset/route.ts` is a separate case.** It does not
call the counter functions; it writes `transaction_references` directly, in
two places with *different* mechanics (both verified 2026-10-14):

- **line 56** (clear-master-data):
  `UPDATE transaction_references SET si_number = '000000' WHERE id = 1`
- **line 287** (factory reset): `TRUNCATE TABLE transaction_references`
  followed by an `INSERT` that re-seeds the columns, including `si_number`

Both must also reset `branch_number_series` — the `TRUNCATE` path in
particular, because truncating `transaction_references` now leaves the series
the system actually reads completely untouched. **This is the most
BIR-dangerous change in the phase:** a reset that clears the sales tables but
leaves a stale counter re-issues invoice numbers that already exist on filed
documents. A reset must either clear both or neither.

Note `branch_number_series` has an `ON DELETE RESTRICT` FK to `branches`, so
the reset must `DELETE`/`UPDATE` its rows rather than truncate the branch
table.

A repo-wide audit for live writes to those columns found exactly these two
sites; the other matches are historical migrations (084, 085, 091, 098),
which must **not** be touched — rewriting an applied migration changes history
other installations have already run.

**Gaplessness is preserved unchanged.** The atomic
`UPDATE … SET si_number = LPAD(… + 1) WHERE branch_id = ?` followed by a
read-back on the *same connection* keeps exactly the semantics the global
counter has today, only row-scoped. The existing contract that callers pass
the same connection as the inserting statement — so the number rolls back with
a failed transaction — is unchanged and still load-bearing.

`getNextZReadingNumber` and `getNextXReadingNumber` need **no change**: they
already increment per-terminal counters on `pos_terminals`, and a terminal
implies a branch.

`getNextReference(type)` and `getNextReceiptNumber` need **no change** (D1).

### 4. `branch_id` on the sales tables

Added to `sales_transactions` and `pos_transactions`, `VARCHAR(50) NULL`
initially, backfilled from `pos_terminals.branch_id` through each sale's
terminal, then tightened to `NOT NULL` with a FK.

**The backfill's one real gap.** `app/api/sales/transactions/route.ts:513`
inserts `terminalId || null`, so historical sales exist with a NULL
`terminal_id` and no derivable branch. Those rows are assigned the **main
branch**: on a single-store installation that is factually where they were
rung, and the alternative — leaving them NULL — would block the `NOT NULL`
tightening and keep them invisible to every branch user. That same route is
fixed to stamp `branch_id` at write time so the gap does not recur.

**Both sale-creating paths must stamp `branch_id`:** `POST /api/pos/checkout`
and `POST /api/sales/transactions`. Phase 1 established the lesson that a
missed insert path fails at runtime rather than at typecheck, so
implementation sweeps for `INSERT INTO (sales_transactions|pos_transactions)`
across `app/`, `src/` and `lib/` and reports every site found.

**Simplification this unlocks.** Phase 1's `terminalBranchFilter` and
`saleBranchFilter` build `IN (SELECT id FROM pos_terminals WHERE branch_id = ?)`
subqueries. With `branch_id` on the sale itself these become a direct column
comparison — cheaper, and immune to a terminal being reassigned later. Phase
2a converts the call sites it touches; the helpers stay for anything not yet
migrated and are removed when the last caller is gone.

### 5. The five UNIQUE constraints

Each becomes composite with `branch_id`, preserving "no duplicates within a
branch" — which is the BIR requirement — while allowing two branches to each
issue `000001`.

| Table | Column | Existing index |
|---|---|---|
| `sales_transactions` | `si_number` | `si_number` |
| `pos_transactions` | `si_number` | `si_number` |
| `sales_transactions` | `bir_or_number` | `idx_sales_transactions_bir_or_number` |
| `pos_transactions` | `bir_or_number` | `idx_pos_transactions_bir_or_number` |
| `pos_transactions` | `mc_number` | `idx_pos_transactions_mc_number` |

Ordering is forced: add `branch_id` → backfill → tighten to `NOT NULL` → swap
constraints. The swap must be **one transaction per table**; a half-applied
swap leaves a window with no uniqueness guarantee at all, during which a
duplicate invoice number could be written.

### 6. Remove the Phase 1 guard

`POST /api/branches` currently counts rows in `transaction_references` and
forces new branches inactive. With per-branch numbering in place that guard is
obsolete, and its detection rule (`COUNT(*) > 1` on a table this phase stops
using for BIR series) would be wrong anyway. It is replaced by a check that
the branch has a `branch_number_series` row, and new branches are created
active again. The `warning` field disappears from the response.

This is the step that makes multi-branch usable, so it comes **last**, after
numbering is proven by tests.

## Migration order

Migration numbers start at **135** (134 is the last existing).

1. `135_create_branch_number_series` — table plus FK.
2. `136_seed_branch_number_series` — main branch continues from
   `transaction_references`; other branches seed at `'000000'`.
3. `137_add_branch_id_to_sales` — nullable column on both sales tables.
4. `138_backfill_sales_branch_id` — from the terminal; NULL-terminal rows to
   the main branch.
5. `139_tighten_sales_branch_id` — `NOT NULL` + FK, aborting with a message
   naming the table if any row is still NULL.
6. `140_composite_bir_unique_keys` — the five constraint swaps, one
   transaction per table.

Every migration has a working `down()`. Steps 5 and 6 cannot be partially
applied.

## Testing

E2E stays `workers: 1`.

- **`branch-context.spec.ts` passes in a FULL-SUITE run**, not only alone.
  This is the acceptance test for the cycle fix and must be asserted as part
  of it.
- **Per-branch sequences:** interleaved sales in two branches produce
  independent, gapless series.
- **Composite constraints:** the same `si_number` is accepted in two branches
  and rejected as a duplicate within one. Same for `bir_or_number` and
  `mc_number`.
- **Continuity:** the main branch's SI sequence continues across the migration
  with no gap and no reset — asserted against the pre-migration value.
- **Rollback:** a failed sale rolls its SI number back with the transaction,
  leaving no gap (the existing same-connection contract).
- **Backfill:** every historical sale ends with a non-NULL `branch_id`, and
  NULL-terminal sales land in the main branch.
- **Activation:** a second branch can be created **active** once its series
  row exists.
- **Reset parity (both paths):** after clear-master-data and after a factory
  reset, `branch_number_series` is reset in step with the sales tables — never
  left holding a counter higher than the highest remaining invoice. Asserted
  for both reset routes, because this is the path that would re-issue an
  already-filed invoice number.
- **Historical migrations untouched:** migrations 084, 085, 091 and 098 are
  unchanged by this phase.

## Known limitations after 2a

- **Writes are still not branch-isolated** (Phase 2b). A crafted write can
  reach another branch's stock. This is the largest remaining gap and should be
  stated to the operator before a second branch goes live with real staff.
- `app/api/approvals/queue` and `app/api/reports/soa` still read across
  branches, as documented in Phase 1.
- The nine internal document series remain company-wide by design (D1).
- `transaction_references`' three BIR columns become vestigial — read by
  nothing, kept as a recovery reference until a later cleanup.
