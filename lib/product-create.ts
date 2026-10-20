import { query, withTransaction } from '@/lib/mysql';
import {
  assertWarehouseInBranch,
  BranchResolutionError,
  type BranchScope,
} from '@/lib/branch-context';
import { generateBatchId } from '@/lib/batch-utils';
import { checkApprovalRequired, submitToApprovalQueue } from '@/lib/approvals';
import { v4 as uuidv4 } from 'uuid';
import {
  SellingUnitConflictError,
  writeSellingUnits,
  writeBaseUnitPriceLevels,
  resolveDefaultPriceLevelId,
} from '@/lib/product-selling-unit-writes';
import type { ProductFormData } from '@/app/(app)/products/actions';

/** Converts a branch refusal into the action's own failure shape; null for any other error. */
function branchRefusal(error: unknown): { success: false; message: string } | null {
  if (error instanceof BranchResolutionError) {
    return { success: false, message: error.message };
  }
  return null;
}

/**
 * Assert a warehouse a write is about to put a product into (or already has it
 * in). A product with no warehouse belongs to no branch, so a branch-scoped
 * caller cannot claim it: NULL / '' is refused. Head office may leave it NULL.
 */
export async function assertWarehouseForWrite(
  warehouseId: string | null | undefined,
  scope: BranchScope,
): Promise<void> {
  if (scope.scope === 'all') return;
  if (!warehouseId) {
    throw new BranchResolutionError(
      'A product must stay in a warehouse of your branch; it cannot be left without one.',
    );
  }
  await assertWarehouseInBranch(warehouseId, scope);
}

/**
 * Branch-guarded product creation - the TRUSTED entry point.
 *
 * This module deliberately has NO 'use server' directive: it is not an HTTP
 * endpoint, so `scope` can only come from server code that resolved it itself.
 * Two trusted callers: the public `addProduct` action, which passes the signed
 * session's scope, and the approval processor, which passes a scope derived
 * from the queue row's DB-stored created_by (the product belongs to the branch
 * that REQUESTED it, not the approver's). Never re-export this from a
 * 'use server' file: every parameter of a server action is attacker-controlled,
 * and `{ scope: 'all' }` would bypass the guard.
 *
 * `scope === null` means "no trustworthy identity" and the product is created
 * exactly as before the guard existed (never fail closed). `userId` is
 * attribution only and is NEVER used to derive a branch.
 * isInternalFinalization is caller-settable, so it is not a trust boundary and
 * does not exempt the check. A refusal returns `{ success: false, message }`;
 * it never throws.
 */
export async function addProductWithScope(
  formData: ProductFormData,
  userId: string,
  isInternalFinalization: boolean,
  scope: BranchScope | null,
) {
  try {
    // Branch guard (null = fall back to unguarded). Services get their
    // warehouse assigned below, so they are asserted after that.
    if (scope && formData.itemType !== 'service') {
      await assertWarehouseForWrite(formData.warehouse || null, scope);
    }

    // --- Check if approval is required ---
    if (!isInternalFinalization) {
      const isApprovalRequired = await checkApprovalRequired('PRODUCT_CREATE');
      if (isApprovalRequired) {
        const items = [{
          productId: 'NEW',
          productName: formData.name,
          sku: formData.sku || '',
          barcode: formData.barcode || '',
          price: formData.price,
          cost: formData.cost || 0,
          quantity: formData.stock || 0,
          unit: formData.unitOfMeasure,
        }];
        // Strip the non-serializable File; keep the base64 `image` string.
        const { imageFile, ...serializable } = formData;
        const { queueId, pendingApproval } = await submitToApprovalQueue(
          'PRODUCT_CREATE',
          { ...serializable, items },
          userId,
        );
        if (pendingApproval) {
          return {
            success: true,
            pendingApproval: true,
            queueId,
            message: 'Product creation submitted for approval.',
          };
        }
        // pendingApproval === false (all steps auto-skipped) → fall through to immediate insert.
      }
    }

    // Products carry no SKU of their own, so the id cannot derive from one.
    // Same shape the duplicate-product flows below already use.
    const productId = `product_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const isServiceProduct = formData.itemType === 'service';

    // Services are performed at the store, not stocked in a warehouse the user
    // picks — so the field is hidden on the form and the main warehouse is
    // assigned here instead. Without this they would land with a NULL
    // warehouse and show a blank column in the product list.
    let resolvedWarehouseId = formData.warehouse || null;
    if (isServiceProduct) {
      // A branch-scoped caller gets a warehouse of its OWN branch; the global
      // "main" one would put the service in someone else's branch.
      const [mainWarehouse]: any = await query(
        `SELECT id FROM warehouses
         WHERE is_active = 1${scope?.scope === 'single' ? ' AND branch_id = ?' : ''}
         ORDER BY is_main DESC, (id = 'wh_main') DESC, created_at ASC
         LIMIT 1`,
        scope?.scope === 'single' ? [scope.branchId] : [],
      );
      resolvedWarehouseId = mainWarehouse?.id ?? null;
    }
    if (scope) {
      await assertWarehouseForWrite(resolvedWarehouseId, scope);
    }

    await withTransaction(async (connection) => {
      const productData = {
        id: productId,
        name: formData.name,
        description: formData.description,
        additional_description: formData.additionalDescription || null,
        category: formData.category,
        brand: formData.brand,
        // Department groups stocked goods for markup and reporting; it does not
        // apply to services, so it is never written for one.
        department: isServiceProduct ? null : (formData.department || null),
        subcategory: formData.subcategory || null,
        supplier_id: formData.supplier || null,
        warehouse_id: resolvedWarehouseId,
        stock: formData.stock || 0,
        reorder_point: formData.reorderPoint || formData.supplierMappings?.find(m => m.isPrimary)?.rop || 0,
        avg_daily_sales: 0,
        price: formData.price,
        // `|| null` would turn a deliberate 0 into NULL. That matters for
        // services: cost is required at creation precisely so cost_at_sale is
        // never NULL, and 0 is a legitimate answer for a pure-margin service.
        cost: formData.cost ?? null,
        sku: formData.sku || null,
        barcode: formData.barcode || null,
        image_url: formData.image || null,
        image_hint: formData.name.toLowerCase().replace(/\s+/g, '-'),
        unit_of_measure: formData.unitOfMeasure,
        expense_account: formData.expenseAccount || null,
        income_account: formData.incomeAccount || null,
        vat_status: formData.vatStatus || 'YES (Subject to 12% VAT)',
        availability: formData.availability || 'Available',
        earns_points: formData.earnsPoints !== false,
        is_perishable: formData.isPerishable ? 1 : 0,
        type: formData.itemType === 'service' ? 'service' : 'standard',
      };

      const sql = `
        INSERT INTO products (
          id, name, description, additional_description, category, brand, department,
          subcategory, supplier_id, warehouse_id, stock, reorder_point, avg_daily_sales, price, cost,
          sku, barcode, image_url, image_hint,
          unit_of_measure, income_account, expense_account,
          vat_status, availability, earns_points, shelf_location_id, is_perishable, type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const legacyShelfId = formData.shelfLocationIds && formData.shelfLocationIds.length > 0 ? formData.shelfLocationIds[0] : null;

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

      await connection.query(sql, values_array);

      // --- BATCH COSTING: Auto-create batch for initial stock ---
      // Services never get a batch: they have no stock, and an empty batch
      // would make them appear in FIFO deduction and valuation reports.
      if (productData.type === 'standard' && formData.stock && formData.stock > 0) {
        try {
          const batchId = generateBatchId();
          await connection.query(`
            INSERT INTO inventory_batches
              (id, product_id, received_date, quantity_in, quantity_remaining, unit_cost, selling_price, source_type, notes)
            VALUES (?, ?, CURDATE(), ?, ?, ?, ?, 'adjustment', 'Initial Stock')
          `, [
            batchId, 
            productId, 
            formData.stock, 
            formData.stock, 
            formData.cost || 0, 
            formData.price || 0
          ]);
        } catch (batchErr) {
          console.warn('[BatchCosting] Could not create batch for initial product stock:', batchErr);
        }
      }

      if (formData.shelfLocationIds && formData.shelfLocationIds.length > 0) {
        for (let i = 0; i < formData.shelfLocationIds.length; i++) {
          const shelfId = formData.shelfLocationIds[i];
          const qty = i === 0 ? (formData.stock || 0) : 0;
          await connection.query('INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)', [productId, shelfId, qty]);
        }
      }

      if (formData.sellingUnits && formData.sellingUnits.length > 0) {
        const defaultLevelId = await resolveDefaultPriceLevelId(connection);
        const { baseUnit, basePrice: resolvedBasePrice } =
          await writeSellingUnits(connection, productId, formData.sellingUnits, defaultLevelId);

        // Sync the scalar columns from the base row — one source of truth.
        if (baseUnit) {
          await writeBaseUnitPriceLevels(connection, productId, baseUnit);

          const basePrice = resolvedBasePrice ?? Number(productData.price ?? 0);
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

      if (formData.supplierMappings && formData.supplierMappings.length > 0) {
        for (const mapping of formData.supplierMappings) {
          // supplier_product_mapping.id is VARCHAR(50) — a productId-prefixed id
          // can overflow it. A short prefix + uuid (already imported in this
          // file) is both well under the limit and collision-safe across
          // concurrent requests, unlike a Date.now()-based id — this project
          // runs one server per terminal against a shared DB.
          const mappingId = `spm_${uuidv4()}`;
          await connection.query('INSERT INTO supplier_product_mapping (id, product_id, supplier_id, supplier_sku, supplier_lead_time, supplier_specific_rop, supplier_cost, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [mappingId, productId, mapping.supplierId, mapping.supplierSku || null, mapping.leadTime, mapping.rop, mapping.cost || null, mapping.isPrimary ? 1 : 0]);
        }
      }
    });

    return { success: true, message: `${formData.name} has been added to the inventory.`, productId };
  } catch (error: any) {
    const refused = branchRefusal(error);
    if (refused) return refused;
    console.error('Error saving product:', error);
    if (error instanceof SellingUnitConflictError) {
      return { success: false, message: error.message };
    }
    if (error.code === 'ER_DUP_ENTRY' && error.message?.includes('unique_selling_unit_barcode')) {
      return { success: false, message: "That barcode is already used by another product's selling unit." };
    }
    if (error.code === 'ER_DUP_ENTRY' && error.message?.includes('unique_product_unit_name')) {
      return { success: false, message: 'Two selling units of this product have the same unit name.' };
    }
    return { success: false, message: 'There was an error saving the product.' };
  }
}
