# Basic Info tab: no SKU, combined category field, tidier layout

**Date:** 2026-09-30
**Status:** Draft for review
**Relationship to other specs:** This is the narrow first step toward
`2026-09-25-sku-to-supplier-design.md`. It does **not** drop `products.sku`, migrate data,
or change matching keys; the full spec can follow later and is unaffected by this one.

## Problem

- The Add/Edit Product Basic Info tab asks for a SKU, but SKU is tracked per supplier
  (`supplier_product_mapping.supplier_sku`, entered on the Supplier tab) and barcode
  already identifies a product. Staff should not have to type or generate a product SKU.
- Category and Subcategory are two separate dropdowns, and the tab's field order leaves
  gaps and splits the two description fields.

## Goals

1. New products are created with **no SKU** (`products.sku = NULL`).
2. Basic Info has no SKU field and no "Generate SKU" wand, on both Add and Edit.
3. Category and Subcategory are one combined "Category / Subcategory" field with inline
   add/rename for each. **(Already implemented:
   `app/(app)/products/components/category-subcategory-picker.tsx`.)**
4. Basic Info uses one two-column grid in the same order on Add and Edit.
5. Existing products keep their SKU untouched.

## Non-goals

- No migration, no dropping `products.sku`, no backfill into `supplier_sku`.
- No change to matching keys (transfers, family-sync, imports, bulk price update, POS
  scan). They already skip SKU when it is empty and fall back to name/barcode.
- No change to the Supplier tab (keeps its per-supplier Supplier SKU; the star-toggle
  polish stays in the 2026-09-25 spec).
- No change to reports/print previews that display SKU; they show blank for new
  products. Falling back to barcode there is a possible follow-up.
- Import/bulk-price-update keep generating SKUs for rows they create. Out of scope.

## Design

### Database
`products.sku` is already nullable and the unique index `(sku, warehouse_id)` permits
multiple NULLs (migrations 001, 056). No schema change.

### Validation
- `add-product/product-schema.ts` and `edit-product/product-schema.ts`: `sku` becomes
  optional (`z.string().optional()`); "SKU is required" is removed.

### Add flow (`use-add-product-form.ts`, `actions.ts`)
- Remove the `generateSku` helper from the form hook and its context value, the `sku`
  default, and `formErrors.sku` from the "basic tab has errors" check.
- `ProductFormData.sku` becomes optional. `addProduct` stops using it for the id:
  `productId` changes from `` `${formData.sku}-${Date.now()}` `` to a SKU-free id in the
  same shape used elsewhere in this file: `` `product_${Date.now()}_${random5}` ``.
  Inserted `sku` is `formData.sku || null`.
- The picsum image seed (`values.sku`) and the activity-log text
  (`(SKU: ${values.sku})`) stop referencing SKU (seed with the product name; drop the
  SKU parenthetical).
- The approval-queue item's `sku` field is `formData.sku || ''`.

### Edit flow (`use-edit-product-form.ts`)
- `updateProduct` already keeps the stored value (`formData.sku ?? existing.sku`), so
  existing SKUs are preserved without the form sending one.
- The Edit tab shows a read-only "SKU" line (with the existing "cannot be changed" note)
  **only when the product already has a SKU**; otherwise nothing is shown.
- Activity-log text drops the SKU parenthetical.

### Duplicate-product flows (`actions.ts` ~1290 and ~1560)
- The child/bulk product **ids** are already SKU-free. Their derived SKU string
  (`${parent.sku}-…` / `${pack.sku}-BULK-…`) would become `null-…` for a SKU-less
  parent, so: if the parent has no SKU, the new product's SKU is `NULL`; otherwise
  behavior is unchanged.

### Basic Info layout (both tabs)
One grid, two columns (one column on mobile), in this order:

| | Left | Right |
|---|---|---|
| Row 1 | Product Name | Brand |
| Row 2 | Category / Subcategory | Description |
| Row 3 | Additional Description (Optional), spanning both columns | |

Additional Description spans both columns in Row 3 so the grid has no empty slot. The
Edit tab keeps the "Product Type" badge above the grid and the conditional read-only SKU
line beneath it.

### Tests
- E2E specs that type into the SKU field or locate products by SKU
  (`add-product.spec.ts`, `product-edit-delete.spec.ts`, `add-product-suppliers.spec.ts`,
  `add-product-approval.spec.ts`, `selling-units.spec.ts`, `product-type-service.spec.ts`,
  and shared fixtures/helpers) are updated to create products without a SKU and locate
  them by name/barcode. Specs that seed products directly in the DB are unaffected.
- `tests/unit/sku.test.ts` stays (the helper is still used by import/bulk-price-update).

## Error handling / edge cases

- New products have `sku = NULL`; product lists and reports show blank in the SKU column.
- Two new products never collide on the unique index (NULLs are distinct).
- Warehouse transfers of a SKU-less product match the target product by name (existing
  fallback in `family-sync.ts` and `TransferStockService.ts`); renaming a product in one
  warehouse would stop it matching in another. Known limitation, addressed by the
  barcode-key change in the 2026-09-25 spec.
- Approval-queue payloads created before this change contain a SKU and still finalize.

## Verification

- `npm run typecheck`.
- Add a product with no SKU (direct and via approval), confirm it saves with
  `sku = NULL` and appears in the list.
- Edit a legacy product with a SKU: SKU shown read-only and preserved after save.
  Edit a new product: no SKU line.
- Create a child/bulk product from a SKU-less parent: no `null-` string in `sku`.
- Run the affected e2e specs.
