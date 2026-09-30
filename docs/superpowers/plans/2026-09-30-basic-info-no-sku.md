# Basic Info: No SKU, Combined Category Field, Tidier Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New products are created without a SKU; the Add/Edit Basic Info tabs drop the SKU field, use the combined Category / Subcategory picker, and share one tidy two-column layout.

**Architecture:** `products.sku` is already nullable (unique index `(sku, warehouse_id)` allows many NULLs), so no migration. `addProduct` stops deriving the product id from the SKU and inserts `NULL`; `updateProduct` never overwrites a stored SKU with an empty value. The forms stop asking for SKU. E2E specs that drive the Add dialog are rewritten first (they fail), then the code makes them pass.

**Tech Stack:** Next.js 16 (server actions), React Hook Form + Zod, Radix Popover, Playwright e2e against `alon_pos_test` (port 3100, `workers: 1`), `tsx` unit scripts.

**Spec:** `docs/superpowers/specs/2026-09-30-basic-info-no-sku-design.md` (narrow first step of `2026-09-25-sku-to-supplier-design.md`)

## Global Constraints

- Do **not** add a migration, drop `products.sku`, or backfill `supplier_sku` (spec Non-goals).
- Do **not** change matching keys in transfers / family-sync / import / bulk-price-update / POS scan.
- Do **not** touch the Supplier tab. Per-supplier `Supplier SKU` stays.
- Existing products keep their SKU; `updateProduct` must never replace a stored SKU with `''`/`null`.
- New products store `sku = NULL` (never `''` — two `''` in the same warehouse would violate the unique index).
- BIR sales-invoice numbering is untouched.
- Run e2e with `npx playwright test <file>` (sequential, isolated DB). Typecheck with `npm run typecheck` (the repo has no working ESLint config; do not try to run lint).
- Code style: match surrounding code; e2e comments in these files are written in Cebuano/English mix — new comments may be English.

## Review Focus

1. **Editing a product whose SKU is NULL** must save without a "SKU is required" error and must leave `sku` NULL (not `''`) — pinned by a new e2e test in Task 1, satisfied in Task 2/3.
2. **Two SKU-less products in the same warehouse** must both save (NULLs are distinct in the unique index) — covered by the approval spec creating multiple products in one run (Task 1).
3. **Editing a legacy product that has a SKU** must preserve it exactly — the existing edit test asserts the product is still found by SKU; keep that assertion (Task 1).
4. **Bulk/pack child products from a SKU-less parent** must get `sku = NULL`, never the string `null-…` — pinned by a source-level guard in Task 2 (no DB-backed e2e exists for these flows).
5. **Popover inside the modal dialog**: picking a category, adding one inline, and closing via "Done" must work while the Add Product dialog is open — exercised by every rewritten Add spec through `selectCategory` (Task 1).

---

## File Structure

| File | Change |
|---|---|
| `tests/e2e/helpers/product-form.ts` | **Create** — `selectCategory` helper for the combined picker |
| `tests/e2e/add-product.spec.ts`, `add-product-approval.spec.ts`, `add-product-suppliers.spec.ts`, `selling-units.spec.ts` | Modify — no SKU typing, new category helper, find products by name |
| `tests/e2e/product-edit-delete.spec.ts` | Modify — add SKU-less edit test |
| `tests/e2e/fixtures/test-data.ts` | Modify — drop `sku` from `NEW_PRODUCT` and `SELLING_UNITS_NEW_PRODUCT` |
| `app/(app)/products/actions.ts` | Modify — optional SKU, SKU-free id, null-safe child SKUs |
| `app/(app)/products/add-product/product-schema.ts`, `edit-product/product-schema.ts` | Modify — `sku` optional |
| `app/(app)/products/add-product/use-add-product-form.ts`, `edit-product/use-edit-product-form.ts` | Modify — remove SKU usage, `generateSku` |
| `app/(app)/products/add-product/tabs/basic-info-tab.tsx`, `edit-product/tabs/basic-info-tab.tsx` | Modify — new layout + picker, no SKU |
| `app/(app)/products/components/category-subcategory-picker.tsx` | Already written (uncommitted) — committed in Task 3 |

---

### Task 1: Rewrite e2e specs for the no-SKU, combined-picker form (they fail first)

**Files:**
- Create: `tests/e2e/helpers/product-form.ts`
- Modify: `tests/e2e/fixtures/test-data.ts` (`NEW_PRODUCT` ~L99, `SELLING_UNITS_NEW_PRODUCT` ~L423)
- Modify: `tests/e2e/add-product.spec.ts`, `tests/e2e/add-product-approval.spec.ts`, `tests/e2e/add-product-suppliers.spec.ts`, `tests/e2e/selling-units.spec.ts`, `tests/e2e/product-edit-delete.spec.ts`

**Interfaces:**
- Produces: `selectCategory(page: Page, dialog: Locator, categoryName: string): Promise<void>` in `tests/e2e/helpers/product-form.ts` — opens the "Category / Subcategory" field inside `dialog`, clicks the category button, closes with "Done".

- [ ] **Step 1: Create the helper**

`tests/e2e/helpers/product-form.ts`:

```ts
import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';

/**
 * Pick a category in the combined "Category / Subcategory" field of the
 * Add/Edit Product dialog. The field is a Popover (not a Radix Select), so
 * options are buttons, not role=option, and the popover stays open until
 * "Done" is clicked.
 */
export async function selectCategory(page: Page, dialog: Locator, categoryName: string) {
  await dialog.getByLabel('Category / Subcategory', { exact: true }).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]');
  await popover.getByRole('button', { name: categoryName, exact: true }).click();
  await popover.getByRole('button', { name: 'Done' }).click();
  await expect(popover).toBeHidden();
}
```

- [ ] **Step 2: Drop `sku` from the two "new product" fixtures**

In `tests/e2e/fixtures/test-data.ts` delete the line `  sku: 'QA-WIDGET-001',` from `NEW_PRODUCT` and `  sku: 'QA-SU-NEW-001',` from `SELLING_UNITS_NEW_PRODUCT`. Leave every other fixture (seeded products keep their SKUs).

- [ ] **Step 3: Rewrite `add-product.spec.ts`**

- Add `import { selectCategory } from './helpers/product-form';`
- Delete the line `await dialog.getByLabel('SKU').fill(NEW_PRODUCT.sku);`
- Replace `await selectOption(page, dialog, 'Category', TEST_CATEGORY.name);` with `await selectCategory(page, dialog, TEST_CATEGORY.name);`
- Replace the persistence check at the end with:

```ts
    // I-verify nga na-persist sa DB — walay SKU ang bag-ong product.
    const res = await request.get(`/api/products?search=${encodeURIComponent(NEW_PRODUCT.name)}&limit=50`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.name === NEW_PRODUCT.name);
    expect(match, 'bag-ong product makita sa /api/products').toBeTruthy();
    expect(match.sku ?? null).toBeNull();
    expect(Number(match.stock)).toBe(NEW_PRODUCT.stock);
    expect(Number(match.price)).toBe(NEW_PRODUCT.retail);
```

- [ ] **Step 4: Rewrite `add-product-suppliers.spec.ts`**

- Add `import { selectCategory } from './helpers/product-form';`
- In `makeNewProduct()` rename the `sku` property to `uniq` so it is still a per-call unique token, and use it in the name so the product can be found by name:

```ts
function makeNewProduct() {
  const uniq = Date.now();
  return {
    name: `QA Widget With Supplier ${uniq}`,
    uniq,
    description: 'A widget created by the e2e Add Product Suppliers test.',
    stock: 10,
  };
}
```
  (Update the doc comment above it: it now explains a unique *name*, since products have no SKU.)
- Delete `await dialog.getByLabel('SKU').fill(NEW_PRODUCT.sku);`
- Replace the `selectOption(... 'Category' ...)` call with `await selectCategory(page, dialog, TEST_CATEGORY.name);`
- Change the barcode line to ``await base.getByLabel('Barcode').fill(`SUP-${NEW_PRODUCT.uniq}`);``
- Replace the product lookup with:

```ts
    const res = await request.get(`/api/products?search=${encodeURIComponent(NEW_PRODUCT.name)}&limit=50`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.name === NEW_PRODUCT.name);
```
- Replace the two row-lookup lines with:

```ts
    await page.getByPlaceholder('Search products...').fill(NEW_PRODUCT.name);
    const row = page.getByRole('row', { name: new RegExp(NEW_PRODUCT.name) });
```

- [ ] **Step 5: Rewrite `selling-units.spec.ts`**

- Add `import { selectCategory } from './helpers/product-form';`
- In the add test delete `await dialog.getByLabel('SKU').fill(P.sku);` and replace the Category `selectOption` with `await selectCategory(page, dialog, TEST_CATEGORY.name);`
- In that test's three DB queries replace `WHERE p.sku = ?` / `[P.sku]` with `WHERE p.name = ?` / `[P.name]` (the `product_selling_units` query, the prices query, and `SELECT price, cost, barcode, unit_of_measure FROM products WHERE name = ?`).
- Leave the later tests that use `SELLING_UNITS_PRODUCT` (seeded, has a SKU) unchanged.

- [ ] **Step 6: Rewrite `add-product-approval.spec.ts`**

- Add `import { selectCategory } from './helpers/product-form';`
- `fillAndSubmitProduct` opts type becomes `{ name: string; description: string; stock: number; cost: string }`; delete the `dialog.getByLabel('SKU').fill(opts.sku)` line; replace the Category `selectOption` with `await selectCategory(page, dialog, TEST_CATEGORY.name);`
- `beforeEach` cleanup: replace `DELETE FROM products WHERE sku LIKE 'APRV-E2E-%'` with `DELETE FROM products WHERE name LIKE 'APRV-E2E %'`.
- In each of the three tests replace `const sku = \`APRV-E2E-…-${Date.now()}\`;` with a unique name and pass it as `name`:
  - OFF: `const name = \`APRV-E2E Off Widget ${Date.now()}\`;`
  - ON: `const name = \`APRV-E2E On Widget ${Date.now()}\`;`
  - APPROVE: `const name = \`APRV-E2E Finalized Widget ${Date.now()}\`;`
  and drop the `sku,` property from the `fillAndSubmitProduct` call (keep `name,`).
- Replace each lookup `request.get(\`/api/products?search=${sku}&limit=50\`)` + `find((p: any) => p.sku === sku)` with `…?search=${encodeURIComponent(name)}&limit=50` + `find((p: any) => p.name === name)`. Remove the now-redundant `expect(match.name).toBe('…')` lines (OFF and APPROVE tests) or change them to `expect(match.name).toBe(name)`.
- In the ON test replace `// carrying this sku in transaction_data.` … `expect(txData.sku).toBe(sku);` with:

```ts
    // Queue row must exist as Pending, carrying this product name in transaction_data.
    …
    expect(txData.name).toBe(name);
```

- [ ] **Step 7: Add the SKU-less edit test (Review Focus #1)**

In `tests/e2e/product-edit-delete.spec.ts` add `import { testQuery } from './helpers/db';` and, inside `test.describe('Edit product', …)` after the existing test, add:

```ts
  test('admin makausab ug product nga walay SKU — dili mo-require ug dili mag-set ug SKU', async ({ page, request }) => {
    const id = 'test-no-sku-1';
    const name = 'No SKU Widget';
    const newName = 'No SKU Widget Renamed';
    await testQuery('DELETE FROM products WHERE id = ?', [id]);
    await testQuery(
      `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability)
       VALUES (?, ?, 40, 5, NULL, 'Product nga walay SKU.', ?, ?, ?, 'Available')`,
      [id, name, EDITABLE_PRODUCT.brand, EDITABLE_PRODUCT.category, EDITABLE_PRODUCT.unitOfMeasure],
    );
    try {
      await seedSession(page, DEFAULT_ADMIN);
      await page.goto('/products');
      await openRowMenu(page, name, name);
      await page.getByRole('menuitem', { name: 'Edit Product' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Edit Product')).toBeVisible();
      // No SKU line for a product that has none.
      await expect(dialog.getByLabel('SKU')).toHaveCount(0);

      await dialog.getByLabel('Product Name').fill(newName);
      await dialog.getByRole('button', { name: 'Save Changes' }).click();
      await expect(dialog).toBeHidden();

      const [row] = await testQuery('SELECT name, sku FROM products WHERE id = ?', [id]);
      expect(row.name).toBe(newName);
      expect(row.sku, 'SKU stays NULL, not empty string').toBeNull();
    } finally {
      await testQuery('DELETE FROM products WHERE id = ?', [id]);
    }
  });
```

Also update the existing edit test's comment/assert wording only if needed — keep its `sku`-based lookup as-is (it proves a legacy SKU survives an edit, Review Focus #3).

- [ ] **Step 8: Run the specs to verify they FAIL**

Run: `npx playwright test tests/e2e/add-product.spec.ts tests/e2e/product-edit-delete.spec.ts --reporter=line`
Expected: FAIL. The working tree already has the picker wired in, so the failures come from SKU: `add-product.spec` fails because the form still blocks submit with "SKU is required" (the dialog never closes), and the new SKU-less edit test fails on "SKU is required" or on `getByLabel('SKU')` having count 1 (legacy SKU input still shown). Record which tests fail and why.

- [ ] **Step 9: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): drive Add/Edit Product without a SKU and via the combined category picker

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server — SKU optional in actions and schemas

**Files:**
- Modify: `app/(app)/products/actions.ts` (type L15, approval item L710, id L736, insert L776, update L923, child L1290, bulk L1560, comment L872)
- Modify: `app/(app)/products/add-product/product-schema.ts:157`
- Modify: `app/(app)/products/edit-product/product-schema.ts:32`

**Interfaces:**
- Consumes: nothing from Task 1 (independent; Task 1 tests exercise it).
- Produces: `ProductFormData.sku?: string`; `addProduct` accepts a payload with no `sku` and inserts `NULL`; `updateProduct` keeps the stored SKU when the payload's SKU is empty/absent.

- [ ] **Step 1: `actions.ts` — type**

Change `  sku: string;` (in `ProductFormData`, ~L15) to `  sku?: string;`.

- [ ] **Step 2: `actions.ts` — approval-queue item**

Change `          sku: formData.sku,` (~L710) to `          sku: formData.sku || '',`.

- [ ] **Step 3: `actions.ts` — SKU-free product id**

Replace ``const productId = `${formData.sku}-${Date.now()}`;`` (~L736) with:

```ts
    // Products carry no SKU of their own, so the id cannot derive from one.
    // Same shape the duplicate-product flows below already use.
    const productId = `product_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
```

- [ ] **Step 4: `actions.ts` — insert NULL**

Change `        sku: formData.sku,` in `addProduct`'s `productData` (~L776) to `        sku: formData.sku || null,`.

- [ ] **Step 5: `actions.ts` — stale comment**

Replace the comment at ~L871–873 (`// supplier_product_mapping.id is VARCHAR(50) — a productId-prefixed id\n // (productId is itself \`${sku}-${Date.now()}\`) overflows it for any\n // non-trivial SKU. A short prefix + uuid …`) with:

```ts
          // supplier_product_mapping.id is VARCHAR(50) — a productId-prefixed id
          // can overflow it. A short prefix + uuid (already imported in this
```
keeping the remaining lines of that comment unchanged.

- [ ] **Step 6: `actions.ts` — updateProduct never clobbers a stored SKU**

Change `        sku: formData.sku ?? existing.sku,` (~L923) to:

```ts
        // '' or null from the form (SKU-less products, or forms that no longer
        // collect a SKU) must not overwrite what is stored — and '' must never
        // be written (the (sku, warehouse_id) unique index treats '' as a value).
        sku: formData.sku || existing.sku || null,
```

- [ ] **Step 7: `actions.ts` — child / bulk SKU from a SKU-less parent**

Replace (~L1290):
```ts
        const newSku = `${parent.sku}-${newProductData.unitOfMeasure.replace(/\s+/g, '').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
```
with:
```ts
        const newSku = parent.sku
          ? `${parent.sku}-${newProductData.unitOfMeasure.replace(/\s+/g, '').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
          : null;
```
and (~L1560):
```ts
        const newSku = `${pack.sku}-BULK-${Date.now().toString(36).toUpperCase()}`;
```
with:
```ts
        const newSku = pack.sku ? `${pack.sku}-BULK-${Date.now().toString(36).toUpperCase()}` : null;
```

- [ ] **Step 8: Schemas**

`add-product/product-schema.ts`: change `  sku: z.string().min(1, 'SKU is required'),` to `  sku: z.string().optional(),`.

`edit-product/product-schema.ts`: change `    sku: z.string().min(1, 'SKU is required'),` to `    // Legacy products carry a SKU; products created after SKU was retired have NULL.\n    sku: z.string().nullish(),`.

- [ ] **Step 9: Source guard for Review Focus #4**

Run: `grep -n "parent.sku\|pack.sku" "app/(app)/products/actions.ts"`
Expected: the only `${parent.sku}` / `${pack.sku}` template uses are inside the `parent.sku ? … : null` / `pack.sku ? … : null` ternaries.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: no new errors. (`docs/superpowers/scratch-typecheck-errors.txt` in the repo lists unrelated pre-existing ones; only compare the files touched here.) If a place consumed `values.sku` as `string`, fix by `?? ''`.

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/products/actions.ts" "app/(app)/products/add-product/product-schema.ts" "app/(app)/products/edit-product/product-schema.ts"
git commit -m "feat(products): create products without a SKU and never clobber a stored one

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: UI — drop SKU, combined picker, one tidy layout (Add and Edit)

**Files:**
- Modify: `app/(app)/products/add-product/use-add-product-form.ts` (~L145, L235, L509, L527, L559-564, L612)
- Modify: `app/(app)/products/edit-product/use-edit-product-form.ts` (~L279, L524)
- Rewrite: `app/(app)/products/add-product/tabs/basic-info-tab.tsx`, `app/(app)/products/edit-product/tabs/basic-info-tab.tsx`
- Commit (already written): `app/(app)/products/components/category-subcategory-picker.tsx`

**Interfaces:**
- Consumes: `CategorySubcategoryPicker` props exactly as defined in `components/category-subcategory-picker.tsx` (`categories, subcategories, isLoadingCategories?, isLoadingSubcategories?, category, subcategory, onCategoryChange, onSubcategoryChange, onAddCategory, onRenameCategory, onAddSubcategory, onRenameSubcategory, orphanLabel?`); Task 2's optional `sku`.
- Produces: Basic Info with no SKU control; `generateSku` removed from the add-form context.

- [ ] **Step 1: Add hook — remove SKU**

In `use-add-product-form.ts`:
- Delete `      sku: '',` from `defaultValues` (~L145).
- In the basic-tab error flag (~L235) remove `|| formErrors.sku`:
  `basic: !!(formErrors.name || formErrors.brand || formErrors.description || formErrors.category),`
- Replace ``image: `https://picsum.photos/seed/${values.sku}/400/300`,`` (~L509) with ``image: `https://picsum.photos/seed/${encodeURIComponent(values.name)}/400/300`,``
- Replace the activity description (~L527) with ``description: `Added product: ${values.name} — Category: ${values.category || 'N/A'}`,``
- Delete the whole `const generateSku = () => { … };` block (~L559-564) and the `    generateSku,` entry in the returned object (~L612).

- [ ] **Step 2: Edit hook — remove SKU**

In `use-edit-product-form.ts`:
- Remove `|| formErrors.sku` from the basic-tab error flag (~L279).
- Replace the activity description (~L524) with ``description: `Updated product: ${values.name || product.name}`,``

- [ ] **Step 3: Rewrite the Add Basic Info tab**

Replace the whole file `app/(app)/products/add-product/tabs/basic-info-tab.tsx` with:

```tsx
'use client';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Category, Brand } from '@/lib/types';

import { useAddProductFormContext } from '../add-product-form-context';
import { InlineEditableSelect } from '../../components/inline-editable-select';
import { CategorySubcategoryPicker } from '../../components/category-subcategory-picker';
import { addBrand, updateBrand, addCategory, updateCategory, addSubcategory, updateSubcategory } from '../../actions';

export function BasicInfoTab() {
  const {
    form,
    brands, isLoadingBrands,
    categories, isLoadingCategories,
    subcategories, isLoadingSubcategories,
    selects, setSelects,
    refreshBrands,
    refreshCategories,
    refreshSubcategories,
  } = useAddProductFormContext();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Row 1: Name and Brand */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Product Name</FormLabel>
            <FormControl>
              <Input placeholder="e.g., Cola-Cola" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="brand"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Brand</FormLabel>
            <InlineEditableSelect
              items={brands}
              isLoading={isLoadingBrands}
              value={field.value}
              onChange={field.onChange}
              open={selects.brands}
              onOpenChange={(o) => setSelects((p) => ({ ...p, brands: o }))}
              placeholder="Select a brand"
              addLabel="Add Brand"
              emptyLabel="No brands found"
              getId={(b: Brand) => b.id}
              getValue={(b: Brand) => b.name}
              getOptionLabel={(b: Brand) => b.name}
              getName={(b: Brand) => b.name}
              onAdd={async (name) => {
                const r = await addBrand(name, 0);
                if (r.success) { await refreshBrands(); return name; }
                return undefined;
              }}
              onRename={async (id, name) => {
                const existing = brands.find((b: Brand) => b.id === id);
                const r = await updateBrand(id, name, existing?.markupPercentage);
                if (r.success) { await refreshBrands(); return name; }
                return undefined;
              }}
            />
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Row 2: Category / Subcategory and Description */}
      <FormField
        control={form.control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Category / Subcategory</FormLabel>
            <CategorySubcategoryPicker
              categories={categories}
              subcategories={subcategories}
              isLoadingCategories={isLoadingCategories}
              isLoadingSubcategories={isLoadingSubcategories}
              category={field.value}
              subcategory={form.watch('subcategory') ?? ''}
              onCategoryChange={field.onChange}
              onSubcategoryChange={(v) => form.setValue('subcategory', v, { shouldDirty: true, shouldValidate: true })}
              onAddCategory={async (name) => {
                const r = await addCategory(name, 0);
                if (r.success) { await refreshCategories(); return name; }
                return undefined;
              }}
              onRenameCategory={async (id, name) => {
                const existing = categories.find((c: Category) => c.id === id);
                const r = await updateCategory(id, name, existing?.markupPercentage);
                if (r.success) { await refreshCategories(); return name; }
                return undefined;
              }}
              onAddSubcategory={async (name) => {
                const r = await addSubcategory(name, 0);
                if (r.success) { await refreshSubcategories(); return name; }
                return undefined;
              }}
              onRenameSubcategory={async (id, name) => {
                const existing = subcategories.find((s: Category) => s.id === id);
                const r = await updateSubcategory(id, name, existing?.markupPercentage);
                if (r.success) { await refreshSubcategories(); return name; }
                return undefined;
              }}
            />
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                placeholder="A short description of the product."
                {...field}
                onKeyDown={(e) => {
                  if (e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Row 3: Additional Description (full width) */}
      <FormField
        control={form.control}
        name="additionalDescription"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Additional Description (Optional)</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Provide additional details like specifications or special notes."
                {...field}
                onKeyDown={(e) => {
                  if (e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the Edit Basic Info tab**

Replace the whole file `app/(app)/products/edit-product/tabs/basic-info-tab.tsx` with:

```tsx
'use client';

import { Badge } from '@/components/ui/badge';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Category, Brand } from '@/lib/types';

import { useEditProductFormContext } from '../edit-product-form-context';
import { InlineEditableSelect } from '../../components/inline-editable-select';
import { CategorySubcategoryPicker } from '../../components/category-subcategory-picker';
import { addBrand, updateBrand, addCategory, updateCategory, addSubcategory, updateSubcategory } from '../../actions';

export function BasicInfoTab() {
  const {
    form,
    product,
    brands,
    categories,
    subcategories,
    setSelects,
    selects,
    refreshBrands,
    refreshCategories,
    refreshSubcategories,
  } = useEditProductFormContext();

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Product Type:</span>
        <Badge variant="secondary">
          {product.type === 'service' ? 'Service' : 'Standard'}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Cannot be changed after creation.
        </span>
      </div>

      {/* Legacy products only: SKU is retired for new products, but keep showing an existing one. */}
      {product.sku ? (
        <div className="space-y-2">
          <Label htmlFor="legacy-sku">SKU</Label>
          <Input id="legacy-sku" value={product.sku} readOnly className="bg-muted" />
          <p className="text-sm text-muted-foreground">SKU cannot be changed after creation.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Row 1: Name and Brand */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product Name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="brand"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brand</FormLabel>
              <InlineEditableSelect
                items={brands}
                isLoading={false}
                value={field.value}
                onChange={field.onChange}
                open={selects.brands}
                onOpenChange={(o) => setSelects((p) => ({ ...p, brands: o }))}
                placeholder="Select a brand"
                addLabel="Add Brand"
                emptyLabel="No brands found"
                orphanLabel={(v) => `${v} (Missing in Settings)`}
                getId={(b: Brand) => b.id}
                getValue={(b: Brand) => b.name}
                getOptionLabel={(b: Brand) => b.name}
                getName={(b: Brand) => b.name}
                onAdd={async (name) => {
                  const r = await addBrand(name, 0);
                  if (r.success) { await refreshBrands(); return name; }
                  return undefined;
                }}
                onRename={async (id, name) => {
                  const existing = brands.find((b: Brand) => b.id === id);
                  const r = await updateBrand(id, name, existing?.markupPercentage);
                  if (r.success) { await refreshBrands(); return name; }
                  return undefined;
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Row 2: Category / Subcategory and Description */}
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category / Subcategory</FormLabel>
              <CategorySubcategoryPicker
                categories={categories}
                subcategories={subcategories}
                category={field.value}
                subcategory={form.watch('subcategory') ?? ''}
                onCategoryChange={field.onChange}
                onSubcategoryChange={(v) => form.setValue('subcategory', v, { shouldDirty: true, shouldValidate: true })}
                orphanLabel={(v) => `${v} (Missing in Settings)`}
                onAddCategory={async (name) => {
                  const r = await addCategory(name, 0);
                  if (r.success) { await refreshCategories(); return name; }
                  return undefined;
                }}
                onRenameCategory={async (id, name) => {
                  const existing = categories.find((c: Category) => c.id === id);
                  const r = await updateCategory(id, name, existing?.markupPercentage);
                  if (r.success) { await refreshCategories(); return name; }
                  return undefined;
                }}
                onAddSubcategory={async (name) => {
                  const r = await addSubcategory(name, 0);
                  if (r.success) { await refreshSubcategories(); return name; }
                  return undefined;
                }}
                onRenameSubcategory={async (id, name) => {
                  const existing = subcategories.find((s: Category) => s.id === id);
                  const r = await updateSubcategory(id, name, existing?.markupPercentage);
                  if (r.success) { await refreshSubcategories(); return name; }
                  return undefined;
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="A short description of the product."
                  {...field}
                  onKeyDown={(e) => {
                    if (e.key === ' ') {
                      e.stopPropagation();
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Row 3: Additional Description (full width) */}
        <FormField
          control={form.control}
          name="additionalDescription"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Additional Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Provide additional details like specifications or special notes."
                  {...field}
                  onKeyDown={(e) => {
                    if (e.key === ' ') {
                      e.stopPropagation();
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
```

Note: `FormDescription` is imported but no longer used in that file — remove it from the import line (`import { FormControl, FormField, FormItem, FormLabel, FormMessage } …`) before saving. `Label` lives at `@/components/ui/label` (exists).

- [ ] **Step 5: Check nothing else referenced the removed things**

Run: `grep -rn "generateSku" "app/(app)/products/add-product"`
Expected: no matches. Run: `grep -rn "getByLabel('SKU')" tests/e2e`
Expected: only matches inside the SKU-less edit test's `toHaveCount(0)` assertion.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors in the files touched by this plan (compare against `docs/superpowers/scratch-typecheck-errors.txt` for unrelated pre-existing ones).

- [ ] **Step 7: Run the affected e2e specs — expect PASS**

Run: `npx playwright test tests/e2e/add-product.spec.ts tests/e2e/add-product-approval.spec.ts tests/e2e/add-product-suppliers.spec.ts tests/e2e/selling-units.spec.ts tests/e2e/product-edit-delete.spec.ts --reporter=line`
Expected: all PASS. If `selectCategory` fails to click inside the popover because the modal Dialog blocks pointer events, inspect `components/ui/popover.tsx` layering (Popover content is portaled with `z-[150]`) and fix in the picker component (e.g. add `onOpenAutoFocus`/`modal` props) — do not weaken the helper.

- [ ] **Step 8: Run remaining product-related specs for regressions**

Run: `npx playwright test tests/e2e/product-type-service.spec.ts tests/e2e/inventory-adjust.spec.ts tests/e2e/bulk-price-update.spec.ts --reporter=line`
Expected: PASS (they seed products via SQL and are unaffected).

- [ ] **Step 9: Manual check in the browser (golden path and edges)**

With `npm run dev`: open Add Product — no SKU field, layout is Name | Brand, Category / Subcategory | Description, then Additional Description full width. Open the picker: add a new category and subcategory inline, rename one, pick both, clear the subcategory via "None", click Done. Narrow the window to phone width: single column, popover stays inside the viewport. Open Edit on a legacy product with a SKU: read-only SKU shows and survives Save. Open Edit on a product with no SKU: no SKU line.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/products/components/category-subcategory-picker.tsx" \
        "app/(app)/products/add-product/use-add-product-form.ts" \
        "app/(app)/products/add-product/tabs/basic-info-tab.tsx" \
        "app/(app)/products/edit-product/use-edit-product-form.ts" \
        "app/(app)/products/edit-product/tabs/basic-info-tab.tsx"
git commit -m "feat(products): combined category picker, no SKU field, tidy Basic Info layout

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Do **not** `git add` the unrelated modified files present in the working tree (`.claude/settings.json`, the inventory/suppliers tab edits, `components/ui/spinner.tsx`, other docs, migration 114). Stage paths explicitly as above and check `git status` before committing.
