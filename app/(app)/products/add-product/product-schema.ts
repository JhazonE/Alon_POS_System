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
    minQuantity: z.coerce.number().int('Min quantity must be a whole number').min(0).optional(),
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
 * One supplier-mapping row. Field names match what `addProduct` in actions.ts
 * reads positionally off `formData.supplierMappings[]` — do not rename these
 * to match the DB column names or the `SupplierProductMapping` read-side type
 * in lib/types.ts, both of which use different names.
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
  sku: z.string().optional(),
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
  supplierMappings: z.array(supplierMappingSchema).optional(),
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
  supplierMappings: z.undefined(),
});

export const productSchema = z
  .discriminatedUnion('itemType', [standardProductSchema, serviceProductSchema])
  .superRefine((values, ctx) => {
    if (values.itemType !== 'standard') return;
    sellingUnitsSuperRefine(values.sellingUnits, ctx);
    supplierMappingsSuperRefine(values.supplierMappings, ctx);
  });

export type ProductFormValues = z.infer<typeof productSchema>;
export type StandardProductValues = z.infer<typeof standardProductSchema>;
export type ServiceProductValues = z.infer<typeof serviceProductSchema>;
