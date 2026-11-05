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

### Cost updates the product record, and the batch follows for free

The user chose: the typed cost updates the product's cost record, not just the
batch.

Because `lib/stock-movements.ts` reads `products.cost` when it creates the new
batch, **updating `products.cost` before the stock change makes the batch pick up
the new cost automatically.** One write satisfies both halves of the
requirement.

So the ordering inside the route's per-item loop is load-bearing:

1. update `products.cost` (when a cost was supplied), then
2. perform the stock change as it does today.

Both already happen inside the same `withTransaction`, so a failure rolls back
the cost change along with the stock.

**Do not** add a cost parameter to `addFamilyStock` or
`updateStockAndRecordMovement` to carry it down. That would duplicate the source
of truth and would also force a decision about what cost a *family member's*
cascaded batch should take — a question this feature has no business answering.
Letting the family cascade keep reading each member's own `products.cost` is the
correct existing behaviour.

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

Existing users do not have this permission, so cost entry is off everywhere
until an administrator grants it. That is the correct default for a field that
moves valuation.

### The printout

The user reviewed a mockup and approved the version **with the signature
block**. The mockup is at
`.superpowers/brainstorm/845-1793793333/content/printout.html`.

**Header:** title "STOCK ADJUSTMENT REPORT", business/branch name, reference
number, date and time, warehouse, mode, supplier (when one was chosen), and who
posted it.

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
the printout can show it. Format should follow whatever the codebase already
uses for internal document series — prefer `getNextReference()` (the existing
company-wide internal series mechanism) over inventing a new counter; the
implementer should confirm it has a suitable series and add one if not. A
user-supplied reference is used as-is.

This is deliberately the one piece of groundwork that makes a future "reprint
this batch" screen possible without another migration.

### Persisting the cost: add a column

`stock_adjustments` records what each adjustment did but has no cost column, so
today the posted cost is only recoverable indirectly through the batch. For an
auditable document, store it: **migration 145** adds a nullable
`unit_cost DECIMAL(15, 4) DEFAULT NULL` to `stock_adjustments`, written on every
ADD row with the cost the batch was posted at (typed or existing).

Nullable, because every historical row predates it and REMOVE/TRANSFER rows have
no meaningful single cost. `down()` drops the column. Follow the shape of
migration 073, which added the other metadata fields to this same table.

Match the precision already used for money in this schema rather than copying
`DECIMAL(15, 4)` blindly — migration 078 set stock columns to `DECIMAL(15, 4)`;
the implementer should check what `products.cost` itself uses and match that, so
a cost cannot round differently between the two tables.

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
- **The approval path is easy to get wrong.** The queued branch of the route
  `continue`s before any `stock_adjustments` row is written, so a cost attached
  to a queued item must travel in the approval payload and be applied at
  finalization, or be knowingly dropped. The builder must pick one and say which
  — and if the cost travels in the payload, finalization re-checks the permission
  question, because the approver is not the person who typed the cost. Carrying
  it is the better behaviour; dropping it silently is not acceptable.
