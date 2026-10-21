# Phase 3 — Operability: branch management UI + per-terminal reading numbers

**Status:** design, awaiting approval
**Date:** 2026-10-21
**Predecessors:** Phase 1 (branch identity + read isolation), Phase 2a (per-branch BIR
numbering), Phase 2b (API write isolation), Phase 2c (server-action write isolation)

---

## Intent and the why

Phases 1–2c built the multi-branch *machinery*: branch identity, read filtering, per-branch
BIR series, and write isolation on both the API and server-action paths. None of it is
**operable**. Two things block a real deployment, and they are unrelated to each other
except that both must be fixed before anyone can run a second branch or a second terminal.

**1. There is no way to manage branches.** `POST /api/branches` exists, but no page in the
app calls it — verified by grepping every `.tsx` for `api/branches`: zero hits. So creating
a branch, pointing a warehouse at it, or moving a user into it can only be done by hitting
the API by hand or editing MySQL directly. Everything built in Phases 1–2c is unreachable
for an ordinary admin.

**2. Z-readings and X-readings break on the second terminal.** This is pre-existing, is
*not* caused by the branch work, and it already breaks single-branch stores that run two
registers. It is in this phase because it is a legally-significant hard failure and because
the fix touches the same per-branch/per-terminal numbering area Phase 2a established.

### The reading-number defect, precisely

Verified against both the live schema (`INFORMATION_SCHEMA.STATISTICS`) and the SQL backups:

| | `z_readings` | `x_readings` |
|---|---|---|
| Counter source | `pos_terminals.z_counter` (per terminal) | `pos_terminals.x_counter` (per terminal) |
| Number format | `Z-YYYYMMDD-NNN` | `X-YYYYMMDD-NNN` |
| Terminal in the number? | **No** | **No** |
| UNIQUE key | `(reading_number)` — **global** | `(reading_number)` — **global** |
| Has `terminal_id`? | Yes | Yes |
| Has `branch_id`? | **No** | **No** |

The counter is per-terminal but the uniqueness constraint is global, and the number carries
nothing to tell two terminals apart. So terminal 1 and terminal 2 both reach counter 1 on
the same day, both generate `Z-20261021-001`, and **the second terminal's Z-reading fails on
a duplicate-key error.** A Z-reading is the BIR-required end-of-day close, so the second
register cannot close its day. `getNextZReadingNumber` / `getNextXReadingNumber` are in
`lib/mysql.ts` (~:182, ~:214).

**I originally reported this as Z-only. It affects X-readings identically** — same counter
shape, same global key, same format. The fix covers both.

### Why not just change the number format

`reading_number` has eight consumers, including `lib/ejournal/*` (the BIR audit journal),
`lib/ejournal/text-receipt.ts` (printed output) and the X-reading preview. The number
appears on filed documents. Changing its *format* would alter already-filed paperwork and
ripple through printing and the e-journal. Making the *uniqueness* per-terminal does not.

---

## Goals

1. An admin can create a branch, edit it, and deactivate it from the UI — no API calls, no
   SQL.
2. An admin can see which warehouses and users belong to a branch, and move a warehouse or
   a user to a different branch.
3. Two terminals in the same store can both close their day: concurrent Z-readings and
   X-readings on different terminals never collide.
4. Existing filed reading numbers keep their exact current values. No renumbering.

## Non-goals

- Inter-branch stock transfers with two-sided approval (that was the original design's
  "transfers and approvals" phase and stays separate).
- The scheduler single-writer lease (`lib/scheduler.ts` has no lease today — a multi-terminal
  store runs N racing hourly schedulers; `CLAUDE.md` already documents this and says not to
  enable hourly Sta. Lucia submission on a multi-terminal store).
- Consolidated head-office reports.
- Phase 2d hardening (removing the cookie fallback, `resolveTerminalBranch`'s type guard, the
  supplier-mapping writers).
- Changing the reading-number *format*, per the reasoning above.

## Anti-goals

Things that would make this a failure even if it ships and tests pass:

- **Renumbering or rewriting any existing `reading_number`.** These are on filed BIR
  documents. The migration must be additive to the constraint only.
- **A branch UI that writes `branches`, `warehouses.branch_id` or `users.branch_id` without
  going through a branch-checked route.** Phases 2b/2c spent two phases establishing that
  writes are refused, not filtered; a new admin screen must not become the hole. Note the
  ~6 admin/dev utility writes (warehouses among them) are in `CLAUDE.md`'s "still open" set —
  this phase must not *widen* that set.
- **Letting a branch be deactivated or deleted while rows still point at it.** A warehouse
  or user orphaned onto an inactive branch gets 403 from every branch-filtered route — i.e.
  a silent lockout, which is exactly the failure Phase 1's migration 134 was written to
  avoid.
- **Breaking the one-terminal case.** The overwhelming majority of installs have a single
  terminal and must see no behaviour change.

---

## Constraints

- MySQL 8 only; raw parameterised SQL via `query()` / `withTransaction()` from
  `lib/mysql.ts`. No ORM.
- Migrations are numbered TypeScript files in `scripts/migrations/` with `up()` and `down()`.
  **The last is 141, so this phase starts at 142.**
- **MySQL DDL implicitly commits.** Phase 2a learned this the hard way: a constraint swap
  cannot be made atomic with a transaction, so ordering is the only guarantee — **ADD the new
  key before DROPping the old one**, never the reverse (migration 141 is the precedent).
- `lib/branch-context.ts` is the only place a branch is resolved. Reuse it; do not add a
  second resolver.
- Reads are filtered, writes are refused with 403. A cross-branch target is never silently
  ignored.
- BIR numbering is legally significant. Nothing here may gap or duplicate a series.
- E2E `workers: 1`; Cebuano test descriptions, English code.
- `npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"` must stay empty.
  `npm run lint` is broken repo-wide on Next 16 and is **waived**.
- Baseline to preserve: **346 passed / 23 failed / 1 skipped / 6 did not run**. The 23 are
  pre-existing and individually attributed; 15 are the `Retail (₱)` selector family, whose
  four rendering files must not be touched.
- Commits authored as JhazonE, no Claude attribution trailer.

---

## The approach — decided

Two independent pieces. Either could ship alone; the reading fix is the more urgent.

### Piece A — per-terminal reading uniqueness

A single migration (142) that, for **both** `z_readings` and `x_readings`:

1. **ADDs** a composite `UNIQUE (terminal_id, reading_number)`.
2. **Then DROPs** the global `UNIQUE (reading_number)`.

That order matters and is non-negotiable (see Constraints). `down()` reverses it — ADD the
global key back, then DROP the composite — and must be expected to **fail loudly** if
duplicate numbers exist by then, because at that point restoring a global unique key is not
possible without destroying data. Say so in the migration's comment rather than silently
coercing.

`terminal_id` is nullable on both tables. A NULL in a MySQL UNIQUE index does not collide
with another NULL, so legacy rows with no terminal are unaffected — but that also means the
composite key does not constrain them. Acceptable: those rows predate terminal tracking and
no new row is written without a terminal.

Nothing in the *generators* changes. They are already per-terminal; the constraint was the only
thing wrong there. Resist adding `branch_id` to these tables: the terminal already determines
the branch (`pos_terminals.branch_id`) and a denormalised copy is a second source of truth for
a BIR document.

**But the constraint swap is NOT the whole fix, and an earlier draft of this document was wrong
to say so.** A builder check caught it and I verified it:

`sta_lucia_submissions.z_reading_id` is the table's **PRIMARY KEY** (migration 106), and
`lib/integrations/sta-lucia/send-z-reading.ts` fills it with the bare `reading_number`
(`claimZReading`, ~:287). Line :343 then looks up
`SELECT * FROM z_readings WHERE reading_number = ? LIMIT 1`, and the payload's `id` is
`String(row.reading_number)` (:84). The sender never references `terminal_id` at all.

So the moment two terminals may legitimately both hold `Z-20261021-001`:

1. The second terminal's claim INSERT hits a duplicate key, which the sender reads as
   **"already submitted"** — so that terminal's sales are **silently never reported to the mall**.
2. The `LIMIT 1` lookup can fetch the **wrong terminal's** Z-reading.
3. The payload `id` collides mall-side too. Whether MediaOne dedupes on it is unknown to us.

`CLAUDE.md` notes Philippine mall rent is commonly a percentage of reported sales, so (1)
under-reports revenue. **Piece A therefore converts a loud failure (a duplicate-key error the
cashier sees) into a silent financial one** — strictly worse — unless the Sta. Lucia claim and
lookup are keyed per terminal in the same change.

**Decision: Piece A must include the Sta. Lucia sender.** Scope:

- A migration re-keying `sta_lucia_submissions` so the claim is unique per
  (terminal, reading number) rather than per reading number. Same ADD-then-DROP ordering rule.
- `claimZReading` and the `:343` lookup take the terminal into account, so each terminal claims
  and resends independently.
- `CLAUDE.md` already records the *hourly* variant as single-terminal-only. The per-Z sender's
  claim key is **not** recorded there; this change must add that history so the next reader knows
  why the key is composite.

**What remains outside our control, and must be documented rather than engineered around:** if
the mall's API dedupes on the payload `id`, two terminals' same-numbered Z-readings may still
collide on their side. We cannot see their semantics. The honest position is the one
`CLAUDE.md` already takes for at-least-once delivery — state the limitation. If the mall needs
globally distinct ids, the only real fix is a format change, which this document rejects for
filed-document reasons; that trade-off would then be the user's call, not the builder's.

### Piece B — branch management UI

A settings page at `app/(app)/settings/branches/` listing branches with their warehouse and
user counts, and offering: create, edit (name, address, and the BIR identity fields a branch
owns — permit, MIN, serial), activate/deactivate, and reassignment of a warehouse or user to
another branch.

Server side, the existing `app/api/branches/route.ts` has only `GET` and `POST`. This phase
adds what the UI needs:

- `PATCH /api/branches/[id]` — edit, and activate/deactivate.
- Reassignment endpoints for a warehouse's and a user's `branch_id`.

Every one of these is **head-office-only**: they must require the `all_branches` permission
(`ALL_BRANCHES_PERMISSION` in `lib/branch-context.ts`), not merely a resolvable branch. A
branch manager must not be able to move their own warehouse into another branch, nor edit
another branch. This is the one place where "which branch are you?" is not the right question
— the right question is "are you head office?".

**Deactivation guard.** A branch may not be deactivated while it still has active warehouses,
users, or terminals pointing at it. Refuse with a message naming the counts, so the admin
knows what to move first. Rationale is in the anti-goals: orphaning rows onto an inactive
branch is a silent lockout.

**The main branch is special.** It cannot be deactivated and its `is_main` flag cannot be
moved in this phase — `mainBranchId()` is the default for several inserts, and migration 137
re-synced the main branch's BIR series at cutover. Changing which branch is "main" is a
separate, riskier change.

### Rejected alternatives

- **Put the terminal in the reading number** (e.g. `Z-T01-20261021-001`). Rejected: the number
  is on filed BIR documents and has eight consumers including the e-journal and printed
  receipts. The composite key fixes uniqueness without touching a filed value.
- **Make the counter global instead of per-terminal.** Rejected: it would gap each terminal's
  own sequence, and per-terminal Z-numbering is what the BIR expects of a register.
- **Add `branch_id` to the reading tables.** Rejected as a second source of truth for a
  legally-significant document; the terminal already resolves the branch.
- **Build the UI against the existing GET/POST only, editing rows via a generic admin route.**
  Rejected: it would widen the unisolated admin-write set that `CLAUDE.md` tracks as still
  open.

---

## Decisions made after the builder check

A reviewer read this document as the implementer and raised nine questions. The Sta. Lucia one
changed Piece A's scope (above). The rest are settled here as **my calls**, not as things the
user agreed to.

**Terminal assignment is IN scope — the phase fails without it.** `app/api/pos-terminals/route.ts:219-220`
hard-codes `mainBranchId()` ("No branch picker yet"), and nothing can change a terminal's branch
afterwards. So a branch created by the new UI could never have a terminal, never ring a sale and
never take a Z-reading — the branch would be decorative, and the phase's "operable" goal would be
unmet. Piece B therefore also lets an admin set a terminal's branch on create and reassign it
later, under the same head-office rule. This is a third reassignment endpoint and touches the
existing `pos-terminals` pages.

**Head office means `all_branches`, and that is the check.** Use the existing
`ALL_BRANCHES_PERMISSION` grant as the authorisation for every branch-administration endpoint.
Do **not** additionally require `users.branch_id IS NULL`: migration 134 deliberately left admins
branchless-with-grant, but a branch-assigned user holding the grant is a legitimate
"branch manager who also administers" and refusing them would be a surprise. The relevant question
for these endpoints is "may you administer branches?", which is exactly what the grant answers.

**Retrofit the existing `POST /api/branches` with the same check.** It has no authorisation today
and the new UI will call it. Leaving it open while guarding its siblings would be incoherent. Take
the uid by the established convention for a route of that shape (`resolveScopeFromRequest` /
`lib/session-uid.ts` for bodyless requests, the body otherwise) rather than inventing a new one.

**User reassignment sets a real branch only.** It may not set `branch_id = NULL` and may not grant
or revoke `all_branches`. Rationale: branchless-without-grant is precisely the silent-lockout state
migration 134 exists to prevent, and permission editing belongs to the existing user-management
screen, not to a branch page. Moving a head-office admin *into* a branch leaves them with a branch
plus the grant, which the paragraph above defines as valid.

**Guard the last administrator.** Refuse a reassignment that would leave zero users holding
`all_branches`. Without it, one move locks every admin out of the branch page — recoverable only by
hand-editing MySQL, which is the situation this phase exists to end.

**Warehouse reassignment is refused, not warned, when the warehouse is busy.** Moving a warehouse
silently moves its products, batches and stock history into another branch's view. Refuse while it
has pending approvals, open shifts or open orders, naming the counts. An unconditional move is the
kind of irreversible, invisible data migration that a warning dialog does not make safe. Past sales
keep their stamped `sales_transactions.branch_id`, so filed BIR documents stay with the
establishment that issued them — that asymmetry (stock moves, history does not) must be stated in
the UI copy. The main branch's last warehouse may not be moved out.

**Deactivation keeps `branch_number_series` and does not reset anything.** Reactivating a branch
must not re-issue invoice numbers already on filed documents — the same rule as the three data-reset
actions. In-flight pending documents block deactivation, on the same reasoning as the warehouse
guard.

**Editable branch fields: name, address, contact, and the BIR identity fields.** `code` is immutable
after creation (it is an identifier). `tin` and `business_name` are editable because they are
printed and do get corrected, but every edit to a BIR identity field (permit, MIN, serial, TIN,
business name) must be **audited** — these appear on filed documents, and a silent change makes a
filed document unexplainable. Do not block edits once invoices exist; a typo in a permit number has
to be fixable. **Terminal-level `min_number` / `serial_number` / `permit_no` remain authoritative
for printing** where both exist; the branch-level fields are the establishment's own registration.
The builder should confirm that precedence against `lib/receipt-generator.ts` before relying on it.

**Migration mechanics: look the index name up.** Resolve the existing unique index via
`INFORMATION_SCHEMA` and tolerate its absence, exactly as migration 141 does, rather than assuming
the default name `reading_number`. `scripts/fix_z_readings_schema.ts` shows `terminal_id` has had
collation drift, so the migration must not assume a collation either. The composite key also fixes
the post-reset collision the reviewer noticed (`app/api/data-management/reset/route.ts` zeroes
`x_counter`/`z_counter`, so a restarted counter could previously collide with a surviving row) —
record that as a side benefit, not a separate change.

**The red test is API-level, not full-route.** Reproduce the collision by seeding a second terminal
and calling `getNextZReadingNumber` plus the INSERT directly, rather than driving the whole
Z-reading route with its open-shift and sales setup. The defect is in the constraint, so the
lighter test exercises it precisely; the full-route path is already covered elsewhere. Do the same
for X-readings and for the Sta. Lucia claim.

## Left to the builder

- Page layout, component choices, and how the warehouse/user reassignment is presented
  (inline on the branch row, or a dedicated panel). Follow existing settings pages.
- Exact route shapes for the two reassignment endpoints.
- Whether the deactivation guard counts inactive warehouses/users as blockers.
- Whether to add a composite index for query performance alongside the unique key.
- Task decomposition and ordering, with red-first verification per task.

## Verification that matters

- **The collision must be reproduced before it is fixed.** A test that seeds two terminals,
  takes a Z-reading on each on the same day, and shows the second one **failing** on the
  current schema — then passing after the migration. Without observing the failure first, the
  test proves nothing. Do the same for X-readings.
- A test that existing reading numbers are unchanged by the migration (seed rows, migrate,
  compare).
- `npm run migrate` then `npm run migrate:down` then `npm run migrate` again, to prove the
  migration is reversible in both directions on a DB that has rows.
- For the UI: a branch-scoped (non-head-office) user must be **refused** by every new
  endpoint, with the row verified unchanged in the database — status alone is not enough
  (Phase 2b's review found four tests that asserted only status and would have passed if the
  write happened before the refusal).
- A test that deactivating a branch with attached warehouses/users is refused.
- Full suite as the phase gate, with any new failure attributed individually before merge.
