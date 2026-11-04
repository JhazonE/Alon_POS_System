# Plan: Remove the dead `products.sku` column

**Date:** 2026-11-04
**Branch:** `feat/warehouse-tabs-multi-warehouse-create`

## Why

`products.sku` is dead. The add-product form has **no SKU input field** — the
column exists only in the Zod schema (`product-schema.ts:277`, `z.string().optional()`),
so a user has no way to type one. All 3 products in the development database have
`sku` NULL or blank. The four "functional uses" of the column (Excel import matching,
family-sync lookup, DISTINCT report counts, POS exact-code match) therefore never
fire against real data — every one of them silently falls through to its fallback.

Barcode is already the product identity, and it already carries the constraint:

- `product_selling_units.barcode` is **global `UNIQUE`, `NOT NULL`** (migration 115).
- `products.barcode` is **derived** from the base selling unit — `product-create.ts:478`
  does `UPDATE products SET price = ?, cost = ?, barcode = ?, unit_of_measure = ?`
  from `baseUnit.barcode`, with the comment *"Sync the scalar columns from the base
  row — one source of truth."*

So this is a cleanup of a dead column, not a migration of identity from one column
to another. The identity is already barcode.

## Goals

- Drop `products.sku` and its `sku_warehouse` unique index.
- Leave every call site working — several would throw on a missing column.
- Repoint the three DISTINCT report counts from `sku` to `barcode`, which **improves**
  them: today they all fall back to `name` because every `sku` is blank.

## Non-goals

- **Do not touch `supplier_product_mapping.supplier_sku`.** It is a different column
  on a different table and is actively used.
- **Do not delete `lib/sku.ts`.** Three of its four callers generate `supplierSku`,
  not `products.sku`.
- **Do not make `products.barcode` NOT NULL.** A service has no base selling unit
  (`selling-unit-sync.ts` header: *"A product with no base selling unit (e.g. a service)
  is a no-op"*) and therefore legitimately has no barcode.
- **Do not add `UNIQUE(barcode, warehouse_id)` to `products`.** The constraint already
  lives on `product_selling_units`, and `products.barcode` is derived from it. Adding
  a second one would be a redundant constraint on a derived column. (Confirmed against
  live data: barcode `38608490` appears on 2 rows in *different* warehouses — the normal
  multi-warehouse pattern.)

## Anti-goals

Anything that changes which products a query returns, beyond the DISTINCT count
identity change. This is a cleanup; the row sets must not move.

## Global Constraints

- **No ORM.** Raw `mysql2/promise` via `lib/mysql.ts`. Match surrounding SQL style.
- **Migration numbering:** next free number is **145**. Register via `registerMigration`,
  with both `up()` and `down()`, matching the style of the existing numbered migrations
  in `scripts/migrations/`.
- `npm run lint` and `npm run typecheck` must both pass.
- Match the surrounding code's comment density and naming. This repo comments the
  *why* of non-obvious decisions, heavily.
- **Order matters:** the code must stop referencing `sku` **before** the column is
  dropped, or the app breaks between deploy and migrate. Task 1 does the code, Task 2
  does the migration.

---

## Task 1: Remove every `products.sku` code reference

All of these read or write `products.sku` and must stop. Grouped by what they do.

### 1a. Two call sites that would **throw** on a dropped column

These `INSERT`/`SELECT` the column by name — they are the reason Task 1 must land first.

- **`lib/scheduler.ts`** — cloud **pull** sync (note: this is `query()`, the *local*
  pool, inserting data received from cloud). Remove `sku` from three places:
  - line ~425: the column list
  - line ~445: `sku = VALUES(sku),` in the `ON DUPLICATE KEY UPDATE` clause
  - line ~471: the `product.sku ?? null,` bind parameter

  The column list, the `VALUES(...)` placeholder count, and the bind array must all
  stay in agreement — removing one without the others is a runtime error.

- **`app/api/send-products/route.ts:28`** — remove `sku,` from the `SELECT` list.

### 1b. The three DISTINCT report counts → `barcode`

Replace the `sku` identity with `barcode`, keeping the `NULLIF` + `COALESCE`-to-`name`
fallback exactly as-is (`products.barcode` stays nullable, so the fallback is still
load-bearing).

- `app/api/reports/stats/route.ts:177`
  `const productIdentity = "COALESCE(CONCAT('sku:', NULLIF(sku, '')), CONCAT('name:', name))";`
  → `"COALESCE(CONCAT('barcode:', NULLIF(barcode, '')), CONCAT('name:', name))"`
- `app/api/reports/inventory/route.ts:123` — same substitution, note the `p.` alias:
  `COUNT(DISTINCT COALESCE(CONCAT('barcode:', NULLIF(p.barcode, '')), CONCAT('name:', p.name))) as totalItems`
- `app/api/reports/cost-vs-retail/route.ts:109` — same as inventory.

**Do not touch** the separate `COUNT(*) as total` in the inventory and cost-vs-retail
routes. Per CLAUDE.md that one feeds `pagination.totalItems` and must equal the rows
actually listed; making it DISTINCT desynchronises paging.

`tests/e2e/reports-distinct-counts.spec.ts` guards these routes — read it, and update
it if it asserts on the `sku:` prefix specifically.

### 1c. Excel / product importers → barcode-only matching

User decision: **barcode only; a SKU column in an uploaded sheet is ignored.** No
transition period is needed — the user confirmed no existing price-list or import
files use the SKU column.

- **`app/(app)/inventory/pricing/actions.ts`** (bulk price update preview):
  - Remove the `WHERE sku = ? AND warehouse_id = ?` lookup (~line 93) — the barcode
    lookup immediately after it becomes the only one.
  - Remove the `seenSkus` dedup set and its duplicate-SKU skip reasons; dedup on
    barcode instead, keeping the same "earlier row in this file superseded" wording.
  - The `Missing SKU and barcode` skip reason becomes `Missing barcode`, and its
    guard becomes barcode-only.
  - Remove the `generateSku` call (~line 132) and the `NewProductFromExcel.sku` field
    it feeds. Remove the now-unused `generateSku` import from this file **only**.
  - `row.sku` comes from the parsed spreadsheet — drop it from the parse/type as well
    if nothing else reads it.
- **`app/api/data-management/import/products/route.ts`**: remove the `generateSku` call
  (line 64), its import (line 4), and `sku` from the `INSERT` column list and bind array.
- **`app/api/data-management/import/products/legacy.ts:38`**: the existence check
  `SELECT id FROM products WHERE sku = ?` becomes a barcode check. Keep the branch
  filter (`inBranch.sql` / `inBranch.params`) exactly as-is.

### 1d. Remaining reads — remove the `sku` term, keep the rest

- **Product search**, two identical clauses — `app/(app)/products/actions.ts:157` and
  `:413`: `(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)` loses the `sku` term.
  **Each clause pushes `searchParam` three times — drop it to two.** Mismatched
  placeholder/param counts are a runtime error.
- **`lib/family-sync.ts:287`**: delete the `SELECT id FROM products WHERE sku = ? AND
  warehouse_id = ?` lookup. The `(name, warehouse_id)` lookup right after it is already
  the fallback and becomes the only match path. Update the surrounding comment, which
  describes a two-step match.
- **`app/(app)/pos/pos-content/use-pos.ts:709-712`**: drop `sku` from the exact-code
  match; `barcode` remains.
- **`app/api/products/[id]/route.ts:79`**: remove the `sku` update branch.
- **`lib/product-create.ts`** — remove `sku` from: the column list (~195), the object
  literals (~277, ~379), the INSERT column list (~397) and its bind array (~409), and
  the secondary-warehouse copy INSERT (~538) and its binds (~546). Column lists and
  bind arrays must stay in agreement.
- **`app/(app)/products/actions.ts`** (update path) — remove the `sku` normalization
  (~571-572, including its comment about `''` vs NULL in the unique index — the index
  is going away), the `sku = ?` assignment (~589), and its bind (~620).
- **`app/(app)/products/add-product/product-schema.ts:277`**: remove `sku: z.string().optional()`.
- **`app/(app)/products/actions.ts:30`**: remove `sku?: string;` from the type.

### 1e. Sweep

After the above, run `grep -rn "\bsku\b" --include=*.ts --include=*.tsx app lib hooks components | grep -v "supplier_sku\|supplierSku"`
and resolve every remaining hit. Expect display-only hits (table columns, report row
shapes, receipt fields) — remove those too, including the UI columns that would now
always render blank. `lib/import/` and `components/approvals/` have hits not itemized
above; handle them on the same principle.

**`lib/sku.ts` itself stays** — `use-add-product-form.ts:374` and
`use-supplier-mappings.ts:60` call `generateSku` for `supplierSku`. Leave both alone.
Update the JSDoc on `generateSku` to say it is for supplier SKUs, since its last
`products.sku` caller is gone.

### Verification

- `npm run lint` and `npm run typecheck` both clean.
- The grep from 1e returns only `supplier_sku` / `supplierSku` hits and `lib/sku.ts`.
- No SQL column list disagrees with its bind array — check each INSERT touched.

---

## Task 2: Migration 145 — drop the column and its index

`scripts/migrations/145_drop_product_sku.ts`, following the existing migration style.

**`up()`:**
1. Drop the `sku_warehouse` unique index (added by migration 056 as
   `UNIQUE INDEX sku_warehouse (sku, warehouse_id)`). Resolve its existence from
   `INFORMATION_SCHEMA` first rather than assuming — migration 056's own `up()` did
   exactly this, and `down()` on a partially-applied database may have left a plain
   `sku` index instead. Handle both names.
2. Drop the `sku` column.

Both steps must tolerate already-absent objects (`IF EXISTS` semantics via
`INFORMATION_SCHEMA` checks), so a rerun is a no-op.

**`down()`:** re-add the column as `VARCHAR(100) NULL` and recreate
`UNIQUE INDEX sku_warehouse (sku, warehouse_id)`.

**`down()` must carry a comment stating that the data is not recoverable** — the
column's values are gone after `up()`. This is acceptable *only* because every row's
`sku` is already NULL or blank; state that reasoning in the comment so a future reader
does not mistake it for an oversight.

### Verification

- `npm run migrate` applies cleanly.
- `npm run migrate:down` rolls back cleanly, then `npm run migrate` re-applies.
- After `up()`: `DESCRIBE products` shows no `sku`, and `SHOW INDEX FROM products`
  shows no `sku_warehouse`.
- The app starts and the products page, a report, and the POS product list all load.

---

## Known consequence, accepted

`family-sync.ts` currently matches a family member by `(sku, warehouse_id)` first and
`(name, warehouse_id)` second. After this change only the name match remains. Since
every `sku` is blank today, the name path is already the only one that runs — so there
is no behavioural change now, but the system's reliance on product *name* for that
match becomes total. Recorded here deliberately rather than engineered around.
