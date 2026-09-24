# Product Supplier Mapping UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-supplier field on the Add/Edit Product dialogs with a "Suppliers" tab that manages multiple supplier mappings per product (SKU, cost, lead time, reorder point, primary flag), backed by the already-existing `supplier_product_mapping` table and server actions.

**Architecture:** No schema or server-action changes — `supplier_product_mapping` (migration 036) and `addSupplierMapping`/`updateSupplierMapping`/`deleteSupplierMapping`/`getSupplierMappings`/`setPrimarySupplier` already exist in `app/(app)/products/actions.ts`, and `addProduct`/`updateProduct` already persist `formData.supplierMappings[]` via full delete+reinsert. This plan is purely client-side: add a `supplierMappings` array field to both product zod schemas, build a repeatable-row tab UI (styled like the existing Selling Units tab), remove the single-select Supplier field from both Inventory tabs, and make `productData.supplier_id` (the legacy scalar column still read by family-sync, child-product creation, and the multi-branch scheduler) derive automatically from whichever mapping row is flagged primary — so those unrelated consumers keep working unmodified.

**Tech Stack:** Next.js 16, react-hook-form + useFieldArray, zod, existing `InlineEditableSelect` component, raw MySQL via existing server actions.

**Spec:** No written spec — classified as a bounded change during brainstorming (existing table + existing actions, no new subsystem). This plan's Architecture section carries the agreed design; the file/line citations below are the source of truth in place of a spec doc.

## Global Constraints

- Do not modify `scripts/migrations/036_create_supplier_product_mapping.ts` or any other migration — the table already exists with the exact shape needed.
- Do not modify `addSupplierMapping`, `updateSupplierMapping`, `deleteSupplierMapping`, `getSupplierMappings`, or `setPrimarySupplier` in `app/(app)/products/actions.ts` — they are correct and unused by any other in-flight work.
- `addProduct` (actions.ts:619-624) and `updateProduct` (actions.ts:773-779) already reconcile `formData.supplierMappings[]` into the table (insert-only for add; delete-all-then-reinsert for update). Do not duplicate that logic client-side — the tab only needs to manage local form-array state and submit it once.
- `formData.supplierMappings[]` items must use exactly these field names, because actions.ts reads them positionally: `supplierId`, `supplierSku`, `leadTime`, `rop`, `cost`, `isPrimary`. Do not use the `lib/types.ts` `SupplierProductMapping` field names (`supplierLeadTime`, `supplierSpecificRop`) for the submitted payload — those are for the read-side type returned by `getSupplierMappings`.
- `products.supplier_id` (the legacy column) must keep being written on every add/update, derived from the mapping row where `isPrimary === true` (or `undefined` if no rows exist) — see Task 2 and Task 5. Do not delete `productData.supplier_id` from either action; do not remove `formData.supplier` from the zod schemas' internal type (keep it as an internal derived field, just stop rendering an input for it).
- Exactly zero or one row may be marked primary at a time. Enforce in the UI: checking a row's Primary radio unchecks all others (same pattern `setPrimarySupplier` uses server-side, but this is local form state, not a live call).
- Each product may only be mapped to a given supplier once (`UNIQUE KEY (product_id, supplier_id)` in the table). Block adding a duplicate supplier row client-side with a validation error rather than letting the insert fail.

## Review Focus

- **Removing all supplier mappings then saving an edit** — `updateProduct` does `DELETE FROM supplier_product_mapping WHERE product_id = ?` unconditionally when `formData.supplierMappings` is present at all (even as `[]`), and the new `productData.supplier_id` derivation must resolve to `null` (not throw, not keep a stale value) when the array is empty. A test must save a product with zero mapping rows and confirm both the mapping table and `products.supplier_id` end up empty.
- **Editing a product that predates this feature (no existing mapping rows, but has a legacy `products.supplier_id`)** — the edit form must not silently drop that supplier. On load, if `getSupplierMappings` returns `[]` and `product.supplier` (or `product.supplierId`) is set, seed one primary row from it so opening and re-saving an old product doesn't wipe its only supplier link.
- **Marking a second row primary** — must uncheck the previously-primary row in the same state update, not leave two rows both flagged (which would make `.find(m => m.isPrimary)` in actions.ts pick whichever happens to be first, silently).
- **Duplicate supplier selected twice** — adding a row for a supplier already present in the array must show a validation error and refuse to save, not let the DB unique-constraint error surface as a raw "There was an error updating the product" toast with no explanation.
- **Automatic markup calculation** (`calculateMarkupPercentage` in `lib/purchase-utils.ts:124`, wired via `watchedSupplierId`/`selectedSupplierId` in both `use-add-product-form.ts:269` and `use-edit-product-form.ts:230`) — after the single Supplier field is removed, this must be repointed to the primary mapping row's `supplierId`, not silently stop firing. A test must confirm the markup-source banner still appears when a primary supplier with a markup percentage is set via the new tab.

---

### Task 1: Add `supplierMappings` to both product zod schemas

**Files:**
- Modify: `app/(app)/products/add-product/product-schema.ts`
- Modify: `app/(app)/products/edit-product/product-schema.ts`
- Test: `scripts/verify-supplier-mapping-schema.ts` (new, throwaway — see Step 1)

**Interfaces:**
- Produces: `supplierMappingSchema` (exported from `add-product/product-schema.ts`, re-exported from `edit-product/product-schema.ts` the same way `sellingUnitSchema` already is at edit-product/product-schema.ts:2-9) and `SupplierMappingValues` type, plus a `supplierMappingsSuperRefine(mappings, ctx)` function that enforces "at most one `isPrimary: true`" and "no duplicate `supplierId`".
- Consumes: nothing from other tasks.

This project has no unit-test runner configured (`package.json` has no `vitest`/`jest`; its only test layer is Playwright E2E on port 3100, per `CLAUDE.md`). Do not add one for this plan. Verify the pure zod logic with a disposable `tsx`-run script instead of a real test file, then delete it — Task 6's Playwright suite is the durable, checked-in test for this feature.

- [ ] **Step 1: Write the failing verification script**

Create `scripts/verify-supplier-mapping-schema.ts`:

```typescript
import { z } from 'zod';
import { supplierMappingSchema, supplierMappingsSuperRefine } from '../app/(app)/products/add-product/product-schema';

function runRefine(mappings: any[]) {
  const issues: any[] = [];
  const ctx = { addIssue: (issue: any) => issues.push(issue) } as unknown as z.RefinementCtx;
  supplierMappingsSuperRefine(mappings as any, ctx);
  return issues;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`OK: ${message}`);
}

assert(
  supplierMappingSchema.safeParse({ supplierId: 'sup_1', leadTime: 3, rop: 10, isPrimary: true }).success,
  'accepts a minimal valid row',
);
assert(
  !supplierMappingSchema.safeParse({ leadTime: 3, rop: 10, isPrimary: false }).success,
  'requires supplierId',
);
assert(runRefine([]).length === 0, 'allows zero rows');
assert(
  runRefine([
    { supplierId: 'sup_1', leadTime: 0, rop: 0, isPrimary: true },
    { supplierId: 'sup_2', leadTime: 0, rop: 0, isPrimary: false },
  ]).length === 0,
  'allows exactly one primary row',
);
assert(
  runRefine([
    { supplierId: 'sup_1', leadTime: 0, rop: 0, isPrimary: true },
    { supplierId: 'sup_2', leadTime: 0, rop: 0, isPrimary: true },
  ]).length > 0,
  'flags more than one primary row',
);
assert(
  runRefine([
    { supplierId: 'sup_1', leadTime: 0, rop: 0, isPrimary: true },
    { supplierId: 'sup_1', leadTime: 0, rop: 0, isPrimary: false },
  ]).length > 0,
  'flags a duplicate supplierId',
);

console.log('All supplier-mapping schema checks passed.');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/verify-supplier-mapping-schema.ts`
Expected: FAIL — `supplierMappingSchema` and `supplierMappingsSuperRefine` are not exported yet (module has no such export).

- [ ] **Step 3: Implement the schema and refine function**

In `app/(app)/products/add-product/product-schema.ts`, add after `sellingUnitsSuperRefine` (after line 83, before the `baseProductSchema` comment block at line 85):

```typescript
/**
 * One supplier-mapping row. Field names match what `addProduct`/`updateProduct`
 * in actions.ts read positionally off `formData.supplierMappings[]` — do not
 * rename these to match the DB column names or the `SupplierProductMapping`
 * read-side type in lib/types.ts, both of which use different names.
 */
export const supplierMappingSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  supplierSku: z.string().optional(),
  leadTime: z.coerce.number().int().nonnegative().default(0),
  rop: z.coerce.number().int().nonnegative().default(0),
  cost: z.coerce.number().min(0).optional(),
  isPrimary: z.boolean().default(false),
});

export type SupplierMappingValues = z.infer<typeof supplierMappingSchema>;

/**
 * Structural rules the per-row schema cannot express: at most one primary
 * row, and no supplier mapped twice (the table's UNIQUE KEY (product_id,
 * supplier_id) would otherwise surface as a raw DB error on save).
 */
export function supplierMappingsSuperRefine(
  mappings: SupplierMappingValues[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (!mappings || mappings.length === 0) return;

  const primaryIndexes = mappings
    .map((m, i) => (m.isPrimary ? i : -1))
    .filter((i) => i >= 0);

  if (primaryIndexes.length > 1) {
    for (const i of primaryIndexes.slice(1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supplierMappings', i, 'isPrimary'],
        message: 'Only one supplier can be marked primary.',
      });
    }
  }

  const seen = new Map<string, number>();
  mappings.forEach((m, i) => {
    const key = m.supplierId;
    if (!key) return;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supplierMappings', i, 'supplierId'],
        message: 'This supplier is already mapped to this product.',
      });
    } else {
      seen.set(key, i);
    }
  });
}
```

Then add the field to `standardProductSchema` (after `isPerishable: z.boolean().optional(),` at line 126):

```typescript
  supplierMappings: z.array(supplierMappingSchema).optional(),
```

And to `serviceProductSchema` (after `isPerishable: z.undefined(),` at line 157), pin it unrepresentable the same way other stock-only fields are:

```typescript
  supplierMappings: z.undefined(),
```

Wire the new superRefine into the top-level `productSchema` (lines 160-165):

```typescript
export const productSchema = z
  .discriminatedUnion('itemType', [standardProductSchema, serviceProductSchema])
  .superRefine((values, ctx) => {
    if (values.itemType !== 'standard') return;
    sellingUnitsSuperRefine(values.sellingUnits, ctx);
    supplierMappingsSuperRefine(values.supplierMappings, ctx);
  });
```

In `app/(app)/products/edit-product/product-schema.ts`, re-export the same way `sellingUnitSchema` already is (edit the top import/export block at lines 1-9):

```typescript
import { z } from 'zod';
import {
  sellingUnitSchema,
  sellingUnitsSuperRefine,
  supplierMappingSchema,
  supplierMappingsSuperRefine,
  type SellingUnitValues,
  type SupplierMappingValues,
} from '../add-product/product-schema';

export { sellingUnitSchema, sellingUnitsSuperRefine, supplierMappingSchema, supplierMappingsSuperRefine };
export type { SellingUnitValues, SupplierMappingValues };
```

Add the field to the object schema (after `isPerishable: z.boolean().optional(),` at line 53):

```typescript
    supplierMappings: z.array(supplierMappingSchema).optional(),
```

And wire it into the `superRefine` call (lines 55-57):

```typescript
  .superRefine((values, ctx) => {
    sellingUnitsSuperRefine(values.sellingUnits, ctx);
    supplierMappingsSuperRefine(values.supplierMappings, ctx);
  });
```

- [ ] **Step 4: Run it to verify it passes, then delete it**

Run: `npx tsx scripts/verify-supplier-mapping-schema.ts`
Expected: prints six `OK:` lines and `All supplier-mapping schema checks passed.`

Delete the script — it was a one-off verification, not a checked-in test:

```bash
rm scripts/verify-supplier-mapping-schema.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/products/add-product/product-schema.ts app/\(app\)/products/edit-product/product-schema.ts
git commit -m "feat(products): add supplierMappings array to product schemas"
```

---

### Task 2: Wire `supplierMappings` field array + primary-supplier derivation into the Add Product form hook

**Files:**
- Modify: `app/(app)/products/add-product/use-add-product-form.ts`

**Interfaces:**
- Consumes: `supplierMappingSchema`, `SupplierMappingValues` from Task 1 (`./product-schema`, already imported as a sibling export alongside `SellingUnitValues`).
- Produces (added to the returned `AddProductFormController`, consumed by Task 3's tab and Task 4's dialog/inventory-tab changes): `supplierMappingFields`, `addSupplierMapping()`, `removeSupplierMapping(index: number)`, `setPrimarySupplierRow(index: number)` — a helper that sets `isPrimary` on one row and clears it on every other row via `form.setValue`.

- [ ] **Step 1: Write the failing test**

This hook is tightly coupled to `react-hook-form` and browser APIs (`localStorage`, `fetch`) — there is no existing unit test for `use-add-product-form.ts`, consistent with the rest of this file (it's exercised via the dialog in practice, not in isolation). Skip an isolated unit test for the hook itself; Task 6's E2E test is what proves this wiring works end-to-end. Proceed directly to implementation.

- [ ] **Step 2: (skipped — no isolated test for this hook, see Step 1)**

- [ ] **Step 3: Implement the field array, primary-setter, and supplier_id derivation**

In `app/(app)/products/add-product/use-add-product-form.ts`, update the import at line 27:

```typescript
import { productSchema, type ProductFormValues, type SellingUnitValues, type SupplierMappingValues } from './product-schema';
```

Add `supplierMappings: []` to the `defaultValues` object (after `sellingUnits: [...]` at line 149):

```typescript
      supplierMappings: [],
```

After the existing `sellingUnitFields` field array block (after line 158), add a second field array:

```typescript
  const { fields: supplierMappingFields, append: appendSupplierMapping, remove: removeSupplierMappingRow } = useFieldArray({
    control: form.control as any,
    name: 'supplierMappings',
  });

  const addSupplierMapping = () =>
    appendSupplierMapping({
      supplierId: '',
      supplierSku: '',
      leadTime: 0,
      rop: 0,
      cost: undefined,
      isPrimary: false,
    } as any);

  const removeSupplierMapping = (index: number) => removeSupplierMappingRow(index);

  /** Marks one row primary and clears the flag on every other row. */
  const setPrimarySupplierRow = (index: number) => {
    const rows = (form.getValues('supplierMappings' as any) as SupplierMappingValues[] | undefined) ?? [];
    rows.forEach((_, i) => {
      form.setValue(`supplierMappings.${i}.isPrimary` as any, i === index, { shouldDirty: true });
    });
  };
```

Replace the `watchedSupplierId` derivation (line 269, currently `const watchedSupplierId = form.watch('supplier');`) — the single field is going away in Task 4, so the markup calculation must derive its supplier from the primary mapping row instead:

```typescript
  const watchedSupplierMappings = form.watch('supplierMappings' as any) as SupplierMappingValues[] | undefined;
  const primarySupplierId = (watchedSupplierMappings ?? []).find((m) => m?.isPrimary)?.supplierId
    ?? (watchedSupplierMappings ?? [])[0]?.supplierId;
```

Update the `calculateMarkupPercentage` call (around line 283, inside the markup `useEffect`) to use `primarySupplierId` instead of `watchedSupplierId`:

```typescript
            supplierId: primarySupplierId
```

And update that `useEffect`'s dependency array (line 310) to swap `watchedSupplierId` for `primarySupplierId`.

In `onSubmit` (around line 437-448), derive `supplier_id` for the payload from the primary mapping row, since the top-level `values.supplier` field no longer has an input writing to it:

```typescript
      const primaryMapping = (values as any).supplierMappings?.find((m: SupplierMappingValues) => m.isPrimary)
        ?? (values as any).supplierMappings?.[0];

      const result = await addProduct(
        {
          ...values,
          itemType,
          supplier: primaryMapping?.supplierId,
          price: mirroredPrice,
          cost: baseUnit?.cost ?? values.cost,
          barcode: baseUnit?.barcode ?? values.barcode,
          unitOfMeasure: baseUnit?.unitName || values.unitOfMeasure,
          image: `https://picsum.photos/seed/${values.sku}/400/300`,
        } as any,
        uid,
      );
```

This keeps `formData.supplier` populated for `addProduct`'s existing `productData.supplier_id = formData.supplier || null` line (actions.ts:524) without touching actions.ts at all — Task 5 covers the equivalent for `updateProduct`, which needs an actual actions.ts change because its fallback-to-existing logic (`formData.supplier !== undefined ? formData.supplier : existing.supplier_id`) would otherwise never update a changed primary supplier.

Finally, add the four new items to the hook's return object (in the "field arrays" section, after `baseUnitIndex, baseUnitName,` around line 537):

```typescript
    supplierMappingFields, addSupplierMapping, removeSupplierMapping, setPrimarySupplierRow,
```

- [ ] **Step 4: (skipped — see Step 1)**

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/products/add-product/use-add-product-form.ts
git commit -m "feat(products): wire supplierMappings field array into Add Product form"
```

---

### Task 3: Build the Suppliers tab UI (Add Product)

**Files:**
- Create: `app/(app)/products/add-product/tabs/suppliers-tab.tsx`
- Modify: `app/(app)/products/add-product/add-product-dialog.tsx`

**Interfaces:**
- Consumes: `useAddProductFormContext()` → `suppliers`, `isLoadingSuppliers`, `refreshSuppliers` (already exist), plus `supplierMappingFields`, `addSupplierMapping`, `removeSupplierMapping`, `setPrimarySupplierRow` (from Task 2), plus `addSupplier`, `updateSupplier`, `getSuppliers` (already imported in `inventory-tab.tsx` from `../../actions`, same pattern reused here).
- Produces: `SuppliersTab` component, imported and rendered by `add-product-dialog.tsx`.

- [ ] **Step 1: Write the failing test**

Create `app/(app)/products/add-product/tabs/suppliers-tab.test.tsx` — a lightweight render test using the same testing setup the project already has for React components. First check what test runner/library config exists:

Run: `cat package.json | grep -A3 '"test"'` (or open `package.json`) to confirm whether `@testing-library/react` and `vitest`/`jest` are already configured. If no React component test harness exists in this repo (most likely, since Playwright E2E is the project's only test layer per CLAUDE.md), skip a component-level unit test and rely on Task 6's Playwright E2E test as the executable verification for this UI. Note that decision here and proceed to Step 3.

- [ ] **Step 2: (skipped if no component test harness — see Step 1)**

- [ ] **Step 3: Implement the tab**

Create `app/(app)/products/add-product/tabs/suppliers-tab.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { PlusCircle, X } from 'lucide-react';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { Supplier } from '@/lib/types';

import { useAddProductFormContext } from '../add-product-form-context';
import { InlineEditableSelect } from '../../components/inline-editable-select';
import { addSupplier, updateSupplier, getSuppliers } from '../../actions';

export function SuppliersTab() {
  const {
    form,
    itemType,
    suppliers, isLoadingSuppliers,
    refreshSuppliers,
    supplierMappingFields, addSupplierMapping, removeSupplierMapping, setPrimarySupplierRow,
  } = useAddProductFormContext();

  const [openSupplierRow, setOpenSupplierRow] = useState<number | null>(null);

  if (itemType === 'service') return null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium leading-none">Suppliers</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Every supplier this product can be sourced from. Mark one as primary — it
              feeds automatic markup and the product&apos;s default reorder point.
            </p>
          </div>
          <button
            type="button"
            onClick={addSupplierMapping}
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Supplier
          </button>
        </div>

        {supplierMappingFields.length === 0 && (
          <p className="text-sm text-muted-foreground">No suppliers mapped yet.</p>
        )}

        <div className="space-y-4">
          {supplierMappingFields.map((field, index) => (
            <div
              key={field.id}
              className="relative p-4 pr-14 bg-card border rounded-md shadow-sm"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.supplierId` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Supplier</FormLabel>
                      <InlineEditableSelect
                        items={suppliers}
                        isLoading={isLoadingSuppliers}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        open={openSupplierRow === index}
                        onOpenChange={(o) => setOpenSupplierRow(o ? index : null)}
                        placeholder="Select a supplier"
                        addLabel="Add Supplier"
                        emptyLabel="No suppliers found"
                        getId={(s: Supplier) => s.id}
                        getValue={(s: Supplier) => s.id}
                        getOptionLabel={(s: Supplier) => s.name}
                        getName={(s: Supplier) => s.name}
                        onAdd={async (name) => {
                          const r = await addSupplier({ name });
                          if (r.success) {
                            await refreshSuppliers();
                            const fresh = await getSuppliers();
                            const created = fresh.find((s) => s.name === name);
                            return created?.id;
                          }
                          return undefined;
                        }}
                        onRename={async (id, name) => {
                          const existing = suppliers.find((s: Supplier) => s.id === id);
                          if (!existing) return undefined;
                          const r = await updateSupplier(id, { ...existing, name });
                          if (r.success) { await refreshSuppliers(); return id; }
                          return undefined;
                        }}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.supplierSku` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Supplier SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.cost` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Cost (₱)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.leadTime` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Lead Time (days)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.rop` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Reorder Point</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.isPrimary` as any}
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-end">
                      <FormLabel className="text-xs">Primary</FormLabel>
                      <FormControl>
                        <label className="flex h-10 items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="primary-supplier-mapping"
                            checked={!!field.value}
                            onChange={() => setPrimarySupplierRow(index)}
                            className="h-4 w-4"
                          />
                          {field.value ? 'Primary supplier' : 'Set as primary'}
                        </label>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="absolute right-3 top-3">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                  onClick={() => removeSupplierMapping(index)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove supplier</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Wire it into `app/(app)/products/add-product/add-product-dialog.tsx`: add the import (after line 20, `import { LoyaltyTab } from './tabs/loyalty-tab';`):

```typescript
import { SuppliersTab } from './tabs/suppliers-tab';
```

Add a tab trigger after the Selling Units trigger's closing `)}` (after line 113, before the Loyalty trigger at line 114):

```tsx
                      {itemType === 'standard' && (
                        <TabsTrigger
                          value="suppliers"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
                        >
                          Suppliers
                        </TabsTrigger>
                      )}
```

Add the corresponding `TabsContent` after the Selling Units content block's closing `)}` (after line 131, before the Loyalty content at line 132):

```tsx
                    {itemType === 'standard' && (
                      <TabsContent value="suppliers" className="space-y-4 p-6">
                        <SuppliersTab />
                      </TabsContent>
                    )}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the Add Product dialog, switch to Standard item type, open the new Suppliers tab, add two supplier rows, mark one primary, remove one row. Confirm no console errors and the primary radio behaves as a true single-select across rows.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/products/add-product/tabs/suppliers-tab.tsx app/\(app\)/products/add-product/add-product-dialog.tsx
git commit -m "feat(products): add Suppliers tab to Add Product dialog"
```

---

### Task 4: Remove the single Supplier field from Add Product's Inventory tab

**Files:**
- Modify: `app/(app)/products/add-product/tabs/inventory-tab.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (pure removal).

- [ ] **Step 1: Write the failing test**

No isolated test harness for this component (see Task 3 Step 1 decision). Skip to implementation; Task 6's E2E test covers this tab's final shape.

- [ ] **Step 2: (skipped — see Step 1)**

- [ ] **Step 3: Remove the field**

In `app/(app)/products/add-product/tabs/inventory-tab.tsx`, delete the entire `{itemType === 'standard' && (<FormField ... name="supplier" ...>)}` block (lines 231-274). Also remove the now-unused imports this leaves behind: `addSupplier, updateSupplier, getSuppliers` from the `../../actions` import (line 14) — check first whether `suppliers`/`isLoadingSuppliers`/`refreshSuppliers` destructured from `useAddProductFormContext()` (lines 26, 32) are still used elsewhere in this file; if not, remove those from the destructure too. Leave `Supplier` type import (line 7) removed if no longer referenced in this file.

- [ ] **Step 4: Manual verification**

Run: `npm run typecheck` — confirm no unused-import or type errors from the removal. Run `npm run dev`, open Add Product → Inventory tab, confirm the Supplier field is gone and the layout (grid of remaining fields) still looks correct with one fewer item.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/products/add-product/tabs/inventory-tab.tsx
git commit -m "refactor(products): remove single Supplier field from Add Product Inventory tab"
```

---

### Task 5: Mirror Tasks 2–4 onto the Edit Product form (field array, tab, inventory-tab removal) + actions.ts supplier_id derivation

**Files:**
- Modify: `app/(app)/products/edit-product/use-edit-product-form.ts`
- Create: `app/(app)/products/edit-product/tabs/suppliers-tab.tsx`
- Modify: `app/(app)/products/edit-product/edit-product-dialog.tsx`
- Modify: `app/(app)/products/edit-product/tabs/inventory-tab.tsx`
- Modify: `app/(app)/products/actions.ts:677` (updateProduct's `supplier_id` derivation) and `app/(app)/products/actions.ts:2213-2226` (`getSupplierMappings`, to confirm return shape used for seeding)

**Interfaces:**
- Consumes: `supplierMappingSchema`, `SupplierMappingValues` (Task 1), `getSupplierMappings(productId)` (existing action, actions.ts:2213, returns rows shaped `{ id, product_id, supplier_id, supplier_sku, supplier_lead_time, supplier_specific_rop, supplier_cost, is_primary, supplierName }` — snake_case DB columns plus one camelCase join alias).
- Produces: same four hook exports as Task 2 (`supplierMappingFields`, `addSupplierMapping`, `removeSupplierMapping`, `setPrimarySupplierRow`), a `SuppliersTab` component for the edit dialog.

- [ ] **Step 1: Write the failing test**

No component-test harness (per Task 3's decision); this task's correctness is proven by Task 6's E2E edit-product test, which specifically covers the "predates this feature" and "duplicate primary" review-focus cases. Proceed to implementation.

- [ ] **Step 2: (skipped — see Step 1)**

- [ ] **Step 3a: Load existing mappings and seed the field array in `use-edit-product-form.ts`**

Update the import at line 26:

```typescript
import { productSchema, type ProductFormValues, type SellingUnitValues, type SupplierMappingValues } from './product-schema';
```

Add `getSupplierMappings` to the actions import block (lines 15-25):

```typescript
import {
  updateProduct,
  getBrands,
  getCategories,
  getSubcategories,
  getUnitsOfMeasure,
  getSuppliers,
  getWarehouses,
  getShelfLocations,
  getDepartments,
  getSupplierMappings,
} from '../actions';
```

Add a mapper function near `toFormSellingUnits` (after its closing brace, around line 91) that converts a raw `getSupplierMappings` row into `SupplierMappingValues`, and falls back to the legacy scalar `product.supplier`/`product.supplierId` when no rows exist yet (Review Focus item 2):

```typescript
/**
 * Maps raw `supplier_product_mapping` rows (snake_case DB columns, from
 * getSupplierMappings) onto the form shape. A product saved before this
 * feature existed has no rows here but may still have the legacy scalar
 * `products.supplier_id` set — synthesize one primary row from it so
 * opening and re-saving an old product does not silently drop its supplier.
 */
export function toFormSupplierMappings(
  rows: any[],
  legacySupplierId: string | null | undefined,
): SupplierMappingValues[] {
  if (rows && rows.length > 0) {
    return rows.map((r) => ({
      supplierId: r.supplier_id,
      supplierSku: r.supplier_sku ?? '',
      leadTime: Number(r.supplier_lead_time ?? 0),
      rop: Number(r.supplier_specific_rop ?? 0),
      cost: r.supplier_cost ?? undefined,
      isPrimary: !!r.is_primary,
    }));
  }
  if (legacySupplierId) {
    return [{
      supplierId: legacySupplierId,
      supplierSku: '',
      leadTime: 0,
      rop: 0,
      cost: undefined,
      isPrimary: true,
    }];
  }
  return [];
}
```

Add `supplierMappings: []` to the initial `defaultValues` object (after `sellingUnits: toFormSellingUnits(product),` at line 190) — it gets properly populated asynchronously below, this is just so the field array has a defined array to attach to before the fetch resolves:

```typescript
      supplierMappings: [],
```

Add the field array (after the existing `sellingUnitFields` block, after line 202):

```typescript
  const { fields: supplierMappingFields, append: appendSupplierMapping, remove: removeSupplierMappingRow } = useFieldArray({
    control: form.control as any,
    name: 'supplierMappings',
  });

  const addSupplierMapping = () =>
    appendSupplierMapping({
      supplierId: '',
      supplierSku: '',
      leadTime: 0,
      rop: 0,
      cost: undefined,
      isPrimary: false,
    } as any);

  const removeSupplierMapping = (index: number) => removeSupplierMappingRow(index);

  const setPrimarySupplierRow = (index: number) => {
    const rows = (form.getValues('supplierMappings' as any) as SupplierMappingValues[] | undefined) ?? [];
    rows.forEach((_, i) => {
      form.setValue(`supplierMappings.${i}.isPrimary` as any, i === index, { shouldDirty: true });
    });
  };
```

In the `useEffect` that resets the form when `product`/`isOpen` change (lines 251-287), fetch and seed mappings after the reset. Replace the effect body's `form.reset(sanitizedProduct);` line with:

```typescript
      form.reset(sanitizedProduct);
      getSupplierMappings(product.id).then((rows: any[]) => {
        form.setValue(
          'supplierMappings' as any,
          toFormSupplierMappings(rows, (product as any).supplierId ?? (product as any).supplier ?? null),
        );
      });
```

Replace the `selectedSupplierId` derivation (line 230, currently `const selectedSupplierId = form.watch('supplier');`) with the primary-mapping-based derivation, matching Task 2:

```typescript
  const watchedSupplierMappings = form.watch('supplierMappings' as any) as SupplierMappingValues[] | undefined;
  const selectedSupplierId = (watchedSupplierMappings ?? []).find((m) => m?.isPrimary)?.supplierId
    ?? (watchedSupplierMappings ?? [])[0]?.supplierId;
```

This is a drop-in replacement — every other reference to `selectedSupplierId` in the file (the markup `useEffect` at line 316 and its dependency array at line 342, plus the return object at line 532) keeps working unchanged since the variable name and type (`string | undefined`) are the same.

In `saveChanges` (around line 451-457), derive the submitted `supplier` the same way as Task 2's `onSubmit`:

```typescript
      const primaryMapping = (values as any).supplierMappings?.find((m: SupplierMappingValues) => m.isPrimary)
        ?? (values as any).supplierMappings?.[0];

      const result = await updateProduct(product.id, {
        ...values,
        supplier: primaryMapping?.supplierId ?? null,
        price: mirroredPrice,
        cost: baseUnit ? baseUnit.cost : values.cost,
        barcode: baseUnit ? baseUnit.barcode : values.barcode,
        unitOfMeasure: baseUnit?.unitName || values.unitOfMeasure,
      } as any);
```

Note the explicit `?? null` here (unlike Task 2's `addProduct` call, which can leave it `undefined`): `updateProduct`'s existing fallback at actions.ts:677 is `(formData.supplier !== undefined ? formData.supplier : existing.supplier_id) || null` — passing `undefined` would make it fall back to `existing.supplier_id` and never clear a removed supplier, which breaks the Review Focus "remove all mappings" case. Passing `null` explicitly forces the update.

Add the four new items to the hook's return object (after `baseUnitIndex, baseUnitName,` around line 529):

```typescript
    supplierMappingFields, addSupplierMapping, removeSupplierMapping, setPrimarySupplierRow,
```

- [ ] **Step 3b: Create the edit-product Suppliers tab**

Create `app/(app)/products/edit-product/tabs/suppliers-tab.tsx` — identical to `app/(app)/products/add-product/tabs/suppliers-tab.tsx` from Task 3, with two substitutions: the context import becomes `useEditProductFormContext` from `../edit-product-form-context`, and there is no `itemType === 'service'` early-return guard — use `product.type === 'service'` instead, matching how `edit-product/tabs/selling-units-tab.tsx` and `edit-product-dialog.tsx:110` gate on `product?.type` rather than an `itemType` state value (Edit Product has no `itemType` field per the doc comment at `edit-product/product-schema.ts:11-13`). Pull `product` off the context the same way the dialog does (`const { product, ... } = useEditProductFormContext();`).

- [ ] **Step 3c: Wire the tab into `edit-product-dialog.tsx`**

Add the import (after line 23, `import { LoyaltyTab } from './tabs/loyalty-tab';`):

```typescript
import { SuppliersTab } from './tabs/suppliers-tab';
```

Add a tab trigger, gated the same way the existing Selling Units trigger is gated (`product?.type !== 'service'`, line 110), placed after that trigger's closing `)}` (after line 118, before Loyalty at line 119):

```tsx
                        {product?.type !== 'service' && (
                          <TabsTrigger
                            value="suppliers"
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
                          >
                            Suppliers
                          </TabsTrigger>
                        )}
```

Add the corresponding content block after the Selling Units content's closing `)}` (after line 136, before Loyalty content at line 137):

```tsx
                      {product?.type !== 'service' && (
                        <TabsContent value="suppliers" className="space-y-4 p-6">
                          <SuppliersTab />
                        </TabsContent>
                      )}
```

- [ ] **Step 3d: Remove the single Supplier field from `edit-product/tabs/inventory-tab.tsx`**

Read the file first to find its exact structure (it mirrors `add-product/tabs/inventory-tab.tsx` but may not be line-identical). Remove the `FormField` block with `name="supplier"` the same way as Task 4, and remove any now-unused `addSupplier`/`updateSupplier`/`getSuppliers`/`Supplier` imports it leaves behind, following the same check-before-removing approach as Task 4 Step 3.

- [ ] **Step 3e: Fix `updateProduct`'s `supplier_id` handling in `actions.ts`**

The existing line at `app/(app)/products/actions.ts:677` already reads:

```typescript
        supplier_id: (formData.supplier !== undefined ? formData.supplier : existing.supplier_id) || null,
```

This is already correct for Step 3a's contract (`supplier` is now always sent — either a supplierId string or explicit `null` from `saveChanges`, never left `undefined`) — **no code change needed here**, but add a one-line comment above it recording why this must never fall back silently, since the previous behavior (`formData.supplier` coming from an actual form input) implicitly guaranteed `undefined` only when the field was absent from the payload shape, and that invariant now depends on the client always sending the key:

```typescript
        // formData.supplier is now always present (never `undefined`) — derived
        // from the Suppliers tab's primary mapping row in use-edit-product-form.ts,
        // explicitly `null` when no mappings remain. Do not reintroduce a code path
        // that omits this key, or a removed supplier will silently persist via the
        // `existing.supplier_id` fallback below.
        supplier_id: (formData.supplier !== undefined ? formData.supplier : existing.supplier_id) || null,
```

- [ ] **Step 4: Manual verification**

Run: `npm run typecheck`. Run `npm run dev`, open Edit Product on an existing product that has a legacy `supplier_id` but no mapping rows — confirm the Suppliers tab shows one seeded primary row. Add a second supplier, save, reopen — confirm both rows persisted and the primary flag survived. Remove all rows, save, reopen — confirm the tab is empty and no error occurred.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/products/edit-product/use-edit-product-form.ts app/\(app\)/products/edit-product/tabs/suppliers-tab.tsx app/\(app\)/products/edit-product/edit-product-dialog.tsx app/\(app\)/products/edit-product/tabs/inventory-tab.tsx app/\(app\)/products/actions.ts
git commit -m "feat(products): add Suppliers tab to Edit Product dialog, derive supplier_id from primary mapping"
```

---

### Task 6: E2E coverage for the Suppliers tab (add + edit flows)

**Files:**
- Create: `tests/e2e/product-supplier-mapping.spec.ts`
- Test: same file (Playwright)

**Interfaces:**
- Consumes: existing Playwright fixtures/helpers used by sibling specs in `tests/e2e/` (check an existing product-related spec, e.g. search `tests/e2e/` for an existing "add product" spec, and copy its login/setup boilerplate rather than reinventing it).
- Produces: nothing consumed by later tasks — this is the terminal verification task.

- [ ] **Step 1: Write the failing test**

First inspect an existing product-flow E2E spec for the login/navigation boilerplate this project uses (e.g. `tests/e2e/*.spec.ts` matching "product" — locate one with Glob before writing this file) and match its structure. Then write `tests/e2e/product-supplier-mapping.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
// Adjust this import to match whatever login/session helper the sibling
// product specs in this directory already use — do not reinvent it.

test.describe('Product Suppliers tab', () => {
  test('add product with two suppliers, one primary, persists correctly', async ({ page }) => {
    // 1. Log in and navigate to Products (mirror an existing spec's setup).
    // 2. Open Add Product, switch to Standard, fill required Basic Info fields
    //    (name, brand, sku, description, category) and one selling unit row.
    // 3. Open the Suppliers tab.
    // 4. Click "Add Supplier" twice, pick two different existing suppliers
    //    (or create new ones inline via the "+" affordance in InlineEditableSelect).
    // 5. Mark the second row primary — assert the first row's radio unchecks.
    // 6. Fill lead time / ROP / cost on both rows.
    // 7. Submit the form.
    // 8. Reopen the created product's Edit dialog, go to the Suppliers tab.
    // 9. Assert both supplier rows are present with the values entered, and the
    //    second one is still marked primary.
  });

  test('editing a legacy product with no mapping rows seeds one primary row from products.supplier_id', async ({ page }) => {
    // Requires a seeded product with a legacy supplier_id and zero
    // supplier_product_mapping rows — check tests/e2e/setup/global-setup.ts's
    // seed data for a fixture product matching this shape, or add one there
    // if none exists (matching that file's existing seeding conventions).
    // 1. Open Edit Product on that fixture product.
    // 2. Open the Suppliers tab — assert exactly one row is shown, marked
    //    primary, with the expected supplier selected.
  });

  test('removing all supplier rows and saving clears the product supplier', async ({ page }) => {
    // 1. Open Edit Product on a product with at least one existing mapping.
    // 2. Remove every row in the Suppliers tab.
    // 3. Save.
    // 4. Reopen — assert the Suppliers tab is empty (no error toast on save).
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -- product-supplier-mapping`
Expected: FAIL — tab/selectors don't exist yet if run before Tasks 3/5, or fixture data is missing.

(This task runs after Tasks 1–5 are committed, so in practice this is the first real run, not a true red-first step — the "write test, watch it fail once for a fixture/typo reason, then fix" cycle still applies for iterating on selectors.)

- [ ] **Step 3: Fill in the real assertions and selectors**

Replace the comment placeholders in Step 1's test bodies with concrete Playwright calls once the actual DOM is available to inspect (`page.getByRole('tab', { name: 'Suppliers' })`, `page.getByText('Add Supplier')`, etc.), following whatever selector conventions (data-testid vs role vs text) the sibling specs in `tests/e2e/` already use. If the second test's fixture product doesn't exist in `tests/e2e/setup/global-setup.ts`, add one there following that file's existing pattern for seeding a product row plus a `products.supplier_id` value, with zero rows in `supplier_product_mapping` for it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:e2e -- product-supplier-mapping`
Expected: PASS (all 3 cases)

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/product-supplier-mapping.spec.ts tests/e2e/setup/global-setup.ts
git commit -m "test(products): add E2E coverage for the Suppliers tab"
```
