# Selling Units — Add/Edit Product UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Conversion" and "Price Levels" tabs in both the Add Product and Edit Product forms with a single "Selling Units" tab backed by `product_selling_units` / `product_selling_unit_prices`, and delete the parent/child creation UI (Quick Add Child, Reassign Parent, Auto-create Child Unit) that the Plan 1 data migration made obsolete.

**Architecture:** Each form gets its own `tabs/selling-units-tab.tsx` (per this codebase's existing per-form duplication convention) driving a `react-hook-form` `useFieldArray` over a new `sellingUnits` schema field, with one price column per active price level held in a plain `Record<levelId, {price, minQuantity}>`. Row 1 is the locked base unit (`qty_base = 1`) and is the single source of truth for the product's scalar `price` / `cost` / `barcode` / `unit_of_measure` columns, which `addProduct` / `updateProduct` sync server-side so the ~100+ call sites reading `products.*` directly keep working unmodified. `updateProduct` delete-then-reinserts the selling-unit rows, preserving submitted row ids so `sale_items` / `inventory_batches` / `purchase_order_items` foreign keys survive an edit.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19 + `react-hook-form` 7 + `@hookform/resolvers`, Zod 3.25, raw `mysql2/promise` via `lib/mysql.ts` (`query` / `withTransaction`), plain Tailwind on native `<button>` elements (no shared Button component), Playwright E2E on port 3100 against `alon_pos_test`.

**Spec:** `docs/superpowers/specs/2026-09-24-selling-units-add-edit-product-ui-design.md`

## Global Constraints

- This plan modifies only the files listed in "Scope" in the spec — no changes to POS checkout, product search, Break Pack/Consolidate, the products-list page (beyond removing the dead Quick Add Child trigger), or `lib/family-sync.ts`.
- The old `products.parent_id`/`conversion_factor` columns and `conversion_factors`/`product_price_levels` tables are NOT dropped — only the Add/Edit Product UI's use of them is removed.
- A new selling-unit row's `qtyBase` starts empty — no default value (per the spec's explicit "no silent default" decision, this is a corrective for a real bug class this feature has already had at the database layer). The **base** row is the one exception: it is pinned to `1` and rendered as static text.
- Exactly one row must be `isBase: true`, and that row's `qtyBase` must equal `1` (client-side validation).
- Barcode uniqueness within the submitted array is validated client-side; global uniqueness is enforced by the existing DB `UNIQUE KEY unique_selling_unit_barcode` on `product_selling_units.barcode` (from migration 115 — do not re-add it).
- Two separate tab files (one per form), not a shared component — matches this codebase's existing convention for these two forms.
- `prices` is a plain object keyed by price-level id (`Record<levelId, {price, minQuantity}>`), not a nested field array.
- Buttons are plain `<button>` elements with the full inline Tailwind class string — this repo removed the shared `Button` component. Copy the exact class strings used below (lifted verbatim from `tabs/conversion-tab.tsx` / `tabs/price-levels-tab.tsx`).
- **One source of truth per value.** Every field the base selling-unit row owns — Barcode, Cost, price, Unit Name — is removed from wherever else it was editable (Basic Info's Barcode, Inventory's Cost, Inventory's "Base Unit of Measure" select), rather than mirrored into a second editable control. The one exception is the **service** branch of `inventory-tab.tsx`, which keeps its own Cost and Base Unit of Measure inputs: a service has no selling units to carry them.

---

### Task 1: Selling-units Zod shape in both product schemas

**Files:**
- Modify: `app/(app)/products/add-product/product-schema.ts:1-85` (whole file)
- Modify: `app/(app)/products/edit-product/product-schema.ts:1-40` (whole file)

**Interfaces:**
- Consumes: nothing new (pure `zod`).
- Produces: `sellingUnitSchema`, `sellingUnitsSuperRefine`, `SellingUnitValues`, and `productSchema` / `ProductFormValues` with a `sellingUnits` field, for `use-add-product-form.ts`, `use-edit-product-form.ts`, and both `tabs/selling-units-tab.tsx`.

- [ ] **Step 1: Replace `app/(app)/products/add-product/product-schema.ts` in full**

The code being replaced (current file, lines 1–85) is:

```ts
import { z } from 'zod';

/**
 * Fields shared by every product type.
 *
 * Note the field is `itemType`, not `productType` — `productType` is already
 * taken by the parent/child family selector in use-add-product-form.ts.
 */
const baseProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  brand: z.string().min(1, 'Brand is required'),
  sku: z.string().min(1, 'SKU is required'),
  barcode: z.string().optional(),
  department: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  additionalDescription: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
  price: z.coerce.number().positive('Price must be a positive number'),
  incomeAccount: z.string().optional(),
  expenseAccount: z.string().optional(),
  priceLevels: z.array(z.object({
    levelId: z.string().min(1, 'Price level is required'),
    price: z.number().min(0, 'Price cannot be negative'),
    minQuantity: z.number().min(0).optional(),
  })).optional(),
  vatStatus: z.string().default('YES (Subject to 12% VAT)'),
  availability: z.string().default('Available'),
  earnsPoints: z.boolean().default(true),
});

/** Stocked goods — the existing behaviour, unchanged. */
const standardProductSchema = baseProductSchema.extend({
  itemType: z.literal('standard'),
  supplier: z.string().optional(),
  warehouse: z.string().optional(),
  shelfLocationIds: z.array(z.string()).optional(),
  stock: z.coerce.number().int().nonnegative('Initial stock must be a non-negative integer'),
  reorderPoint: z.coerce.number().int().nonnegative().optional().default(0),
  cost: z.coerce.number().nonnegative('Cost must be non-negative').optional(),
  parentId: z.string().optional(),
  conversionFactor: z.coerce.number().positive('Conversion factor must be positive').optional(),
  conversionFactors: z.array(z.object({
    unit: z.string().min(1, 'Unit is required'),
    factor: z.coerce.number().positive('Factor must be positive'),
  })).optional(),
  isPerishable: z.boolean().optional(),
});

/**
 * Services — no stock, no batches, no family.
 *
 * `cost` is REQUIRED here even though it is optional for standard products:
 * standard products fall back to FIFO batch cost, services have no such
 * fallback, and a blank cost would write NULL to sale_items.cost_at_sale and
 * break profit reporting. Zero is allowed — a pure-margin service is valid,
 * the user just has to say so explicitly.
 *
 * Stock and family fields are pinned to constants rather than omitted so a
 * service with stock is unrepresentable even if the UI is bypassed.
 */
const serviceProductSchema = baseProductSchema.extend({
  itemType: z.literal('service'),
  cost: z.coerce.number().nonnegative('Cost is required for services (enter 0 if there is no input cost)'),
  stock: z.literal(0).default(0),
  reorderPoint: z.literal(0).default(0),
  supplier: z.undefined(),
  warehouse: z.undefined(),
  shelfLocationIds: z.undefined(),
  parentId: z.undefined(),
  conversionFactor: z.undefined(),
  conversionFactors: z.undefined(),
  isPerishable: z.undefined(),
});

export const productSchema = z.discriminatedUnion('itemType', [
  standardProductSchema,
  serviceProductSchema,
]);

export type ProductFormValues = z.infer<typeof productSchema>;
export type StandardProductValues = z.infer<typeof standardProductSchema>;
export type ServiceProductValues = z.infer<typeof serviceProductSchema>;
```

Write the file as:

```ts
import { z } from 'zod';

/**
 * One selling unit row. `prices` is keyed by price-level id — the price-level
 * list is fetched once and fixed for the lifetime of a form session, so a
 * keyed object is a better fit than a nested field array.
 *
 * `qtyBase` has NO default. A new non-base row starts empty and the user must
 * state how the unit relates to the base unit; a wrong-but-plausible default
 * silently accepted is exactly the bug class the Plan 1 data migration spent
 * its final review chasing down.
 */
export const sellingUnitSchema = z.object({
  id: z.string().optional(),
  unitName: z.string().min(1, 'Unit name is required'),
  qtyBase: z.coerce.number().positive('Qty must be positive'),
  barcode: z.string().min(1, 'Barcode is required'),
  cost: z.coerce.number().min(0).optional(),
  isBase: z.boolean(),
  prices: z.record(z.string(), z.object({
    price: z.coerce.number().min(0),
    minQuantity: z.number().min(0).optional(),
  })),
});

export type SellingUnitValues = z.infer<typeof sellingUnitSchema>;

/**
 * Structural rules the per-row schema cannot express. Shared verbatim with
 * edit-product/product-schema.ts (the two forms keep separate files by
 * convention, but this predicate has exactly one correct definition).
 *
 * Global barcode uniqueness is the DB's job — `product_selling_units` carries
 * UNIQUE KEY unique_selling_unit_barcode. The check here is a fast-feedback
 * layer over the submitted array only.
 */
export function sellingUnitsSuperRefine(
  units: SellingUnitValues[] | undefined,
  ctx: z.RefinementCtx,
): void {
  if (!units || units.length === 0) return;

  const baseIndexes = units
    .map((u, i) => (u.isBase ? i : -1))
    .filter((i) => i >= 0);

  if (baseIndexes.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sellingUnits'],
      message: 'One selling unit must be marked as the base unit.',
    });
  } else if (baseIndexes.length > 1) {
    for (const i of baseIndexes.slice(1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sellingUnits', i, 'isBase'],
        message: 'Only one selling unit can be the base unit.',
      });
    }
  } else if (Number(units[baseIndexes[0]].qtyBase) !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sellingUnits', baseIndexes[0], 'qtyBase'],
      message: 'The base unit must equal 1 base unit.',
    });
  }

  const seen = new Map<string, number>();
  units.forEach((u, i) => {
    const key = (u.barcode || '').trim();
    if (!key) return;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sellingUnits', i, 'barcode'],
        message: 'Barcode already used by another selling unit of this product.',
      });
    } else {
      seen.set(key, i);
    }
  });
}

/**
 * Fields shared by every product type.
 *
 * Note the field is `itemType`. The old `productType` parent/child family
 * selector is gone — selling units replaced it.
 *
 * `barcode`, `price`, `cost` and `unitOfMeasure` are NOT inputs on the standard
 * branch any more: the base selling-unit row owns all four. They stay on the
 * schema because they are still what gets sent to the server action (mirrored
 * from the base row on submit) and what the service branch edits directly.
 */
const baseProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  brand: z.string().min(1, 'Brand is required'),
  sku: z.string().min(1, 'SKU is required'),
  barcode: z.string().optional(),
  department: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  additionalDescription: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  unitOfMeasure: z.string().default(''),
  price: z.coerce.number().min(0).default(0),
  incomeAccount: z.string().optional(),
  expenseAccount: z.string().optional(),
  vatStatus: z.string().default('YES (Subject to 12% VAT)'),
  availability: z.string().default('Available'),
  earnsPoints: z.boolean().default(true),
});

/** Stocked goods — one or more selling units, the first of which is the base. */
const standardProductSchema = baseProductSchema.extend({
  itemType: z.literal('standard'),
  supplier: z.string().optional(),
  warehouse: z.string().optional(),
  shelfLocationIds: z.array(z.string()).optional(),
  stock: z.coerce.number().int().nonnegative('Initial stock must be a non-negative integer'),
  reorderPoint: z.coerce.number().int().nonnegative().optional().default(0),
  cost: z.coerce.number().nonnegative('Cost must be non-negative').optional(),
  sellingUnits: z.array(sellingUnitSchema)
    .min(1, 'At least one selling unit (the base unit) is required'),
  isPerishable: z.boolean().optional(),
});

/**
 * Services — no stock, no batches, no selling units.
 *
 * `cost` is REQUIRED here even though it is optional for standard products:
 * standard products fall back to FIFO batch cost, services have no such
 * fallback, and a blank cost would write NULL to sale_items.cost_at_sale and
 * break profit reporting. Zero is allowed — a pure-margin service is valid,
 * the user just has to say so explicitly.
 *
 * `price` and `unitOfMeasure` are tightened back up here for the same reason:
 * a service has no base selling-unit row to derive them from, so its own
 * Inventory-tab inputs are the only source and must be filled in.
 *
 * Stock and selling-unit fields are pinned to constants rather than omitted so
 * a service with stock (or with sellable units) is unrepresentable even if the
 * UI is bypassed.
 */
const serviceProductSchema = baseProductSchema.extend({
  itemType: z.literal('service'),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
  price: z.coerce.number().positive('Price must be a positive number'),
  cost: z.coerce.number().nonnegative('Cost is required for services (enter 0 if there is no input cost)'),
  stock: z.literal(0).default(0),
  reorderPoint: z.literal(0).default(0),
  supplier: z.undefined(),
  warehouse: z.undefined(),
  shelfLocationIds: z.undefined(),
  sellingUnits: z.undefined(),
  isPerishable: z.undefined(),
});

export const productSchema = z
  .discriminatedUnion('itemType', [standardProductSchema, serviceProductSchema])
  .superRefine((values, ctx) => {
    if (values.itemType !== 'standard') return;
    sellingUnitsSuperRefine(values.sellingUnits, ctx);
  });

export type ProductFormValues = z.infer<typeof productSchema>;
export type StandardProductValues = z.infer<typeof standardProductSchema>;
export type ServiceProductValues = z.infer<typeof serviceProductSchema>;
```

- [ ] **Step 2: Replace `app/(app)/products/edit-product/product-schema.ts` in full**

The code being replaced (current file, lines 1–40) is:

```ts
import { z } from 'zod';

export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  brand: z.string().min(1, 'Brand is required'),
  department: z.string().optional(),
  sku: z.string().min(1, 'SKU is required'),
  barcode: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  additionalDescription: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  subcategory: z.string().optional(),
  supplier: z.string().optional(),
  warehouse: z.string().optional(),
  shelfLocationIds: z.array(z.string()).optional(),
  isSerialized: z.boolean().default(false),
  unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
  reorderPoint: z.coerce.number().int().nonnegative().optional().default(0),
  price: z.coerce.number().positive("Price must be a positive number"),
  cost: z.coerce.number().nonnegative("Cost must be non-negative").optional(),
  incomeAccount: z.string().optional(),
  expenseAccount: z.string().optional(),
  conversionFactor: z.coerce.number().positive('Conversion factor must be positive').optional(),
  conversionFactors: z.array(z.object({
    unit: z.string(),
    factor: z.coerce.number().positive('Conversion factor must be positive'),
  })).transform(arr => arr.filter(cf => cf.unit.trim() !== '')),
  priceLevels: z.array(z.object({
    levelId: z.string().min(1, 'Level is required'),
    price: z.coerce.number().positive('Price must be positive'),
    minQuantity: z.number().min(0).optional(),
  })).optional(),
  vatStatus: z.string().default('YES (Subject to 12% VAT)'),
  availability: z.string().default('Available'),
  earnsPoints: z.boolean().default(true),
  isPerishable: z.boolean().optional(),
});

export type ProductFormValues = z.infer<typeof productSchema>;
```

Write the file as:

```ts
import { z } from 'zod';
import {
  sellingUnitSchema,
  sellingUnitsSuperRefine,
  type SellingUnitValues,
} from '../add-product/product-schema';

export { sellingUnitSchema, sellingUnitsSuperRefine };
export type { SellingUnitValues };

/**
 * Edit Product has no `itemType` discriminator — the product's type is
 * immutable after creation and comes in on the `product` prop, not the form.
 * So `sellingUnits` is optional here and the hook simply omits it for a
 * service (whose tab is hidden). `updateProduct` only rewrites the selling-unit
 * tables when the field is present, so a service edit never touches them.
 *
 * `unitOfMeasure` keeps its `.min(1)` here (unlike the Add form, which relaxes
 * it): an Edit form's values are seeded from an existing product, so the field
 * is always already populated, and a service still edits it directly on the
 * Inventory tab. For a standard product the base row's Unit Name overwrites it
 * on submit.
 */
export const productSchema = z
  .object({
    name: z.string().min(1, 'Product name is required'),
    brand: z.string().min(1, 'Brand is required'),
    department: z.string().optional(),
    sku: z.string().min(1, 'SKU is required'),
    // Mirrored from the base selling unit's barcode on submit — not an input.
    barcode: z.string().optional(),
    description: z.string().min(1, 'Description is required'),
    additionalDescription: z.string().optional(),
    category: z.string().min(1, 'Category is required'),
    subcategory: z.string().optional(),
    supplier: z.string().optional(),
    warehouse: z.string().optional(),
    shelfLocationIds: z.array(z.string()).optional(),
    isSerialized: z.boolean().default(false),
    unitOfMeasure: z.string().min(1, 'Unit of measure is required'),
    reorderPoint: z.coerce.number().int().nonnegative().optional().default(0),
    // Mirrored from the base selling unit's default-level price on submit for a
    // standard product; a service keeps its own markup-derived price.
    price: z.coerce.number().min(0).default(0),
    // Mirrored from the base selling unit's cost for a standard product.
    cost: z.coerce.number().nonnegative('Cost must be non-negative').optional(),
    incomeAccount: z.string().optional(),
    expenseAccount: z.string().optional(),
    sellingUnits: z.array(sellingUnitSchema).min(1, 'At least one selling unit (the base unit) is required').optional(),
    vatStatus: z.string().default('YES (Subject to 12% VAT)'),
    availability: z.string().default('Available'),
    earnsPoints: z.boolean().default(true),
    isPerishable: z.boolean().optional(),
  })
  .superRefine((values, ctx) => {
    sellingUnitsSuperRefine(values.sellingUnits, ctx);
  });

export type ProductFormValues = z.infer<typeof productSchema>;
```

- [ ] **Step 3: Run the type checker to confirm the schema compiles standalone**
Run: `npx tsc --noEmit`
Expected: the only remaining errors reference `conversionFactors` / `priceLevels` / `parentId` / `conversionFactor` / `productType` in `use-add-product-form.ts`, `use-edit-product-form.ts`, `tabs/conversion-tab.tsx`, `tabs/price-levels-tab.tsx`, `tabs/inventory-tab.tsx` and `actions.ts`. Those are fixed by Tasks 2–4. No error should point at either `product-schema.ts`.

- [ ] **Step 4: Commit**
```bash
git add "app/(app)/products/add-product/product-schema.ts" "app/(app)/products/edit-product/product-schema.ts"
git commit -m "feat(products): add sellingUnits schema shape to both product forms

Replaces the parentId/conversionFactor/conversionFactors/priceLevels fields in
the Add and Edit Product schemas with a single sellingUnits array, plus the
shared superRefine enforcing exactly-one base row at qtyBase 1 and barcodes
unique within the submitted array.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Add Product — hook, Selling Units tab, and tab-list wiring

**Files:**
- Modify: `app/(app)/products/add-product/use-add-product-form.ts:1-599` (multiple blocks)
- Create: `app/(app)/products/add-product/tabs/selling-units-tab.tsx`
- Delete: `app/(app)/products/add-product/tabs/conversion-tab.tsx`
- Delete: `app/(app)/products/add-product/tabs/price-levels-tab.tsx`
- Modify: `app/(app)/products/add-product/add-product-dialog.tsx:18-147`
- Modify: `app/(app)/products/add-product/tabs/basic-info-tab.tsx:13-126`
- Modify: `app/(app)/products/add-product/tabs/inventory-tab.tsx:20-470`

**Interfaces:**
- Consumes: `productSchema` / `ProductFormValues` / `SellingUnitValues` from Task 1; `applyPriceLevelAdjustment` from `@/lib/price-level-calc`; `priceLevels` (already loaded into the hook from `productOptions.priceLevels`).
- Produces: `sellingUnitFields`, `appendSellingUnit`, `addSellingUnit`, `removeSellingUnit`, `baseUnitIndex`, `baseUnitName`, `generateUnitBarcode(index)`, `tabErrors.sellingUnits` on `AddProductFormController`; `<SellingUnitsTab />`.

- [ ] **Step 1: Replace the state block in `use-add-product-form.ts:74-81`**

Current:

```ts
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productType, setProductType] = useState<'parent' | 'child'>('parent');
  // Standard vs Service. Distinct from `productType` above, which is the
  // parent/child family selector.
  const [itemType, setItemType] = useState<ProductType>('standard');
  const [autoCreateChild, setAutoCreateChild] = useState(true);
  const { toast } = useToast();
```

New:

```ts
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Standard vs Service. The old parent/child `productType` selector is gone —
  // a product's units now live in its `sellingUnits` array, not in sibling rows.
  const [itemType, setItemType] = useState<ProductType>('standard');
  const { toast } = useToast();
```

- [ ] **Step 2: Replace the `defaultValues` tail in `use-add-product-form.ts:147-155`**

Current:

```ts
      sku: '',
      barcode: '',
      conversionFactor: 1,
      conversionFactors: [],
      priceLevels: [],
      earnsPoints: true,
      isPerishable: false,
    },
  });
```

New:

```ts
      sku: '',
      barcode: '',
      sellingUnits: [
        { unitName: '', qtyBase: 1, barcode: '', cost: undefined, isBase: true, prices: {} },
      ],
      earnsPoints: true,
      isPerishable: false,
    },
  });
```

- [ ] **Step 3: Replace the two `useFieldArray` calls at `use-add-product-form.ts:157-165`**

Current:

```ts
  const { fields: conversionFactorFields, append: appendConversionFactor, remove: removeConversionFactor } = useFieldArray({
    control: form.control,
    name: "conversionFactors",
  });

  const { fields: priceLevelFields, append: appendPriceLevel, remove: removePriceLevel } = useFieldArray({
    control: form.control,
    name: "priceLevels",
  });
```

New:

```ts
  const { fields: sellingUnitFields, append: appendSellingUnit, remove: removeSellingUnit } = useFieldArray({
    control: form.control as any,
    name: 'sellingUnits',
  });

  const watchedSellingUnits = form.watch('sellingUnits' as any) as SellingUnitValues[] | undefined;
  const baseUnitIndex = Math.max(0, (watchedSellingUnits ?? []).findIndex((u) => u?.isBase));
  const baseUnitName = (watchedSellingUnits ?? [])[baseUnitIndex]?.unitName || '';

  /** Appends a blank non-base row. qtyBase is deliberately left empty. */
  const addSellingUnit = () =>
    appendSellingUnit({
      unitName: '',
      qtyBase: undefined as unknown as number,
      barcode: '',
      cost: undefined,
      isBase: false,
      prices: {},
    } as any);

  /** EAN-8: 7 random digits + 1 check digit. */
  const generateUnitBarcode = (index: number) => {
    const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
    const check = (10 - (sum % 10)) % 10;
    form.setValue(`sellingUnits.${index}.barcode` as any, [...digits, check].join(''), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
```

- [ ] **Step 4: Replace the watch + `tabErrors` block at `use-add-product-form.ts:167-175`**

`selectedUnitOfMeasure` existed only to feed the deleted Conversion tab's "exclude the base unit" filter. With the Inventory tab's Base Unit of Measure select also gone for a standard product (Step 15), nothing reads it — it goes rather than sitting unused.

Current:

```ts
  const selectedUnitOfMeasure = form.watch('unitOfMeasure');
  const watchedPrice = form.watch('price');
  const formErrors = form.formState.errors;
  const tabErrors = {
    basic: !!(formErrors.name || formErrors.brand || formErrors.sku || formErrors.description || formErrors.category),
    inventory: !!(formErrors.unitOfMeasure || formErrors.stock),
    priceLevels: !!(formErrors.priceLevels),
    conversion: !!(formErrors.conversionFactors),
  };
```

New:

```ts
  const watchedPrice = form.watch('price');
  const formErrors = form.formState.errors as any;
  const tabErrors = {
    basic: !!(formErrors.name || formErrors.brand || formErrors.sku || formErrors.description || formErrors.category),
    // unitOfMeasure can still error here — a Service edits it on this tab.
    inventory: !!(formErrors.unitOfMeasure || formErrors.stock),
    sellingUnits: !!formErrors.sellingUnits,
  };
```

- [ ] **Step 5: Replace the default-price-level seeding block at `use-add-product-form.ts:191-207`**

Current:

```ts
      setPriceLevels(externalProductOptions.priceLevels || []);
      setTaxRates(externalProductOptions.taxRates || []);

      // Initialize default price level if form is empty
      const systemPriceLevels = externalProductOptions.priceLevels || [];
      const currentPriceLevels = form.getValues('priceLevels') || [];

      if (currentPriceLevels.length === 0 && systemPriceLevels.length > 0) {
          // Find default level or take first
          const defaultLevel = systemPriceLevels.find((l:any) => l.isDefault) || systemPriceLevels[0];
          if (defaultLevel) {
              appendPriceLevel({ levelId: defaultLevel.id, price: 0 });
          }
      }

    }
  }, [externalProductOptions, form, appendPriceLevel]); // Added appendPriceLevel dep
```

New (the price-level columns are now driven straight off `priceLevels`, so nothing has to be appended into form state):

```ts
      setPriceLevels(externalProductOptions.priceLevels || []);
      setTaxRates(externalProductOptions.taxRates || []);
    }
  }, [externalProductOptions]);
```

- [ ] **Step 6: Replace the reset / productType / itemType effects at `use-add-product-form.ts:209-262`**

Current:

```ts
  useEffect(() => {
    if (isOpen) {
      form.reset();

      // Set default tax rate if available and valid
      if (taxRates.length > 0) {
        const defaultTax = taxRates.find(t => t.isDefault) || taxRates[0];
        form.setValue('vatStatus', defaultTax.name);
      }

      setProductType('parent');
      setAutoCreateChild(true);
    }
  }, [isOpen, form]);

  useEffect(() => {
    if (productType === 'parent') {
      form.setValue('conversionFactor', 1);
      form.setValue('parentId', undefined);
    }
  }, [productType, form]);

  useEffect(() => {
    if (productType === 'child') {
      // For child products, conversion factor should be manually entered by user
      // The previous auto-setting based on unit of measure is no longer valid
      // since conversion factors are now managed separately
    }
  }, [productType]);

  // Switching to Service clears every stock-side field. Without this, values
  // typed while Standard was selected stay in form state and fail the service
  // branch's z.undefined() checks on submit, with no visible field to fix.
  useEffect(() => {
    // Must run for BOTH branches: this is the only place that writes the
    // discriminator into react-hook-form state. `itemType` otherwise lives
    // only in React state, so the zod resolver would always see 'standard'
    // and serviceProductSchema (and its required-cost rule) would never run.
    form.setValue('itemType', itemType);

    if (itemType === 'service') {
      form.setValue('stock', 0);
      form.setValue('reorderPoint', 0);
      form.setValue('cost', 0);
      form.setValue('department', undefined);
      form.setValue('supplier', undefined);
      form.setValue('warehouse', undefined);
      form.setValue('shelfLocationIds', undefined);
      form.setValue('parentId', undefined);
      form.setValue('conversionFactor', undefined);
      form.setValue('conversionFactors', undefined);
      form.setValue('isPerishable', undefined);
    }
  }, [itemType, form]);
```

New — the two `productType` effects go entirely, and nothing mirrors `unitOfMeasure` into the base row: the base row's Unit Name is the only place that value is typed for a standard product, and `onSubmit` copies it out (Step 8):

```ts
  useEffect(() => {
    if (isOpen) {
      form.reset();

      // Set default tax rate if available and valid
      if (taxRates.length > 0) {
        const defaultTax = taxRates.find(t => t.isDefault) || taxRates[0];
        form.setValue('vatStatus', defaultTax.name);
      }
    }
  }, [isOpen, form]);

  // Switching to Service clears every stock-side field. Without this, values
  // typed while Standard was selected stay in form state and fail the service
  // branch's z.undefined() checks on submit, with no visible field to fix.
  useEffect(() => {
    // Must run for BOTH branches: this is the only place that writes the
    // discriminator into react-hook-form state. `itemType` otherwise lives
    // only in React state, so the zod resolver would always see 'standard'
    // and serviceProductSchema (and its required-cost rule) would never run.
    form.setValue('itemType', itemType);

    if (itemType === 'service') {
      form.setValue('stock', 0);
      form.setValue('reorderPoint', 0);
      form.setValue('cost', 0);
      form.setValue('department', undefined);
      form.setValue('supplier', undefined);
      form.setValue('warehouse', undefined);
      form.setValue('shelfLocationIds', undefined);
      form.setValue('sellingUnits' as any, undefined);
      form.setValue('isPerishable', undefined);
    } else {
      // Switching back from Service: the array above was cleared, so restore a
      // blank base row or the Selling Units tab renders with nothing in it.
      const current = form.getValues('sellingUnits' as any) as SellingUnitValues[] | undefined;
      if (!current || current.length === 0) {
        form.setValue('sellingUnits' as any, [
          { unitName: '', qtyBase: 1, barcode: '', cost: undefined, isBase: true, prices: {} },
        ]);
      }
      // A Service run may have written unitOfMeasure via its own select; a
      // standard product takes it from the base row on submit, so clear it.
      form.setValue('unitOfMeasure', '');
    }
  }, [itemType, form]);
```

- [ ] **Step 7: Replace the price-level auto-fill effect tail at `use-add-product-form.ts:369-395`**

Current:

```ts
          // ALSO update all price level fields automatically
          if (priceLevelFields.length > 0) {
            priceLevelFields.forEach((field, index) => {
              const levelDef = priceLevels.find((l: any) => l.id === field.levelId);
              if (levelDef) {
                // Calculate price for each level
                let levelPrice;
                const levelMarkup = levelDef.percentageAdjustment ?? 0;

                if (levelDef.calculationBase === 'cost') {
                    levelPrice = parseFloat((cost * (1 + levelMarkup / 100)).toFixed(2));
                } else {
                    // Retail Base
                    if (levelMarkup === 0 && levelDef.name?.toLowerCase() === 'retail') {
                        levelPrice = parseFloat(basePrice.toFixed(2));
                    } else {
                        levelPrice = parseFloat((basePrice * (1 + levelMarkup / 100)).toFixed(2));
                    }
                }
                form.setValue(`priceLevels.${index}.price`, levelPrice);
              }
            });
          }
        }
      }
    }
  }, [selectedPriceLevelId, priceLevels, priceLevelFields, form, categories, subcategories, brands, systemSettings]);
```

New:

```ts
          // ALSO fill every price-level column on the BASE selling unit row.
          // Non-base rows are left alone — their price is a per-unit decision,
          // not a derived multiple, and overwriting a typed value would be the
          // same silent-default failure mode the qtyBase rule guards against.
          const units = (form.getValues('sellingUnits' as any) as SellingUnitValues[] | undefined) ?? [];
          const idx = Math.max(0, units.findIndex((u) => u?.isBase));
          priceLevels.forEach((levelDef: any) => {
            let levelPrice: number;
            const levelMarkup = levelDef.percentageAdjustment ?? 0;

            if (levelDef.calculationBase === 'cost') {
              levelPrice = parseFloat((cost * (1 + levelMarkup / 100)).toFixed(2));
            } else {
              // Retail Base
              if (levelMarkup === 0 && levelDef.name?.toLowerCase() === 'retail') {
                levelPrice = parseFloat(basePrice.toFixed(2));
              } else {
                levelPrice = parseFloat((basePrice * (1 + levelMarkup / 100)).toFixed(2));
              }
            }
            form.setValue(`sellingUnits.${idx}.prices.${levelDef.id}.price` as any, levelPrice);
          });
        }
      }
    }
  }, [selectedPriceLevelId, priceLevels, form, categories, subcategories, brands, systemSettings]);
```

- [ ] **Step 8: Replace the whole `onSubmit` body at `use-add-product-form.ts:397-522`**

The code being removed — the price-level placeholder fix-up and the entire auto-child intent:

```ts
      values.priceLevels = (values.priceLevels || []).map((pl) => {
        if (pl.price !== 0) return pl;
        const level = priceLevels.find((l: any) => l.id === pl.levelId);
        if (!level) return pl;
        const basePrice = (level.calculationBase || 'retail') === 'cost' ? (values.cost || 0) : values.price;
        return { ...pl, price: applyPriceLevelAdjustment(level.adjustmentType, level.percentageAdjustment, basePrice) };
      });

      // Build the auto-child intent (if applicable) so a single approval covers parent + child.
      let childProduct: any = undefined;
      const willAutoChild =
        itemType === 'standard' &&
        productType === 'parent' &&
        autoCreateChild &&
        values.conversionFactors &&
        values.conversionFactors.length > 0;

      if (willAutoChild) {
        const firstConversion = values.conversionFactors![0];
        const childPrice = values.price / firstConversion.factor;
        const childCost = values.cost ? values.cost / firstConversion.factor : undefined;
        childProduct = {
          name: `${values.name} (${firstConversion.unit})`,
          brand: values.brand,
          sku: `${values.sku}-${firstConversion.unit.toLowerCase().replace(/\s+/g, '')}`,
          barcode: values.barcode ? `${values.barcode}-${firstConversion.unit.toLowerCase()}` : undefined,
          description: `${values.description} - ${firstConversion.unit}`,
          additionalDescription: values.additionalDescription,
          category: values.category,
          subcategory: values.subcategory,
          supplier: values.supplier,
          unitOfMeasure: firstConversion.unit,
          stock: 0,
          reorderPoint: 0,
          price: childPrice,
          cost: childCost,
          conversionFactor: firstConversion.factor,
          image: `https://picsum.photos/seed/${values.sku}-${firstConversion.unit}/400/300`,
        };
      }

      const result = await addProduct(
        {
          ...values,
          itemType,
          image: `https://picsum.photos/seed/${values.sku}/400/300`,
          ...(childProduct ? { __childProduct: childProduct } : {}),
        } as any,
        uid,
      );
```

…and further down:

```ts
      } else if (result.success) {
        // Immediate insert path — create child directly if approval is off.
        if (willAutoChild && result.productId) {
          const childResult = await addProduct(
            { ...childProduct, parentId: result.productId } as any,
            uid,
          );
          if (!childResult.success) {
            console.warn('Failed to auto-create child product:', childResult.message);
          }
        }
```

Write the whole function as:

```ts
  async function onSubmit(values: ProductFormValues) {
    setIsSubmitting(true);

    try {
      const uid = getCurrentUid();

      // The base selling unit is the single source of truth for the product's
      // scalar price/cost/barcode/unit_of_measure columns. Mirror them here so
      // the ~100+ call sites that read products.* directly keep working;
      // addProduct re-derives the same values server-side as the
      // authoritative pass.
      const units = (values as any).sellingUnits as SellingUnitValues[] | undefined;
      const baseUnit = units?.find((u) => u.isBase) ?? units?.[0];
      const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];

      let mirroredPrice = values.price;
      if (baseUnit && defaultLevel) {
        const entered = Number(baseUnit.prices?.[defaultLevel.id]?.price ?? NaN);
        if (Number.isFinite(entered) && entered > 0) {
          mirroredPrice = entered;
        } else {
          // No explicit default-level price typed — fall back to the level's
          // own adjustment applied to the row's cost/price basis, the same
          // rule the old Price Levels tab used when a level was picked.
          const basis = (defaultLevel.calculationBase || 'retail') === 'cost'
            ? Number(baseUnit.cost ?? values.cost ?? 0)
            : Number(values.price ?? 0);
          mirroredPrice = applyPriceLevelAdjustment(
            defaultLevel.adjustmentType,
            defaultLevel.percentageAdjustment,
            basis,
          );
        }
      }

      const result = await addProduct(
        {
          ...values,
          itemType,
          price: mirroredPrice,
          cost: baseUnit?.cost ?? values.cost,
          barcode: baseUnit?.barcode ?? values.barcode,
          unitOfMeasure: baseUnit?.unitName || values.unitOfMeasure,
          image: `https://picsum.photos/seed/${values.sku}/400/300`,
        } as any,
        uid,
      );

      if (result.success && (result as any).pendingApproval) {
        toast({
          title: 'Submitted for Approval',
          description: `${values.name} was submitted and is awaiting approval.`,
        });
        form.reset();
        onProductAdded?.();
        setIsOpen(false);
      } else if (result.success) {
        // Fire and forget - don't block form submission on activity logging
        logActivity({
          action: 'CREATE',
          module: 'PRODUCTS',
          description: `Added product: ${values.name} (SKU: ${values.sku}) — Category: ${values.category || 'N/A'}`,
          referenceId: result.productId,
        }).catch(() => {
          // Silently ignore activity logging errors
        });
        toast({
          title: 'Product Added',
          description: `${values.name} has been successfully added.`,
        });
        form.reset();
        onProductAdded?.();
        dispatchStockUpdate();
        setIsOpen(false);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.message,
        });
      }
    } catch (error) {
      console.error('Error adding product:', error);
      toast({
        variant: 'destructive',
        title: 'Uh oh! Something went wrong.',
        description: 'There was a problem adding the product. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }
```

- [ ] **Step 9: Delete `generateBarcode` at `use-add-product-form.ts:531-537`**

Delete this function outright — the standalone Barcode field it wrote to is gone, and `generateUnitBarcode(index)` from Step 3 replaces it:

```ts
  const generateBarcode = () => {
    // EAN-8: 7 random digits + 1 check digit
    const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
    const check = (10 - (sum % 10)) % 10;
    form.setValue('barcode', [...digits, check].join(''));
  };
```

- [ ] **Step 10: Update the returned controller object at `use-add-product-form.ts:549-596` and the import at line 27**

Three regions of the return object change. Current:

```ts
    isOpen, setIsOpen,
    isSubmitting,
    productType, setProductType,
    itemType, setItemType,
    autoCreateChild, setAutoCreateChild,
    form,
```

New:

```ts
    isOpen, setIsOpen,
    isSubmitting,
    itemType, setItemType,
    form,
```

Current:

```ts
    // field arrays
    conversionFactorFields, appendConversionFactor, removeConversionFactor,
    priceLevelFields, appendPriceLevel, removePriceLevel,

    // derived values
    selectedUnitOfMeasure,
    tabErrors,
```

New:

```ts
    // field arrays
    sellingUnitFields, appendSellingUnit, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,

    // derived values
    tabErrors,
```

Current:

```ts
    onSubmit,
    generateSku,
    generateBarcode,
```

New:

```ts
    onSubmit,
    generateSku,
    generateUnitBarcode,
```

Finally the import on line 27. Current:

```ts
import { productSchema, type ProductFormValues } from './product-schema';
```

New:

```ts
import { productSchema, type ProductFormValues, type SellingUnitValues } from './product-schema';
```

- [ ] **Step 11: Create `app/(app)/products/add-product/tabs/selling-units-tab.tsx`**

```tsx
'use client';

import { PlusCircle, Wand2, X } from 'lucide-react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { useAddProductFormContext } from '../add-product-form-context';
import { calculatePriceLevelPrice } from '../use-add-product-form';

export function SellingUnitsTab() {
  const {
    form,
    itemType,
    priceLevels, isLoadingPriceLevels,
    sellingUnitFields, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,
    generateUnitBarcode,
  } = useAddProductFormContext();

  // Services have no sellable units — the tab is not rendered for them.
  if (itemType === 'service') return null;

  /**
   * Fills every price-level column of one row from that row's own cost and the
   * base row's retail price, using the same adjustment rule the old Price
   * Levels tab applied when a level was picked. A non-base row scales by its
   * qtyBase: one Box of 12 is priced off 12 Pieces of retail.
   */
  const autoPriceRow = (index: number) => {
    const units: any[] = form.getValues('sellingUnits' as any) || [];
    const row = units[index];
    if (!row) return;

    const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];
    const baseRetail = defaultLevel
      ? Number(units[baseUnitIndex]?.prices?.[defaultLevel.id]?.price ?? 0)
      : 0;
    const qty = row.isBase ? 1 : Number(row.qtyBase) || 0;
    if (!qty) return;

    const rowRetail = row.isBase ? baseRetail : baseRetail * qty;
    const rowCost = Number(row.cost ?? units[baseUnitIndex]?.cost ?? 0) * (row.isBase ? 1 : qty);

    priceLevels.forEach((level: any) => {
      const value = calculatePriceLevelPrice(
        level.id,
        level.calculationBase || 'retail',
        priceLevels,
        rowRetail,
        rowCost,
      );
      form.setValue(
        `sellingUnits.${index}.prices.${level.id}.price` as any,
        parseFloat(value.toFixed(2)),
        { shouldDirty: true },
      );
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium leading-none">Selling Units</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Every way this product is sold. The first row is the base unit; every other
              row says how many base units it contains (e.g. 1 Box = 12 Pieces).
            </p>
          </div>
          <button
            type="button"
            onClick={addSellingUnit}
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Selling Unit
          </button>
        </div>

        {/* Column header — the price-level columns are rendered once here. */}
        <div className="hidden md:flex items-end gap-3 px-3 pb-2 text-xs font-medium text-muted-foreground">
          <div className="flex-1 min-w-[140px]">Unit Name</div>
          <div className="w-[120px]">Qty Base</div>
          <div className="w-[170px]">Barcode</div>
          <div className="w-[110px]">Cost (₱)</div>
          {isLoadingPriceLevels ? (
            <div className="w-[110px]">Loading…</div>
          ) : (
            priceLevels.map((level: any) => (
              <div key={level.id} className="w-[110px] truncate" title={level.name}>
                {level.name} (₱)
              </div>
            ))
          )}
          <div className="w-[72px]" />
        </div>

        <div className="space-y-3">
          {sellingUnitFields.map((field, index) => {
            const isBaseRow = index === baseUnitIndex;
            return (
              <div
                key={field.id}
                className="flex flex-wrap md:flex-nowrap items-end gap-3 p-3 bg-card border rounded-md shadow-sm overflow-x-auto"
              >
                <div className="flex-1 min-w-[140px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.unitName` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Unit Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={isBaseRow ? 'e.g., Piece' : 'e.g., Box'}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        {isBaseRow && (
                          <FormDescription className="text-xs">
                            Base unit — this is the product&apos;s unit of measure.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="w-[120px]">
                  {isBaseRow ? (
                    <div className="space-y-2">
                      <span className="text-xs font-medium md:sr-only block">Qty Base</span>
                      <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-semibold">
                        1
                      </div>
                    </div>
                  ) : (
                    <FormField
                      control={form.control}
                      name={`sellingUnits.${index}.qtyBase` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs md:sr-only">Equals how many base units?</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.000001"
                              placeholder="Qty"
                              value={field.value ?? ''}
                              onChange={(e) =>
                                field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            How many {baseUnitName || 'base units'} is one of this unit?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="w-[170px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.barcode` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Barcode</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              placeholder="e.g., 12345670"
                              {...field}
                              value={field.value ?? ''}
                              className="pr-10"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                              }}
                            />
                          </FormControl>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                            onClick={() => generateUnitBarcode(index)}
                          >
                            <Wand2 className="h-4 w-4" />
                            <span className="sr-only">Generate Barcode</span>
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="w-[110px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.cost` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Cost (₱)</FormLabel>
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
                </div>

                {priceLevels.map((level: any) => (
                  <div key={level.id} className="w-[110px]">
                    <FormField
                      control={form.control}
                      name={`sellingUnits.${index}.prices.${level.id}.price` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs md:sr-only">{level.name} (₱)</FormLabel>
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
                  </div>
                ))}

                <div className="flex w-[72px] items-center gap-1 self-center pb-1">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground"
                    onClick={() => autoPriceRow(index)}
                  >
                    <Wand2 className="h-4 w-4" />
                    <span className="sr-only">Auto-fill prices for this unit</span>
                  </button>
                  {!isBaseRow && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                      onClick={() => removeSellingUnit(index)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove selling unit</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Delete the two replaced tab files**
```bash
git rm "app/(app)/products/add-product/tabs/conversion-tab.tsx" "app/(app)/products/add-product/tabs/price-levels-tab.tsx"
```

- [ ] **Step 13: Update `add-product-dialog.tsx` imports (lines 18-22) and the tab list/content (lines 107-146)**

Current imports:

```tsx
import { BasicInfoTab } from './tabs/basic-info-tab';
import { InventoryTab } from './tabs/inventory-tab';
import { ConversionTab } from './tabs/conversion-tab';
import { PriceLevelsTab } from './tabs/price-levels-tab';
import { LoyaltyTab } from './tabs/loyalty-tab';
```

New:

```tsx
import { BasicInfoTab } from './tabs/basic-info-tab';
import { InventoryTab } from './tabs/inventory-tab';
import { SellingUnitsTab } from './tabs/selling-units-tab';
import { LoyaltyTab } from './tabs/loyalty-tab';
```

Current tab triggers (lines 107-122):

```tsx
                      <TabsTrigger
                        value="price-levels"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
                      >
                        Price Levels
                        {tabErrors.priceLevels && <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-destructive" />}
                      </TabsTrigger>
                      {itemType === 'standard' && (
                        <TabsTrigger
                          value="conversion"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
                        >
                          Conversion
                          {tabErrors.conversion && <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-destructive" />}
                        </TabsTrigger>
                      )}
```

New:

```tsx
                      {itemType === 'standard' && (
                        <TabsTrigger
                          value="selling-units"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
                        >
                          Selling Units
                          {tabErrors.sellingUnits && <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-destructive" />}
                        </TabsTrigger>
                      )}
```

Current tab contents (lines 136-143):

```tsx
                    {itemType === 'standard' && (
                      <TabsContent value="conversion" className="space-y-4 p-6">
                        <ConversionTab />
                      </TabsContent>
                    )}
                    <TabsContent value="price-levels" className="space-y-4 p-6">
                      <PriceLevelsTab />
                    </TabsContent>
```

New:

```tsx
                    {itemType === 'standard' && (
                      <TabsContent value="selling-units" className="space-y-4 p-6">
                        <SellingUnitsTab />
                      </TabsContent>
                    )}
```

- [ ] **Step 14: Remove the standalone Barcode field from `add-product/tabs/basic-info-tab.tsx`**

In the destructure at lines 14-25, change the last two entries from:

```tsx
    generateSku,
    generateBarcode,
  } = useAddProductFormContext();
```

to:

```tsx
    generateSku,
  } = useAddProductFormContext();
```

Delete this whole `FormField` block (lines 104-126):

```tsx
      <FormField
        control={form.control}
        name="barcode"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Barcode (EAN-8)</FormLabel>
            <div className="relative">
              <FormControl>
                <Input placeholder="e.g., 123456789012" {...field} className="pr-10" />
              </FormControl>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                onClick={generateBarcode}
              >
                <Wand2 className="h-4 w-4" />
                <span className="sr-only">Generate Barcode</span>
              </button>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
```

Change the comment on line 80 from `{/* Row 2: SKU and Barcode */}` to `{/* Row 2: SKU (barcode now lives on the base selling unit) */}`, and widen the SKU field so the grid row does not leave a hole — change its `<FormItem>` opening tag (line 85) from `<FormItem>` to `<FormItem className="col-span-2 sm:col-span-1">`.

`Wand2` is still used by the Generate SKU button on line 96, so its import stays.

- [ ] **Step 15: Remove the standalone Cost field, the Base Unit of Measure select and the `productType === 'child'` branch from `add-product/tabs/inventory-tab.tsx`**

Delete `productType,` from the destructure at line 23. Keep `unitsOfMeasure, isLoadingUnits`, `selects`/`setSelects`, `refreshUnits` and the `addUnitOfMeasure` / `updateUnitOfMeasure` imports — the **service** early-return at lines 39-141 still renders its own Base Unit of Measure select and Cost input, and those stay untouched (a service has no selling units to carry them).

In the standard branch, delete the whole `unitOfMeasure` `FormField` (lines 366-401):

```tsx
        <FormField
          control={form.control}
          name="unitOfMeasure"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{productType === 'parent' ? 'Base Unit of Measure' : 'Unit of Measure'}</FormLabel>
              <InlineEditableSelect
                items={unitsOfMeasure}
                isLoading={isLoadingUnits}
                value={field.value}
                onChange={field.onChange}
                open={selects.units}
                onOpenChange={(o) => setSelects((p) => ({ ...p, units: o }))}
                placeholder="Select a unit"
                addLabel="Add Unit"
                emptyLabel="No units found"
                getId={(u: UnitOfMeasure) => u.id}
                getValue={(u: UnitOfMeasure) => u.name}
                getOptionLabel={(u: UnitOfMeasure) => `${u.name} (${u.abbreviation})`}
                getName={(u: UnitOfMeasure) => u.name}
                onAdd={async (name) => {
                  const r = await addUnitOfMeasure(name, name);
                  if (r.success) { await refreshUnits(); return name; }
                  return undefined;
                }}
                onRename={async (id, name) => {
                  const existing = unitsOfMeasure.find((u: UnitOfMeasure) => u.id === id);
                  const r = await updateUnitOfMeasure(id, name, existing?.abbreviation ?? name);
                  if (r.success) { await refreshUnits(); return name; }
                  return undefined;
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
```

That leaves only Warehouse and Shelf Locations in its grid, so change the grid's opening tag (line 281) from:

```tsx
      <div className={`grid grid-cols-1 gap-4 ${itemType === 'standard' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
```

to:

```tsx
      {/* Unit of measure now lives on the base selling-unit row — one source of
          truth, same treatment as barcode and cost. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
```

Delete the conversion-factor block (lines 404-419):

```tsx
      {itemType === 'standard' && productType === 'child' && (
        <FormField
          control={form.control}
          name="conversionFactor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conversion Factor</FormLabel>
              <FormControl>
                <Input type="number" placeholder="e.g., 12" value={field.value} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
              </FormControl>
              <FormDescription>How many base units are in this child unit?</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
```

Finally replace the Stock/Reorder/Cost grid (lines 421-470) with:

```tsx
      {/* Cost now lives on the base selling unit row in the Selling Units tab —
          one source of truth. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="stock"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Initial Stock</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" value={field.value} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reorderPoint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reorder Point</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" value={field.value} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
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

The `itemType === 'standard' &&` guards on the remaining Department / Supplier / Warehouse / Shelf fields become tautological (the service branch returns early) but are left as-is — removing them is unrelated churn.

- [ ] **Step 16: Run the type checker**
Run: `npx tsc --noEmit`
Expected: no errors under `app/(app)/products/add-product/`. Errors may remain in `edit-product/` and `actions.ts` until Tasks 3–4 land.

- [ ] **Step 17: Run lint**
Run: `npm run lint`
Expected: no new errors or warnings from the files touched in this task.

- [ ] **Step 18: Commit**
```bash
git add "app/(app)/products/add-product"
git commit -m "feat(products): replace Conversion + Price Levels with a Selling Units tab (Add Product)

Adds tabs/selling-units-tab.tsx (one repeatable row per selling unit, a locked
qty_base=1 base row, one price column per active price level, per-row barcode
Generate) and removes the Conversion and Price Levels tabs, the Auto-create
Child Unit switch, the parent/child productType state, the standalone Barcode
field in Basic Info, and the standalone Cost field and Base Unit of Measure
select in Inventory. The base row is now the only place those values are typed;
the service branch keeps its own Cost and unit inputs since it has no units.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Edit Product — hook, Selling Units tab, and tab-list wiring

**Files:**
- Modify: `lib/types.ts:46-58` (add `sellingUnits` to `Product`)
- Modify: `app/(app)/products/actions.ts:215-298` (hydrate `sellingUnits` in `getProducts`)
- Modify: `app/(app)/products/edit-product/use-edit-product-form.ts:1-487` (multiple blocks)
- Create: `app/(app)/products/edit-product/tabs/selling-units-tab.tsx`
- Delete: `app/(app)/products/edit-product/tabs/conversion-tab.tsx`
- Delete: `app/(app)/products/edit-product/tabs/price-levels-tab.tsx`
- Modify: `app/(app)/products/edit-product/edit-product-dialog.tsx:20-150`
- Modify: `app/(app)/products/edit-product/tabs/basic-info-tab.tsx:1-140`
- Modify: `app/(app)/products/edit-product/tabs/inventory-tab.tsx:22-455`

**Interfaces:**
- Consumes: `productSchema` / `ProductFormValues` / `SellingUnitValues` from Task 1; `product.sellingUnits` hydrated by `getProducts`.
- Produces: `sellingUnitFields`, `appendSellingUnit`, `addSellingUnit`, `removeSellingUnit`, `baseUnitIndex`, `baseUnitName`, `generateUnitBarcode(index)`, `tabErrors.sellingUnits` on `EditProductFormController`; `toFormSellingUnits(product)`; `<SellingUnitsTab />`.

> **Why `getProducts` and `lib/types.ts` are in this task:** nothing in `app/` reads `product_selling_units` today (verified by grep — the only readers are `lib/selling-units-migration.ts` and the migration scripts). The Edit form's `defaultValues` are built from the `product` prop, so without hydrating the units the tab would open empty on an already-migrated product, which the spec's own Testing section requires to work. This is an additive read inside a file the spec already lists in Scope.

- [ ] **Step 1: Add `sellingUnits` to the `Product` interface in `lib/types.ts`**

Current (lines 46-58):

```ts
  // Parent/Child relationship
  parentId?: string | null;
  conversionFactor?: number;

  // Conversion factors for different units
  conversionFactors?: { unit: string; factor: number }[];

  // Timestamps
  createdAt?: string;
  updatedAt?: string;

  // Price Levels
  priceLevels?: { levelId: string; price: number; minQuantity?: number }[];
```

New:

```ts
  // Parent/Child relationship — legacy; superseded by sellingUnits. Still read
  // by the products-list tree UI and lib/family-sync.ts until their own plans.
  parentId?: string | null;
  conversionFactor?: number;

  // Conversion factors for different units — legacy, see above.
  conversionFactors?: { unit: string; factor: number }[];

  // Selling units (product_selling_units + product_selling_unit_prices)
  sellingUnits?: {
    id: string;
    unitName: string;
    qtyBase: number;
    barcode: string;
    cost?: number;
    price: number;
    isBase: boolean;
    sortOrder: number;
    prices: Record<string, { price: number; minQuantity?: number }>;
  }[];

  // Timestamps
  createdAt?: string;
  updatedAt?: string;

  // Price Levels — legacy product_price_levels rows.
  priceLevels?: { levelId: string; price: number; minQuantity?: number }[];
```

- [ ] **Step 2: Hydrate `sellingUnits` in `getProducts` (`app/(app)/products/actions.ts`)**

Insert this immediately after the `plMap` block that ends at line 242, right before `const defaultPriceLevelSql = ...` on line 244:

```ts
    // Selling units + their per-price-level prices, mapped by product id. Same
    // fetch-all-then-group shape as cfMap/plMap above (this action is already a
    // handful of unbounded reads; a third does not change its cost profile).
    const sellingUnitRows = await query(
      `SELECT id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order
       FROM product_selling_units
       ORDER BY product_id, sort_order, unit_name`,
    );
    const sellingUnitPriceRows = await query(
      `SELECT selling_unit_id, price_level_id, price, min_quantity FROM product_selling_unit_prices`,
    );

    const suPriceMap = new Map<string, Record<string, { price: number; minQuantity?: number }>>();
    sellingUnitPriceRows.forEach((r: any) => {
      if (!suPriceMap.has(r.selling_unit_id)) suPriceMap.set(r.selling_unit_id, {});
      suPriceMap.get(r.selling_unit_id)![r.price_level_id] = {
        price: parseFloat(r.price),
        minQuantity: r.min_quantity == null ? undefined : parseFloat(r.min_quantity),
      };
    });

    const suMap = new Map<string, any[]>();
    sellingUnitRows.forEach((r: any) => {
      if (!suMap.has(r.product_id)) suMap.set(r.product_id, []);
      suMap.get(r.product_id)!.push({
        id: r.id,
        unitName: r.unit_name,
        qtyBase: parseFloat(r.qty_base),
        barcode: r.barcode,
        cost: r.cost == null ? undefined : parseFloat(r.cost),
        price: parseFloat(r.price),
        isBase: r.is_base === 1,
        sortOrder: r.sort_order,
        prices: suPriceMap.get(r.id) || {},
      });
    });
```

Then add one line to the returned object, immediately after `conversionFactors: cfMap.get(product.id) || [],` (line 280):

```ts
        sellingUnits: suMap.get(product.id) || [],
```

- [ ] **Step 3: Add `toFormSellingUnits` to `use-edit-product-form.ts`, below `calculatePriceLevelPrice` (after line 49)**

```ts
/**
 * Maps a product's stored selling units onto the form shape.
 *
 * A service never gets units (its tab is hidden and updateProduct leaves the
 * selling-unit tables alone when the field is absent). A standard product that
 * somehow has no rows yet — one created before this feature, or one loaded by a
 * caller that does not hydrate them (e.g. the inventory detail page's
 * `<EditProductDialog product={product} />` at
 * app/(app)/inventory/[productId]/page.tsx:110) — gets a synthesized base row
 * from its scalar columns, so the tab is never blank and saving cannot
 * silently wipe it.
 */
export function toFormSellingUnits(product: Product): any[] | undefined {
  if (product?.type === 'service') return undefined;

  const stored = product?.sellingUnits ?? [];
  if (stored.length > 0) {
    return stored
      .slice()
      .sort((a, b) => (a.isBase === b.isBase ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0) : a.isBase ? -1 : 1))
      .map((u) => ({
        id: u.id,
        unitName: u.unitName,
        qtyBase: Number(u.qtyBase),
        barcode: u.barcode ?? '',
        cost: u.cost ?? undefined,
        isBase: !!u.isBase,
        prices: u.prices ?? {},
      }));
  }

  return [
    {
      unitName: product?.unitOfMeasure ?? '',
      qtyBase: 1,
      barcode: product?.barcode ?? '',
      cost: product?.cost ?? undefined,
      isBase: true,
      prices: {},
    },
  ];
}
```

- [ ] **Step 4: Replace the `defaultValues` and field-array blocks in `use-edit-product-form.ts:131-167`**

Current:

```ts
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      ...product,
      category: product.category ?? '',
      brand: product.brand ?? '',
      department: product.department ?? '',
      cost: product.cost ?? 0,
      barcode: product.barcode ?? '',
      additionalDescription: product.additionalDescription ?? '',
      incomeAccount: product.incomeAccount ?? '',
      expenseAccount: product.expenseAccount ?? '',
      warehouse: product.warehouse ?? '',
      shelfLocationIds: product.shelfLocationIds || [],
      subcategory: product.subcategory ?? '', // Handle null
      supplier: product.supplier ?? '', // Handle null
      unitOfMeasure: product.unitOfMeasure ?? '', // Handle null
      conversionFactor: product.conversionFactor ?? 1, // Handle null/0 by defaulting to 1
      conversionFactors: product.conversionFactors || [],
      priceLevels: product.priceLevels || [],
      vatStatus: product.vatStatus || 'YES (Subject to 12% VAT)',
      availability: product.availability || 'Available',
      earnsPoints: product.earnsPoints ?? true,
      isPerishable: product.isPerishable ?? false,
      description: product.description ?? '',
    },
  });

  const { fields: conversionFactorFields, append: appendConversionFactor, remove: removeConversionFactor } = useFieldArray({
    control: form.control,
    name: 'conversionFactors',
  });

  const { fields: priceLevelFields, append: appendPriceLevel, remove: removePriceLevel } = useFieldArray({
    control: form.control,
    name: "priceLevels",
  });
```

New:

```ts
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      ...product,
      category: product.category ?? '',
      brand: product.brand ?? '',
      department: product.department ?? '',
      cost: product.cost ?? 0,
      barcode: product.barcode ?? '',
      additionalDescription: product.additionalDescription ?? '',
      incomeAccount: product.incomeAccount ?? '',
      expenseAccount: product.expenseAccount ?? '',
      warehouse: product.warehouse ?? '',
      shelfLocationIds: product.shelfLocationIds || [],
      subcategory: product.subcategory ?? '', // Handle null
      supplier: product.supplier ?? '', // Handle null
      unitOfMeasure: product.unitOfMeasure ?? '', // Handle null
      sellingUnits: toFormSellingUnits(product),
      vatStatus: product.vatStatus || 'YES (Subject to 12% VAT)',
      availability: product.availability || 'Available',
      earnsPoints: product.earnsPoints ?? true,
      isPerishable: product.isPerishable ?? false,
      description: product.description ?? '',
    },
  });

  const { fields: sellingUnitFields, append: appendSellingUnit, remove: removeSellingUnit } = useFieldArray({
    control: form.control as any,
    name: 'sellingUnits',
  });

  const watchedSellingUnits = form.watch('sellingUnits' as any) as SellingUnitValues[] | undefined;
  const baseUnitIndex = Math.max(0, (watchedSellingUnits ?? []).findIndex((u) => u?.isBase));
  const baseUnitName = (watchedSellingUnits ?? [])[baseUnitIndex]?.unitName || '';

  /** Appends a blank non-base row. qtyBase is deliberately left empty. */
  const addSellingUnit = () =>
    appendSellingUnit({
      unitName: '',
      qtyBase: undefined as unknown as number,
      barcode: '',
      cost: undefined,
      isBase: false,
      prices: {},
    } as any);

  /** EAN-8: 7 random digits + 1 check digit. */
  const generateUnitBarcode = (index: number) => {
    const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
    const check = (10 - (sum % 10)) % 10;
    form.setValue(`sellingUnits.${index}.barcode` as any, [...digits, check].join(''), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };
```

- [ ] **Step 5: Replace the watch + `tabErrors` block at `use-edit-product-form.ts:169-183`**

`selectedUnitOfMeasure` fed only the deleted Conversion tab; with the standard branch's Base Unit of Measure select also gone (Step 11), nothing reads it.

Current:

```ts
  const selectedSupplierId = form.watch('supplier');
  const selectedUnitOfMeasure = form.watch('unitOfMeasure');
  const costValue = form.watch('cost');
  const watchedCost = form.watch('cost');
  const watchedPrice = form.watch('price');
  const watchedCategoryName = form.watch('category');
  const watchedSubcategoryName = form.watch('subcategory');
  const watchedBrandName = form.watch('brand');
  const formErrors = form.formState.errors;
  const tabErrors = {
    basic: !!(formErrors.name || formErrors.brand || formErrors.sku || formErrors.description || formErrors.category),
    inventory: !!(formErrors.unitOfMeasure),
    priceLevels: !!(formErrors.priceLevels),
    conversion: !!(formErrors.conversionFactors),
  };
```

New:

```ts
  const selectedSupplierId = form.watch('supplier');
  const costValue = form.watch('cost');
  const watchedCost = form.watch('cost');
  const watchedPrice = form.watch('price');
  const watchedCategoryName = form.watch('category');
  const watchedSubcategoryName = form.watch('subcategory');
  const watchedBrandName = form.watch('brand');
  const formErrors = form.formState.errors as any;
  const tabErrors = {
    basic: !!(formErrors.name || formErrors.brand || formErrors.sku || formErrors.description || formErrors.category),
    // unitOfMeasure can still error here — a Service edits it on this tab.
    inventory: !!(formErrors.unitOfMeasure),
    sellingUnits: !!formErrors.sellingUnits,
  };
```

- [ ] **Step 6: Update the reset effect at `use-edit-product-form.ts:188-227` and drop the `seedDefaultPriceLevel` import at line 8**

Inside `sanitizedProduct`, replace these three lines:

```ts
          conversionFactor: product.conversionFactor ?? 1, // Handle null/0 by defaulting to 1
          conversionFactors: product.conversionFactors || [],
          priceLevels: seedDefaultPriceLevel(product.priceLevels || [], priceLevels, product.price),
```

with:

```ts
          sellingUnits: toFormSellingUnits(product),
```

Also delete the stale debug line just below it (line 215):

```ts
      console.log('Resetting form with:', sanitizedProduct);
```

And delete the now-unused import on line 8:

```ts
import { seedDefaultPriceLevel } from '@/lib/price-level-seed';
```

`lib/price-level-seed.ts` itself stays — it is not in this plan's scope; only this import goes.

- [ ] **Step 7: Replace the price-level auto-fill effect tail at `use-edit-product-form.ts:342-368`**

Current:

```ts
          // ALSO update all price level fields automatically
          if (priceLevelFields.length > 0) {
            priceLevelFields.forEach((field, index) => {
              const levelDef = priceLevels.find((l: any) => l.id === field.levelId);
              if (levelDef) {
                // Calculate price for each level
                let levelPrice;
                const levelMarkup = levelDef.percentageAdjustment ?? 0;

                if (levelDef.calculationBase === 'cost') {
                    levelPrice = parseFloat((cost * (1 + levelMarkup / 100)).toFixed(2));
                } else {
                    // Retail Base
                    if (levelMarkup === 0 && levelDef.name?.toLowerCase() === 'retail') {
                        levelPrice = parseFloat(basePrice.toFixed(2));
                    } else {
                        levelPrice = parseFloat((basePrice * (1 + levelMarkup / 100)).toFixed(2));
                    }
                }
                form.setValue(`priceLevels.${index}.price`, levelPrice);
              }
            });
          }
        }
      }
    }
  }, [selectedPriceLevelId, priceLevels, priceLevelFields, form, categories, subcategories, brands, systemSettings]);
```

New:

```ts
          // ALSO fill every price-level column on the BASE selling unit row.
          // Non-base rows keep whatever the user typed.
          const units = (form.getValues('sellingUnits' as any) as SellingUnitValues[] | undefined) ?? [];
          const idx = Math.max(0, units.findIndex((u) => u?.isBase));
          priceLevels.forEach((levelDef: any) => {
            let levelPrice: number;
            const levelMarkup = levelDef.percentageAdjustment ?? 0;

            if (levelDef.calculationBase === 'cost') {
              levelPrice = parseFloat((cost * (1 + levelMarkup / 100)).toFixed(2));
            } else {
              // Retail Base
              if (levelMarkup === 0 && levelDef.name?.toLowerCase() === 'retail') {
                levelPrice = parseFloat(basePrice.toFixed(2));
              } else {
                levelPrice = parseFloat((basePrice * (1 + levelMarkup / 100)).toFixed(2));
              }
            }
            form.setValue(`sellingUnits.${idx}.prices.${levelDef.id}.price` as any, levelPrice);
          });
        }
      }
    }
  }, [selectedPriceLevelId, priceLevels, form, categories, subcategories, brands, systemSettings]);
```

- [ ] **Step 8: Replace `generateBarcode` (lines 370-376) and the head of `saveChanges` (lines 378-392)**

Delete:

```ts
  const generateBarcode = () => {
    // EAN-8: 7 random digits + 1 check digit
    const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
    const check = (10 - (sum % 10)) % 10;
    form.setValue('barcode', [...digits, check].join(''));
  };
```

Current `saveChanges` head:

```ts
  const saveChanges = async (values: ProductFormValues) => {
    console.log('EditProductDialog saveChanges called with values:', values);
    // Filter out conversion factors with empty units to avoid schema validation errors
    values.conversionFactors = values.conversionFactors?.filter(cf => cf.unit.trim() !== '') || [];
    try {
      setIsSubmitting(true);

      const result = await updateProduct(product.id, values);

      console.log('updateProduct result:', result);

      // MOCK API CAILL
      // console.log('API Disabled: Mock Save Success');
      // const result = { success: true, message: 'Mock saved successfully' };

      if (result.success) {
```

New:

```ts
  const saveChanges = async (values: ProductFormValues) => {
    try {
      setIsSubmitting(true);

      // The base selling unit is the single source of truth for the product's
      // scalar price/cost/barcode/unit_of_measure columns. Mirror them here;
      // updateProduct re-derives the same values server-side as the
      // authoritative pass. A service submits no sellingUnits, so its own
      // Inventory-tab values pass through untouched.
      const units = (values as any).sellingUnits as SellingUnitValues[] | undefined;
      const baseUnit = units?.find((u) => u.isBase) ?? units?.[0];
      const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];

      let mirroredPrice = values.price;
      if (baseUnit && defaultLevel) {
        const entered = Number(baseUnit.prices?.[defaultLevel.id]?.price ?? NaN);
        if (Number.isFinite(entered) && entered > 0) mirroredPrice = entered;
      }

      const result = await updateProduct(product.id, {
        ...values,
        price: mirroredPrice,
        cost: baseUnit ? baseUnit.cost : values.cost,
        barcode: baseUnit ? baseUnit.barcode : values.barcode,
        unitOfMeasure: baseUnit?.unitName || values.unitOfMeasure,
      } as any);

      if (result.success) {
```

The rest of `saveChanges` (from `await logActivity({ ... })` onward) is unchanged.

- [ ] **Step 9: Update the returned controller object at `use-edit-product-form.ts:436-483` and the import at line 27**

Current:

```ts
    // field arrays
    conversionFactorFields, appendConversionFactor, removeConversionFactor,
    priceLevelFields, appendPriceLevel, removePriceLevel,

    // watched / derived values
    selectedSupplierId,
    selectedUnitOfMeasure,
    tabErrors,
```

New:

```ts
    // field arrays
    sellingUnitFields, appendSellingUnit, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,

    // watched / derived values
    selectedSupplierId,
    tabErrors,
```

Current:

```ts
    // handlers
    generateBarcode,
    saveChanges,
```

New:

```ts
    // handlers
    generateUnitBarcode,
    saveChanges,
```

Current import on line 27:

```ts
import { productSchema, type ProductFormValues } from './product-schema';
```

New:

```ts
import { productSchema, type ProductFormValues, type SellingUnitValues } from './product-schema';
```

- [ ] **Step 10: Create `app/(app)/products/edit-product/tabs/selling-units-tab.tsx`**

Same structure as the Add form's tab, wired to the Edit context and its `product.type` visibility rule:

```tsx
'use client';

import { PlusCircle, Wand2, X } from 'lucide-react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { useEditProductFormContext } from '../edit-product-form-context';
import { calculatePriceLevelPrice } from '../use-edit-product-form';

export function SellingUnitsTab() {
  const {
    form,
    product,
    priceLevels, isLoadingPriceLevels,
    sellingUnitFields, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,
    generateUnitBarcode,
  } = useEditProductFormContext();

  // Services have no sellable units — the tab is not rendered for them.
  if (product?.type === 'service') return null;

  /**
   * Fills every price-level column of one row from that row's own cost and the
   * base row's retail price. A non-base row scales by its qtyBase: one Box of
   * 12 is priced off 12 Pieces of retail.
   */
  const autoPriceRow = (index: number) => {
    const units: any[] = form.getValues('sellingUnits' as any) || [];
    const row = units[index];
    if (!row) return;

    const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];
    const baseRetail = defaultLevel
      ? Number(units[baseUnitIndex]?.prices?.[defaultLevel.id]?.price ?? 0)
      : 0;
    const qty = row.isBase ? 1 : Number(row.qtyBase) || 0;
    if (!qty) return;

    const rowRetail = row.isBase ? baseRetail : baseRetail * qty;
    const rowCost = Number(row.cost ?? units[baseUnitIndex]?.cost ?? 0) * (row.isBase ? 1 : qty);

    priceLevels.forEach((level: any) => {
      const value = calculatePriceLevelPrice(
        level.id,
        level.calculationBase || 'retail',
        priceLevels,
        rowRetail,
        rowCost,
      );
      form.setValue(
        `sellingUnits.${index}.prices.${level.id}.price` as any,
        parseFloat(value.toFixed(2)),
        { shouldDirty: true },
      );
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium leading-none">Selling Units</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Every way this product is sold. The first row is the base unit; every other
              row says how many base units it contains (e.g. 1 Box = 12 Pieces).
            </p>
          </div>
          <button
            type="button"
            onClick={addSellingUnit}
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Selling Unit
          </button>
        </div>

        {/* Column header — the price-level columns are rendered once here. */}
        <div className="hidden md:flex items-end gap-3 px-3 pb-2 text-xs font-medium text-muted-foreground">
          <div className="flex-1 min-w-[140px]">Unit Name</div>
          <div className="w-[120px]">Qty Base</div>
          <div className="w-[170px]">Barcode</div>
          <div className="w-[110px]">Cost (₱)</div>
          {isLoadingPriceLevels ? (
            <div className="w-[110px]">Loading…</div>
          ) : (
            priceLevels.map((level: any) => (
              <div key={level.id} className="w-[110px] truncate" title={level.name}>
                {level.name} (₱)
              </div>
            ))
          )}
          <div className="w-[72px]" />
        </div>

        <div className="space-y-3">
          {sellingUnitFields.map((field, index) => {
            const isBaseRow = index === baseUnitIndex;
            return (
              <div
                key={field.id}
                className="flex flex-wrap md:flex-nowrap items-end gap-3 p-3 bg-card border rounded-md shadow-sm overflow-x-auto"
              >
                <div className="flex-1 min-w-[140px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.unitName` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Unit Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={isBaseRow ? 'e.g., Piece' : 'e.g., Box'}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        {isBaseRow && (
                          <FormDescription className="text-xs">
                            Base unit — this is the product&apos;s unit of measure.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="w-[120px]">
                  {isBaseRow ? (
                    <div className="space-y-2">
                      <span className="text-xs font-medium md:sr-only block">Qty Base</span>
                      <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-semibold">
                        1
                      </div>
                    </div>
                  ) : (
                    <FormField
                      control={form.control}
                      name={`sellingUnits.${index}.qtyBase` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs md:sr-only">Equals how many base units?</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.000001"
                              placeholder="Qty"
                              value={field.value ?? ''}
                              onChange={(e) =>
                                field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            How many {baseUnitName || 'base units'} is one of this unit?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                <div className="w-[170px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.barcode` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Barcode</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              placeholder="e.g., 12345670"
                              {...field}
                              value={field.value ?? ''}
                              className="pr-10"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                              }}
                            />
                          </FormControl>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                            onClick={() => generateUnitBarcode(index)}
                          >
                            <Wand2 className="h-4 w-4" />
                            <span className="sr-only">Generate Barcode</span>
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="w-[110px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.cost` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Cost (₱)</FormLabel>
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
                </div>

                {priceLevels.map((level: any) => (
                  <div key={level.id} className="w-[110px]">
                    <FormField
                      control={form.control}
                      name={`sellingUnits.${index}.prices.${level.id}.price` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs md:sr-only">{level.name} (₱)</FormLabel>
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
                  </div>
                ))}

                <div className="flex w-[72px] items-center gap-1 self-center pb-1">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground"
                    onClick={() => autoPriceRow(index)}
                  >
                    <Wand2 className="h-4 w-4" />
                    <span className="sr-only">Auto-fill prices for this unit</span>
                  </button>
                  {!isBaseRow && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                      onClick={() => removeSellingUnit(index)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove selling unit</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Delete the two replaced tab files**
```bash
git rm "app/(app)/products/edit-product/tabs/conversion-tab.tsx" "app/(app)/products/edit-product/tabs/price-levels-tab.tsx"
```

- [ ] **Step 12: Update `edit-product-dialog.tsx` imports (lines 20-24) and the tab list/content (lines 111-147)**

Current imports:

```tsx
import { BasicInfoTab } from './tabs/basic-info-tab';
import { InventoryTab } from './tabs/inventory-tab';
import { ConversionTab } from './tabs/conversion-tab';
import { PriceLevelsTab } from './tabs/price-levels-tab';
import { LoyaltyTab } from './tabs/loyalty-tab';
```

New:

```tsx
import { BasicInfoTab } from './tabs/basic-info-tab';
import { InventoryTab } from './tabs/inventory-tab';
import { SellingUnitsTab } from './tabs/selling-units-tab';
import { LoyaltyTab } from './tabs/loyalty-tab';
```

Current tab triggers (lines 111-126):

```tsx
                        <TabsTrigger
                          value="price-levels"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
                        >
                          Price Levels
                          {tabErrors.priceLevels && <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-destructive" />}
                        </TabsTrigger>
                        {product?.type !== 'service' && (
                          <TabsTrigger
                            value="conversion"
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
                          >
                            Conversion
                            {tabErrors.conversion && <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-destructive" />}
                          </TabsTrigger>
                        )}
```

New:

```tsx
                        {product?.type !== 'service' && (
                          <TabsTrigger
                            value="selling-units"
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
                          >
                            Selling Units
                            {tabErrors.sellingUnits && <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-destructive" />}
                          </TabsTrigger>
                        )}
```

Current tab contents (lines 140-147):

```tsx
                      {product?.type !== 'service' && (
                        <TabsContent value="conversion" className="space-y-4 p-6">
                          <ConversionTab />
                        </TabsContent>
                      )}
                      <TabsContent value="price-levels" className="space-y-4 p-6">
                        <PriceLevelsTab />
                      </TabsContent>
```

New:

```tsx
                      {product?.type !== 'service' && (
                        <TabsContent value="selling-units" className="space-y-4 p-6">
                          <SellingUnitsTab />
                        </TabsContent>
                      )}
```

- [ ] **Step 13: Remove the standalone Barcode field from `edit-product/tabs/basic-info-tab.tsx`**

Delete `generateBarcode,` from the destructure at lines 16-28. Delete this whole `FormField` block (lines 109-139):

```tsx
        <FormField
          control={form.control}
          name="barcode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Barcode (EAN-8)</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    placeholder="e.g., 123456789012"
                    {...field}
                    value={field.value ?? ''}
                    className="pr-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                  />
                </FormControl>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                  onClick={generateBarcode}
                >
                  <Wand2 className="h-4 w-4" />
                  <span className="sr-only">Generate Barcode</span>
                </button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
```

The SKU field is now alone in that `grid-cols-2` wrapper (lines 94-140), so change its `<FormItem>` opening tag (line 99) to `<FormItem className="sm:col-span-2">` — unlike the Add form, SKU here is a read-only full-width field and looks wrong at half width with nothing beside it.

Then delete the now-unused `Wand2` import on line 3 (delete the whole line `import { Wand2 } from 'lucide-react';`) — it was only used by the Generate Barcode button, since Edit's SKU is read-only and has no generate action.

- [ ] **Step 14: Remove the standalone Cost field and the Base Unit of Measure select from the standard branch of `edit-product/tabs/inventory-tab.tsx`**

Keep the **service** early-return (lines 45-147) exactly as it is — its own Base Unit of Measure select and `Cost (required)` input stay, because a service has no selling units to carry them. Keep `units` and `refreshUnits` in the destructure and the `addUnitOfMeasure` / `updateUnitOfMeasure` imports for that branch.

In the standard branch, delete the whole `unitOfMeasure` `FormField` (lines 371-406):

```tsx
        <FormField
          control={form.control}
          name="unitOfMeasure"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit of Measure</FormLabel>
              <InlineEditableSelect
                items={units}
                isLoading={false}
                value={field.value}
                onChange={field.onChange}
                open={selects.units}
                onOpenChange={(o) => setSelects((p) => ({ ...p, units: o }))}
                placeholder="Select a unit"
                addLabel="Add Unit"
                emptyLabel="No units found"
                getId={(u: UnitOfMeasure) => u.id}
                getValue={(u: UnitOfMeasure) => u.name}
                getOptionLabel={(u: UnitOfMeasure) => `${u.name} (${u.abbreviation})`}
                getName={(u: UnitOfMeasure) => u.name}
                onAdd={async (name) => {
                  const r = await addUnitOfMeasure(name, name);
                  if (r.success) { await refreshUnits(); return name; }
                  return undefined;
                }}
                onRename={async (id, name) => {
                  const existing = units.find((u: UnitOfMeasure) => u.id === id);
                  const r = await updateUnitOfMeasure(id, name, existing?.abbreviation ?? name);
                  if (r.success) { await refreshUnits(); return name; }
                  return undefined;
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
```

That leaves only Warehouse and Shelf Locations in its grid, so change that grid's opening tag (line 286) from:

```tsx
      <div className={`grid grid-cols-1 gap-4 ${isServiceProduct ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
```

to:

```tsx
      {/* Unit of measure now lives on the base selling-unit row — one source of
          truth, same treatment as barcode and cost. Mirrors the Add form. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
```

Then replace the Stock/Reorder/Cost grid (lines 412-452) with:

```tsx
      {/* Cost now lives on the base selling unit row in the Selling Units tab —
          one source of truth. Mirrors the Add form. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Initial Stock</Label>
          <div>
            <Input type="text" value={formatQuantity(product.stock || 0)} disabled />
          </div>
          <p className="text-sm text-muted-foreground">Stock is updated via transactions.</p>
        </div>
        <FormField
          control={form.control}
          name="reorderPoint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reorder Point</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" value={field.value != null ? formatQuantity(field.value) : ''} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
```

The `!isServiceProduct &&` guards on the remaining Department / Supplier / Warehouse / Shelf fields become tautological (the service branch returns early) but are left as-is — removing them is unrelated churn.

- [ ] **Step 15: Run the type checker**
Run: `npx tsc --noEmit`
Expected: no errors under `app/(app)/products/edit-product/` or `lib/types.ts`. Errors may remain in `actions.ts` until Task 4 lands.

- [ ] **Step 16: Run lint**
Run: `npm run lint`
Expected: no new errors or warnings from the files touched in this task.

- [ ] **Step 17: Commit**
```bash
git add "app/(app)/products/edit-product" "app/(app)/products/actions.ts" lib/types.ts
git commit -m "feat(products): replace Conversion + Price Levels with a Selling Units tab (Edit Product)

Mirrors the Add Product change on the Edit form and hydrates
product_selling_units / product_selling_unit_prices in getProducts so an
already-migrated product's units and per-level prices load into the tab.
Synthesizes a base row from the product's scalar columns when it has no stored
units yet, so the tab is never blank and a save cannot silently wipe it. The
standalone Barcode, Cost and Base Unit of Measure controls are gone from the
standard branch; the service branch keeps its own.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Server actions — selling-unit writes, and deleting `reassignParent` / `addChildProduct`

**Files:**
- Modify: `app/(app)/products/actions.ts:12-52` (`ProductFormData`)
- Modify: `app/(app)/products/actions.ts:409-611` (`addProduct`)
- Modify: `app/(app)/products/actions.ts:613-752` (`updateProduct`)
- Delete: `app/(app)/products/actions.ts:754-846` (`reassignParent`)
- Delete: `app/(app)/products/actions.ts:2000-2030` (`addChildProduct`)

**Interfaces:**
- Consumes: `sellingUnits` on `ProductFormData`, submitted by both form hooks (Tasks 2–3); `query`/`withTransaction` from `@/lib/mysql`; `uuidv4` from `uuid` (already imported at line 7).
- Produces: rows in `product_selling_units` and `product_selling_unit_prices`; `products.price/cost/barcode/unit_of_measure` synced from the base row.

- [ ] **Step 1: Update `ProductFormData` (`actions.ts:12-52`)**

Current (the fields being replaced, lines 34-37 and line 51):

```ts
  parentId?: string;
  conversionFactor?: number;
  conversionFactors?: { unit: string; factor: number }[];
  priceLevels?: { levelId: string; price: number; minQuantity?: number }[];
```

```ts
  __childProduct?: ProductFormData;
```

Replace those four lines with:

```ts
  /**
   * Every way this product is sold. Exactly one row carries isBase: true, and
   * that row's qtyBase is 1 (the forms enforce this; the DB's UNIQUE keys on
   * barcode and (product_id, unit_name) are the backstop).
   *
   * Absent (not empty) means "do not touch the selling-unit tables" — the
   * bulk-price-update / Excel import path at
   * app/(app)/products/bulk-price-update/actions.ts:324 calls addProduct
   * without them, and a service edit submits none.
   */
  sellingUnits?: {
    id?: string;
    unitName: string;
    qtyBase: number;
    barcode: string;
    cost?: number;
    isBase: boolean;
    prices?: Record<string, { price: number; minQuantity?: number }>;
  }[];
```

…and delete the `__childProduct?: ProductFormData;` line entirely.

- [ ] **Step 2: Add two shared helpers directly above `addProduct` (`actions.ts:409`)**

```ts
/**
 * Writes one product's selling units and their per-price-level prices.
 *
 * Callers are responsible for having already deleted any prior rows (the update
 * path does a delete-then-reinsert; the insert path has nothing to delete).
 * Returns the base row so the caller can sync products.price/cost/barcode/
 * unit_of_measure from it — that sync is what keeps the ~100+ call sites that
 * read products.* directly working unmodified.
 */
async function writeSellingUnits(
  connection: any,
  productId: string,
  units: NonNullable<ProductFormData['sellingUnits']>,
  defaultPriceLevelId: string | null,
) {
  const baseUnit = units.find((u) => u.isBase) ?? units[0];

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    // Existing rows keep their id so sale_items / inventory_batches /
    // purchase_order_items FKs (nullable, ON DELETE SET NULL) survive an edit
    // that does not remove that particular unit.
    const unitId = u.id || `psu_${uuidv4()}`;

    const defaultLevelPrice =
      defaultPriceLevelId && u.prices?.[defaultPriceLevelId]
        ? Number(u.prices[defaultPriceLevelId].price)
        : undefined;
    const firstAnyPrice = Object.values(u.prices || {})[0]?.price;
    const unitPrice = Number(defaultLevelPrice ?? firstAnyPrice ?? 0);

    await connection.query(
      `INSERT INTO product_selling_units
         (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        unitId,
        productId,
        u.unitName,
        Number(u.qtyBase),
        u.barcode,
        u.cost == null ? null : Number(u.cost),
        unitPrice,
        u.isBase ? 1 : 0,
        i,
      ],
    );

    for (const [levelId, entry] of Object.entries(u.prices || {})) {
      if (entry == null || entry.price == null || Number.isNaN(Number(entry.price))) continue;
      await connection.query(
        `INSERT INTO product_selling_unit_prices
           (selling_unit_id, price_level_id, price, min_quantity)
         VALUES (?, ?, ?, ?)`,
        [
          unitId,
          levelId,
          Number(entry.price),
          entry.minQuantity == null ? null : Number(entry.minQuantity),
        ],
      );
    }
  }

  return baseUnit;
}

/** The default price level's id, or the first one, or null if none exist. */
async function resolveDefaultPriceLevelId(connection: any): Promise<string | null> {
  const [rows]: any = await connection.query(
    'SELECT id FROM price_levels ORDER BY is_default DESC, name ASC LIMIT 1',
  );
  return rows?.[0]?.id ?? null;
}
```

- [ ] **Step 3: Delete the conversion-factor pre-check in `addProduct` (`actions.ts:448-454`)**

```ts
    if (formData.conversionFactors && formData.conversionFactors.length > 0) {
      const units = formData.conversionFactors.map(cf => cf.unit.toLowerCase());
      const uniqueUnits = new Set(units);
      if (units.length !== uniqueUnits.size) {
        return { success: false, message: 'Duplicate conversion factor units detected. Each unit must be unique.' };
      }
    }
```

Nothing replaces it — the schema's barcode-uniqueness superRefine and the DB's `unique_product_unit_name` key supersede it.

- [ ] **Step 4: Drop the legacy columns from `addProduct`'s products INSERT**

In the `productData` object (`actions.ts:475-510`), delete these two lines:

```ts
        parent_id: formData.parentId || null,
        conversion_factor: formData.conversionFactor || 1,
```

Replace the INSERT statement (`actions.ts:512-520`):

```ts
      const sql = `
        INSERT INTO products (
          id, name, description, additional_description, category, brand, department,
          subcategory, supplier_id, warehouse_id, stock, reorder_point, avg_daily_sales, price, cost,
          sku, barcode, image_url, image_hint,
          unit_of_measure, parent_id, conversion_factor, income_account, expense_account,
          vat_status, availability, earns_points, shelf_location_id, is_perishable, type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
```

with (two placeholders fewer — 28, not 30):

```ts
      const sql = `
        INSERT INTO products (
          id, name, description, additional_description, category, brand, department,
          subcategory, supplier_id, warehouse_id, stock, reorder_point, avg_daily_sales, price, cost,
          sku, barcode, image_url, image_hint,
          unit_of_measure, income_account, expense_account,
          vat_status, availability, earns_points, shelf_location_id, is_perishable, type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
```

Replace the values array (`actions.ts:524-533`):

```ts
      const values_array = [
        productData.id, productData.name, productData.description, productData.additional_description,
        productData.category, productData.brand, productData.department, productData.subcategory,
        productData.supplier_id, productData.warehouse_id, productData.stock, productData.reorder_point,
        productData.avg_daily_sales, productData.price, productData.cost, productData.sku,
        productData.barcode, productData.image_url, productData.image_hint, productData.unit_of_measure,
        productData.parent_id, productData.conversion_factor, productData.income_account,
        productData.expense_account, productData.vat_status, productData.availability, productData.earns_points,
        legacyShelfId, productData.is_perishable, productData.type
      ];
```

with:

```ts
      const values_array = [
        productData.id, productData.name, productData.description, productData.additional_description,
        productData.category, productData.brand, productData.department, productData.subcategory,
        productData.supplier_id, productData.warehouse_id, productData.stock, productData.reorder_point,
        productData.avg_daily_sales, productData.price, productData.cost, productData.sku,
        productData.barcode, productData.image_url, productData.image_hint, productData.unit_of_measure,
        productData.income_account,
        productData.expense_account, productData.vat_status, productData.availability, productData.earns_points,
        legacyShelfId, productData.is_perishable, productData.type
      ];
```

- [ ] **Step 5: Replace `addProduct`'s conversion-factor and price-level insert loops (`actions.ts:568-579`)**

Current:

```ts
      if (formData.conversionFactors && formData.conversionFactors.length > 0) {
        for (const cf of formData.conversionFactors) {
          const cfId = `${productId}-cf-${cf.unit}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await connection.query('INSERT INTO conversion_factors (id, product_id, unit, factor) VALUES (?, ?, ?, ?)', [cfId, productId, cf.unit, cf.factor]);
        }
      }

      if (formData.priceLevels && formData.priceLevels.length > 0) {
        for (const pl of formData.priceLevels) {
          await connection.query('INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, ?, ?)', [productId, pl.levelId, pl.price, pl.minQuantity || 0]);
        }
      }
```

New:

```ts
      if (formData.sellingUnits && formData.sellingUnits.length > 0) {
        const defaultLevelId = await resolveDefaultPriceLevelId(connection);
        const baseUnit = await writeSellingUnits(connection, productId, formData.sellingUnits, defaultLevelId);

        // Sync the scalar columns from the base row — one source of truth.
        if (baseUnit) {
          const basePrice =
            defaultLevelId && baseUnit.prices?.[defaultLevelId]
              ? Number(baseUnit.prices[defaultLevelId].price)
              : Number(Object.values(baseUnit.prices || {})[0]?.price ?? productData.price ?? 0);
          await connection.query(
            'UPDATE products SET price = ?, cost = ?, barcode = ?, unit_of_measure = ? WHERE id = ?',
            [
              basePrice,
              baseUnit.cost == null ? productData.cost : Number(baseUnit.cost),
              baseUnit.barcode,
              baseUnit.unitName,
              productId,
            ],
          );
        }
      }
```

- [ ] **Step 6: Delete `addProduct`'s auto-child finalization block and fix its error handler**

Replace `actions.ts:589-603`:

```ts
    // On finalization of an approved queue item, create the auto-child too (single approval covers both).
    let childWarning = '';
    if (isInternalFinalization && formData.__childProduct) {
      const childResult = await addProduct(
        { ...formData.__childProduct, parentId: productId },
        userId,
        true,
      );
      if (!childResult.success) {
        console.warn('Failed to auto-create child product on finalization:', childResult.message);
        childWarning = ` (WARNING: child unit was not created: ${childResult.message})`;
      }
    }

    return { success: true, message: `${formData.name} has been added to the inventory.${childWarning}`, productId };
```

with:

```ts
    return { success: true, message: `${formData.name} has been added to the inventory.`, productId };
```

`isInternalFinalization` is still used by the approval gate at the top of the function (`actions.ts:416`), so the parameter stays.

Then replace the error handler (`actions.ts:604-610`):

```ts
  } catch (error: any) {
    console.error('Error saving product:', error);
    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('unique_product_unit')) {
      return { success: false, message: 'A conversion factor with this unit already exists for this product.' };
    }
    return { success: false, message: 'There was an error saving the product.' };
  }
```

with:

```ts
  } catch (error: any) {
    console.error('Error saving product:', error);
    if (error.code === 'ER_DUP_ENTRY' && error.message?.includes('unique_selling_unit_barcode')) {
      return { success: false, message: "That barcode is already used by another product's selling unit." };
    }
    if (error.code === 'ER_DUP_ENTRY' && error.message?.includes('unique_product_unit_name')) {
      return { success: false, message: 'Two selling units of this product have the same unit name.' };
    }
    return { success: false, message: 'There was an error saving the product.' };
  }
```

- [ ] **Step 7: Delete `updateProduct`'s conversion-factor pre-check (`actions.ts:615-621`)**

```ts
    if (formData.conversionFactors && formData.conversionFactors.length > 0) {
      const units = formData.conversionFactors.map(cf => cf.unit.toLowerCase());
      const uniqueUnits = new Set(units);
      if (units.length !== uniqueUnits.size) {
        return { success: false, message: 'Duplicate conversion factor units detected. Each unit must be unique.' };
      }
    }
```

- [ ] **Step 8: Replace `updateProduct`'s conversion-factor / price-level delete-then-reinsert blocks (`actions.ts:720-733`)**

Current:

```ts
      await connection.query('DELETE FROM conversion_factors WHERE product_id = ?', [id]);
      if (formData.conversionFactors && formData.conversionFactors.length > 0) {
        for (const cf of formData.conversionFactors) {
          const cfId = `${id}-cf-${cf.unit}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await connection.query('INSERT INTO conversion_factors (id, product_id, unit, factor) VALUES (?, ?, ?, ?)', [cfId, id, cf.unit, cf.factor]);
        }
      }

      await connection.query('DELETE FROM product_price_levels WHERE product_id = ?', [id]);
      if (formData.priceLevels && formData.priceLevels.length > 0) {
        for (const pl of formData.priceLevels) {
          await connection.query('INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, ?, ?)', [id, pl.levelId, pl.price, pl.minQuantity || 0]);
        }
      }
```

New:

```ts
      // Delete-then-reinsert, the same pattern this function already used for
      // conversion_factors / product_price_levels. The DELETE cascades to
      // product_selling_unit_prices via fk_psup_selling_unit ON DELETE CASCADE,
      // so that table needs no separate delete. Rows the user kept come back
      // with their original id (carried on formData), so sale_items /
      // inventory_batches / purchase_order_items keep pointing at them; a row
      // the user removed stays deleted and those FKs go NULL (ON DELETE SET NULL).
      //
      // `undefined` means "leave the selling-unit tables alone" — a service
      // edit, or any caller that does not manage units.
      if (formData.sellingUnits !== undefined) {
        await connection.query('DELETE FROM product_selling_units WHERE product_id = ?', [id]);

        if (formData.sellingUnits.length > 0) {
          const defaultLevelId = await resolveDefaultPriceLevelId(connection);
          const baseUnit = await writeSellingUnits(connection, id, formData.sellingUnits, defaultLevelId);

          // Sync the scalar columns from the base row — one source of truth.
          if (baseUnit) {
            const basePrice =
              defaultLevelId && baseUnit.prices?.[defaultLevelId]
                ? Number(baseUnit.prices[defaultLevelId].price)
                : Number(Object.values(baseUnit.prices || {})[0]?.price ?? productData.price ?? 0);
            await connection.query(
              'UPDATE products SET price = ?, cost = ?, barcode = ?, unit_of_measure = ? WHERE id = ?',
              [
                basePrice,
                baseUnit.cost == null ? productData.cost : Number(baseUnit.cost),
                baseUnit.barcode,
                baseUnit.unitName,
                id,
              ],
            );
          }
        }
      }
```

> The existing "Family Stock Sync" block (`actions.ts:671-687`, `findUltimateRoot`/`addFamilyStock`/`deductFamilyStock`) is deliberately untouched — `lib/family-sync.ts`'s removal is a later plan, and Plan 1 already deleted the child rows it would walk to, so this is dead-but-harmless until its own plan runs.

- [ ] **Step 9: Replace `updateProduct`'s error handler (`actions.ts:745-751`)**

Current:

```ts
  } catch (error: any) {
    console.error('Error updating product:', error);
    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('unique_product_unit')) {
      return { success: false, message: 'A conversion factor with this unit already exists for this product.' };
    }
    return { success: false, message: 'There was an error updating the product.' };
  }
```

New:

```ts
  } catch (error: any) {
    console.error('Error updating product:', error);
    if (error.code === 'ER_DUP_ENTRY' && error.message?.includes('unique_selling_unit_barcode')) {
      return { success: false, message: "That barcode is already used by another product's selling unit." };
    }
    if (error.code === 'ER_DUP_ENTRY' && error.message?.includes('unique_product_unit_name')) {
      return { success: false, message: 'Two selling units of this product have the same unit name.' };
    }
    return { success: false, message: 'There was an error updating the product.' };
  }
```

- [ ] **Step 10: Delete `reassignParent` (`actions.ts:754-846`) and its now-unused import**

Delete the entire function, from `export async function reassignParent(` through its closing `}`. Its first and last lines, for unambiguous identification:

```ts
export async function reassignParent(
  childId: string,
  newParentId: string | null,
  conversionFactor: number,
): Promise<{ success: boolean; message: string }> {
```

```ts
  } catch (error: any) {
    console.error('Error in reassignParent:', error);
    return { success: false, message: 'There was an error reassigning the product.' };
  }
}
```

Then delete line 9, whose only consumer was that function:

```ts
import { getIllegalReassignTargets, type TreeProduct } from '@/lib/product-tree';
```

`lib/product-tree.ts` itself stays — the products-list tree UI is a later plan.

- [ ] **Step 11: Delete `addChildProduct` (`actions.ts:2000-2030`)**

Its only caller was `quick-add-child/use-quick-add-child.ts:143`, which Task 5 deletes; the `import { addChildProduct } from './actions';` on `app/(app)/products/page.tsx:53` is already dead (the symbol is referenced nowhere else in that file) and Task 5 removes it. Delete the whole function:

```ts
export async function addChildProduct(parentId: string, data: any) {
  try {
    const id = `product_${Date.now()}`;
    await withTransaction(async (connection) => {
      const productSql = `
        INSERT INTO products (
          id, name, brand, sku, barcode, description, category, subcategory, 
          unit_of_measure, stock, reorder_point, price, cost, parent_id,
          conversion_factor, warehouse_id, department, supplier_id, vat_status, income_account, expense_account
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await connection.query(productSql, [
        id, data.name, data.brand, data.sku, data.barcode || null, 
        data.description, data.category, data.subcategory || null,
        data.unitOfMeasure, data.stock || 0, data.reorderPoint || 0, 
        data.price, data.cost, parentId,
        data.conversionFactor || 1,
        data.warehouseId || null,
        data.department || null,
        data.supplierId || null,
        data.vatStatus || 'YES (Subject to 12% VAT)',
        data.incomeAccount || null,
        data.expenseAccount || null
      ]);
    });
    return { success: true, message: 'Child product added successfully.' };
  } catch (error) {
    console.error('Error adding child product:', error);
    return { success: false, message: 'Error adding child product.' };
  }
}
```

`getChildProducts` at `actions.ts:2214` is **kept** — the products-list parent/child tree UI still calls it, and that UI is a later plan.

- [ ] **Step 12: Verify the deleted symbols are gone from this file**
Run: `npx rg -n "reassignParent|addChildProduct|__childProduct|conversionFactors|priceLevels" "app/(app)/products/actions.ts"`
Expected: matches only inside `getProducts` (the `cfMap` / `plMap` hydration, which stays — the products-list tree UI still reads `conversionFactors`, and `priceLevels` still feeds `getProducts`' `effectivePrice`), plus `getPriceLevels` / `addPriceLevel` / `updatePriceLevel` / `deletePriceLevel`. No match inside `addProduct`, `updateProduct`, or `ProductFormData`.

- [ ] **Step 13: Run the type checker**
Run: `npx tsc --noEmit`
Expected: the only remaining errors are the `reassign-parent` / `quick-add-child` / `addChildProduct` imports that Task 5 removes.

- [ ] **Step 14: Commit**
```bash
git add "app/(app)/products/actions.ts"
git commit -m "feat(products): write selling units from addProduct/updateProduct; drop reassignParent

addProduct inserts product_selling_units + product_selling_unit_prices and
syncs products.price/cost/barcode/unit_of_measure from the base row.
updateProduct delete-then-reinserts both tables (the FK cascade covers the
prices table) and keeps submitted row ids so sale_items / inventory_batches
FKs survive an edit. products.parent_id / conversion_factor are no longer
written; the conversion_factors and product_price_levels write loops, the
__childProduct auto-child branch, reassignParent and the now-callerless
addChildProduct are all gone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Delete the Quick Add Child and Reassign Parent dialogs and every trigger

**Files:**
- Delete: `app/(app)/products/quick-add-child/quick-add-child-dialog.tsx`
- Delete: `app/(app)/products/quick-add-child/use-quick-add-child.ts`
- Delete: `app/(app)/products/reassign-parent/reassign-parent-dialog.tsx`
- Delete: `tests/e2e/product-reassign.spec.ts`
- Delete: `tests/e2e/products/price-levels.spec.ts`
- Modify: `app/(app)/products/page.tsx:23, 35, 53, 71, 209-215, 241, 261-271`
- Modify: `app/(app)/products/view-product/view-product-dialog.tsx:22, 24, 32, 42, 284-303, 321-336`

**Interfaces:**
- Consumes: nothing — this task only removes.
- Produces: no `QuickAddChildDialog` / `ReassignParentDialog` / `addChildProduct` symbol anywhere in the tree.

- [ ] **Step 1: Delete both dialog directories and the two obsolete E2E specs**
```bash
git rm -r "app/(app)/products/quick-add-child" "app/(app)/products/reassign-parent"
git rm tests/e2e/product-reassign.spec.ts tests/e2e/products/price-levels.spec.ts
```

Both specs drive UI this plan deletes, so their premise is gone regardless of whether they pass today:
- `tests/e2e/product-reassign.spec.ts` drives `ReassignParentDialog` end to end.
- `tests/e2e/products/price-levels.spec.ts` drives the Price Levels tab (`[role="tab"]:has-text("Price Levels")`) and the `input[name="price"]` / `input[name="cost"]` fields, none of which exist after Tasks 2–3.

The `REASSIGN_*` fixtures in `tests/e2e/fixtures/test-data.ts` (lines 192-323) and their seeding in `tests/e2e/setup/prepare-test-db.ts` are deliberately **left in place**: they are plain `products` + `conversion_factors` rows, they cost nothing, and the products-list parent/child tree UI that still reads them is a later plan's problem.

- [ ] **Step 2: Remove the Quick Add Child trigger from `app/(app)/products/page.tsx`**

Delete line 23:

```tsx
import { QuickAddChildDialog } from './quick-add-child/quick-add-child-dialog';
```

Delete line 53 — already a dead import (the symbol is referenced nowhere else in the file), and Task 4 deleted the action it names:

```tsx
import { addChildProduct } from './actions';
```

Delete line 71:

```tsx
  const [addChildDialogOpen, setAddChildDialogOpen] = useState(false);
```

Delete the menu item at lines 209-215:

```tsx
              {/* Add child product option - available on any product with its own conversion factors */}
              {product.conversionFactors && product.conversionFactors.length > 0 ? (
                  <DropdownMenuItem onClick={() => setAddChildDialogOpen(true)}>
                    <Copy className="mr-2 h-4 w-4" />
                    <span>Add Child Unit</span>
                  </DropdownMenuItem>
              ) : null}
```

Delete the dialog mount at lines 261-271:

```tsx
            {/* Always use the current product itself as the parent - supports multi-level nesting */}
            {product.conversionFactors && product.conversionFactors.length > 0 ? (
                <QuickAddChildDialog
                    open={addChildDialogOpen}
                    onOpenChange={setAddChildDialogOpen}
                    parentProduct={product}
                    baseStock={product.stock}
                    onChildAdded={onProductDeleted || (() => { })}
                    products={products}
                />
            ) : null}
```

Delete `onChildAdded={onProductDeleted}` from the `<ViewProductDialog>` call at line 241 (the prop is removed from that component in Step 3):

```tsx
                onChildAdded={onProductDeleted}
```

Finally, drop `Copy,` from the `lucide-react` import on line 35. Confirm it is unused first:
Run: `npx rg -n "\bCopy\b" "app/(app)/products/page.tsx"`
Expected: after the deletions above, the only hit is the import on line 35 → remove `Copy,` from that import list.

- [ ] **Step 3: Remove both triggers from `app/(app)/products/view-product/view-product-dialog.tsx`**

Delete lines 22 and 24:

```tsx
import { QuickAddChildDialog } from '../quick-add-child/quick-add-child-dialog';
```
```tsx
import { ReassignParentDialog } from '../reassign-parent/reassign-parent-dialog';
```

Delete the Quick Add Child footer block at lines 284-303:

```tsx
                        {!product.parentId && (product.conversionFactors?.length ?? 0) > 0 && products && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <QuickAddChildDialog
                                  parentProduct={product}
                                  baseStock={undefined}
                                  onChildAdded={() => {
                                    onChildAdded?.();
                                    onProductUpdated?.();
                                  }}
                                  products={products}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Add child unit</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
```

Delete the Reassign Parent footer block at lines 321-336:

```tsx
                        {products && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <ReassignParentDialog
                                  product={product}
                                  products={products}
                                  onProductUpdated={onProductUpdated}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Move this product under a different parent</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
```

`onChildAdded` is now unreferenced inside the component, so remove it from the destructure (line 32) and from the prop type (line 42):

```tsx
    onChildAdded,
```
```tsx
    onChildAdded?: () => void;
```

The `products` prop stays — `BreakPackDialog` and the `products` pass-through from `page.tsx` still use it.

- [ ] **Step 4: Verify nothing references the deleted modules**
Run: `npx rg -n "quick-add-child|reassign-parent|QuickAddChild|ReassignParent|reassignParent|addChildProduct|addChildDialogOpen|onChildAdded" app lib tests src`
Expected: no matches. (The `REASSIGN_PARENT_A` / `REASSIGN_CHILD` style fixture constants in `tests/e2e/fixtures/test-data.ts` and `tests/e2e/setup/prepare-test-db.ts` do not match this pattern — `reassign-parent` is hyphenated and `ReassignParent` is CamelCase, neither of which hits `REASSIGN_PARENT_A`. If the run does surface those two files, confirm they are fixture constants only and leave them.)

- [ ] **Step 5: Run the type checker and lint**
Run: `npx tsc --noEmit && npm run lint`
Expected: both clean — this is the first point in the plan where the whole tree should compile.

- [ ] **Step 6: Commit**
```bash
git add -A "app/(app)/products" tests/e2e
git commit -m "refactor(products): delete Quick Add Child and Reassign Parent dialogs

Both created real parent/child products rows, the model the Plan 1 migration
already collapsed into product_selling_units. Removes the dialogs, their hook,
their triggers on the products list and the View Product footer, and the two
E2E specs whose subject UI this plan deletes (product-reassign, price-levels).
The REASSIGN_* test fixtures stay — the products-list tree UI that still reads
them is a later plan.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: E2E coverage for the Selling Units tab

**Files:**
- Modify: `tests/e2e/fixtures/test-data.ts:69-83` (add a Wholesale price level and two new product fixtures)
- Modify: `tests/e2e/setup/prepare-test-db.ts:21-52, 150-168, 355-370` (import + seed, and move the `price_levels` inserts above the product inserts)
- Create: `tests/e2e/selling-units.spec.ts`
- Modify: `tests/e2e/add-product.spec.ts:41-46`
- Modify: `tests/e2e/add-product-approval.spec.ts:49-53`
- Modify: `tests/e2e/product-type-service.spec.ts:67, 77-78`

**Interfaces:**
- Consumes: `seedSession` / `DEFAULT_ADMIN` from `./helpers/auth`; `testQuery` from `./helpers/db`; fixtures from `./fixtures/test-data`.
- Produces: three new Playwright tests — add with 2 units, edit an already-migrated product's units, remove a unit — plus three repaired existing specs.

- [ ] **Step 1: Add fixtures to `tests/e2e/fixtures/test-data.ts`**

Replace the price-level + NEW_PRODUCT block (lines 73-83):

```ts
/** Default retail price level — ang form mo-sync sa main price gikan sa default level. */
export const TEST_PRICE_LEVEL = { id: 'retail-level', name: 'Retail', isDefault: true };

/** Bag-ong product nga himuon sa Add Product UI test. */
export const NEW_PRODUCT = {
  name: 'QA Test Widget',
  sku: 'QA-WIDGET-001',
  description: 'A widget created by the e2e Add Product test.',
  price: 99.5,
  stock: 42,
};
```

with:

```ts
/** Default retail price level — ang form mo-sync sa main price gikan sa default level. */
export const TEST_PRICE_LEVEL = { id: 'retail-level', name: 'Retail', isDefault: true };

/**
 * Second (non-default) price level. The Selling Units tab renders ONE COLUMN
 * PER ACTIVE PRICE LEVEL, so a second level is what makes the multi-column
 * behaviour testable at all. percentage_adjustment 90 = a 10% discount off
 * retail's 100 — a value distinguishable from retail's in an assertion.
 */
export const TEST_PRICE_LEVEL_WHOLESALE = {
  id: 'wholesale-level',
  name: 'Wholesale',
  isDefault: false,
};

/** Bag-ong product nga himuon sa Add Product UI test. */
export const NEW_PRODUCT = {
  name: 'QA Test Widget',
  sku: 'QA-WIDGET-001',
  description: 'A widget created by the e2e Add Product test.',
  price: 99.5,
  stock: 42,
  unitName: 'Piece',
  barcode: '5000000000014',
  cost: 80,
  retail: 100,
};
```

Then append this block at the **end of the file** (after `SO_SERVICE`, line 394) — it must sit below the `FullProduct` type declaration on line 90 so the type reference resolves:

```ts
/** Bag-ong product nga himuon sa Selling Units add test (2 units). */
export const SELLING_UNITS_NEW_PRODUCT = {
  name: 'QA Selling Units Widget',
  sku: 'QA-SU-NEW-001',
  description: 'Product created by the e2e Selling Units add test.',
  baseUnitName: 'Piece',
  baseBarcode: '5100000000011',
  baseCost: 8,
  baseRetail: 12,
  baseWholesale: 11,
  boxUnitName: 'Box',
  boxQtyBase: 12,
  boxBarcode: '5100000000028',
  boxCost: 96,
  boxRetail: 140,
  boxWholesale: 130,
  stock: 24,
};

/**
 * A product that already carries selling units, standing in for one that came
 * out of the Plan 1 data migration. Its rows are seeded directly into
 * product_selling_units / product_selling_unit_prices, NOT through the UI, so
 * the edit test genuinely exercises loading stored rows into the tab.
 */
export const SELLING_UNITS_PRODUCT: FullProduct & {
  barcode: string;
  cost: number;
  units: {
    id: string;
    unitName: string;
    qtyBase: number;
    barcode: string;
    cost: number;
    price: number;
    isBase: boolean;
    sortOrder: number;
    retail: number;
    wholesale: number;
  }[];
} = {
  id: 'test-selling-units-1',
  name: 'Selling Units Sardines',
  sku: 'SU-EDIT-001',
  description: 'Product nga naa nay selling units para sa edit test.',
  price: 25,
  stock: 60,
  brand: TEST_BRAND.name,
  category: TEST_CATEGORY.name,
  unitOfMeasure: TEST_UNIT.name,
  barcode: '5200000000014',
  cost: 18,
  units: [
    {
      id: 'psu-su-edit-base',
      unitName: 'Piece',
      qtyBase: 1,
      barcode: '5200000000014',
      cost: 18,
      price: 25,
      isBase: true,
      sortOrder: 0,
      retail: 25,
      wholesale: 23,
    },
    {
      id: 'psu-su-edit-case',
      unitName: 'Case',
      qtyBase: 24,
      barcode: '5200000000021',
      cost: 420,
      price: 580,
      isBase: false,
      sortOrder: 1,
      retail: 580,
      wholesale: 540,
    },
  ],
};
```

- [ ] **Step 2: Move the `price_levels` inserts above the product inserts in `tests/e2e/setup/prepare-test-db.ts`, and add the Wholesale level**

`product_selling_unit_prices` has `fk_psup_price_level` referencing `price_levels`, so the levels must exist before Step 3 seeds selling-unit prices. Today the `price_levels` insert is the **last** thing `seedFixtures()` does (lines 362-366), well after the products.

Delete this block from its current position (lines 362-366):

```ts
  await conn.query(
    `INSERT INTO price_levels (id, name, calculation_base, is_default, percentage_adjustment)
     VALUES (?, ?, 'retail', 1, 100.00)`,
    [TEST_PRICE_LEVEL.id, TEST_PRICE_LEVEL.name],
  );
```

and insert this in its place, immediately **above** the `// --- products ---` comment at line 152:

```ts
  // --- price levels (kinahanglan una sa products: ang
  // product_selling_unit_prices naay FK padulong sa price_levels) ---
  await conn.query(
    `INSERT INTO price_levels (id, name, calculation_base, is_default, percentage_adjustment)
     VALUES (?, ?, 'retail', 1, 100.00)`,
    [TEST_PRICE_LEVEL.id, TEST_PRICE_LEVEL.name],
  );
  await conn.query(
    `INSERT INTO price_levels (id, name, calculation_base, is_default, percentage_adjustment)
     VALUES (?, ?, 'retail', 0, 90.00)`,
    [TEST_PRICE_LEVEL_WHOLESALE.id, TEST_PRICE_LEVEL_WHOLESALE.name],
  );
```

Add to the import list, after `TEST_PRICE_LEVEL,` (line 32):

```ts
  TEST_PRICE_LEVEL_WHOLESALE,
  SELLING_UNITS_PRODUCT,
```

- [ ] **Step 3: Seed the pre-migrated selling-units product in `prepare-test-db.ts`**

Insert immediately after the `EDITABLE_PRODUCT / DELETABLE_PRODUCT / INVENTORY_PRODUCT` loop, which ends at line 168:

```ts
  // --- product nga naa nay selling units (stand-in para sa Plan 1 migrated data) ---
  await conn.query(
    `INSERT INTO products (id, name, price, cost, stock, sku, barcode, description, brand, category, unit_of_measure, availability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available')`,
    [
      SELLING_UNITS_PRODUCT.id, SELLING_UNITS_PRODUCT.name, SELLING_UNITS_PRODUCT.price,
      SELLING_UNITS_PRODUCT.cost, SELLING_UNITS_PRODUCT.stock, SELLING_UNITS_PRODUCT.sku,
      SELLING_UNITS_PRODUCT.barcode, SELLING_UNITS_PRODUCT.description,
      SELLING_UNITS_PRODUCT.brand, SELLING_UNITS_PRODUCT.category, SELLING_UNITS_PRODUCT.unitOfMeasure,
    ],
  );
  for (const u of SELLING_UNITS_PRODUCT.units) {
    await conn.query(
      `INSERT INTO product_selling_units
         (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.id, SELLING_UNITS_PRODUCT.id, u.unitName, u.qtyBase, u.barcode, u.cost, u.price, u.isBase ? 1 : 0, u.sortOrder],
    );
    await conn.query(
      `INSERT INTO product_selling_unit_prices (selling_unit_id, price_level_id, price, min_quantity)
       VALUES (?, ?, ?, 0), (?, ?, ?, 0)`,
      [u.id, TEST_PRICE_LEVEL.id, u.retail, u.id, TEST_PRICE_LEVEL_WHOLESALE.id, u.wholesale],
    );
  }
```

Also update the summary log at the end of `seedFixtures()` (line 371) from `1 brand/category/unit/price-level` to `1 brand/category/unit, 2 price levels`.

- [ ] **Step 4: Repair `tests/e2e/add-product.spec.ts`**

The Inventory tab no longer carries a Unit of Measure select or a Cost input for a standard product; both moved to the base selling-unit row. Replace lines 41-49:

```ts
    // --- Inventory ---
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await selectOption(page, dialog, /unit of measure/i, `${TEST_UNIT.name} (${TEST_UNIT.abbreviation})`);
    await dialog.getByLabel('Initial Stock').fill(String(NEW_PRODUCT.stock));
    // Cost → mo-trigger sa auto-markup price calculation (price > 0 kinahanglan para sa submit).
    await dialog.getByLabel(/^cost/i).fill('80');

    // --- Submit ---
    await dialog.getByRole('button', { name: 'Add Product' }).click();
```

with:

```ts
    // --- Inventory ---
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await dialog.getByLabel('Initial Stock').fill(String(NEW_PRODUCT.stock));

    // --- Selling Units (base row owns unit name, barcode, cost ug price) ---
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    const base = dialog.locator('div.bg-card.border.rounded-md.shadow-sm').nth(0);
    await base.getByLabel('Unit Name').fill(NEW_PRODUCT.unitName);
    await base.getByLabel('Barcode').fill(NEW_PRODUCT.barcode);
    await base.getByLabel('Cost (₱)').fill(String(NEW_PRODUCT.cost));
    await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(NEW_PRODUCT.retail));

    // --- Submit ---
    await dialog.getByRole('button', { name: 'Add Product' }).click();
```

`TEST_UNIT` is no longer referenced, and `TEST_PRICE_LEVEL` now is, so change the import on line 3 from:

```ts
import { TEST_BRAND, TEST_CATEGORY, TEST_UNIT, NEW_PRODUCT } from './fixtures/test-data';
```

to:

```ts
import { TEST_BRAND, TEST_CATEGORY, TEST_PRICE_LEVEL, NEW_PRODUCT } from './fixtures/test-data';
```

The final DB assertion at line 62 (`expect(Number(match.price)).toBeGreaterThan(0)`) still holds — the base row's Retail price is synced onto `products.price`. Tighten it while you are here:

```ts
    expect(Number(match.price)).toBe(NEW_PRODUCT.retail);
```

Also update the file's header comment (lines 5-9), which claims the form auto-calculates price from cost × markup:

```ts
/**
 * Add Product (DB-backed) — i-drive ang tinuod nga Add Product dialog batok sa
 * alon_pos_test. Nagsalig sa seeded brand/category/price-level. Ang presyo, cost,
 * barcode ug unit name gikan sa base selling-unit row sa Selling Units tab —
 * wala nay standalone nga price/cost/barcode/unit input sa ubang tabs.
 */
```

- [ ] **Step 5: Repair `tests/e2e/add-product-approval.spec.ts`**

Same two fields moved. Replace lines 49-53 of `fillAndSubmitProduct`:

```ts
  // --- Inventory ---
  await dialog.getByRole('tab', { name: 'Inventory' }).click();
  await selectOption(page, dialog, /unit of measure/i, `${TEST_UNIT.name} (${TEST_UNIT.abbreviation})`);
  await dialog.getByLabel('Initial Stock').fill(String(opts.stock));
  await dialog.getByLabel(/^cost/i).fill(opts.cost);
```

with:

```ts
  // --- Inventory ---
  await dialog.getByRole('tab', { name: 'Inventory' }).click();
  await dialog.getByLabel('Initial Stock').fill(String(opts.stock));

  // --- Selling Units (base row owns unit name, barcode, cost ug price) ---
  await dialog.getByRole('tab', { name: 'Selling Units' }).click();
  const base = dialog.locator('div.bg-card.border.rounded-md.shadow-sm').nth(0);
  await base.getByLabel('Unit Name').fill(TEST_UNIT.name);
  // Unique kada tawag — product_selling_units.barcode kay globally UNIQUE.
  await base.getByLabel('Barcode').fill(String(Date.now()).slice(-8));
  await base.getByLabel('Cost (₱)').fill(opts.cost);
  await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(Number(opts.cost) * 1.25));
```

Add `TEST_PRICE_LEVEL` to the import on line 4:

```ts
import { TEST_BRAND, TEST_CATEGORY, TEST_UNIT, TEST_PRICE_LEVEL } from './fixtures/test-data';
```

`selectOption` is still used for Brand and Category on lines 46-47, so that helper stays.

- [ ] **Step 6: Repair `tests/e2e/product-type-service.spec.ts`**

Only the tab's name changed; the service branch of the Inventory tab is untouched, so the `Base Unit of Measure` and `Cost (required)` assertions on lines 92-93 stay exactly as they are. Change the test name on line 67 from:

```ts
  test('creating a service hides all stock fields and the Conversion tab', async ({ page }) => {
```

to:

```ts
  test('creating a service hides all stock fields and the Selling Units tab', async ({ page }) => {
```

and lines 77-78 from:

```ts
    // 5 tabs → 4: Conversion disappears from both the tablist and its panel.
    await expect(dialog.getByRole('tab', { name: 'Conversion' })).toBeHidden();
```

to:

```ts
    // 4 tabs → 3: Selling Units disappears from both the tablist and its panel —
    // a service has no sellable units, so its unit and cost stay on Inventory.
    await expect(dialog.getByRole('tab', { name: 'Selling Units' })).toBeHidden();
```

- [ ] **Step 7: Create `tests/e2e/selling-units.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import {
  TEST_BRAND,
  TEST_CATEGORY,
  TEST_PRICE_LEVEL,
  TEST_PRICE_LEVEL_WHOLESALE,
  SELLING_UNITS_NEW_PRODUCT,
  SELLING_UNITS_PRODUCT,
} from './fixtures/test-data';

/**
 * Selling Units tab (DB-backed) — i-drive ang tinuod nga Add/Edit Product dialog
 * batok sa alon_pos_test, dayon i-assert direkta sa product_selling_units ug
 * product_selling_unit_prices. Ang /api/products DILI mo-expose sa selling units
 * sa paagi nga sayon i-assert, mao nga testQuery ang gigamit.
 */

/** I-pili ang usa ka Radix Select option pinaagi sa label sa sulod sa dialog. */
async function selectOption(page: Page, dialog: Locator, label: string | RegExp, optionName: string) {
  // exact:true aron dili mag-match ang "Category" sa "Subcategory" (substring).
  await dialog.getByLabel(label, { exact: true }).click();
  // Ang Radix Select content mo-portal sa body — page-level ang option locator.
  await page.getByRole('option', { name: optionName }).click();
}

/** Ang mga row sa Selling Units tab — usa ka bordered card kada unit. */
function unitRows(dialog: Locator): Locator {
  return dialog.locator('div.bg-card.border.rounded-md.shadow-sm');
}

/** I-search ang product pinaagi sa SKU dayon ablihi ang iyang row action menu. */
async function openRowMenu(page: Page, sku: string, name: string) {
  await page.getByPlaceholder('Search products...').fill(sku);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open menu' }).click();
}

test.describe('Selling Units — add', () => {
  test('admin makahimo ug product nga naa'y 2 selling units ug prices kada level', async ({ page }) => {
    const P = SELLING_UNITS_NEW_PRODUCT;

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await page.getByRole('button', { name: 'Add Product' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add New Product')).toBeVisible();

    // --- Basic Info ---
    await dialog.getByLabel('Product Name').fill(P.name);
    await dialog.getByLabel('SKU').fill(P.sku);
    await dialog.getByLabel('Description', { exact: true }).fill(P.description);
    await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
    await selectOption(page, dialog, 'Category', TEST_CATEGORY.name);

    // --- Inventory (initial stock ra — ang unit of measure naa na sa base row) ---
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await dialog.getByLabel('Initial Stock').fill(String(P.stock));

    // --- Selling Units ---
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();

    // Row 1 is the base unit: Qty Base is static text "1", no remove button.
    const base = unitRows(dialog).nth(0);
    await expect(base.getByRole('button', { name: 'Remove selling unit' })).toHaveCount(0);
    await base.getByLabel('Unit Name').fill(P.baseUnitName);
    await base.getByLabel('Barcode').fill(P.baseBarcode);
    await base.getByLabel('Cost (₱)').fill(String(P.baseCost));
    await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(P.baseRetail));
    await base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`).fill(String(P.baseWholesale));

    // Row 2 — a new row starts with an EMPTY Qty Base (no silent default).
    await dialog.getByRole('button', { name: 'Add Selling Unit' }).click();
    const box = unitRows(dialog).nth(1);
    await expect(box.getByLabel('Equals how many base units?')).toHaveValue('');
    await box.getByLabel('Unit Name').fill(P.boxUnitName);
    await box.getByLabel('Equals how many base units?').fill(String(P.boxQtyBase));
    await box.getByLabel('Barcode').fill(P.boxBarcode);
    await box.getByLabel('Cost (₱)').fill(String(P.boxCost));
    await box.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(P.boxRetail));
    await box.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`).fill(String(P.boxWholesale));

    // --- Submit ---
    await dialog.getByRole('button', { name: 'Add Product' }).click();
    await expect(dialog).toBeHidden();

    // --- Assert both units landed, with both levels' prices ---
    await expect(async () => {
      const units = await testQuery(
        `SELECT psu.unit_name, psu.qty_base, psu.barcode, psu.cost, psu.is_base
         FROM product_selling_units psu
         JOIN products p ON p.id = psu.product_id
         WHERE p.sku = ?
         ORDER BY psu.sort_order`,
        [P.sku],
      );
      expect(units).toHaveLength(2);
      expect(units[0].unit_name).toBe(P.baseUnitName);
      expect(Number(units[0].qty_base)).toBe(1);
      expect(units[0].is_base).toBe(1);
      expect(units[0].barcode).toBe(P.baseBarcode);
      expect(units[1].unit_name).toBe(P.boxUnitName);
      expect(Number(units[1].qty_base)).toBe(P.boxQtyBase);
      expect(units[1].is_base).toBe(0);
      expect(units[1].barcode).toBe(P.boxBarcode);
    }).toPass({ timeout: 15_000 });

    const prices = await testQuery(
      `SELECT psu.unit_name, psup.price_level_id, psup.price
       FROM product_selling_unit_prices psup
       JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
       JOIN products p ON p.id = psu.product_id
       WHERE p.sku = ?
       ORDER BY psu.sort_order, psup.price_level_id`,
      [P.sku],
    );
    const priceOf = (unitName: string, levelId: string) =>
      Number(prices.find((r: any) => r.unit_name === unitName && r.price_level_id === levelId)?.price);
    expect(priceOf(P.baseUnitName, TEST_PRICE_LEVEL.id)).toBe(P.baseRetail);
    expect(priceOf(P.baseUnitName, TEST_PRICE_LEVEL_WHOLESALE.id)).toBe(P.baseWholesale);
    expect(priceOf(P.boxUnitName, TEST_PRICE_LEVEL.id)).toBe(P.boxRetail);
    expect(priceOf(P.boxUnitName, TEST_PRICE_LEVEL_WHOLESALE.id)).toBe(P.boxWholesale);

    // The base row mirrors onto the product's scalar columns.
    const [product] = await testQuery(
      'SELECT price, cost, barcode, unit_of_measure FROM products WHERE sku = ?',
      [P.sku],
    );
    expect(Number(product.price)).toBe(P.baseRetail);
    expect(Number(product.cost)).toBe(P.baseCost);
    expect(product.barcode).toBe(P.baseBarcode);
    expect(product.unit_of_measure).toBe(P.baseUnitName);
  });
});

test.describe('Selling Units — edit', () => {
  test('stored units mo-load sa tab, ug ang pag-usab mo-persist', async ({ page }) => {
    const P = SELLING_UNITS_PRODUCT;
    const newCaseRetail = 599;

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await openRowMenu(page, P.sku, P.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Product')).toBeVisible();
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();

    // Both stored units load, base first, with their stored values.
    await expect(unitRows(dialog)).toHaveCount(2);
    const base = unitRows(dialog).nth(0);
    const caseRow = unitRows(dialog).nth(1);
    await expect(base.getByLabel('Unit Name')).toHaveValue(P.units[0].unitName);
    await expect(base.getByLabel('Barcode')).toHaveValue(P.units[0].barcode);
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`)).toHaveValue(String(P.units[0].retail));
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`)).toHaveValue(String(P.units[0].wholesale));
    await expect(caseRow.getByLabel('Unit Name')).toHaveValue(P.units[1].unitName);
    await expect(caseRow.getByLabel('Equals how many base units?')).toHaveValue(String(P.units[1].qtyBase));

    // Change the Case row's Retail price and save.
    await caseRow.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(newCaseRetail));
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();

    await expect(async () => {
      const rows = await testQuery(
        `SELECT psu.unit_name, psup.price
         FROM product_selling_unit_prices psup
         JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
         WHERE psu.product_id = ? AND psup.price_level_id = ?`,
        [P.id, TEST_PRICE_LEVEL.id],
      );
      const caseRetail = Number(rows.find((r: any) => r.unit_name === P.units[1].unitName)?.price);
      expect(caseRetail).toBe(newCaseRetail);
    }).toPass({ timeout: 15_000 });

    // The kept rows keep their original ids, so FK references survive the edit.
    const kept = await testQuery(
      'SELECT id FROM product_selling_units WHERE product_id = ? ORDER BY sort_order',
      [P.id],
    );
    expect(kept.map((r: any) => r.id)).toEqual([P.units[0].id, P.units[1].id]);

    // The base row still mirrors onto the product's scalar columns.
    const [product] = await testQuery(
      'SELECT price, barcode, unit_of_measure FROM products WHERE id = ?',
      [P.id],
    );
    expect(Number(product.price)).toBe(P.units[0].retail);
    expect(product.barcode).toBe(P.units[0].barcode);
    expect(product.unit_of_measure).toBe(P.units[0].unitName);
  });

  test('pag-remove sa usa ka non-base selling unit mo-papas sa iyang row', async ({ page }) => {
    const P = SELLING_UNITS_PRODUCT;

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await openRowMenu(page, P.sku, P.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    await expect(unitRows(dialog)).toHaveCount(2);

    // The base row has no remove button — only the non-base row can go.
    await expect(unitRows(dialog).nth(0).getByRole('button', { name: 'Remove selling unit' })).toHaveCount(0);
    await unitRows(dialog).nth(1).getByRole('button', { name: 'Remove selling unit' }).click();
    await expect(unitRows(dialog)).toHaveCount(1);

    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();

    await expect(async () => {
      const rows = await testQuery(
        'SELECT id, unit_name, is_base FROM product_selling_units WHERE product_id = ?',
        [P.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].unit_name).toBe(P.units[0].unitName);
      expect(rows[0].is_base).toBe(1);
    }).toPass({ timeout: 15_000 });

    // The removed unit's prices went with it via fk_psup_selling_unit CASCADE.
    const orphanPrices = await testQuery(
      'SELECT * FROM product_selling_unit_prices WHERE selling_unit_id = ?',
      [P.units[1].id],
    );
    expect(orphanPrices).toHaveLength(0);
  });
});
```

> The two edit tests run in file order against the same seeded product, and Playwright is configured `workers: 1` / `fullyParallel: false`, so the remove test sees the state the previous test left (the Case row's Retail is 599 by then). That is why the remove test asserts on the base row surviving rather than on a specific price.

- [ ] **Step 8: Re-seed the test database with the new fixtures**
Run: `npm run test:e2e:db`
Expected: `✅ Test DB prepared` with no FK errors. A `fk_psup_price_level` failure means the `price_levels` inserts were not moved above the product inserts (Step 2).

- [ ] **Step 9: Run the new spec**
Run: `npx playwright test tests/e2e/selling-units.spec.ts`
Expected: 3 passed.

- [ ] **Step 10: Run the three repaired specs**
Run: `npx playwright test tests/e2e/add-product.spec.ts tests/e2e/add-product-approval.spec.ts tests/e2e/product-type-service.spec.ts`
Expected: all pass.

- [ ] **Step 11: Run the full E2E suite**
Run: `npm run test:e2e`
Expected: no failures attributable to this plan. Any new failure should name a product-form locator — trace it back to a field this plan moved, and fix the spec the same way Steps 4–6 did, rather than reinstating the removed control.

- [ ] **Step 12: Commit**
```bash
git add tests/e2e
git commit -m "test(e2e): cover the Selling Units tab add/edit/remove flows

Seeds a second (Wholesale) price level so the tab's one-column-per-level layout
is testable, plus a product with pre-seeded product_selling_units rows standing
in for Plan 1 migrated data. Asserts directly against product_selling_units /
product_selling_unit_prices and the base-row sync onto products. Repairs
add-product, add-product-approval and product-type-service, which drove the
cost / unit-of-measure inputs and the Conversion tab this plan removed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

### Spec coverage

Every section of `docs/superpowers/specs/2026-09-24-selling-units-add-edit-product-ui-design.md` maps to at least one task step.

| Spec section | Where it is implemented |
|---|---|
| **Decisions** — Quick Add Child / Reassign Parent / Auto-create switch removed entirely, in this plan | Task 5 Steps 1-3 (dialogs + triggers); Task 2 Steps 1, 6, 8 (the `autoCreateChild` switch, its state, and the `__childProduct` submit branch); Task 4 Steps 6, 10, 11 (server side) |
| **Decisions** — duplicate barcode/cost fields removed from their current tabs | Task 2 Steps 14-15 (Add: Basic Info barcode, Inventory cost); Task 3 Steps 13-14 (Edit, mirrored). Extended by ruling to the "Base Unit of Measure" select — Task 2 Step 15, Task 3 Step 14 |
| **Decisions** — side-by-side price-level columns | Task 2 Step 11 and Task 3 Step 10 (the header row plus a `priceLevels.map` column per row) |
| **Decisions** — `prices` as a plain object keyed by level id | Task 1 Step 1 (`prices: z.record(...)`); consumed as `sellingUnits.${i}.prices.${levelId}.price` throughout Tasks 2-4 |
| **Decisions** — no silent default for `qty_base` | Task 1 Step 1 (no `.default()` on `qtyBase`); Task 2 Step 3 / Task 3 Step 4 (`addSellingUnit` passes `undefined`); Task 6 Step 7 asserts the new row renders empty |
| **Decisions** — tab hidden for `itemType === 'service'` | Task 2 Steps 11, 13 (`if (itemType === 'service') return null` + the `itemType === 'standard' &&` tab guards); Task 3 Steps 10, 12 (`product?.type !== 'service'`); Task 6 Step 6 asserts it |
| **Decisions** — two separate tab files, no shared component | Task 2 Step 11 and Task 3 Step 10 create two full files; only the Zod row shape is shared (Task 1 Step 2 imports it) |
| **Data model** — the `sellingUnits` Zod field | Task 1 Steps 1-2, verbatim from the spec's snippet plus the `id` field |
| **Data model** — superRefine: one `isBase`, its `qtyBase === 1`, barcodes unique within the array | Task 1 Step 1 (`sellingUnitsSuperRefine`), wired in both schemas |
| **Tab UI** — header row of price-level columns rendered once | Task 2 Step 11 / Task 3 Step 10 (the `hidden md:flex` header block) |
| **Tab UI** — base row: editable name/barcode/cost/prices, `Qty Base` as static `1`, no remove button | Task 2 Step 11 / Task 3 Step 10 (`isBaseRow` branch) |
| **Tab UI** — extra rows: `Qty Base` input labelled "Equals how many base units?" with helper text naming the base unit, plus a remove button | Task 2 Step 11 / Task 3 Step 10 (the `FormDescription` interpolates `baseUnitName`) |
| **Tab UI** — "Add Selling Unit" appends a blank non-base row | Task 2 Step 3 / Task 3 Step 4 (`addSellingUnit`), wired to the button in the tab files |
| **Tab UI** — barcode "Generate" reusing the Basic Info logic | Task 2 Step 3 / Task 3 Step 4 (`generateUnitBarcode`, the same EAN-8 routine lifted from the deleted `generateBarcode`) |
| **Server actions** — `addProduct` steps 1-5 | Task 4 Steps 3-6 |
| **Server actions** — `updateProduct` steps 1-4 | Task 4 Steps 7-9 |
| **Server actions** — `updateProduct` step 5, Family Stock Sync untouched | Task 4 Step 8 (explicit note; no edit to `actions.ts:671-687`) |
| **Server actions** — `reassignParent` deleted | Task 4 Step 10 |
| **Removed entirely** — the four tab files | Task 2 Step 12, Task 3 Step 11 |
| **Removed entirely** — `productType` / `parentId` / `conversionFactor` / `conversionFactors` / `priceLevels` from both schemas and hooks | Task 1 Steps 1-2; Task 2 Steps 1-6, 10; Task 3 Steps 4-9 |
| **Removed entirely** — standalone Barcode / Cost / the `productType === 'child'` branch | Task 2 Steps 14-15; Task 3 Steps 13-14 |
| **Removed entirely** — `quick-add-child/`, `reassign-parent/` | Task 5 Step 1 |
| **Removed entirely** — the Auto-create Child Unit switch and its state | Task 2 Steps 1, 6, 8 (state, reset effect, submit branch); the switch markup dies with `conversion-tab.tsx` in Step 12 |
| **Testing** — schema-level rules (zero units, two/zero `isBase`, duplicate barcodes, base `qtyBase !== 1`) | Task 1 Step 1 encodes all four. **Gap:** no unit-test step exercises them in isolation — see "Known gaps" below |
| **Testing (E2E)** — add a product with 2 units × 2 levels, reopen and verify | Task 6 Step 7, first test |
| **Testing (E2E)** — edit an already-migrated product; units load; save updates both tables and mirrors onto `products` | Task 6 Step 7, second test (against the `SELLING_UNITS_PRODUCT` fixture seeded directly into the DB in Step 3) |
| **Testing (E2E)** — remove a non-base unit; its row is gone | Task 6 Step 7, third test (asserts the cascade on `product_selling_unit_prices`) |
| **Testing (E2E)** — the two dialogs are gone, no dead links or console errors | Task 5 Steps 4-5 (`rg` sweep + `tsc`/`lint`), and Task 6 Step 11 (full suite) |

**Known gaps, stated rather than hidden:**

1. The spec's "Schema-level (unit, no DB)" test bullet has no dedicated step. This repo has `npm run test:unit` (`tests/unit/run.ts`), so a unit test is possible — it was left out because every one of the four rules is covered end-to-end by Task 6's E2E assertions plus the DB's own `UNIQUE` keys, and adding a first-ever schema unit test for these two files is scope this plan's spec does not ask for. If the reviewer wants it, it belongs as a Task 1 step (the schema is importable with no DB).
2. Task 6 Step 7's third test depends on the second test having run first (shared fixture, `workers: 1`). That coupling is called out in the note under the step, and matches how `product-edit-delete.spec.ts` already works in this repo.
3. `appendSellingUnit` (the raw `useFieldArray` append) is returned by both controllers but consumed by neither tab file — only the `addSellingUnit` wrapper is. It is exposed deliberately so a future caller does not have to re-derive the blank-row shape, but it is unused surface today and a reviewer may prefer it dropped from both return objects.

### Placeholder scan

Run against the finished document:

```
grep -nE "TBD|TODO|FIXME|XXX|similar to Task|same as Task|as above|<placeholder>" <plan>
```

**Result: zero matches.** Verified additionally by inspection:

- Every code block is complete and copy-pasteable. The two `selling-units-tab.tsx` files (Task 2 Step 11, Task 3 Step 10) are written out in full twice rather than the second saying "same as the Add form" — they genuinely differ (context hook, `calculatePriceLevelPrice` import path, `product?.type` vs `itemType` visibility check, `product` in the destructure).
- Every "Current:" block is real code copied from the file at the cited line range, not paraphrase.
- Every `Run:` step names a command that exists: `npx tsc --noEmit`, `npm run lint`, `npm run test:e2e:db`, `npm run test:e2e`, `npx playwright test <file>`, `npx rg`, and `git rm` / `git add` / `git commit`. `lint`, `test:e2e`, `test:e2e:db` are all in `package.json`.
- Every task ends in a commit step with a real message, and no step says "and so on" or trails off.
- The one place the plan intentionally defers to the implementer is Task 5 Step 2's `Copy,` import removal and Task 6 Step 11's "any new failure should name a product-form locator" — both give an explicit command to run and an explicit decision rule, not a vague instruction.

### Type-consistency check

Names introduced in Task 1 and consumed downstream, cross-checked by occurrence count across the document:

| Identifier | Produced in | Consumed in | Consistent |
|---|---|---|---|
| `sellingUnitSchema` | Task 1 Step 1 | Task 1 Step 2 (imported by the Edit schema) | yes |
| `sellingUnitsSuperRefine` | Task 1 Step 1 | Task 1 Step 2 (both `productSchema`s call it) | yes |
| `SellingUnitValues` | Task 1 Step 1 | Task 1 Step 2 re-export; Task 2 Steps 3, 6, 7, 8, 10; Task 3 Steps 4, 7, 8, 9 | yes — imported from `./product-schema` in both hooks |
| `sellingUnits` (field name) | Task 1 Steps 1-2 | Tasks 2, 3 (form paths), Task 4 (`ProductFormData.sellingUnits`), Task 3 Step 1 (`Product.sellingUnits`), Task 3 Step 2 (`getProducts` output) | yes — same spelling at all six layers |
| `sellingUnitFields` | Task 2 Step 3 / Task 3 Step 4 | Task 2 Step 10 / Task 3 Step 9 (return), both tab files (`sellingUnitFields.map`) | yes |
| `addSellingUnit` | Task 2 Step 3 / Task 3 Step 4 | both return objects, both tab files (`onClick={addSellingUnit}`) | yes |
| `removeSellingUnit` | Task 2 Step 3 / Task 3 Step 4 | both return objects, both tab files (`removeSellingUnit(index)`) | yes |
| `baseUnitIndex` | Task 2 Step 3 / Task 3 Step 4 | both return objects, both tab files (`index === baseUnitIndex`, `units[baseUnitIndex]`) | yes |
| `baseUnitName` | Task 2 Step 3 / Task 3 Step 4 | both return objects, both tab files (helper text) | yes |
| `generateUnitBarcode` | Task 2 Step 3 / Task 3 Step 4 | both return objects, both tab files (`generateUnitBarcode(index)`) | yes |
| `tabErrors.sellingUnits` | Task 2 Step 4 / Task 3 Step 5 | Task 2 Step 13 / Task 3 Step 12 (the tab trigger's error dot) | yes — the old `tabErrors.priceLevels` / `tabErrors.conversion` keys are removed in the same steps that stop reading them |
| `toFormSellingUnits` | Task 3 Step 3 | Task 3 Steps 4 and 6 (`defaultValues` and the reset effect) | yes |
| `writeSellingUnits` | Task 4 Step 2 | Task 4 Steps 5 and 8 | yes |
| `resolveDefaultPriceLevelId` | Task 4 Step 2 | Task 4 Steps 5 and 8 | yes |
| `appendSellingUnit` | Task 2 Step 3 / Task 3 Step 4 | both return objects — **not** used by either tab file | exposed but unconsumed; see Known gaps #3 |

Removed names, verified not to survive into any "New:" block (each remaining occurrence sits in a "Current:" block showing code being deleted): `conversionFactorFields`, `appendConversionFactor`, `removeConversionFactor`, `priceLevelFields`, `appendPriceLevel`, `removePriceLevel`, `selectedUnitOfMeasure`, `autoCreateChild`, `setAutoCreateChild`, `productType`, `setProductType`, `generateBarcode`, `__childProduct`, `reassignParent`, `addChildProduct`, `seedDefaultPriceLevel`.

Two cross-task shape contracts worth re-checking during implementation:

- **`prices` entry shape.** The form holds `{ price, minQuantity? }` per level id (Task 1). `writeSellingUnits` reads `entry.price` / `entry.minQuantity` (Task 4 Step 2). `getProducts` emits the same shape (Task 3 Step 2). The tab files write to `...prices.${level.id}.price` only — `minQuantity` has no input, so it is always `undefined` from these forms and lands as `NULL`. That matches `product_selling_unit_prices.min_quantity DEFAULT NULL` and the spec's YAGNI note on min-quantity tiering.
- **`id` round-trip.** `getProducts` emits `id` → `toFormSellingUnits` carries it → `sellingUnitSchema.id` is `.optional()` → `writeSellingUnits` reuses it or mints `psu_${uuidv4()}`. Task 6 Step 7's second test asserts the round-trip by comparing the post-save ids against the seeded ones. A break anywhere in that chain would silently orphan `sale_items.selling_unit_id`, which is why it has an explicit assertion rather than being left implicit.
