# Selling Product Units — Design

**Date:** 2026-09-11
**Status:** Approved for planning

## Summary

Remove the parent/child product feature (`products.parent_id`, `products.conversion_factor`, the `conversion_factors` table, and `lib/family-sync.ts`'s recursive cascade) and replace it with **Selling Product Units**: a flat, per-product list of the different units a single product can be sold in (e.g. Piece, Box, Case), each with its own barcode, cost, and price (including per-price-level pricing). Today, "sell by the sachet vs by the bag" is modeled as two entirely separate `products` rows kept numerically in sync by a recursive cascade. After this change it is one product row with one stock ledger, and each selling unit just declares how many base units it equals.

This supersedes the parent/child pieces of `2026-07-14-child-reassignment-design.md`, `2026-07-14-reassign-autodetect-factor-design.md`, and `2026-07-14-reassign-toplevel-design.md` (those dialogs are removed), and folds per-unit pricing in alongside the existing `2026-07-30-product-price-levels-auto-calc-design.md` price-levels feature (which is kept, just re-scoped from per-product to per-unit).

## Why this change

- The current model requires a brand-new `products` row (own SKU, own stock, often no `inventory_batches` of its own) for every alternate unit, kept in sync only by best-effort cascade math in `lib/family-sync.ts`. The research for this spec found two independently-written, behaviorally-divergent implementations of that cascade (`lib/family-sync.ts` vs `src/infrastructure/services/TransferStockService.ts`) — a 3-level family transferred through the single-item transfer endpoint does not sync the same way it does through the bulk endpoint. This is a correctness landmine, not just a UX one.
- A unit that is never itself purchased directly has zero `inventory_batches` of its own, so selling it falls through to `products.cost` instead of true FIFO — an unnoticed reporting inaccuracy today.
- The `products.parent_id` UI path for creating a "child" (`productType === 'child'` in the Add Product form) is dead code — unreachable in the shipped app. All real parent/child creation happens through three separate side-dialogs (Quick Add Child, Reassign Parent, Break Pack), which is more moving parts than the concept needs.

## Decisions

| Question | Decision |
|---|---|
| Stock model | **One stock, one FIFO batch ledger per product.** No nested/grandchild tree — a flat list of selling units per product. |
| Unit fields | Each selling unit: `unit_name`, `qty_base` (how many base-stock units it equals), `barcode` (own, unique), `cost` (own, reference/display only), `price` (own, per price level). |
| Price levels | **Merged into selling units.** The existing `price_levels` table (Retail/Wholesale, admin-managed) stays; per-product `product_price_levels` overrides are replaced by per-selling-unit `product_selling_unit_prices`. |
| COGS source | **FIFO batch cost stays authoritative.** Selling `N` of a unit deducts `N × qty_base` base units from the same `inventory_batches` the base unit uses. A unit's `cost` field never drives the actual deduction — it's a reference/margin-display value on the product form only. |
| Legacy scalar columns | `products.price` / `cost` / `barcode` / `unit_of_measure` **stay, as an auto-synced mirror of the base selling unit** (`qty_base = 1`). Every write to the base unit updates these columns in the same transaction. Scope boundary: the ~100+ existing consumers of these columns (reports, CSV import/export, the Sta Lucia integration, `lib/scheduler.ts`, etc.) are **not** touched by this change — they keep working unmodified because the mirror is always correct. Migrating them to read `product_selling_units` directly is future, incremental work, not part of this change. |
| Break Pack / Consolidate | **Kept**, but decoupled from `parent_id`. Becomes a one-off transaction between two independently-stocked products (consume X of a source product, produce Y of a target product), with the X:Y ratio entered at transaction time — no persisted conversion relationship. |
| Quick Add Child / Reassign Parent | **Removed entirely.** Their sole purpose was manipulating `parent_id`, which no longer exists. |
| Sales/purchase history | **Record which unit was used.** Add `selling_unit_id` (+ a denormalized snapshot of `unit_name`/`qty_base` at transaction time, so historical receipts/reports stay accurate even if the unit definition later changes) to `sales_items` and `purchase_order_items`. |
| Existing parent/child data | **Migrated, not discarded.** Every child becomes an additional selling unit on its former parent; the child `products` row is then deleted. Detailed steps below. |

## Data model

### New table: `product_selling_units`

```sql
CREATE TABLE product_selling_units (
  id VARCHAR(50) PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL,        -- FK -> products(id) ON DELETE CASCADE
  unit_name VARCHAR(100) NOT NULL,
  qty_base DECIMAL(14,6) NOT NULL,        -- how many base-stock units this equals (fractional for units smaller than the base)
  barcode VARCHAR(100) NOT NULL,
  cost DECIMAL(10,2),                     -- reference/display only, see Decisions
  price DECIMAL(10,2) NOT NULL,           -- default price (paired with the default price_level)
  is_base BOOLEAN NOT NULL DEFAULT FALSE, -- exactly one TRUE row per product, qty_base = 1
  sort_order INT NOT NULL DEFAULT 0,
  created_at, updated_at,
  UNIQUE KEY (barcode),
  UNIQUE KEY unique_product_unit_name (product_id, unit_name)
);
```

### New table: `product_selling_unit_prices`

```sql
CREATE TABLE product_selling_unit_prices (
  selling_unit_id VARCHAR(50) NOT NULL,   -- FK -> product_selling_units(id) ON DELETE CASCADE
  price_level_id VARCHAR(50) NOT NULL,    -- FK -> price_levels(id) ON DELETE CASCADE
  price DECIMAL(10,2) NOT NULL,
  min_quantity DECIMAL(10,2),             -- nullable: optional quantity gate, same as today
  PRIMARY KEY (selling_unit_id, price_level_id)
);
```

This is a direct re-scope of `product_price_levels` (product-level) down to selling-unit level — same shape and same one-row-per-(unit, level) cardinality as the table it replaces (a single optional `min_quantity` gate per row, not multiple volume tiers), same admin UI for managing the `price_levels` list itself (`app/(app)/products/price-levels/`), unchanged.

### Dropped

- `conversion_factors` table
- `products.parent_id`, `products.conversion_factor` columns
- `product_price_levels` table (superseded by `product_selling_unit_prices`)

### New columns on transaction tables

- `sales_items.selling_unit_id` (nullable FK, `ON DELETE SET NULL` — history must survive a later unit deletion), plus `sales_items.selling_unit_name`, `sales_items.selling_unit_qty_base` (snapshot at sale time).
- `purchase_order_items.selling_unit_id` + same snapshot columns, same FK behavior.

## Costing & stock deduction

Selling `qty` of a selling unit with `qty_base = B`:
1. Compute `baseQty = qty * B`.
2. Call the existing `deductFromBatches(productId, baseQty, ...)` unchanged — FIFO math, oversell handling, and the `pos_settings.batch_costing_oversell_block` behavior are untouched.
3. Decrement `products.stock` by `baseQty` and write one `stock_movements` row (unchanged pattern).

Receiving `qty` of a selling unit on a PO:
1. `baseQty = qty * B`.
2. Insert one `inventory_batches` row for `baseQty` at whatever per-base-unit cost the receipt implies (existing `lib/purchase-actions.ts` logic, just fed `baseQty` instead of the raw line quantity).
3. Increment `products.stock` by `baseQty`.

This entirely replaces `lib/family-sync.ts`'s `deductFamilyStock`/`addFamilyStock`/`findUltimateRoot` cascade — there is no cascade anymore because there is only one stock value and one batch ledger per product. `syncFamilyStockDuringTransfer` (both copies) is replaced by a plain single-product stock transfer (no family walk needed).

## Add/Edit Product UI

- Replace the "Conversion" tab with a **"Selling Units"** tab: a repeatable row list — Unit Name, Qty Base, Barcode, Cost, and one price column per active `price_level` (Retail, Wholesale, ...). The first row is locked as the base unit (`qty_base = 1`, `is_base = true`), pre-filled from the product's own current barcode/cost/price so nothing is lost on migration.
- Remove the separate "Price Levels" tab — its per-price-level inputs move inline into the Selling Units rows.
- Delete the dead `productType === 'child'` branches, the manual single Conversion Factor field, and the `parentId` schema field, from both `add-product/` and `edit-product/` (schema files, tabs, and their hooks).
- `add-product/actions.ts` / `edit-product` equivalents: `addProduct`/`updateProduct` write the full `product_selling_units` + `product_selling_unit_prices` set (delete-then-reinsert, same pattern the current code uses for `conversion_factors`), and sync the base row's values onto `products.price/cost/barcode/unit_of_measure`.

## POS checkout

- Barcode scans already resolve the exact selling unit directly (`product_selling_units.barcode` is unique), so no picker is needed on that path — this is strictly simpler than today's "which of these N separate product rows did you scan" resolution.
- Manual product search (`ProductSearchDialog.tsx`) shows one row per product; if it has more than one selling unit, a small unit picker (chip/dropdown) appears before add-to-cart.
- `lib/pricing.ts`'s `calculateEffectivePrice` is re-pointed from `product_price_levels` to `product_selling_unit_prices`, keyed by the chosen selling unit + the active price level (customer's pinned level, or the POS-selected level, or the default).
- `app/api/pos/checkout/route.ts` receives `{ productId, sellingUnitId, quantity, ... }` per line; resolves `qty_base` for that unit, computes `baseQty`, and calls the (unchanged) batch-deduction + stock decrement. Writes `selling_unit_id` + the unit snapshot onto the `sales_items` row.

## Break Pack / Consolidate

Re-architected to not depend on `parent_id`/`conversion_factors`:
- The dialog picks a **source product** (consume X of its stock, drawn from its own FIFO batches) and a **target product** (produce Y of its stock, new batch costed from the consumed value) — both must already exist as independent products; the ratio X:Y is entered on the transaction itself, not read from any persisted per-product relationship.
- `breakPack`/`consolidatePack` in `app/(app)/products/actions.ts` keep their batch-costing logic (source batch unit cost ÷ ratio → target batch unit cost) but stop calling `findUltimateRoot`/`deductFamilyStock`/`addFamilyStock` — they operate on exactly the two named products, nothing cascades further.

## Removed entirely

- `lib/family-sync.ts` (all four exports)
- `src/infrastructure/services/TransferStockService.ts`'s family-sync duplicate (and its callers simplified to a plain single-product transfer)
- `lib/product-tree.ts` (cycle-prevention helpers — no longer needed, nothing to cycle)
- Quick Add Child dialog (`app/(app)/products/quick-add-child/`)
- Reassign Parent dialog (`app/(app)/products/reassign-parent/`)
- Parent/child tree UI in the products list (`app/(app)/products/page.tsx`'s `buildTree`, expand/collapse rows, "Child Unit" badges) and in `ProductCard.tsx`'s conversion-factor badges
- `parentId`/`conversionFactor`/`conversionFactors` fields from `getProducts`, `addProduct`, `updateProduct`, `deleteProduct`, `getChildProducts`, `searchProducts` in `app/(app)/products/actions.ts`

## Migration of existing data

Run once, in a migration script, per existing parent (a product with `conversion_factors` rows and/or children pointing at it via `parent_id`):

1. Create the parent's base selling unit from its own current `barcode`/`cost`/`price`/`unit_of_measure` (`qty_base = 1`, `is_base = true`).
2. For each direct child: create an additional selling unit on the **parent**, with `barcode`/`cost`/`price` carried over from the child's own row, and `qty_base` = **`1 / (composed conversion factor from the root down to that child)`**. A `conversion_factors` row means "1 *parent* unit = `factor` *child* units" (see `lib/family-sync.ts`'s `findUltimateRoot`: `1 Sugar25kg = 50 Sugar500g`), i.e. the factor counts the *smaller* unit — so the child's `qty_base`, which must express how many *base* units one child unit equals, is the **inverse** of that factor, not the factor itself. Concretely: the root/parent stays the base unit at `qty_base = 1`, and if 1 Box = 12 Piece then the Piece unit gets `qty_base = 1/12`. The factor source is the matching `conversion_factors.factor` row on the parent for that child's unit, falling back to the child's own `conversion_factor` scalar (the research found these can disagree; the `conversion_factors` table value wins, since `lib/family-sync.ts` treats it as authoritative today). For deeper levels the factors compose multiplicatively before being inverted — a grandchild under `1 root = 12 mid` and `1 mid = 5 grandchild` gets `qty_base = 1/60`.
3. Re-point the child's `inventory_batches` rows to the parent's `product_id`, tagging them with the new `selling_unit_id`.
4. Re-point `sales_items`/`purchase_order_items` rows referencing the child's `product_id` to the parent's `product_id` + the new `selling_unit_id` (with the unit-name/qty_base snapshot columns backfilled).
5. Delete the child's `products` row.
6. Grandchildren (a child that was itself a parent) are handled by recursing depth-first before deleting — a grandchild's own children get re-pointed to it *before* step 2 walks it up, since after migration everything must resolve to exactly one product with a flat unit list, not a chain.

Any product with no `conversion_factors` rows and no `parent_id` link gets a single base selling unit created from its current values and nothing else — this is the common case (most products aren't part of a family today).

## Out of scope (YAGNI)

- Migrating the ~100+ existing consumers of `products.price/cost/barcode/unit_of_measure` to read `product_selling_units` directly (see Decisions table).
- Multi-level/nested selling units (a unit composed of other units) — flat list only.
- Changing how Break Pack/Consolidate's UI looks beyond removing the parent/child linkage; no new capabilities added there.
- A UI for reordering price levels or renaming them beyond what `app/(app)/products/price-levels/` already provides.
- Backfilling `selling_unit_id` on historical `sales_items`/`purchase_order_items` rows that predate this change beyond what the parent/child migration (step 4 above) covers — a sale of a plain non-family product before this change simply gets `selling_unit_id = NULL` (it can be resolved from `product_id`'s single base unit if ever needed, but that resolution is not built now).

## Testing

- **Unit/integration:**
  - Selling 1 unit with `qty_base = 12` deducts exactly 12 base units from the oldest `inventory_batches` rows (FIFO), and the sale's recorded cost matches those batches' weighted cost — not the unit's manual `cost` field.
  - Receiving 5 of a `qty_base = 12` unit adds one `inventory_batches` row for 60 base units.
  - `product_selling_units.barcode` uniqueness is enforced across products (scanning any unit's barcode resolves exactly one product + unit).
  - Editing a product's base selling unit's price/cost/barcode updates `products.price/cost/barcode` in the same transaction.
  - Migration script: a 3-level family (grandparent/parent/child) collapses to one product with 3 flat selling units, correct `qty_base` at each level (composed, not just the immediate factor), and the two descendant `products` rows are gone.
  - Break Pack between two unrelated products moves stock/batches correctly with no `conversion_factors`/`parent_id` involved.
- **E2E (Playwright):**
  - Add a product with 2 selling units (Piece, Box) each with Retail + Wholesale prices → both appear in the product list/search with correct effective price per level.
  - POS: scan a Box barcode → correct unit/price resolved automatically; search-select a product with multiple units → unit picker appears before add-to-cart.
  - Purchase order: receive a line in "Box" units → parent product's stock and FIFO batch reflect the base-unit-converted quantity.
