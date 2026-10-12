# Multi-Branch Support

**Date:** 2026-10-12
**Status:** Awaiting review

## Problem

The system runs one store. Multiple physical stores cannot be operated from
one installation, and the pieces that would make that work are either missing
or actively single-store:

| Area | Today | Why it blocks multi-branch |
|---|---|---|
| Location hierarchy | `warehouses` with an `is_main` flag | No store identity above the warehouse |
| `products` | `UNIQUE KEY sku_warehouse (sku, warehouse_id)` | Already per-warehouse — the one piece that works |
| `transaction_references` | **one global row at `id = 1`** | All stores would draw from one SI/MC/OR sequence |
| `sales_transactions.si_number`, `pos_transactions.si_number` | `UNIQUE` (global) | Two branches both issuing `000001` violates the constraint |
| `pos_terminals` | no branch link; holds `permit_no`/`min_number`/`serial_number` | Terminals float free of any store |
| `users` | no location column at all | Everyone sees everything |
| Session | `{uid, userType, permissions[]}` in `localStorage` | No branch, and unsigned/forgeable |
| `pos_settings` | one global row, read with `LIMIT 1` (18 call sites) | `business_name`/`address`/`tin` print on receipts and are per-establishment |
| `approval_workflows` | steps assigned to a **role** | Any Manager could approve another store's stock or price changes |
| `initScheduler()` | once per process; `*/2` sweep and `:05` Sta. Lucia cron | One server per terminal + shared DB = N racing schedulers |

The BIR dimension makes this more than a reporting feature. Each branch is its
own registered establishment with its own Permit to Use, MIN, serial, and its
own invoice series starting at 1. A shared sequence, a cross-branch approval,
or a duplicated Sta. Lucia submission all have tax or rent consequences.

## Decisions

Confirmed with the product owner (2026-10-12):

- **D1 — Deployment: separate stores, one shared central MySQL.** No
  per-branch local DB, no branch-to-branch sync, no reconciliation. Every
  terminal in every branch queries the same database live.
- **D2 — Each branch is separately BIR-registered.** Own permit, MIN, serial,
  and own SI/OR series starting at 1. Z-readings and e-journals are filed per
  branch and are never consolidated.
- **D3 — Branch owns warehouses.** A new `branches` table sits above
  `warehouses`; products stay warehouse-scoped exactly as they are today. The
  inventory engine is not touched.
- **D4 — Users are assigned to one branch**, plus a head-office capability
  that sees all branches and can switch between them.
- **D5 — Branch is server-derived, never client-asserted.** The client never
  tells the server which branch it is.
- **D6 — Consolidated head-office reports are in scope** for this phase.
- **D7 — Inter-branch stock transfers are allowed, with a two-sided
  approval**: the sending branch releases, the receiving branch accepts.
- **D8 — Master data is shared company-wide**: suppliers, customers,
  categories, brands, accounts, roles. Only inventory, sales, and BIR
  documents are branch-scoped.
- **D9 — Approvers must be in the transaction's branch** (head office may
  approve anywhere).
- **D10 — `pos_settings` splits**: receipt/BIR identity moves to the branch;
  policy and behaviour flags stay one global row.

## Why server-derived branch, and why this does not wait on API auth

The [API authentication design](2026-10-05-api-authentication-design.md) is
approved but **not implemented**: there is no `middleware.ts`, no auth guard,
no signed session, and routes read `uid` from the request body. Verified
2026-10-12 — `middleware.ts`, `lib/auth-guard.ts`, and `lib/session.ts` do not
exist.

Branch isolation is an authorization feature, so building it on that session
needs care. If `branchId` were simply added to the `localStorage` session, any
cashier with devtools could retype it and ring sales against another branch's
BIR series, move its stock, or read its Z-readings.

The design therefore never lets the client assert its branch:

- **POS / terminal requests** — branch comes from `pos_terminals.branch_id`,
  a property of the machine's server-side registration.
- **Back-office requests** — `users.branch_id` is re-read from the database on
  every request, keyed by `uid`.

A forged session can still lie about *who* it is. That is the existing auth
hole and it is unchanged by this work — closing it remains the auth phase's
job. What a forged session cannot do is lie about *which branch that identity
belongs to*, because the branch is looked up server-side from the identity
rather than carried alongside it. Isolation holds under the current session
model, and improves automatically once auth lands.

## Scope

### In scope

Branch identity and hierarchy; server-side branch context; per-branch BIR
numbering; branch-scoped approvals; inter-branch transfers; the scheduler
single-writer guard; branch management and switching UI; a branch dimension on
the 12 report endpoints.

### Out of scope (deliberately)

- **Offline resilience.** See Known limitations.
- **API authentication.** Tracked by its own approved spec. This work neither
  depends on it nor widens the hole.
- **Per-branch master data.** D8 keeps suppliers, customers, and lookups
  shared.
- **Per-branch policy settings.** D10 keeps approval switches and behaviour
  flags global.
- **Normalizing `userType` casing.** The auth spec already records that
  `'ADMIN'`, `'Admin'`, `'Super Admin'` and others all appear in comparisons.
  Head-office access therefore hangs off an explicit capability, not a string
  comparison, so this work does not add a new dependency on that casing.

## Architecture

### Hierarchy

```
branches (1) --< warehouses (N) --< products (N) --< inventory_batches
    |
    +--< pos_terminals (N)
    +--< users (N)
    +--1 transaction_references   (SI / MC / OR counters)
```

BIR and receipt identity (permit, MIN, serial, TIN, business name, address)
lives on `branches` itself, not on `transaction_references` — that table holds
only the counters.

### 1. `branches`

New table: `id`, `code` (short label for receipts and report columns), `name`,
`address`, `tin`, `contact_number`, `business_name`, `permit_no`,
`min_number`, `serial_number`, `is_main`, `is_active`, timestamps.

The BIR identity fields live here because they belong to the registered
establishment. `pos_terminals` keeps its own `permit_no`/`min_number`/
`serial_number` columns as per-machine values, with the branch supplying the
default — Philippine practice is a per-machine serial under a branch permit,
so both levels are real and neither can be dropped.

### 2. Columns added

- `warehouses.branch_id` — FK, `NOT NULL` after backfill. The existing
  `is_main` flag stays, now meaning "main warehouse *within* its branch".
- `pos_terminals.branch_id` — FK, `NOT NULL` after backfill.
- `users.branch_id` — FK, **nullable**; `NULL` means head office.
- An `all_branches` capability, granted through the existing
  `user_permissions` mechanism rather than inferred from `user_type`.

`products`, `inventory_batches`, `stock_movements`, `product_shelves` and the
rest of the inventory tables are **unchanged**. They are already keyed by
warehouse, and warehouse now implies branch.

### 3. Per-branch numbering

`transaction_references` goes from a single `id = 1` row to one row per
branch, keyed by `branch_id`.

`getNextSINumber()`, `getNextMCNumber()` and `getNextBirOrNumber()`
([lib/mysql.ts:248](../../../lib/mysql.ts#L248) and following) each gain a
**required** `branchId` parameter. Required rather than optional-with-default
so that every call site fails typecheck and gets reviewed, instead of
silently drawing from the first branch's series.

`getNextZReadingNumber(terminalId)`
([lib/mysql.ts:217](../../../lib/mysql.ts#L217)) needs **no change** — it
already increments `pos_terminals.z_counter` per terminal, and a terminal
implies a branch.

Gaplessness is preserved: the atomic `UPDATE ... WHERE branch_id = ?` followed
by a read-back on the same connection keeps exactly the transaction semantics
the global counter has today, only row-scoped. The existing contract that the
caller must pass the *same* connection as the inserting statement is unchanged
and still load-bearing.

**The global `UNIQUE` on `si_number` must be replaced.** Migration 083 added
`si_number VARCHAR(50) DEFAULT NULL UNIQUE` to both `sales_transactions` and
`pos_transactions`. Per-branch sequences mean two branches legitimately both
issue `000001`, which that constraint rejects. Both tables get `branch_id`
and the uniqueness becomes composite `(branch_id, si_number)` — still
enforcing no duplicates within a branch, which is the BIR requirement.

### 4. Branch context

New `lib/branch-context.ts` — the single source of truth:

```
resolveBranch(request) -> { branchId, scope: 'single' | 'all' }
```

- POS/terminal: `branchId` from `pos_terminals.branch_id`.
- Back-office: `users.branch_id`, re-read from the DB per request.
- A head-office user may pass `viewBranchId` to switch; it is validated
  against the `all_branches` capability, also re-read from the DB.
- A passed `warehouse_id` is validated to belong to the resolved branch and
  rejected with 403 otherwise. This is the check that stops a crafted request
  from reaching another branch's stock.

The 57 API routes that query `products`, `sales`, or `inventory_batches`
derive their warehouse filter from branch context rather than trusting a
caller-supplied `warehouse_id`.

### 5. Branch-scoped approvals

`checkApprovalRequired()` and `submitToApprovalQueue()`
([lib/approvals.ts](../../../lib/approvals.ts)) resolve workflow steps by
role only, so a step is satisfied by any user holding that role in any branch.

The approver query gains a branch condition: a step is satisfied only by a
user whose `branch_id` matches the transaction's branch, or who holds
`all_branches`. `approval_queue` rows carry the transaction's `branch_id`, and
the Approvals pages filter by branch context like every other page.
`approval_history` inherits the branch from its queue row rather than storing
its own copy.

### 6. Inter-branch transfers

A warehouse transfer already moves stock across two warehouse-scoped
`products` rows under a `STOCK_TRANSFER` approval
([2026-10-09 consolidation spec](2026-10-09-consolidate-transfers-into-bulk-adjustment-design.md)).
A cross-branch transfer is that same write path with the two warehouses in
different branches — so it reuses it, and adds one stage rather than a new
mechanism:

```
sending branch releases  ->  stock leaves source warehouse, in transit
receiving branch accepts ->  stock lands in destination warehouse
```

Until the receiving branch accepts, the stock is out of the source branch and
not yet in the destination. This matters for BIR: both branches' stock
positions must be defensible at any moment, and stock must never be countable
in two establishments at once. The transfer is visible as in-transit to both
branches and to head office.

Rejection by the receiving branch returns the stock to the source warehouse.
A single-branch transfer (both warehouses in one branch) keeps today's
one-stage behaviour unchanged.

### 7. Scheduler single-writer guard

`initScheduler()` ([lib/scheduler.ts:560](../../../lib/scheduler.ts#L560))
runs once per Node process and registers a `*/2 * * * *` sync sweep and a
`5 * * * *` Sta. Lucia hourly cron. The project runs one local server per
physical terminal against a shared DB, so today a multi-terminal store
already runs racing schedulers — recorded in CLAUDE.md as a single-terminal
limitation and as the reason not to enable hourly Sta. Lucia submission on a
multi-terminal store.

Multi-branch turns a documented limitation into a certainty: every terminal
in every branch sweeps the same tables. Sta. Lucia double-submission
double-reports revenue, and Philippine mall rent is commonly a percentage of
reported sales.

A new `scheduler_leases` table fixes it: each job acquires a named lease via a
conditional `UPDATE` with a TTL, only the holder runs the tick, and a stale
lease is taken over after expiry. This is the same claim/takeover idiom
`sta_lucia_submissions` and `sta_lucia_hourly_submissions` already use, so it
is a familiar pattern here rather than a new one.

Lease names are **per branch** for branch-specific jobs
(`sta_lucia_hourly:<branch_id>`) — each branch is a separate mall tenant with
its own submission series and must not share a lease. Store-wide jobs such as
the sync sweep take a single global lease.

This is in scope because enabling multi-branch without it causes duplicate
rent and tax submissions on day one.

### 8. Settings split

Receipt/BIR identity moves from `pos_settings` to `branches`:
`business_name`, `address`, `tin`, `contact_number`, `min_number`,
`serial_number`, `operated_by`.

Policy and behaviour stay one global row: the `require_*_confirmation`
switches, `currency_*`, `timezone`, `date_format`, print and auth toggles,
`enable_negative_inventory`, batch-costing flags.

The 18 `FROM pos_settings ... LIMIT 1` call sites are audited: those reading
identity fields move to branch context; those reading policy keep the global
read. `lib/receipt-generator.ts` and the e-journal builders take identity from
the branch.

### 9. UI

- **Branch management** under settings — CRUD branches, assign warehouses /
  terminals / users, set BIR identity. Follows the settings-hub catalog
  pattern (`092d7b7`).
- **Branch switcher** in the sidebar, rendered only for `all_branches` users,
  reusing the existing inline-select idiom.
- **POS** — branch is implicit from the terminal and is not selectable. The
  branch's name, address, TIN, permit and MIN print on receipts.
- **Reports** — the 12 endpoints under `app/api/reports/` gain a branch
  dimension. Branch-scoped users get their own branch implicitly; head office
  gets "All branches" consolidated totals plus a per-branch breakdown.
  **Z-readings and e-journals stay strictly per-branch and are never
  consolidated**, because each is a per-establishment BIR filing.

## Migration and backfill

Ordered so that no step leaves the system unable to sell:

1. Create `branches`, `scheduler_leases`.
2. Create one branch from the current `pos_settings` identity values; mark it
   `is_main`.
3. Add `branch_id` as nullable to `warehouses`, `pos_terminals`, `users`,
   `sales_transactions`, `pos_transactions`, and `approval_queue`.
4. Backfill every existing warehouse, terminal, and historical transaction to
   that branch. Leave `users.branch_id` NULL only for intended head-office
   accounts.
5. Tighten `warehouses.branch_id` and `pos_terminals.branch_id` to `NOT NULL`.
6. Re-key `transaction_references` to per-branch, moving the current `id = 1`
   counter values into the migrated branch's row.
7. Drop the global `UNIQUE` on `si_number` on both tables; add composite
   `(branch_id, si_number)`.

**The existing SI sequence continues unbroken** for the migrated branch.
Resetting or gapping it is a BIR violation, so step 6 carries the current
values across rather than starting fresh.

Every migration has a working `down()`. Step 6 and step 7 are the two that
cannot be partially applied — each must be a single transaction.

## Testing

E2E stays `workers: 1` per the project constraint.

- **Isolation** — two branches seeded; a branch-A user cannot read or write
  branch-B products, stock, or sales. Asserted directly against the API with a
  session whose branch has been tampered with, proving server-derivation
  rather than UI filtering.
- **Numbering** — interleaved sales in two branches produce independent,
  gapless series; the composite unique constraint accepts the same
  `si_number` in two branches and rejects a duplicate within one.
- **Transfers** — a cross-branch transfer is not countable in both branches
  while in transit; a rejection returns stock to the source; a same-branch
  transfer behaves exactly as before.
- **Approvals** — a branch-A manager cannot approve a branch-B transaction; a
  head-office user can approve either.
- **Scheduler leases** — two concurrent processes, one tick executes.
- **Reports** — consolidated totals equal the sum of per-branch figures; a
  Z-reading is never consolidated.

## Known limitations

**No offline fallback.** D1 puts every branch on one central MySQL, so a
branch that loses its network link cannot sell at all — there is no local
queue or degraded mode. For Philippine retail this is a real operational
exposure (brownouts, ISP drops). The product owner accepted this trade-off on
2026-10-12 in exchange for avoiding per-branch sync and reconciliation. The
schema here does not prevent adding an offline queue later: branch identity
lives on the terminal, so a terminal already knows which branch's sequence it
would draw from.

**Central MySQL becomes a single point of failure** for the whole chain rather
than for one store. Backup and availability planning for that host is outside
this spec but becomes materially more important once more than one branch
depends on it.

**Identity remains forgeable** until the API authentication phase lands. This
work bounds the damage to "a forged identity acts within *its own* branch"
rather than eliminating it.

## Implementation size

Roughly 20 migrations; 57 API routes touching core tables; 12 report
endpoints; 18 `pos_settings` call sites; plus branch management UI, the
switcher, and receipt/e-journal identity changes.

This is too large for one pass. The implementation plan should phase it:
schema and branch context first, then numbering, then transfers and
approvals, then the scheduler guard, then reports and UI. Phasing is the
planning step's job, not this spec's.
