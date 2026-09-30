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
 * `unitOfMeasure` is NOT required at the field level (same as the Add form):
 * for a standard product the base row's Unit Name is mirrored onto it in
 * saveChanges, which runs only AFTER this schema validates — so a legacy
 * product whose stored unit_of_measure is empty must not fail here first. The
 * base row's own `unitName` (required by sellingUnitSchema) is what enforces a
 * unit for a standard product. A service has no selling units and edits this
 * field directly on the Inventory tab, so the superRefine below still
 * requires it there.
 */
export const productSchema = z
  .object({
    name: z.string().min(1, 'Product name is required'),
    brand: z.string().min(1, 'Brand is required'),
    department: z.string().optional(),
    // Legacy products carry a SKU; products created after SKU was retired have NULL.
    sku: z.string().nullish(),
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
    unitOfMeasure: z.string().default(''),
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
    // No selling units = a service (the hook omits them only for a service):
    // its Inventory-tab unit is the only source, so it is still required.
    if (values.sellingUnits === undefined && !values.unitOfMeasure?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unitOfMeasure'],
        message: 'Unit of measure is required',
      });
    }
  });

export type ProductFormValues = z.infer<typeof productSchema>;
