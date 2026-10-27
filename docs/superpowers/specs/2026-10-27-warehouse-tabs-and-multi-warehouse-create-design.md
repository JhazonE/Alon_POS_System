# Warehouse tabs + multi-warehouse product creation — design

**Date:** 2026-10-27
**Status:** approved, not yet planned
**Supersedes behaviour from:** `2026-10-23-product-warehouse-fanout-design.md` (the
unconditional branch-wide fan-out becomes an explicit selection)

---

## Intent and the why

Two changes to how warehouses appear in the products area, both driven by the same
observation: **a warehouse is not a filter, it is the place you are standing.**

1. **The products table's warehouse selector moves out of the filter panel and
   becomes tabs above the table.** Today it is a `<Select>` sitting in the
   collapsible filter panel next to Category / Brand / Status, and it renders a
   "Warehouse: X" chip in the active-filters row. That framing is wrong twice
   over: it hides the single most important piece of context behind a panel
   toggle, and it implies "Clear filters" should reset it — which would silently
   move the user to a different warehouse's catalogue.

2. **Creating a product lets the user pick several warehouses and give each its
   own opening stock.** Today the form takes one warehouse and one `stock`
   number, and `addProductWithScope` then fans the product out to *every other
   active warehouse of that branch* at **zero stock**. Both halves of that are
   wrong for the user's real case: they want to choose *which* warehouses get the
   product (not all of them), and they want to enter the **real opening quantity
   per warehouse** rather than zero everywhere but one.

### Why now

The fan-out work (2026-10-23) made every created product exist in every active
warehouse of its branch. That was the right direction — a product should not be
invisible in the warehouse that is about to receive it — but it took the choice
away from the user and it could only ever create zero-stock copies. This change
gives back the choice and lets the copies carry stock.

---

## Goals

- The current warehouse is visible without opening anything, and switching is
  one click.
- The warehouse is not reset by "Clear filters" and is not presented as a filter
  chip.
- A product can be created into several chosen warehouses in one submission.
- Each chosen warehouse gets its own opening stock quantity.
- The existing branch isolation properties are preserved exactly: a branch-scoped
  user can never select, or write into, another branch's warehouse.

## Non-goals

- **Edit Product stays single-warehouse.** A product row *is* per-warehouse; editing
  one edits that one. No multi-warehouse editing, and no field sync between copies
  (the fan-out design's "copies are independent by design" decision stands).
- **No per-warehouse cost.** One shared cost for the whole submission (user's
  explicit call — see Decisions).
- **No per-warehouse reorder point.** One shared value (user's explicit call).
- **Not fixing the pre-existing read-isolation gap.** `getProducts` /
  `getProductsCount` still apply no branch filtering, so an "All warehouses" view
  still shows other branches' products. That gap predates this work, is recorded
  in CLAUDE.md, and folding a visibility change into this feature would hide it.
  It stays on the follow-up list.

## Anti-goals — things that would make this a failure even if it "works"

- A tab strip that becomes unusable at 8, 15 or 40 warehouses. The layout must
  degrade gracefully (scroll/overflow), not wrap into a wall or clip silently.
- Losing the fail-closed behaviour: a user whose warehouse does not resolve must
  still see **nothing**, never an unfiltered catalogue.
- A partially-created product. If any chosen warehouse fails, **nothing** is
  written — no primary row, no copies, no batches, no `stock_movements`.
- Silently dropping a warehouse the user selected (e.g. ignoring one that is out
  of branch instead of refusing the submission).

---

## Part 1 — Warehouse tabs in the products table

### Current state

`app/(app)/products/page.tsx`:
- `selectedWarehouse` state, initialised `'all'`, with `NO_WAREHOUSE =
  '__no-warehouse__'` as the match-nothing sentinel.
- `warehouseDefaultReady` gates the products query so it never fetches before the
  default resolves (`enabled: warehouseDefaultReady`).
- `chooseWarehouse` is the single entry point for user-initiated changes; it sets
  `warehouseDefaultReady`, which short-circuits the default-resolving effect.
- The default comes from `getDefaultProductWarehouse()` — server-side, from the
  signed session cookie. `defaultWarehouseFailed` (react-query `isError`) falls
  back to `'all'`.
- The `<Select id="warehouse-filter">` lives in the filter panel (~line 701).
- A "Warehouse: …" chip renders in the active-filters row (~line 830).
- `rollupSuppressed(filters)` deliberately does **not** treat a warehouse-only
  filter as suppressing the family roll-up, while the chip/badge counters **do**
  count a warehouse selection as an active filter.

### A new branch-scoped warehouse list is required (this is not purely presentational)

The original framing of Part 1 as "a presentation change" was **wrong**, and the
implementer must not inherit that assumption. The list the current `<Select>` is
built from is `productOptions.warehouses`, fed by `getWarehouses()` in
`app/(app)/products/actions.ts`:

```sql
SELECT * FROM warehouses ORDER BY name
```

**No branch filter and no `is_active` filter.** There is no branch-scoped
active-warehouse list anywhere in the codebase: `warehouseIdsForBranch`
(`lib/branch-context.ts`) deliberately does not filter `is_active`, and
`app/api/warehouses/route.ts` is not branch-aware.

Rendering tabs from that list would give a branch user a tab per *other
branches'* warehouses, and because `getProducts` is branch-unfiltered (Non-goal
4) clicking one yields a genuinely populated foreign-branch catalogue. The
`<Select>` already leaked that list, but a tab strip reframes it as "places you
are standing" and actively invites the click.

**Decision (user's call): add a branch-scoped, active-only warehouse list.**

- A new server action resolves the caller's scope via `resolveScopeFromSession()`
  and returns the **active** warehouses of that user's branch
  (`is_active = 1 AND branch_id = ?`). `is_active` is the source of truth; the
  runtime-added `active` column is stale and stays untouched.
- **Head office** (`{ scope: 'all' }`) gets every active warehouse across all
  branches. Grouping them by branch in the strip is the implementer's call; the
  branch name must be distinguishable where two branches have similarly-named
  warehouses.
- **No valid cookie** (`scope === null`): falls back to today's unfiltered list,
  consistent with every other Phase 2c fallback. This is a *display* fallback, so
  it does not widen any write path.
- The same new list feeds **both** the tab strip and the create form's
  multi-select (see Part 2), so the two cannot disagree about which warehouses
  exist.

**Accepted consequence:** an **inactive** warehouse that still holds stock loses
its tab, where today it is selectable in the `<Select>`. That is a small
capability regression for anyone using the picker to find stranded stock. It is
accepted because an inactive warehouse is not a place you stand, and the
valuation reports (`reports/inventory`, `cost-vs-retail`) remain a complete
unfiltered path to that stock. Note this in the implementation.

This does **not** contradict Non-goal 4. Non-goal 4 is about the *product read*
(`getProducts`) staying branch-unfiltered; this change scopes the *warehouse
picker*. The read gap stays open and stays on the follow-up list.

### Target behaviour

A horizontal tab strip sits **above the products table**, below the page header
and above (or beside) the search/filter row.

- **One tab per warehouse from the new branch-scoped active list**, plus an
  **"All warehouses"** tab. "All" is retained deliberately: some users want the
  whole picture, and removing it would be a capability regression. (Note "All"
  remains branch-unfiltered on the product read — Non-goal 4.)
- The tab for the resolved default warehouse is selected on load. The resolution
  logic, its 4xx-vs-500 distinction, the uid-keyed react-query cache and the
  `staleTime: Infinity` behaviour are **unchanged** — this is a presentation
  change, not a resolution change.
- Clicking a tab calls the existing `chooseWarehouse`. No new state machine.
- The query stays held until the default resolves. The tab strip renders in a
  loading/skeleton state during that window rather than defaulting visibly to
  "All" and then jumping.
- **The warehouse is removed from the filter panel and from the active-filters
  chip row**, and **"Clear filters" no longer touches it.**
- The `NO_WAREHOUSE` sentinel keeps working: a branch with no warehouses shows
  only the "All" tab plus an empty table, and the sentinel still produces a
  no-match query rather than an unfiltered one.
- Row counts stay as they are. The count badge logic must be revisited only
  insofar as it currently counts a warehouse selection as an active filter — with
  the warehouse no longer being a filter, it must **stop** counting toward the
  filter badge. `rollupSuppressed` already excludes warehouse-only, so the
  roll-up behaviour needs no change.

### Scaling and overflow

The tab strip must handle an arbitrary warehouse count. Implementer's call on the
mechanism (horizontally scrollable strip, or tabs up to a threshold then an
overflow menu), with these requirements: the selected tab is always visible
(scroll it into view on mount and on change), the strip never wraps into multiple
rows, and it is usable at phone width.

### Explicitly unchanged

- `getDefaultProductWarehouse()` and its server-side resolution.
- `MySqlProductRepository.resolveWarehouseFilter()`'s absent-vs-unresolved split.
- POS's fail-closed `useProducts` behaviour and all four POS product queries.
- `ProductFilters.flat` and the bulk-price-update opt-out.

---

## Part 2 — Multi-warehouse product creation

### Current state

`app/(app)/products/add-product/`:
- `product-schema.ts`: `standardProductSchema` has `warehouse: z.string().optional()`,
  `stock: z.coerce.number().int().nonnegative()`, `reorderPoint`, `cost`,
  `shelfLocationIds`. `serviceProductSchema` pins `warehouse: z.undefined()` and
  `stock: z.literal(0)` so a service with a warehouse or stock is unrepresentable.
- `tabs/inventory-tab.tsx`: a single-select warehouse combobox (with inline
  add/edit of warehouses), a `shelfLocationIds` multi-select, and a `stock` field.

`lib/product-create.ts` (`addProductWithScope`):
- `assertWarehouseForWrite(formData.warehouse, scope)` before anything else.
- Services get `resolvedWarehouseId` assigned from the branch's main warehouse
  and are asserted *after* that assignment.
- Inside one `withTransaction`: the primary `products` insert, the opening
  `inventory_batches` row (only when `stock > 0`), `product_shelves`,
  selling units + `product_price_levels`, `supplier_product_mapping`, then the
  fan-out.
- `fanoutTargetWarehouses(selectedWarehouseId, scope)` returns every **other**
  active warehouse of the **one** branch, and each copy is inserted at
  `stock = 0` with no batch, no shelves, no selling units, no supplier mapping.
- The fan-out runs **last, inside the transaction, with no try/catch**, so a copy
  failure rolls the primary back.

### Target behaviour

**The form.** The "Warehouse (Optional)" single-select becomes a
**multi-warehouse section**: the user selects one or more warehouses, and each
selected warehouse gets a row with its own **initial stock** input. Selecting
zero warehouses remains valid (the field is optional today and a NULL-warehouse
product is a legitimate head-office state).

- One of the selected warehouses is the **primary**: it is the product's own
  `products.warehouse_id`, it owns `shelfLocationIds` / `product_shelves`, and it
  owns `product_selling_units` (the global `UNIQUE(barcode)` on that table means
  only one row can hold a given barcode — this constraint is **not** being
  changed). Default the primary to the first warehouse selected; let the user
  change it.
- **Cost is one shared field** for the whole submission. Every warehouse's opening
  batch is written at that same `unit_cost`.
- **Reorder point is one shared field.** Every row gets the same
  `reorder_point`.
- The inline "Add Warehouse" / "Edit Warehouse" affordances in the current
  combobox are kept.
- **The picker is fed by the new branch-scoped active-only list from Part 1**, not
  by today's unfiltered `externalProductOptions.warehouses`
  (`use-add-product-form.ts`). This matters more here than in the tab strip: the
  all-or-nothing rule below means a branch user who ticks four of their own
  warehouses plus one foreign one loses the **entire** form submission. Filtering
  the picker makes that unreachable through the UI rather than a repeatable
  "I filled in the whole form and it threw it away" bug. The server-side refusal
  stays regardless — the picker is a convenience, never the guard — and its
  message must **name the offending warehouse** so a bypassed-UI caller can
  recover.
- **Branch users must select at least one warehouse.** `assertWarehouseForWrite`
  refuses NULL for a branch-scoped caller, so zero-warehouse creation is
  head-office-only. The form cannot know the caller's scope on its own, so it
  learns it from the new warehouse-list action (which resolves the session
  anyway): the action returns whether the caller is head office, and the form
  enforces min-1 when it is not. Without this a branch user who deselects
  everything hits *"A product must stay in a warehouse of your branch"* at submit
  with no way to understand why.
- Services are unaffected: the whole section stays hidden for them, and
  `serviceProductSchema`'s pinned `z.undefined()` / `z.literal(0)` constraints
  must be updated to pin the **new** field shape equally tightly, so a service
  with warehouses or stock stays unrepresentable even if the UI is bypassed.

**The schema.** Replace the single `warehouse` + `stock` pair on
`standardProductSchema` with a collection carrying `{ warehouseId, stock }` per
entry plus a primary marker, and keep `cost` / `reorderPoint` as the existing
single fields. Exact shape is the implementer's call; it must:
- reject a duplicate `warehouseId` within one submission;
- reject a non-string or empty `warehouseId` (see Runtime id validation below);
- keep `stock` a non-negative integer per entry;
- keep the service variant unrepresentable as above.

The old single-warehouse shape must keep working for existing non-form callers if
any exist — notably the **approval queue**, which serialises `formData` into the
queue row and replays it at finalization. A product queued under the old shape and
finalized after this change must still create correctly. The implementer should
accept both shapes on input (normalising the legacy one to a single-entry
collection) rather than migrating queue payloads.

**The approval queue summary gets one `items[]` row per warehouse** (user's call).
Today `addProductWithScope` builds a single-element `items` array with
`quantity: formData.stock || 0` and no warehouse at all. With N warehouses and N
quantities, a single summed row would let an approver approve a create whose real
per-warehouse quantities they never saw. So emit one row per selected warehouse,
each carrying that warehouse's **name** (not just its id — the approvals page
renders this to a human) and its own quantity. Check how the approvals page
renders `items[]` and make sure N rows display sanely there; if it assumes one row
per product, that is part of this work.

**Known sharp edge, not fixed:** `scopeForQueuedItem(item.created_by)` re-resolves
the *creator's* scope at finalization, and **every** warehouse entry is re-asserted
against it. So a five-warehouse create whose creator has since changed branch, been
deleted or left branchless is refused in full and stays Pending — correct per the
existing Phase 2c rules, but a multi-warehouse create has strictly more ways to
become permanently unfinalizable than a single-warehouse one. Document it; do not
add a fallback.

**`addProductWithScope`.** The fan-out is replaced by an explicit, validated
multi-insert:

1. **Validate every target before opening the transaction.** Call
   `assertWarehouseForWrite` (which delegates to `assertWarehouseInBranch`) for
   **each** selected warehouse. One out-of-branch warehouse **refuses the whole
   submission** with a 403-equivalent `{ success: false, message }` — it is never
   silently dropped. This mirrors the existing all-or-nothing batch-writer rule in
   CLAUDE.md: *"every target is validated before any transaction opens, so one
   out-of-branch row refuses the whole batch and writes nothing."*
2. **Write everything in one `withTransaction`, with no try/catch around the
   secondary inserts**, exactly as the fan-out does today. The primary row, every
   additional warehouse row, and every opening batch are all-or-nothing.
3. **Each warehouse row gets its own opening `inventory_batches` row** when its
   stock > 0, at the shared `cost` and the product's `price`,
   `source_type = 'adjustment'`, notes `'Initial Stock'` — the same shape the
   current primary-only batch uses.
   **Note the existing bug this inherits:** today the primary batch insert is
   wrapped in `try/catch` that only `console.warn`s, so a failed batch leaves
   stock with no batch — stock that FIFO cannot deduct from. With stock now
   arriving in several warehouses this becomes materially worse. **Decision: make
   the batch insert fatal** (remove the swallow) so a product can never be created
   with stock that has no batch behind it. This is a deliberate behaviour change
   and must be called out in the implementation's commit message.
   **Each warehouse with opening stock > 0 also writes a `stock_movements`
   row** (user's call). Create writes **no** movement row today — not for the
   primary, not for a fan-out copy — so opening stock in five warehouses would be
   five stock changes with no audit history, against the CLAUDE.md invariant
   *"every stock change writes a movement record for audit/history."* Follow the
   shape `lib/stock-movements.ts` already uses for an opening/adjustment movement;
   match what `lib/stock-adjust.ts` writes. These rows are written **inside the
   same transaction**, so they are covered by the all-or-nothing rule — which is
   also what the refusal test below asserts (it is no longer a vacuous check).
4. **What each additional warehouse row carries** is the fan-out's list, unchanged
   except for stock: the 23 descriptive and commercial scalar columns plus
   `product_price_levels`, now with its **own** `stock` and its own opening batch.
   Still **not** carried, each for the reason the fan-out design gives:
   `product_shelves` / `shelf_location_id` (physical to one warehouse),
   `product_selling_units` (global `UNIQUE(barcode)`, `NOT NULL`),
   `parent_id` / `conversion_factor` (families; only roots fan out),
   `supplier_product_mapping` (neither `TransferStockService` nor `family-sync`
   copies it).
5. **`fanoutTargetWarehouses` is no longer called on the create path, and has no
   other caller — delete it.** An earlier draft said to keep it because migration
   144 depends on it; **that was checked and is false** — migration 144
   reimplements the logic inline and does not import it. After this change its
   only consumers are its own 6 tests, so the export and those tests go together.
   Do **not** change migration 144 itself: it is already applied, its backfill is
   historical fact, and its `down()` is deliberately strict.
6. **Copies remain independent.** No field sync between warehouse rows, before or
   after creation.

### Runtime id validation

Every `warehouseId` arriving from the form is attacker-controlled: these are
server-action arguments and TypeScript types are erased. `assertWarehouseInBranch`
already throws `BranchResolutionError` for a non-string or empty id *before* the
head-office early return, and that must not be weakened. Note specifically why:
`lib/mysql.ts` uses `pool.query`, which escapes an **object** parameter as
`` `key` = value ``, so a `WHERE id = ?` with `{foo: 0}` becomes a match-many
predicate. The new collection must validate each entry, not just the first.

### Branch scope, unchanged

- `scope === null` (no valid cookie) still falls back to the pre-guard path. This
  change does not narrow or widen that window; the Phase 2c fallback and its
  12-hour cookie lifetime apply here as everywhere else.
- Head office (`{ scope: 'all' }`) may select warehouses freely — but note the
  behaviour change this creates versus the fan-out: head office previously fanned
  out within *the selected warehouse's branch only, never across branches*. With
  an explicit selection, head office **can** now pick warehouses in two different
  branches. **Decision: allow it.** Head office legitimately administers across
  branches, the selection is explicit rather than implicit, and each row still
  lands in exactly the warehouse chosen. A branch-scoped user remains confined to
  their own branch by `assertWarehouseInBranch`.

---

### The zero-warehouse / primary-marker edge

Two edges the schema must handle explicitly:

- **Zero warehouses selected** means no primary, so `products.warehouse_id` is
  NULL. The primary marker must therefore be **optional when the collection is
  empty**, and that optionality must not loosen the service-variant pinning
  (a service must still be unable to carry warehouses or stock).
- `shelfLocationIds` and `sellingUnits` then belong to a row in no warehouse.
  That is already possible today, so it is **unchanged** — not a new state to
  design for.
- Zero-warehouse creation is **head-office-only**, enforced client-side as
  described in the form section above and server-side by
  `assertWarehouseForWrite` regardless.

## Decisions made by the user

- Warehouse selector becomes **tabs**, not a header picker. ("mga tab nga sayon
  i-switch")
- The warehouse list (tabs **and** create-form picker) becomes **branch-scoped and
  active-only**, via a new session-resolving server action — rather than reusing
  today's unfiltered `SELECT * FROM warehouses`.
- Opening stock per warehouse **writes a `stock_movements` row**, closing an audit
  gap create has today.
- The approval queue shows **one row per warehouse**, each with its own quantity,
  so an approver sees what they are approving.
- Multi-warehouse creation must do **both**: choose *which* warehouses (not all
  automatically), **and** enter stock per warehouse. ("gusto naku kani pareho")
- **One shared cost**, not per-warehouse. ("usa ra ka cost nga gipaambit")
- **One shared reorder point**, not per-warehouse.
- "All warehouses" is retained as a tab; Edit Product stays single-warehouse.
  (Played back and confirmed: "wala nay sayop ani")

## Decisions made by me (my call, not the user's) — check these

- The primary-warehouse concept, and which tables follow the primary
  (`product_shelves`, `product_selling_units`). Forced by the global
  `UNIQUE(barcode)` on `product_selling_units`.
- Making the opening-batch insert **fatal** instead of a swallowed `console.warn`.
- Allowing head office to select warehouses across branches.
- Accepting both the legacy single-warehouse and the new collection shape, to
  keep already-queued approval items replayable.
- Keeping `fanoutTargetWarehouses` rather than deleting it.
- Tab overflow mechanism left to the implementer, within the stated requirements.

## Left to the builder

- The tab component (there is an existing shadcn `Tabs` in this codebase) and the
  overflow strategy.
- The exact Zod shape of the warehouse collection and its service-variant pinning.
- The per-warehouse stock row layout in the inventory tab.
- Whether the shared cost/reorder-point fields move visually next to the warehouse
  section to make their shared-ness obvious.

## Testing

### `tests/e2e/product-fanout.spec.ts` must be rewritten — this is in scope

The file has 15 tests in two describe blocks, and **9 of them assert behaviour
this design removes**. This is a file to rewrite, not a line to tweak, and the
assertions must be **ported where they encode properties the design still wants**
— not silently deleted.

- `test.describe('fanoutTargetWarehouses')` — **6 tests, delete with the
  function** (see point 5: it has no remaining caller).
- `addProductWithScope fan-out` — 9 tests. **Flatly contradicted and replaced:**
  *"a created product appears in every active warehouse of the branch at zero
  stock"* (now: only the selected ones, at their own stock) and *"no inventory
  batch is created for a fanned-out copy"* (now: a batch per warehouse with
  stock). **Port and keep:** *"the copy carries the descriptive columns of the
  original"*, *"the copy takes its scalar columns from the post-sync primary, not
  from the form"*, *"product_price_levels rows are copied … under its own product
  id"*, *"selling units are not copied"*, *"a service product does not fan out"*
  (now: a service takes no warehouse collection), *"a NULL-warehouse product
  creates one row"*, and *"a fan-out failure rolls back the primary insert"* —
  that last one is the all-or-nothing property and is more important now, not
  less.

### New and regression

- E2E: a branch user creating into two warehouses of their own branch gets two
  rows with the right stock, a batch each, and a `stock_movements` row each.
- E2E: a branch user whose submission includes another branch's warehouse gets a
  refusal naming that warehouse, and **zero** rows written — `products`,
  `inventory_batches` **and** `stock_movements`. The movements check is meaningful
  now that create writes them; before this design it would have passed vacuously.
- E2E: the new warehouse-list action returns only the caller's branch's active
  warehouses for a branch user, and all branches' for head office.
- E2E: a queued multi-warehouse `PRODUCT_CREATE` shows one `items[]` row per
  warehouse with the right quantities, and finalizes into the creator's branch.
- E2E: the products table's tab strip selects the resolved default on load, and a
  branch with no warehouses shows an empty table rather than an unfiltered one.
- E2E: "Clear filters" does not change the selected warehouse tab.
- Regression: `tests/e2e/branch-write-isolation.spec.ts` and
  `tests/e2e/reports-distinct-counts.spec.ts` must still pass — the latter because
  per-warehouse stock means copies are **no longer necessarily zero-value**, so
  the valuation reports' `SUM`s now legitimately include them at creation time
  rather than only after a transfer. That is correct behaviour, not a regression,
  but confirm the DISTINCT-count assertions still hold.
