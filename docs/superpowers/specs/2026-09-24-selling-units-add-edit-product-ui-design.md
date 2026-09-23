# Selling Units — Add/Edit Product UI Design

**Date:** 2026-09-24
**Status:** Approved for planning
**Implements:** the "Add/Edit Product UI" section of `docs/superpowers/specs/2026-09-11-selling-product-units-design.md` (Plan 2 of that spec's 5-plan breakdown). Plan 1 (schema + data migration) is already implemented, reviewed, and merged.

## Summary

Replace the "Conversion" and "Price Levels" tabs in both the Add Product and Edit Product forms with a single new "Selling Units" tab: a repeatable row list where each row is one selling unit (Unit Name, Qty Base, Barcode, Cost, and one price column per active price level). The first row is always the locked base unit (`qty_base = 1`). This is the UI layer for the `product_selling_units` / `product_selling_unit_prices` tables Plan 1 already created and populated.

Alongside this, remove the now-redundant parent/child creation UI entirely: the "Auto-create Child Unit" switch, the Quick Add Child dialog, and the Reassign Parent dialog. Once every product can carry multiple selling units directly, there is no remaining use for creating a second `products` row to represent "the same product in a different unit."

## Why this change

- Plan 1's migration already collapsed every legacy parent/child family in the database into flat `product_selling_units` rows. But nothing in the UI reads or writes those tables yet — Add/Edit Product still edit `conversion_factors` and `product_price_levels`, the tables Plan 1 explicitly kept only for backward compatibility during the transition.
- Leaving the old "Auto-create Child Unit" / Quick Add Child / Reassign Parent paths in place after this ships would let staff keep creating real parent/child `products` rows, which the migration has already established are inconsistent with the model everything else has moved to — a live regression path back to the problem Plan 1 solved.
- Two forms (`add-product/`, `edit-product/`) already implement nearly-identical Conversion and Price Levels tabs using the same `react-hook-form` `useFieldArray` row-list pattern. The new Selling Units tab reuses that same pattern, merged into one array per form.

## Scope

Touches only:
- `app/(app)/products/add-product/` — `product-schema.ts`, `use-add-product-form.ts`, `tabs/basic-info-tab.tsx`, `tabs/inventory-tab.tsx`, new `tabs/selling-units-tab.tsx` (replacing `tabs/conversion-tab.tsx` + `tabs/price-levels-tab.tsx`, both deleted), `add-product-dialog.tsx` (tab list).
- `app/(app)/products/edit-product/` — the same set of files, mirrored.
- `app/(app)/products/actions.ts` — `addProduct`, `updateProduct` (rewritten write blocks); `reassignParent` deleted.
- `app/(app)/products/quick-add-child/`, `app/(app)/products/reassign-parent/` — deleted entirely.

Not touched: POS checkout, product search/barcode-scan resolution, Break Pack/Consolidate, the products list page's parent/child tree UI, `lib/family-sync.ts`, `lib/pricing.ts`. Those are later plans (3–5) per the original spec's Decisions table. The old `products.parent_id`/`conversion_factor` columns and the `conversion_factors`/`product_price_levels` tables are **not** dropped in this plan — only the Add/Edit Product UI's use of them is removed. Dropping the schema itself is Plan 5's job, once nothing reads it.

## Decisions

| Question | Decision |
|---|---|
| Quick Add Child / Reassign Parent / Auto-create Child switch | **Removed entirely**, in this same plan, not deferred. Confirmed with the user: leaving them running alongside the new Selling Units tab would let staff keep creating real parent/child rows the rest of the system has already moved away from. |
| Duplicate barcode/cost/price fields (currently standalone in Basic Info / Inventory tabs) | **Removed from their current tabs.** The base selling-unit row (row 1 of the new tab) becomes the single place to edit these values — one source of truth, not a synced pair of editable fields that could drift or confuse which one "wins." |
| Price-level columns layout | **Side-by-side columns**, one per active price level, matching the original spec's literal wording. Works well for the small number of price levels this system manages (Retail/Wholesale-scale); a denser or scrollable layout is not needed at that count. |
| `prices` data shape | **A plain object keyed by price-level id** (`Record<levelId, {price, minQuantity}>`), not a nested `useFieldArray`. The price-level list is fetched once and fixed for the lifetime of the form session — there is no need for the array-within-an-array complexity a dynamically-sized nested field array would add. |
| New selling-unit row defaults | **No silent default for `qty_base`.** A new row starts with `qty_base` empty (not `1`, not any other guess) — the user must deliberately state how it relates to the base unit. (The old Conversion tab defaulted a new row's factor to `1`; a wrong-but-plausible-looking default silently accepted is exactly the class of bug the Plan 1 migration spent its final review chasing down.) |
| Tab visibility | **Hidden for `itemType === 'service'`**, matching the current Conversion tab's visibility rule — services do not have sellable "units." |
| Shared component vs. per-form duplication | **Two separate tab files** (`add-product/tabs/selling-units-tab.tsx`, `edit-product/tabs/selling-units-tab.tsx`), matching this codebase's existing convention for these two forms (Conversion and Price Levels are already separately duplicated per form, not shared components, likely because the two forms' context providers differ enough that full sharing would need an adapter layer). Introducing a new shared-component architecture is not this plan's job — it would be a separate, unrelated refactor. |

## Data model

No new tables — this plan is UI/action wiring on top of Plan 1's `product_selling_units` and `product_selling_unit_prices` (see `docs/superpowers/specs/2026-09-11-selling-product-units-design.md` for their schema).

### New shared schema shape (both `product-schema.ts` files)

```ts
sellingUnits: z.array(z.object({
  id: z.string().optional(),        // existing product_selling_units.id when editing; absent for a new row
  unitName: z.string().min(1, 'Unit name is required'),
  qtyBase: z.coerce.number().positive('Qty must be positive'),
  barcode: z.string().min(1, 'Barcode is required'),
  cost: z.coerce.number().min(0).optional(),
  isBase: z.boolean(),
  prices: z.record(z.string(), z.object({
    price: z.coerce.number().min(0),
    minQuantity: z.number().min(0).optional(),
  })),
})).min(1, 'At least one selling unit (the base unit) is required'),
```

Both forms drop: `productType` (React state in add-product, unused in edit-product), `parentId` (add-product schema only), the scalar `conversionFactor` field (both), and the `conversionFactors`/`priceLevels` array fields (both) — replaced by `sellingUnits` above.

Client-side validation additionally enforces (superRefine, not shown above): exactly one row has `isBase: true`, that row's `qtyBase` equals `1`, and barcodes are unique within the submitted array (server-side uniqueness against `product_selling_units.barcode` globally is Plan 1's existing `UNIQUE` constraint — the client check is a fast-feedback layer, not the source of truth).

## Tab UI

One new file per form, replacing `conversion-tab.tsx` + `price-levels-tab.tsx`:

- A header row rendering the price-level columns once (from `priceLevels`, already fetched today for the old Price Levels tab — reused unchanged).
- **Row 1 (base unit, always present, no remove button):** `Unit Name`, `Barcode` (+ "Generate" button, reusing the existing barcode-generation logic from Basic Info), `Cost`, one price input per price-level column — all editable. `Qty Base` is rendered as static text (`1`), not an input.
- **Additional rows:** the same fields, plus an editable `Qty Base` input (label: "Equals how many base units?", with helper text naming the base row's current unit name, e.g. "How many *Piece* is one of this unit?") and a remove button.
- **"Add Selling Unit"** button appends a blank row (`isBase: false`, `qtyBase` left empty, `unitName`/`barcode` empty, `cost` empty, `prices` empty).
- Hidden entirely when `itemType === 'service'`.

`basic-info-tab.tsx` loses its standalone `Barcode` field; `inventory-tab.tsx` loses its standalone `Cost` field; both forms lose any remaining `productType === 'child'` branch in `inventory-tab.tsx`.

## Server actions (`app/(app)/products/actions.ts`)

**`addProduct`** (plain inserts, brand-new product):
1. Insert the `products` row as today, but with `parent_id`/`conversion_factor` columns dropped from the INSERT (no longer written).
2. For each `sellingUnits` entry: `INSERT INTO product_selling_units (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order) VALUES (...)` — `price` is that unit's price at the price levels list's default/first level (mirroring how the old `product_price_levels` default-row logic worked), generating a new `id` for each row.
3. For each (selling unit × price level) pair present in that unit's `prices` object: `INSERT INTO product_selling_unit_prices (selling_unit_id, price_level_id, price, min_quantity) VALUES (...)`.
4. Sync: set `products.price/cost/barcode/unit_of_measure` from the row where `isBase: true`.
5. Removed: the `__childProduct` recursive auto-child-creation branch, the conversion-factors duplicate-unit-name pre-check (superseded by the new schema's barcode-uniqueness check), the old `conversion_factors`/`product_price_levels` insert loops.

**`updateProduct`** (delete-then-reinsert, same pattern already used today):
1. `DELETE FROM product_selling_units WHERE product_id = ?` (cascades to `product_selling_unit_prices` via its existing `ON DELETE CASCADE` FK from Plan 1 — no separate delete needed for that table).
2. Reinsert both tables from the submitted `sellingUnits` array, same shape as `addProduct` steps 2–3. Existing rows being edited keep their `id` (from the schema's optional `id` field) so any FK references from `sale_items`/`inventory_batches`/etc. (nullable `selling_unit_id`, `ON DELETE SET NULL`) survive an edit that doesn't remove that particular unit; a row whose `id` is submitted `undefined` (a newly-added unit) gets a freshly generated id.
3. Sync: same base-row sync as `addProduct` step 4.
4. Removed: the `conversion_factors`/`product_price_levels` delete-then-reinsert blocks, the `parent_id`/`conversion_factor` write-once check (there was none — confirmed these columns were never in `updateProduct`'s column list to begin with, so no removal needed there).
5. Unaffected: the existing "Family Stock Sync" logic (`findUltimateRoot`/`addFamilyStock`/`deductFamilyStock` on manual stock edits) is untouched by this plan — `lib/family-sync.ts`'s removal is a later plan, and by the time this ships every product should have zero children left to walk to anyway (Plan 1 already deleted them), so this code becomes dead-but-harmless until its own removal plan runs.

**`reassignParent`** — deleted.

## Removed entirely

- `add-product/tabs/conversion-tab.tsx`, `add-product/tabs/price-levels-tab.tsx`, and their `edit-product/` twins.
- `productType` state, `parentId` schema field, scalar `conversionFactor` field, `conversionFactors`/`priceLevels` array fields — both forms' schemas and hooks.
- The standalone `Barcode` field in `basic-info-tab.tsx` and standalone `Cost` field in `inventory-tab.tsx` — both forms.
- Any remaining `productType === 'child'` branch in `add-product/tabs/inventory-tab.tsx`.
- `app/(app)/products/quick-add-child/` (dialog + hook).
- `app/(app)/products/reassign-parent/` (dialog) and the `reassignParent` server action.
- The "Auto-create Child Unit" switch and its associated `autoCreateChild` state/logic in `use-add-product-form.ts`.

## Out of scope (YAGNI)

- Any change to POS checkout, product search, or barcode-scan resolution — those read `product_selling_units` already (Plan 1's data is there); wiring the UI to actually use it for a sale is a separate, later plan.
- A shared component between the two forms' Selling Units tabs (see Decisions table).
- Per-price-level minimum-quantity tiering beyond the single optional `min_quantity` gate `product_selling_unit_prices` already provides (same shape `product_price_levels` had — no new capability added here).
- Migrating any of the ~100+ other call sites that read `products.price/cost/barcode/unit_of_measure` directly — the sync in `addProduct`/`updateProduct` keeps those columns correct, so those callers keep working unmodified (per the original spec's explicit scope boundary).
- Dropping `products.parent_id`/`conversion_factor`, the `conversion_factors` table, or the `product_price_levels` table — Plan 5's job.
- Any change to `lib/family-sync.ts` or the products-list page's parent/child tree UI — later plans, per the original spec.

## Testing

- **Schema-level (unit, no DB):** a submission with zero selling units is rejected; a submission with two rows both marked `isBase: true` (or none) is rejected; a submission with duplicate barcodes across its own rows is rejected; a base row with `qtyBase !== 1` is rejected.
- **E2E (Playwright, matching this repo's existing pattern):**
  - Add a product with 2 selling units (a base "Piece" and a "Box" with `qtyBase = 12`), each with Retail and Wholesale prices → both units and both price levels' prices appear correctly on reopening Edit Product.
  - Edit an already-migrated product (one that came from Plan 1's data migration, so it already has selling units in the database) → its existing units and prices load into the tab correctly, and saving a change updates `product_selling_units`/`product_selling_unit_prices` and mirrors the base row onto `products.price/cost/barcode/unit_of_measure`.
  - Removing a non-base selling unit and saving → its `product_selling_units` row is gone, and any `sale_items`/`inventory_batches` rows that referenced it via `selling_unit_id` now show `NULL` there (not deleted), matching the existing `ON DELETE SET NULL`/cascade behavior from Plan 1.
  - Quick Add Child and Reassign Parent dialogs are gone from the products page/product card — no dead links, no console errors from removed imports.
