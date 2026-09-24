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
