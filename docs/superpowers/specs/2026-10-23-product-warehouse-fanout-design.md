# Auto-fan-out a new product to every warehouse in its branch

**Date:** 2026-10-23
**Status:** Design, approved for planning

---

## Intent and the why

Today a product lives in exactly one warehouse. `products` holds **one row per
(product, warehouse)** — the same item stocked in three warehouses is three
rows with three different `id`s and the same `sku`. Migration 056 made this
explicit by replacing `UNIQUE (sku)` with `UNIQUE (sku, warehouse_id)`
precisely so the same SKU can repeat across warehouses.

The consequence is operational friction the user raised directly: when a new
product arrives, it exists in one warehouse only. To make it exist anywhere
else, a user must run a **stock transfer** — even when there is no stock to
move yet. The transfer is being used as a *product-provisioning* mechanism
rather than a stock-movement one.

That mechanism already does the provisioning work. In
`src/infrastructure/services/TransferStockService.ts`, when the destination
warehouse has no matching product row, the transfer **creates one** (matching
first by `sku`, then by `name`), copies the descriptive columns and the price
levels, and inserts it at `stock = 0` before applying the transferred quantity.

This design moves that provisioning to product-creation time, so the row
already exists and no transfer is needed to bring a product into being
somewhere.

### The user's words

> "dire sa atong warehouse features gusto naku automatic sya muadd ug products
> ang warehouse products kung naa warehouse nga nacreate" → clarified to:
> "bali kung magadd ko ug products naa pud products sa mga warehouse" —
> i.e. **product → warehouses**, not warehouse → products.
>
> "para dili naku magtransfer ug products sa mga warehouse kung bagong products sya"

---

## Goals

1. Creating a product inserts one `products` row per **active warehouse in the
   creating user's branch**, not just the selected one.
2. The selected warehouse keeps the entered quantity and its inventory batch.
   **Every other copy is `stock = 0` with no batch.**
3. The copies are immediately visible and searchable in the products list and
   can receive stock directly (purchase, receipt, adjustment) with no transfer.
4. The products table defaults to showing **one** warehouse, so a product
   appears as one row, not N.
5. A one-time backfill fans out all **existing** products the same way.

## Non-goals

- **No cross-branch fan-out.** Nothing is ever written into another branch's
  warehouse.
- **No field synchronization between copies.** Editing the price or name of one
  copy does not touch the others. `updateProduct` is unchanged. (User: *"independent
  ra kada warehouse sama sa karon"*.)
- **No opt-out UI.** No checkbox; fan-out is unconditional. (User: *"automatic
  kini sa kada product nga ma-create (walay pangutana)"*.)
- **No stock duplication.** Quantity is never copied.
- No change to the warehouse-creation path. (The original phrasing suggested
  warehouse → products; the user reversed it.)

## Anti-goals — this is a failure even if it "works"

- **A branch guard regressing.** `products.warehouse_id` is the *sole* carrier
  of a product's branch identity across Phase 1–2c. A fan-out that writes into
  a warehouse outside the caller's branch silently undoes that work. The
  fan-out must be subject to the same `assertWarehouseInBranch` discipline as
  the primary insert.
- **A products list showing the same product N times.** If the display default
  is not changed in the same change, the feature makes the main inventory
  screen worse, not better. Goal 4 is not polish; it ships with Goal 1.
- **Stock appearing out of nothing.** Any copy carrying a non-zero quantity, or
  an `inventory_batches` row, corrupts inventory valuation and FIFO cost
  (`lib/batch-deduction.ts`).
- **A partially-created product.** A product that exists in 2 of 4 warehouses
  because the loop failed halfway is worse than the current behaviour.

---

## Constraints

### Hard DB constraint: `product_selling_units.barcode` is globally unique

Migration 115 declares `UNIQUE KEY unique_selling_unit_barcode (barcode)` —
**global, not per product and not per warehouse**, and `barcode` is `NOT NULL`.
`products.barcode` has no unique key, but selling units do.

So a fan-out **cannot** copy a product's selling units verbatim: the second
copy's base-unit barcode collides and `addProductWithScope` already surfaces
that collision as *"That barcode is already used by another product's selling
unit."*

This is the single biggest decision in the work. **It is decided: option (1)
below.** The user was shown both and chose the recommendation. Option (2) is
recorded only so a future reader knows it was considered and rejected for this
change.

1. **DECIDED — Do not copy selling units to the zero-stock copies.** The copy gets the
   scalar `products` columns (name, price, cost, sku, barcode, unit_of_measure,
   category, …) and no `product_selling_units` rows. This matches what the
   existing transfer path does — note `TransferStockService` copies
   `product_price_levels` but **not** selling units — so it introduces no new
   inconsistency, and a user who wants multi-unit selling in that warehouse
   adds the units there. Cheapest and lowest-risk.
2. **REJECTED for this change — Widen the key to `(warehouse_id, barcode)`** via a new migration, scoping
   it through the owning product. This is a schema change to a table with many
   consumers (`lib/product-selling-unit-writes.ts`,
   `app/api/pos/checkout/selling-unit-resolve.ts`,
   `lib/selling-units-migration.ts`) and should not be undertaken as a
   side-effect of this feature.

Relevant to the choice: the POS does **not** resolve a scanned barcode with a
global `SELECT … WHERE barcode = ?`. It resolves against its already
warehouse/branch-filtered product list, so duplicate barcodes across warehouses
are a *storage*-key problem, not a lookup-ambiguity problem.

Under the decided option, the product's own `barcode` and `sku` scalar columns
**are** copied — only `product_selling_units` rows are skipped. A user who wants
multi-unit selling in another warehouse adds the units on that copy. The
unique-barcode collision therefore cannot occur, and no migration to table 115
is part of this work.

### `(sku, warehouse_id)` is unique, and `sku` may be NULL

Different warehouses, same SKU — allowed by design (056). Two rows with the
same SKU *and* the same warehouse are blocked, so the fan-out must not insert
into a warehouse that already holds that SKU (relevant to the backfill, where
some products already exist in several warehouses).

Note `sku` is nullable and NULLs do not collide in a MySQL unique index, so SKU
alone is not a reliable identity for the backfill. The existing transfer code
matches on `sku` **then falls back to `name`**; the backfill should use the same
two-step match so it agrees with the system's existing notion of "the same
product in another warehouse."

### `warehouses` has both `is_active` and `active`, and they can disagree

`app/api/warehouses/route.ts` runtime-adds an `active` column alongside the
migration-created `is_active`, then runs a one-directional partial sync
(`UPDATE warehouses SET active = is_active WHERE active IS NULL OR active = TRUE`).
A warehouse deactivated through a path that writes only one column reads active
in the other.

**Decided (author's call): `is_active` is the source of truth for the fan-out,
and this work does not reconcile or touch the stale `active` column.** Flipping
`active` on rows where the two disagree could change warehouse visibility
elsewhere in the app, which is a larger blast radius than this feature earns.
The duplication is pre-existing debt, recorded here so the next reader finds it.

Note also that `warehouseIdsForBranch` (`lib/branch-context.ts:211`) filters by
`branch_id` **only** and does not filter on activity at all. The fan-out's
active-only rule is therefore its own query, not a reuse of that helper.

### `warehouses.is_main` is not created by a migration

`lib/product-create.ts:125` already orders by `is_main`, and
`app/api/warehouses/route.ts` / `[id]/route.ts` add the column at runtime via an
ensure-column list. There is **no migration** for it. Any new code that depends
on `warehouses.is_main` (notably the default-warehouse choice in Goal 4) must
not assume it exists, or must add the migration. This is pre-existing debt the
builder should resolve deliberately rather than inherit silently.

### The Phase 2c session-cookie fallback still applies

`addProduct` resolves its scope from the signed session cookie via
`resolveScopeFromSession()`, which returns `null` when the cookie is absent or
expired (12-hour max age, issued only at login). Per CLAUDE.md this falls back
to unguarded **by design**. The fan-out inherits that fallback exactly: see
"Scope resolution" below for what `null` must mean here.

### Other

- MySQL only, raw `mysql2/promise`, no ORM.
- All DB logic in API routes or `lib/`, never in Server Components.
- **`lib/product-create.ts` must not gain a `'use server'` directive**, and must
  never be re-exported from a `'use server'` file. It takes a `scope` parameter;
  per CLAUDE.md a server action's parameters are attacker-controlled, so a
  `scope` argument on a `'use server'` export is a complete bypass.
- E2E tests run `workers: 1` against `alon_pos_test`.

---

## The how — decided

### Where the fan-out lives

In **`lib/product-create.ts`**, inside `addProductWithScope`, within the
**existing `withTransaction`** block, after the primary product row and its
batch/shelves/selling-units/supplier-mappings are written.

Rationale: this is already the single trusted creation path. Both of its callers
(the public `addProduct` action with the session scope, and the approval
processor with a `created_by`-derived scope) then get the behaviour for free,
including `createProductsFromExcel`, which creates products by calling
`addProduct`.

### All-or-nothing

Sharing the existing transaction makes the whole fan-out atomic with the primary
insert: either the product exists everywhere in the branch or nowhere. This
matches the all-or-nothing rule CLAUDE.md states for batch writers.

Consequence to respect: the fan-out **must not** be wrapped in the kind of
`try/catch`-and-warn that the initial-batch insert uses
(`console.warn('[BatchCosting] …')`). A swallowed fan-out failure produces
exactly the partial product the anti-goals forbid.

### Scope resolution — which warehouses

| Caller | Warehouses fanned into |
|---|---|
| Branch user (`scope.scope === 'single'`) | all `is_active = 1` warehouses where `branch_id = scope.branchId` |
| Head office (`scope.scope === 'all'`) | all `is_active = 1` warehouses of **the branch owning the selected warehouse** |
| `scope === null` (no/expired cookie) | **the branch owning the selected warehouse** |

The head-office rule is the user's explicit decision: *"sa branch ra sa warehouse
nga gi-pili nya"* — a head-office user does **not** fan out across all branches.

The `null` row is the builder's call, made here for consistency: deriving the
target set from the *selected warehouse's own branch* needs no trusted identity
at all, so it behaves identically to the head-office case and does not widen the
Phase 2c fallback. It must never mean "all warehouses everywhere."

Edge cases, all of which must leave the primary insert intact:

- Selected warehouse is `NULL` (head-office product belonging to no branch) → no
  fan-out. There is no branch to fan out within.
- Service products (`itemType === 'service'`) → **no fan-out.** A service is
  performed at the store, is not stocked, and is deliberately kept out of
  batches and FIFO. `product-create.ts` already assigns it a warehouse itself.
- The branch has exactly one active warehouse → no extra rows; not an error.
- Inactive warehouses are skipped. A row on an inactive warehouse is the kind
  of orphan Phase 3 refuses branch deactivation to avoid.

### What each copy carries

Copy: the descriptive and commercial scalar columns — `name`, `description`,
`additional_description`, `category`, `brand`, `department`, `subcategory`,
`supplier_id`, `reorder_point`, `price`, `cost`, `sku`, `barcode`, `image_url`,
`image_hint`, `unit_of_measure`, `income_account`, `expense_account`,
`vat_status`, `availability`, `earns_points`, `is_perishable`, `type`.

Zero or omit: `stock` = 0, `avg_daily_sales` = 0, **no `inventory_batches` row**,
no `product_shelves` rows (shelf locations are physical to one warehouse).

Each copy gets its own fresh `id` in the same format the file already uses.

`product_price_levels`: the existing transfer path copies these, so copying them
keeps the two provisioning paths consistent. The builder should copy them unless
the selling-units decision above makes that incoherent.

### Display: default the products-table warehouse filter

`app/(app)/products/page.tsx:326` initialises `selectedWarehouse` to `'all'`,
and line 359 sends `warehouse: undefined` for `'all'`. With fan-out live, `'all'`
renders every product once per warehouse — the anti-goal.

Change the **default** to a single warehouse. `'all'` remains selectable, and the
existing filter UI, active-filter chips and count badges keep working unchanged.

Which warehouse is the default is the builder's call, constrained by:

- It must be a warehouse of the user's own branch.
- It must not depend on `warehouses.is_main` without first resolving the
  missing-migration issue above.
- A user whose branch has no warehouses must get an empty list, not an
  unfiltered one.

Stated as the author's call, not the user's: the user's instruction was *"dapat
naka default filters warehouse"* and that the table read per-warehouse rather
than per-row; the specific warehouse chosen is an implementation detail.

#### A warehouse filter currently disables the family roll-up — this must be fixed too

**This is the largest piece of work in the change and it is not optional.**

`getProducts` and `getProductsCount` (`app/(app)/products/actions.ts:115` and
`:423`) compute one `hasActiveFilters` flag that includes
`filters.warehouse !== 'all'`, and then use it for **two unrelated purposes**:

1. when no filter is active, `WHERE p.parent_id IS NULL` pages only family roots
   (`:168`, `:435`);
2. when no filter is active, a recursive CTE attaches `children[]` for the
   expandable family rows (`:185`).

So merely changing the default would make every first page load a **flat list
with every child product as its own top-level row and no family grouping** — a
different shape of the same anti-goal this design exists to prevent, and a
permanent regression for all users.

The warehouse filter must therefore be **decoupled** from the roll-up switch:
warehouse scoping is a *row-visibility* concern and must not suppress family
roll-up. The roll-up should stay on for a warehouse-only filter. Both functions
and the CTE need the change, kept consistent with each other so the count and
the page agree.

#### The products list is not branch-filtered at all (scope boundary)

Correcting an error in an earlier draft of this document: `getProducts` /
`getProductsCount` apply **no** branch scoping whatsoever — no
`warehouseIdsForBranch`, no session scope. A branch user's product list today
shows every product in every branch. Unlike `app/api/reports/stats/route.ts`,
which does scope correctly, these two actions never did.

**Decided: adding real branch filtering to the products list is OUT OF SCOPE
here**, and the "empty list, not an unfiltered one" line above is a constraint
on the *default*, not a claim that the list is branch-safe.

Why out of scope: it is a pre-existing read-isolation gap, not one this feature
creates; it changes what existing users see; and CLAUDE.md already tracks
unisolated reads (`approvals/queue`, `reports/soa`) as deliberate follow-ups.
Folding it in would hide a visibility change inside a convenience feature.

Be honest about the consequence rather than papering over it: because the list
is unfiltered, a user who selects `'all'` sees other branches' products, and
fan-out makes that view N× larger. The default hides this; it does not fix it.
**This belongs on the follow-up list as a read-isolation item, alongside the
`GET /api/branches` gap Phase 3 left open.**

### POS: a blank terminal location becomes an unfiltered catalogue

POS loads its catalogue through `MySqlProductRepository`, which applies
`AND products.warehouse_id = ?` behind `if (filters.warehouseId)` — a
**truthiness** check (`:66`, `:196`). The id comes from the terminal's
`location` column, which `app/api/pos-terminals/route.ts` defaults to the
literal string `'Store'` when omitted, and which the add/edit dialogs can set
to `'Store'` when no warehouses exist.

Two failure modes, in opposite directions:

- `location = 'Store'` → matches no warehouse → **zero products**. Exists today
  and is loudly visible.
- `location = ''` or NULL → the filter is **dropped entirely** → post-fan-out,
  POS search returns every warehouse's copy of every product: duplicate rows
  with the same name and barcode, most at zero stock. A cashier can ring up the
  wrong row. Today this merely shows all (distinct) products, so fan-out turns a
  cosmetic problem into a correctness one.

**Measured on the live local DB (2026-10-26): 1 terminal, `location = 'wh_main'`
— valid.** So this is latent, not active, and the fix is proportionate: make the
POS path **fail closed** rather than fall back to unfiltered — when the
terminal's location is blank or does not resolve to a warehouse, scope to the
terminal's branch warehouses (`pos_terminals.branch_id` is populated and is the
server-side source of branch truth per CLAUDE.md) or return nothing, never
everything. A regression test should cover the blank case.

### Report counts will multiply — business metrics fixed, row counts left alone

The branch-scoped reports scope by all warehouses of the branch, which is
exactly the fan-out set. Verified instances:

- `app/api/reports/stats/route.ts:175` — `COUNT(*) … WHERE type = 'standard'`
  as `total_items`.
- `app/api/reports/stats/route.ts:174` — `low_stock_items`. Worse than a simple
  multiplication: every zero-stock copy has `stock > 0` false, so it is excluded
  — but a copy that later receives a little stock joins the low-stock count,
  so one product can be reported low-stock several times.
- `app/api/reports/inventory/route.ts:87,123` — `COUNT(*)` as `total`/`totalItems`.

Stock totals and valuation are **safe** by construction (copies are zero-stock
with no batches, so FIFO and valuation are untouched). It is the **counts and
averages** that change: "Total Products" rises by roughly the active-warehouse
count per branch on the day the backfill runs.

**Decided (author's recommendation, accepted by the user): fix the counts that
are business metrics, and leave the counts that are row counts alone.** The two
are not the same thing, and a blanket "make them DISTINCT" would introduce a
bug:

| Count | What it means | Action |
|---|---|---|
| `reports/stats:175` `total_items` | "how many products does this branch sell" — a **business metric** | `COUNT(DISTINCT …)` |
| `reports/stats:174` `low_stock_items` | "how many products need reordering" — a **business metric**, and worse than multiplied: one product can be counted once per warehouse that happens to be low | `COUNT(DISTINCT …)` |
| `reports/inventory:87` `total` | **pagination count** — must equal the number of rows actually listed | **leave as `COUNT(*)`** |
| `reports/inventory:123` `totalItems` | total over the same listed/filtered row set | **leave as `COUNT(*)`** — it is the row count for the rows shown |

Making the pagination count DISTINCT while the page query still returns one row
per product-warehouse would desynchronise `totalPages` from the data and produce
empty or truncated trailing pages. That is a real bug, not a cleanup.

**Identity for the DISTINCT:** `sku` is nullable, so `COUNT(DISTINCT sku)` alone
silently drops every NULL-SKU product. Use a coalesced identity — e.g.
`COUNT(DISTINCT COALESCE(sku, CONCAT('name:', name)))` — matching the
`sku`-then-`name` identity the existing transfer path and the backfill use. The
builder should confirm the exact expression against the real column nullability.

`reports/inventory` is a per-warehouse-row inventory listing, which is arguably
the *correct* granularity for an inventory report post-fan-out; the user-facing
label is what may need wording, not the query.

### Backfill migration

A new numbered migration (next free number after 143) fans out existing
products, with `up()` and `down()`.

Requirements:

- **Idempotent.** Insert only where that branch's warehouse does not already
  hold the product, matching `sku` first then `name` — the same two-step match
  `TransferStockService` uses.
- **Per-branch, never cross-branch**, by the same rule as the runtime path: a
  product is fanned out only within the branch of its own `warehouse_id`.
- **Skip** products with `warehouse_id IS NULL` (no branch), services
  (`type = 'service'`), and inactive warehouses.
- **Every inserted row is `stock = 0` with no batch.** The backfill must not
  create a single unit of inventory.
- **Skip non-root products** (`parent_id IS NOT NULL`). `lib/family-sync.ts`
  already copies `parent_id` verbatim into another warehouse, producing a child
  whose parent row lives in a different warehouse — an incoherence that predates
  this work. The backfill must not add to it: copying `parent_id` creates more
  cross-warehouse families, and nulling it turns a child into a spurious
  top-level product. Root-only is the conservative choice, and it costs nothing
  today (see sizing). `conversion_factor` is likewise not copied, since it is
  meaningful only in a family.
- Sizing, **measured** on the live local DB (`alon_pos`) on 2026-10-26:
  **3 products, 1 branch, 2 active warehouses, 0 children, 0 services, 0 NULL
  warehouses.** The backfill creates on the order of **3 rows**. A single-pass
  insert is correct; chunking, progress reporting, a resumable marker and an
  abort ceiling would all be speculative complexity. The builder should still
  write the query so it does not degrade pathologically, but must not build for
  a scale that does not exist. Re-measure before running against any other
  install.
- `down()` must be honest about what it can reverse. Deleting "the rows the
  backfill created" is only safe if they are identifiable and still at
  `stock = 0` with no movements. A row that has since received stock, been sold
  from, or acquired `stock_movements` must **not** be deleted; precedent for
  refusing an unsafe `down()` is migration 142, which throws rather than
  corrupt data.

---

## Left to the builder

1. **The default warehouse** for the products table, within the constraints
   above.
2. Whether `warehouses.is_main` gets a real migration as part of this work or
   is avoided entirely. (Scoped to `is_main` only — `active` is explicitly left
   alone, see constraints.)
3. Whether `product_price_levels` are copied (recommended: yes, matching the
   transfer path).
4. How the backfill identifies its own rows for a safe `down()`.
5. The mechanics of decoupling the warehouse filter from the family roll-up in
   `getProducts` / `getProductsCount` / the CTE — *that* it must be decoupled is
   decided; how, is not.
6. Test shape. Given CLAUDE.md's emphasis, the suite should cover at minimum:
   a branch user's fan-out staying inside its branch; a head-office user's
   fan-out confined to the selected warehouse's branch; every copy at
   `stock = 0` with no `inventory_batches` row; a service product not fanning
   out; all-or-nothing on failure; the backfill being idempotent across two
   runs; the family roll-up surviving a warehouse-only filter; and POS failing
   closed on a blank terminal location.

---

## Decision log

| Decision | Who |
|---|---|
| Direction is product → warehouses, not warehouse → products | user |
| Copies exist at zero stock; no stock is duplicated | user |
| Fan-out is confined to one branch | user |
| No field sync between copies; independent as today | user |
| Automatic, no opt-out checkbox | user |
| Products table defaults to one warehouse, not `all` | user |
| Head office fans out into the selected warehouse's branch only | user |
| One-time backfill for existing products | user |
| Selling units are not copied to the zero-stock copies; table 115's unique barcode key is left alone | user (chose the recommendation) |
| `scope === null` behaves as the head-office case | author |
| Fan-out shares the existing transaction (all-or-nothing) | author |
| Services are excluded | author |
| Shelf locations are not copied | author |
| `is_active` is the source of truth; stale `active` column left alone | author |
| Backfill skips non-root products; `conversion_factor` not copied | author |
| Backfill sized from measured data (3 products × 2 warehouses) — single pass, no chunking | author, from measurement |
| Warehouse filter must be decoupled from the family roll-up (not optional) | author, from review |
| Real branch filtering of the products list is out of scope; recorded as a follow-up | author |
| POS must fail closed on a blank terminal location, never fall back to unfiltered | author |
| Business-metric counts go `COUNT(DISTINCT …)`; pagination counts stay `COUNT(*)` | author's recommendation, user accepted |
