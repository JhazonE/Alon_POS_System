# Bulk Stock Adjustment: per-product cost entry and a printable transaction report

**Date:** 2026-11-04
**Status:** Approved design, ready to plan

---

## Intent and the why

The Bulk Stock Adjustment screen (`/inventory/bulk-adjustment`) lets a user stage
many products and apply one adjustment to all of them. Today it captures
quantity, an optional expiry and a per-row note. It captures **no cost**, and it
produces **no paper**.

Two additions, asked for together because they land on the same screen:

1. **Per-product cost entry.** When adding stock, the user types the unit cost
   for each product. That cost updates the product's own cost record and prices
   the new FIFO batch.
2. **A printable transaction report.** After a batch posts, the user can print a
   document listing what was adjusted, at what cost, for what total.

This is a feature addition, not a fix for a reported problem. The user asked for
it as "dugang features". The printout's audience is **the supplier and the
auditor** — stated by the user — which is why it is a signed document rather
than a screen dump.

## Goals

- A cost field per staged product, visible when adding stock.
- The typed cost updates `products.cost`.
- The typed cost becomes the `unit_cost` of the new `inventory_batches` row.
- A printable report of a posted batch: per product the quantity, unit cost,
  total cost and resulting stock, with batch totals and a signature block.
- Cost entry gated by a user permission.

## Non-goals

- Cost entry on REMOVE or TRANSFER. See "Cost applies to ADD only".
- Reprinting a batch from a history screen. The print is offered at the end of
  the posting flow. Making past batches reprintable is a natural follow-up and
  the data model below deliberately does not block it, but it is not in scope.
- Changing FIFO deduction, family sync, or the approval workflow.
- A cost column on the single-product adjustment path.
- Cost history or a cost-change audit report beyond the existing activity log.

## Anti-goals

Things that would make this a failure even if it technically worked:

- **Silently changing a product's cost.** Cost drives margin on every report and
  the valuation of every future batch. A user who did not intend to change cost
  must not change it by passing through this screen. Leaving the field blank
  must mean "leave cost alone", never "set cost to zero".
- **A printout that does not match what was posted.** The document goes to a
  supplier and an auditor. If approval held some items back, or an item failed,
  the paper must not claim they were posted.
- **Letting an unprivileged user change cost.** The user was explicit that this
  depends on permission.

## Constraints

- MySQL only, raw `mysql2/promise`, no ORM (see CLAUDE.md).
- The existing bulk write path is `POST /api/inventory/adjust/bulk`, which is
  already branch-isolated via `resolveScopeFromBody` + `assertWarehouseInBranch`.
  That guard must keep working unchanged.
- Migrations are numbered TypeScript files; the next free number is **145**.
- `products.cost` is the single source of truth for cost and is read by the
  batch-costing block in `lib/stock-movements.ts`.
- The client must keep sending the session uid via `lib/session-uid.ts`.

## Current state (verified in the code)

Read before designing; the implementer can rely on these:

- **`app/(app)/inventory/bulk-adjustment/`** — `use-bulk-adjustment.ts` is the
  controller; `constants.ts` defines `AdjustmentItem`; `adjustment-table-row.tsx`
  and `adjustment-mobile-card.tsx` are the per-item editors; `config-fields.tsx`
  holds the right-hand batch configuration panel.
- **`AdjustmentItem`** is `{ product, quantity, type, reason, expirationDate? }`.
- **The batch already takes its cost from the product.**
  `lib/stock-movements.ts` around line 195, inside `updateStockAndRecordMovement`:
  on a positive quantity change it creates an `inventory_batches` row whose
  `unit_cost` is `SELECT cost FROM products WHERE id = ?`. **This is the pivot of
  the whole design** — see below.
- **`stock_adjustments`** has `id, product_id, quantity, reason, new_stock,
  warehouse_id, target_warehouse_id, reference_no, supplier_id, note, adj_type,
  selling_unit_id, created_at, updated_at`. It has **no cost column**.
  `reference_no` exists and is nullable.
- **Approval**: the route calls `checkApprovalRequired('STOCK_ADJUSTMENT')` per
  item. If approval is on, the item is pushed to the approval queue via
  `submitToApprovalQueue` and `continue`s — **no stock moves, no
  `stock_adjustments` row is written**. The response separates `results` (posted)
  from `queuedItems` (held).
- **Permissions** are a flat list of ids in
  `app/(app)/user-management/permissions.ts` (`ALL_PERMISSIONS`), checked
  client-side through `hasPermission(id)` from `app/(app)/use-app-layout.ts`,
  and stored per user. There are 14 today. The bulk adjustment page sits under
  `manage_inventory`. Note `edit_price` is referenced by
  `app/(app)/pos/admin-auth/use-admin-auth.ts` but is **not** in
  `ALL_PERMISSIONS` — do not follow that as a pattern.
- **Printing** is CSS-based, not a separate route: a `hidden print:block
  printable-area` block in the page plus the `@media print` rules in
  `app/globals.css` (around line 356), triggered by `window.print()`.
  `app/(app)/inventory/stock-counts/[id]/print-layout.tsx` is the reference
  implementation and the closest sibling document.

## The decisions, as made

### Cost updates the product record, and the batch follows — after a prerequisite fix

The user chose: the typed cost updates the product's cost record, not just the
batch.

`lib/stock-movements.ts` reads `products.cost` when it creates the new batch, so
updating `products.cost` before the stock change is intended to make the batch
pick up the new cost. The ordering inside the route's per-item loop is therefore
load-bearing:

1. update `products.cost` (when a cost was supplied), then
2. perform the stock change as it does today.

Both happen inside the same `withTransaction`, so a failure rolls back the cost
change along with the stock.

**But this does not work today, and fixing it is step one.** The read at
`lib/stock-movements.ts` ~line 195 is:

```ts
const costInfo = await query('SELECT cost, price FROM products WHERE id = ?', [productId]);
```

`query()` is the **pool**, not the `connection` threaded through the rest of
that function. Under InnoDB REPEATABLE READ on a separate connection, an
uncommitted `UPDATE products SET cost = ?` is invisible to it, so the batch
would be created at the **old** cost while `products.cost` carries the new one —
and the printout, which must show the cost the batch was actually posted at,
would disagree with the batch.

**Decision: fix the read to use `connection` when one is passed.**

This is a pre-existing bug, not merely an obstacle: *any* caller that updates
cost inside a transaction and then adds stock already gets a stale batch cost,
silently. The alternative considered and rejected was post-correcting the batch
with an `UPDATE inventory_batches` scoped to this feature — that leaves the bug
in place and adds a second cost-writing path on top of it.

Because `updateStockAndRecordMovement` is called from **every** stock write path
in the system (sales, POs, transfers, counts, family sync), this is a repo-wide
behaviour change and must be **its own step, with its own tests, landed before
the feature work**. The change makes the batch see same-transaction cost writes;
no existing caller updates cost inside its transaction before adding stock, so
no current behaviour should shift — but that expectation is exactly what the
tests must pin down.

**Note the surrounding `try/catch`**, which currently only `console.warn`s on a
batch-costing failure. That is out of scope here, but the implementer should
know it exists: a swallowed failure would produce a printout claiming a cost no
batch carries. CLAUDE.md records that the product-create path made its opening
batch insert fatal for the same class of reason. Flag it as a follow-up; do not
change it as part of this work.

**Do not** add a cost parameter to `addFamilyStock` or
`updateStockAndRecordMovement` to carry the cost down. That would duplicate the
source of truth and would also force a decision about what cost a *family
member's* cascaded batch should take — a question this feature has no business
answering. Letting the family cascade keep reading each member's own
`products.cost` is the correct existing behaviour. The fix above changes only
*which connection* that read uses, not where the cost comes from.

### The cost write must also sync the base selling unit

`lib/selling-unit-sync.ts` states it directly: any writer of `products.cost`
that does not also update the base selling unit leaves a stale value there, **and
the next unrelated Edit Product save silently reverts the change.**
`lib/price-update-batch.ts` and `lib/purchase-actions.ts` both call
`syncBaseSellingUnit` after writing cost.

**Decision: this feature calls it too**, passing only `cost`. Without it, the
cost would be reverted by the next edit of that product, leaving the batch and
the printed document disagreeing with the product record an auditor later looks
up — squarely this design's own anti-goal.

This slightly widens what the feature writes (`product_selling_units.cost` of
the base row) and deserves its own test. Note that the Constraints section calls
`products.cost` the single source of truth; that is true of what *readers*
consult, but writers must keep the base selling unit in step.

### Cost applies to ADD only

Confirmed with the user.

REMOVE deducts from existing batches at their own recorded FIFO costs; TRANSFER
moves stock between warehouses. Neither creates a batch, so a typed cost on
either would change `products.cost` with no incoming stock to justify it — a
silent revaluation, which is an anti-goal.

The cost column therefore appears only while the batch mode is ADD. Switching
the batch mode away from ADD must discard any typed costs rather than keep them
hidden and submit them. The server must enforce this too: ignore (or reject) a
cost on a non-ADD batch, because `adjustmentType` arrives from the client.

### Blank means "leave cost alone"

The cost field is **optional and empty by default** — it must not be prefilled
with the product's current cost, because a prefilled field invites an accidental
no-op write and makes "unchanged" indistinguishable from "confirmed unchanged".

- Empty → `products.cost` is not touched; the batch takes the existing cost,
  exactly as today.
- A number ≥ 0 → `products.cost` is updated and the batch takes it.

Show the product's current cost next to the input as read-only context, so the
user can see what they are changing from.

Validation, server-side as well as in the form (a server route's body arrives
off the wire): a supplied cost must parse as a finite number and be `>= 0`.
Reject the batch on a malformed cost rather than coercing it — coercing a bad
cost to 0 would zero a product's cost, which is the anti-goal above.

### Permission: a new `edit_product_cost`

The user asked for this to depend on permission, and chose the recommended
split rather than reusing `manage_inventory`.

Add `{ id: 'edit_product_cost', label: 'Edit Product Cost' }` to
`ALL_PERMISSIONS`. Then:

- `manage_inventory` alone — can stage, adjust and print as today; the cost
  column is **not rendered** and no cost is sent.
- `manage_inventory` **+** `edit_product_cost` — the cost column is rendered and
  costs are submitted.

**The server must check it too.** A client-side `hasPermission` call only hides
UI; the route must reject a cost from a caller who lacks the grant. The route
already resolves the caller for branch scope, so the grant check belongs
alongside it. Refuse the request rather than silently dropping the costs — a
dropped cost would post stock at the wrong valuation with no signal.

**The check is strict: an `EXISTS` against `user_permissions` for
`edit_product_cost`, mirroring `assertHeadOffice`.** No `userType` shortcut — an
`Admin` does not carry it implicitly. That is what makes the next sentence true.

Existing users do not have this permission, so cost entry is off everywhere
until an administrator grants it. That is the correct default for a field that
moves valuation.

**Two consequences the implementer must handle, both verified in the code:**

- The client-side `hasPermission` in `app/(app)/use-app-layout.ts` returns true
  for everything when the session carries `super_admin`, which is set only by the
  **dev-only** localStorage fallback session. So in development the UI would
  render the cost column while a strict server check rejects the submission.
  Grant `edit_product_cost` to the relevant seeded users so the dev flow and the
  E2E suite exercise the real path; do not loosen the server check to
  accommodate the dev session.
- `userType === 'Cashier'` is narrowed to `access_pos` client-side and never
  reaches this screen; no special handling needed.

No migration is required for the permission itself: permissions are per-user
rows, `ALL_PERMISSIONS` feeds only the user-management UI grids, and there are
no role templates to update.

### The printout

The user reviewed a mockup and approved the version **with the signature
block**. The mockup is at
`.superpowers/brainstorm/845-1793793333/content/printout.html`.

**Header:** title "STOCK ADJUSTMENT REPORT", the **issuing branch's**
`business_name`, reference number, date and time, warehouse, mode, supplier
(when one was chosen), and who posted it.

The branch's `business_name`, **not** the company name from `/api/pos-settings`.
The audience is a supplier and an auditor, and the whole branch phase exists to
keep establishments distinct; a document about one branch's stock should name
that branch. The stock-count print layout has no business-name header, so there
is no existing pattern to copy. Note that `GET /api/branches` is flagged in
CLAUDE.md as unauthenticated and wider than it looks — take only the name
needed, and prefer resolving it server-side alongside the posted results rather
than widening any client's access to the BIR identity fields.

**Table, one row per posted product:** product name, barcode, signed quantity,
unit cost, total cost (quantity × unit cost), stock after.

**Footer:** total quantity and total cost. Then a three-way signature block:
*Prepared by*, *Received by*, *Checked by*.

**Build it like its sibling.** A `print-layout.tsx` in the bulk-adjustment
folder, modelled on the stock-count one: `hidden print:block printable-area`,
plain black-on-white, driven by `window.print()`. Do not introduce a PDF
library or a print route.

The unit cost shown must be **the cost the batch was actually posted at** — the
newly typed cost where one was given, otherwise the product's existing cost. The
document is for an auditor; it must state what happened, not what was typed.

### The cost travels through approval

When `STOCK_ADJUSTMENT` approval is on, the route `continue`s before any
`stock_adjustments` row is written and the item goes to the approval queue. A
typed cost must therefore either travel in the approval payload and be applied
at finalization, or be dropped.

**Decision: carry it.**

The alternative considered and rejected was suppressing the cost field whenever
approval is on. That would disable the feature for exactly the stores most
likely to want cost control, and the per-store approval setting is not visible
from this screen, so the field would vanish for reasons the user cannot see.

**What this costs, verified in the code.** Finalization does not come back
through the bulk route. `app/api/approvals/process/route.ts:168` calls
`adjustStockWithScope(...)` in `lib/stock-adjust.ts`, which writes
`stock_adjustments` with only `(id, product_id, quantity, reason, new_stock)` —
no `reference_no`, no `supplier_id`, no cost column. So carrying the cost means:

1. Putting the cost in the approval payload alongside the existing
   `expirationDate`, `referenceNo` and `supplierId` metadata.
2. Extending `adjustStockWithScope` with an **optional** cost parameter, and
   extending its `stock_adjustments` INSERT to write `unit_cost` (and, while
   there, the reference, so a queued-then-approved item is not invisible to a
   future reprint screen).
3. Applying the same `products.cost` update **and** `syncBaseSellingUnit` call
   at finalization that the direct path performs.

This touches the single-product adjustment path's *signature*, but adds no cost
UI there — the non-goal ("a cost column on the single-product adjustment path")
stands, because the parameter is optional and that path passes nothing.

**`adjustStockWithScope` has the same connection problem.** It uses `query()`
(the pool) for its `stock_adjustments` insert and opens its own
`withTransaction` for the family sync. The step-one fix above addresses the read
inside `updateStockAndRecordMovement`; the implementer must confirm the cost
update here is visible to the batch created by that call, and order the writes
so it is. This is a second instance of the same hazard, not a separate design
question.

**The permission re-check at finalization targets the creator, not the
approver** — `item.created_by`, consistent with how
`scopeForQueuedItem(item.created_by)` already resolves branch scope on the line
above. The approver may legitimately lack `edit_product_cost`; they are
approving someone else's request, not typing a cost.

**On failure, refuse the item** and leave it Pending with a message, matching
the branch-refusal precedent in that same route. Do not finalize the stock
change while dropping the cost: that would post stock at a valuation nobody
chose. CLAUDE.md notes `created_by` is DB-sourced but not session-proven; that
limitation is inherited here and is not made worse by this feature.

### What prints is what posted

Confirmed with the user.

The route's response already distinguishes `results` (posted) from `queuedItems`
(held for approval). The print offer keys off `results`:

- Some items posted → offer the print, listing **only** those items. If others
  were queued, say so on screen (not on the paper).
- Nothing posted, everything queued → **no print offer**; the existing
  "pending approval" message stands alone.

A document that listed queued items as adjusted would be a false record going to
an auditor.

**There is no partial-failure case to handle.** The route's `withTransaction`
wraps the whole loop and any per-item failure throws, so the outcomes are: all
posted, all queued, or all rolled back with a 500. The only mixed case is
`results` vs `queuedItems`, which is what the rule above covers. Do **not**
restructure the transaction boundary to tolerate per-item failure — the
all-or-nothing behaviour is correct and matches the batch writers described in
CLAUDE.md.

For this to work the route must return enough per-item data to render the
document. `results` currently carries `{ productId, productName, newStock }`.
It needs at least the barcode, the signed quantity and the unit cost the batch
was posted at. Returning it from the server is preferable to reassembling it on
the client from the staged list, because the server knows what actually
committed.

### Reference number groups the document

Confirmed with the user. `reference_no` is already on `stock_adjustments` but is
optional. For a batch to be identifiable as one document — and reprintable
later — it needs one.

When the batch is ADD and the user left the reference blank, generate one
server-side and use it for every row in the batch. Return it in the response so
the printout can show it. A user-supplied reference is used as-is.

**Decision: use `getNextReference('stock_adjustment')` — company-wide, and it
needs no migration.**

Verified: `transaction_references` already has a `stock_adjustment` column, and
all three data-reset paths already seed it in their fixed `INSERT` column list
(`app/api/data-management/reset/route.ts`). No caller increments it today, so
this feature inherits the counter at its seeded `'1000'`. Reusing it therefore
touches neither a migration nor the reset route, and the CLAUDE.md invariant
about resets re-issuing filed numbers is already satisfied for this series.

**Company-wide, not per-branch**, matching CLAUDE.md: the nine internal document
series and `receipt_number` stay company-wide, while per-establishment numbering
is reserved for BIR documents in `branch_number_series`. This is an internal
document, not a BIR one, and the issuing branch is already identified in the
printout header. Do **not** add a `branch_number_series` column for it.

This is deliberately the one piece of groundwork that makes a future "reprint
this batch" screen possible without another migration.

### Persisting the cost: add a column

`stock_adjustments` records what each adjustment did but has no cost column, so
today the posted cost is only recoverable indirectly through the batch. For an
auditable document, store it: **migration 145** adds a nullable
`unit_cost DECIMAL(10, 2) DEFAULT NULL` to `stock_adjustments`, written on every
ADD row with the cost the batch was posted at (typed or existing).

Nullable, because every historical row predates it and REMOVE/TRANSFER rows have
no meaningful single cost. `down()` drops the column. Follow the shape of
migration 073, which added the other metadata fields to this same table.

**Precision: `DECIMAL(10, 2)`, matching `products.cost`** (migration 001, never
altered). Note the consequence, which is accepted rather than solved:
`inventory_batches.unit_cost` is 4dp, so a cost is stored at 2dp here and in
`products.cost` but at 4dp on the batch. Matching the product record is the
right call — this column exists to state what the product's cost was set to, and
a cost the user typed in pesos and centavos should round once, consistently,
wherever cost is stored. The input should therefore accept 2 decimal places;
rejecting or rounding beyond that is better than storing a precision the product
record cannot hold.

## Order of work

The first item is a prerequisite, not part of the feature, and must land and be
tested on its own:

1. **Fix the batch-costing read** in `lib/stock-movements.ts` to use the passed
   `connection`. Repo-wide blast radius; own tests.
2. Migration 145 — `stock_adjustments.unit_cost`.
3. The `edit_product_cost` permission, server check included.
4. Cost capture in the bulk route: `products.cost` + `syncBaseSellingUnit` +
   `unit_cost` + the reference number.
5. The approval payload and `adjustStockWithScope` extension.
6. The cost column in the table and mobile card.
7. The print layout and the post-success print offer.

## Open to the builder

- Exact placement and width of the cost column in the desktop table and the
  mobile card. The mobile card is already dense; a sensible layout there is the
  builder's call.
- Whether the "apply this cost to all rows" convenience (mirroring the existing
  `applyExpirationToAll` for expiry dates) is worth adding. It is not required.
  If added, it must still leave untouched rows blank rather than stamping zero.
- The exact reference-number format and series, per the note above.
- How the print is offered after a successful post: the current flow routes to
  `/inventory` on success, so the builder must decide where the printable
  document lives in that flow and keep it reachable long enough to print. Do not
  let the redirect race the print.
- Test coverage. TDD per the project's normal workflow; the branch-isolation and
  permission refusals are the cases most worth a test, along with "blank cost
  leaves `products.cost` unchanged" and "queued-only batch offers no print".

## Risks worth stating

- **Cost is a valuation lever.** Everything above about blank-means-unchanged,
  server-side validation and the permission gate exists because a wrong cost
  silently misstates margin and inventory value on every downstream report.
  None of those three is optional.
- **The approval path carries real work.** See the dedicated section above; it
  is the largest piece of this feature, and the estimate should reflect that
  rather than treating it as a payload tweak.
