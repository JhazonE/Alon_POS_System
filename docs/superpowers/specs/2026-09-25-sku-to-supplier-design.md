# Move SKU from Product to Supplier

**Date:** 2026-09-25
**Status:** Draft for review

## Problem

`products.sku` is currently a required, per-warehouse-unique column that does three
unrelated jobs at once:

1. A human-readable label shown across the app (product tables, POS, reports, invoices).
2. The key used to recognize "the same product" across warehouses, for stock transfers
   and family-sync (`lib/family-sync.ts`, `src/infrastructure/services/TransferStockService.ts`,
   `app/api/inventory/adjust/bulk/route.ts`).
3. The upsert/match key for the legacy CSV product importer
   (`app/api/data-management/import/products/legacy.ts`) and for bulk price update
   (`app/(app)/products/bulk-price-update/actions.ts`).

The business no longer wants SKU tracked per product. Instead, each supplier a product
is sourced from should carry its own SKU — the supplier's own code for that item — via
the already-existing but unconstrained `supplier_product_mapping.supplier_sku` column.
A product can have zero, one, or several suppliers, so "the product's SKU" stops being
a well-defined single value at the product level.

This spec covers removing `products.sku` as a concept and re-pointing everything that
currently reads, writes, or matches on it.

## Goals

- `supplier_product_mapping.supplier_sku` becomes the only place SKU is entered or
  stored — a free-text, optional, non-unique label per supplier-product relationship.
- The Basic Info tab (Add/Edit Product) no longer has a SKU field.
- The Suppliers tab (Add/Edit Product) keeps its Supplier SKU input (per-supplier,
  optional), and gets the originally-requested UI polish: the Primary control becomes
  the first column in each supplier row, shown as a star toggle instead of a radio
  button, matching the existing convention in
  `app/(app)/products/product-suppliers/product-suppliers.tsx`.
- Anywhere a product's "SKU" is displayed (product tables, POS, reports, invoices,
  cards) shows the **primary supplier's** `supplier_sku`, or blank/"—" when there is no
  primary supplier or it has no SKU set.
- Anywhere SKU was used as a **matching/uniqueness key** (warehouse transfers,
  family-sync, legacy CSV import, bulk price update, POS exact-scan) switches to
  **barcode** as the replacement key. Barcode is already the field these paths fall
  back to today and is effectively unique in practice; SKU is never used as a lookup
  key again anywhere in the codebase after this change.
- Existing `products.sku` data is not silently discarded: for products that have a
  primary supplier mapping at migration time, the current SKU value is backfilled into
  that mapping's `supplier_sku` before the column is dropped.

## Non-goals

- No change to BIR/fiscal invoice numbering (`lib/fiscal-utils.ts`) — confirmed it has
  no SKU dependency.
- No change to `supplier_product_mapping`'s schema beyond what's already there —
  `supplier_sku` is already `VARCHAR(100) NULL`, no new uniqueness constraint is added.
- No introduction of a new cross-warehouse "product group" link table. Barcode is the
  chosen cross-warehouse identity key (see Approach), not a new abstraction.
- No change to how barcodes themselves are generated, validated, or printed, beyond
  the label fallback already documented below.

## Approach

### 1. Schema

- New migration: backfill + drop.
  - Step 1 (data): for every product with `sku IS NOT NULL` and a primary supplier
    mapping (`supplier_product_mapping.is_primary = 1`), copy `products.sku` into that
    mapping's `supplier_sku` **only if the mapping's `supplier_sku` is currently
    NULL/empty** (don't clobber a value already entered at the supplier level).
  - Step 2 (schema): drop the `sku_warehouse` unique index, then drop the `sku` column
    from `products`.
  - `down()`: re-add the `sku` column and the `(sku, warehouse_id)` unique index, and
    best-effort repopulate `products.sku` from each product's primary supplier's
    `supplier_sku` (documented as lossy if a product's primary supplier changed since
    the forward migration ran, or if a product had no primary supplier — matches the
    existing precedent in migration 056's own down-migration caveat).
- No schema change to `supplier_product_mapping` — `supplier_sku` already exists,
  already nullable, already has no uniqueness constraint.

### 2. Product forms (Add/Edit Product)

- **Basic Info tab** (`app/(app)/products/add-product/tabs/basic-info-tab.tsx` and its
  edit-product equivalent): remove the SKU `FormField` and the "Generate SKU"
  (`Wand2`) button entirely. Remove `sku` from `product-schema.ts` validation
  (currently `z.string().min(1, 'SKU is required')`) and from the add/edit product
  submit payloads in `actions.ts`.
- **Suppliers tab** (`app/(app)/products/add-product/tabs/suppliers-tab.tsx`):
  - Reorder the per-row grid so the Primary control is the first field, ahead of
    Supplier.
  - Replace the radio-button Primary control with a star-icon toggle: filled/yellow
    star when `isPrimary` is true, outline star button (calls
    `setPrimarySupplierRow(index)`) otherwise — mirroring the existing pattern at
    `app/(app)/products/product-suppliers/product-suppliers.tsx:90-102`.
  - Supplier SKU input stays as-is (optional free-text), just visually reflowed to
    accommodate the new column order.

### 3. Display-only consumers (~40 files)

Everywhere that currently reads `product.sku` purely to display it (product list/table
rows, product cards, POS search results, reports, invoice/receipt views, print-barcode
preview text) switches to reading a `primarySupplierSku` value instead. This is
resolved server-side: API routes/queries that currently `SELECT sku FROM products`
add a join to `supplier_product_mapping` filtered to `is_primary = 1` and alias it as
`primarySupplierSku` (or equivalent per-route naming), falling back to `NULL`/blank
when no primary supplier exists or its `supplier_sku` is empty. Frontend components
swap their `product.sku` reads for this new field name.

This is mechanical but touches many files; the implementation plan should enumerate
them explicitly (grouped by API route vs. component) rather than relying on a global
find-and-replace, since some hits are false positives (e.g., unrelated `.sku` on
non-product objects) that the research pass already filtered out.

### 4. Matching/uniqueness consumers — switch key from SKU to barcode

- **`lib/family-sync.ts`** and **`src/infrastructure/services/TransferStockService.ts`**:
  the `SELECT id FROM products WHERE sku = ? AND warehouse_id = ?` lookups become
  `WHERE barcode = ? AND warehouse_id = ?`. Products without a barcode cannot be
  auto-linked/transferred this way — same limitation that already existed for
  products missing a SKU.
- **`app/api/inventory/adjust/bulk/route.ts`**: same swap; error message changes from
  "Product ... (SKU: ...) not found in target warehouse" to reference barcode.
- **`app/(app)/products/actions.ts`** (`WHERE p.id = ? OR p.sku = ?` convert-unit
  lookups): drop the `OR p.sku = ?` clause; resolution is by `id` only (SKU was never
  more than a convenience alternate lookup here, and `id` is always available).
- **Legacy CSV import** (`app/api/data-management/import/products/legacy.ts`): the
  required-column check moves from `sku` to `barcode` (`if (!p.name || !p.barcode)`),
  and the upsert lookup becomes `SELECT id FROM products WHERE barcode = ?`. This
  aligns it with the newer JSON import wizard, which already matches by
  barcode-then-name.
- **Bulk price update** (`app/(app)/products/bulk-price-update/actions.ts`): drop the
  SKU-based primary match (`WHERE sku = ? AND warehouse_id = ?`) and the `seenSkus`
  duplicate-SKU detection; match becomes barcode-only
  (`WHERE barcode = ? AND warehouse_id = ?`). Rows with no barcode can no longer be
  matched to an existing product by this tool. The `generateSku()`-on-create fallback
  is removed since new rows no longer need a SKU. `price-list-template.ts`'s exported
  CSV drops the `sku` column.
- **POS scan/search** (`app/(app)/pos/pos-content/use-pos.ts`): `findExactCodeMatch`
  and `handleAddItemBySKU` drop the `p.sku === q` branch; exact-match scanning is
  barcode-only. Typing text into the scan box still falls through to fuzzy
  name/supplier-SKU search (not a guaranteed unique hit) rather than a removed
  capability.
- **`app/(app)/products/print-barcode/use-print-barcode.ts`**: the printed barcode's
  encoded value fallback chain (`product.barcode || product.sku || product.id`) drops
  the `product.sku` link, becoming `product.barcode || product.id`.

### 5. Tests

E2E tests currently drive and assert on the product-level SKU field directly
(`tests/e2e/add-product.spec.ts`, `tests/e2e/product-edit-delete.spec.ts`,
`tests/e2e/pos-sale.spec.ts`, `tests/e2e/add-product-suppliers.spec.ts`). These need
rewriting as part of implementation: product creation/lookup helpers switch to
barcode as the stable identifier, and any assertion on `product.sku` either moves to
asserting on the supplier mapping's `supplier_sku` (where the test is specifically
about supplier data) or is dropped (where it was only ever a convenient unique handle
for finding a row).

## Error handling / edge cases

- **Product with no suppliers at all:** displays blank/"—" wherever SKU would have
  shown. Cannot be scanned/found by SKU (never could reliably anyway); found by
  barcode or name search as normal.
- **Product with a primary supplier but that mapping's `supplier_sku` is empty:**
  same as above — blank display, no behavior change to matching (barcode still
  drives matching regardless).
- **Product with multiple suppliers, no primary marked:** display falls back to
  blank (no primary to read from) — consistent with `isPrimary` already being a
  form-enforced single-select per product today (see `product-schema.ts` primary
  validation).
- **Duplicate `supplier_sku` values across different suppliers or products:** allowed,
  intentional — it's just a label now, never a lookup key.
- **Products without a barcode**, post-migration: lose the ability to be
  auto-matched by warehouse-transfer/family-sync/import/bulk-price-update tooling.
  This is a real, accepted regression for that subset of products (same shape of
  limitation SKU-less products already had for SKU-based matching), not something
  this spec engineers around.

## Migration / rollout notes

- This is a single migration file (backfill + drop), run via the existing
  `npm run migrate` flow described in `CLAUDE.md`. `npm run migrate:down` restores
  the column and best-effort backfills it, per the caveats above.
- No feature flag — this is a breaking schema change with a hard cutover; the app
  does not support running against both old and new schema shapes simultaneously,
  consistent with how other numbered migrations in this repo are deployed.

## Open items for the implementation plan

- Exact enumeration of the ~40 display-only files and which API route each one's data
  flows through (needed to size the join/backfill work per route rather than doing a
  blind repo-wide replace).
- Whether any report/export (e.g., `bulk-price-update` template, inventory reports)
  needs its own column-header/label rename from "SKU" to something like "Supplier SKU"
  where it now shows a per-supplier value instead of a product value.
