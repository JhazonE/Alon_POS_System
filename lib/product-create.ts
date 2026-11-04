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
import { recordStockMovement } from '@/lib/stock-movements';
import {
  normalizeLegacyWarehouseInput,
  type WarehouseEntry,
} from '@/app/(app)/products/add-product/product-schema';
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
 * Server-side re-validation of the `warehouses` collection.
 *
 * `productSchema` is only the CLIENT form resolver: nothing server-side parses
 * with it, and every argument of `addProductWithScope` arrives off the wire (a
 * server action's parameters, or a replayed approval payload). So the rules the
 * schema states are enforced AGAIN here, before any id reaches a query.
 *
 * `warehouseId` is never coerced. lib/mysql.ts uses pool.query, which escapes
 * an OBJECT parameter as `key` = value, so `WHERE id = ?` fed `{ foo: 0 }`
 * becomes a match-many predicate that could touch every row in every branch.
 * The same reason `assertProductInScope` and friends runtime-check their ids.
 *
 * Returns the entries with the primary resolved: the entry flagged
 * `isPrimary`, or the FIRST entry when none is flagged (the schema accepts
 * "none flagged" and does not default it, so the default lives here).
 * Throws BranchResolutionError on any violation, which the caller turns into
 * `{ success: false, message }` without writing anything.
 */
function validateWarehouseEntries(entries: WarehouseEntry[]): {
  entries: WarehouseEntry[];
  primaryIndex: number;
} {
  if (!Array.isArray(entries)) {
    throw new BranchResolutionError('The warehouse selection is malformed.');
  }

  const seen = new Set<string>();
  const primaryIndexes: number[] = [];

  entries.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new BranchResolutionError(`Warehouse selection ${i + 1} is malformed.`);
    }
    const { warehouseId, stock } = entry;
    if (typeof warehouseId !== 'string' || warehouseId.trim() === '') {
      throw new BranchResolutionError(
        `Warehouse selection ${i + 1} has no valid warehouse id.`,
      );
    }
    if (seen.has(warehouseId)) {
      throw new BranchResolutionError(
        `Warehouse ${warehouseId} is selected more than once for this product.`,
      );
    }
    seen.add(warehouseId);
    if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0) {
      throw new BranchResolutionError(
        `The opening stock for warehouse ${warehouseId} must be a non-negative whole number.`,
      );
    }
    if (entry.isPrimary) primaryIndexes.push(i);
  });

  if (primaryIndexes.length > 1) {
    throw new BranchResolutionError('Only one warehouse can be marked primary.');
  }

  // Ruling C: default the primary to the first entry when none is flagged.
  return { entries, primaryIndex: primaryIndexes[0] ?? 0 };
}

/**
 * Warehouse id -> name, for the approval queue summary: the approvals UI
 * renders this row to a human, who cannot read a warehouse id.
 *
 * Read-only and called only with ids `validateWarehouseEntries` already proved
 * to be non-empty strings. A name that cannot be resolved is simply absent and
 * the caller falls back to the id rather than failing the submission.
 */
async function resolveWarehouseNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const rows = (await query(
    `SELECT id, name FROM warehouses WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  )) as Array<{ id: string; name: string | null }>;
  for (const row of rows) {
    if (row.name) names.set(row.id, row.name);
  }
  return names;
}

/**
 * Every warehouse of a submission must belong to ONE branch.
 *
 * `assertWarehouseForWrite` returns early for head office (`scope === 'all'`),
 * so without this a head-office caller could create a single product holding
 * stock in two BIR establishments at once. A branch caller never could: each
 * entry is already asserted against their own branch.
 *
 * Enforced HERE rather than only in the picker because a server action's
 * arguments arrive off the wire — a replayed approval item, or a direct call,
 * never passes through the UI. The branch is read from the warehouse rows
 * themselves, not from anything the caller supplied.
 *
 * A warehouse with a NULL `branch_id` belongs to no branch; it may only be
 * combined with other branchless warehouses, never mixed with a branch's, for
 * the same reason two branches may not be mixed. An id that matches no row is
 * left to `assertWarehouseInBranch` (head office does not run that, so an
 * unknown id simply contributes no branch here and fails later on the insert's
 * own foreign key).
 */
async function assertEntriesShareOneBranch(entries: WarehouseEntry[]): Promise<void> {
  if (entries.length < 2) return;
  const ids = entries.map((e) => e.warehouseId);
  const rows = (await query(
    `SELECT id, name, branch_id FROM warehouses WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids,
  )) as Array<{ id: string; name: string | null; branch_id: string | null }>;
  if (rows.length === 0) return;

  const byBranch = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.branch_id ?? '__none__';
    const names = byBranch.get(key) ?? [];
    names.push(row.name ?? row.id);
    byBranch.set(key, names);
  }
  if (byBranch.size < 2) return;

  const branchIds = [...byBranch.keys()].filter((k) => k !== '__none__');
  const branchNames = new Map<string, string>();
  if (branchIds.length > 0) {
    const branchRows = (await query(
      `SELECT id, name FROM branches WHERE id IN (${branchIds.map(() => '?').join(', ')})`,
      branchIds,
    )) as Array<{ id: string; name: string | null }>;
    for (const b of branchRows) if (b.name) branchNames.set(b.id, b.name);
  }
  // Name the branches AND their warehouses: "two branches" alone leaves the
  // user to work out which of their picks is the odd one.
  const detail = [...byBranch.entries()]
    .map(([key, names]) => {
      const label = key === '__none__' ? 'no branch' : branchNames.get(key) ?? key;
      return `${label} (${names.join(', ')})`;
    })
    .join(' and ');
  throw new BranchResolutionError(
    `A product belongs to one branch, but these warehouses span ${byBranch.size}: ${detail}. ` +
      'Create it separately for each branch.',
  );
}

/** The 22 descriptive and commercial scalar columns a non-primary row carries. */
const COPIED_SCALAR_COLUMNS = `name, description, additional_description, category, brand, department,
        subcategory, supplier_id, reorder_point, price, cost, barcode,
        image_url, image_hint, unit_of_measure, income_account, expense_account,
        vat_status, availability, earns_points, is_perishable, type`;

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
    const isService = formData.itemType === 'service';

    // Normalise the legacy single `warehouse`/`stock` pair into the collection
    // first, so a pre-multi-warehouse approval item replays correctly, then
    // re-validate every entry server-side (Ruling B) and resolve the primary
    // (Ruling C). A service carries no collection.
    const normalized = isService
      ? []
      : normalizeLegacyWarehouseInput({
          warehouses: formData.warehouses,
          warehouse: formData.warehouse,
          stock: formData.stock,
        });
    const { entries: warehouseEntries, primaryIndex } = validateWarehouseEntries(normalized);

    // Branch guard (null = fall back to unguarded). EVERY target is asserted
    // BEFORE the transaction opens: one refusal writes nothing at all - not a
    // product row, not a batch, not a stock_movements row. Same all-or-nothing
    // rule the repo's other batch writers follow. Services get their warehouse
    // assigned below, so they are asserted after that.
    if (scope && !isService) {
      if (warehouseEntries.length === 0) {
        // No warehouse at all: head office may leave it NULL, a branch caller
        // may not. assertWarehouseForWrite states exactly that.
        await assertWarehouseForWrite(null, scope);
      }
      for (const entry of warehouseEntries) {
        await assertWarehouseForWrite(entry.warehouseId, scope);
      }
    }
    // Runs for EVERY caller, guarded or not: the per-entry assert above is a
    // no-op for head office, and an unguarded (null-scope) call skips it
    // entirely, so this is the only thing standing between either of them and
    // a product spanning two BIR establishments.
    if (!isService) {
      await assertEntriesShareOneBranch(warehouseEntries);
    }

    // --- Check if approval is required ---
    if (!isInternalFinalization) {
      const isApprovalRequired = await checkApprovalRequired('PRODUCT_CREATE');
      if (isApprovalRequired) {
        // One items[] row per warehouse, each with that warehouse's own
        // quantity and its NAME - the approvals UI renders this to a human, who
        // cannot read a warehouse id. A product with no warehouse still gets one
        // row, so the queue summary is never empty.
        const warehouseNames = await resolveWarehouseNames(
          warehouseEntries.map((e) => e.warehouseId),
        );
        const baseItem = {
          productId: 'NEW',
          productName: formData.name,
          barcode: formData.barcode || '',
          price: formData.price,
          cost: formData.cost || 0,
          unit: formData.unitOfMeasure,
        };
        const items = warehouseEntries.length > 0
          ? warehouseEntries.map((entry) => ({
              ...baseItem,
              warehouseId: entry.warehouseId,
              warehouseName: warehouseNames.get(entry.warehouseId) ?? entry.warehouseId,
              quantity: entry.stock,
            }))
          : [{ ...baseItem, warehouseName: '—', quantity: formData.stock || 0 }];
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
    const isServiceProduct = isService;

    // The primary entry owns `products.warehouse_id`, the shelf rows and the
    // selling units. With an empty collection there is no primary: the row is
    // created with a NULL warehouse (the head-office case).
    const primaryEntry = warehouseEntries[primaryIndex];
    const secondaryEntries = warehouseEntries.filter((_, i) => i !== primaryIndex);

    /**
     * Ruling A: the stock that lands on the primary product row.
     *
     * With a warehouse, it is that warehouse's own opening stock. With NO
     * warehouse at all it is the legacy scalar `stock`: the pre-multi-warehouse
     * code wrote `stock: formData.stock || 0` onto the row independently of any
     * warehouse and opened a batch for it, so a legacy `{ stock: 50 }` payload
     * created a NULL-warehouse product holding 50 units. Treating an empty
     * collection as "no stock" would silently lose that on an approval item
     * queued under the old shape and replayed after this change.
     */
    const primaryStock = primaryEntry ? primaryEntry.stock : (formData.stock || 0);

    // Services are performed at the store, not stocked in a warehouse the user
    // picks — so the field is hidden on the form and the main warehouse is
    // assigned here instead. Without this they would land with a NULL
    // warehouse and show a blank column in the product list.
    let resolvedWarehouseId = primaryEntry?.warehouseId ?? null;
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
        // A service has no stock; otherwise the primary entry's own opening
        // stock, or the legacy scalar when there is no warehouse (Ruling A).
        stock: isServiceProduct ? 0 : primaryStock,
        reorder_point: formData.reorderPoint || formData.supplierMappings?.find(m => m.isPrimary)?.rop || 0,
        avg_daily_sales: 0,
        price: formData.price,
        // `|| null` would turn a deliberate 0 into NULL. That matters for
        // services: cost is required at creation precisely so cost_at_sale is
        // never NULL, and 0 is a legitimate answer for a pure-margin service.
        cost: formData.cost ?? null,
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
          barcode, image_url, image_hint,
          unit_of_measure, income_account, expense_account,
          vat_status, availability, earns_points, shelf_location_id, is_perishable, type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const legacyShelfId = formData.shelfLocationIds && formData.shelfLocationIds.length > 0 ? formData.shelfLocationIds[0] : null;

      const values_array = [
        productData.id, productData.name, productData.description, productData.additional_description,
        productData.category, productData.brand, productData.department, productData.subcategory,
        productData.supplier_id, productData.warehouse_id, productData.stock, productData.reorder_point,
        productData.avg_daily_sales, productData.price, productData.cost,
        productData.barcode, productData.image_url, productData.image_hint, productData.unit_of_measure,
        productData.income_account,
        productData.expense_account, productData.vat_status, productData.availability, productData.earns_points,
        legacyShelfId, productData.is_perishable, productData.type
      ];

      await connection.query(sql, values_array);

      /**
       * One warehouse row's opening stock: its FIFO cost batch and its audit
       * movement, both on this connection so the rollback covers them.
       *
       * BEHAVIOUR CHANGE: the batch insert is FATAL. It used to be wrapped in a
       * try/catch that only console.warn'd, which could leave a product holding
       * stock that no batch backs — stock FIFO cannot deduct from, so the first
       * sale of it fails or costs nothing. A product with unbacked stock is
       * worse than no product, so a failure now rolls the whole create back.
       */
      const writeOpeningStock = async (rowId: string, stock: number) => {
        if (productData.type !== 'standard' || !stock || stock <= 0) return;
        const batchId = generateBatchId();
        await connection.query(`
          INSERT INTO inventory_batches
            (id, product_id, received_date, quantity_in, quantity_remaining, unit_cost, selling_price, source_type, notes)
          VALUES (?, ?, CURDATE(), ?, ?, ?, ?, 'adjustment', 'Initial Stock')
        `, [batchId, rowId, stock, stock, formData.cost || 0, formData.price || 0]);

        // `connection` is REQUIRED: without it the movement would be written on
        // its own pool connection and survive a rollback as an orphan audit row.
        await recordStockMovement({
          productId: rowId,
          productName: formData.name,
          movementType: 'adjustment',
          quantityChange: stock,
          previousStock: 0,
          newStock: stock,
          referenceId: rowId,
          referenceType: 'adjustment',
          notes: 'Initial Stock',
        }, connection);
      };

      // --- BATCH COSTING: opening stock for the primary row ---
      // Services never get a batch: they have no stock, and an empty batch
      // would make them appear in FIFO deduction and valuation reports.
      await writeOpeningStock(productId, productData.stock);

      if (formData.shelfLocationIds && formData.shelfLocationIds.length > 0) {
        for (let i = 0; i < formData.shelfLocationIds.length; i++) {
          const shelfId = formData.shelfLocationIds[i];
          // The shelves belong to the PRIMARY row, so the first one holds that
          // row's opening stock (a shelf is physical and in one warehouse).
          const qty = i === 0 ? productData.stock : 0;
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

      // --- The OTHER selected warehouses ---
      // One product row per remaining selected warehouse, each with its OWN
      // opening stock, batch and movement. Runs LAST and inside this
      // transaction, with no try/catch: a failure here must roll the primary
      // insert back, not leave a half-created product in some warehouses.
      // Every target was already asserted against `scope` BEFORE the
      // transaction opened. Services carry no collection, so they never get here.
      if (!isServiceProduct && secondaryEntries.length > 0) {
        // Read the primary back so the other rows pick up the scalar columns the
        // selling-unit sync above may have rewritten (price/cost/barcode/uom).
        const [primaryRows]: any = await connection.query(
          `SELECT ${COPIED_SCALAR_COLUMNS} FROM products WHERE id = ?`,
          [productId],
        );
        const primary = primaryRows[0];
        const [levelRows]: any = await connection.query(
          'SELECT price_level_id, price, min_quantity FROM product_price_levels WHERE product_id = ?',
          [productId],
        );

        // Deliberately NOT carried, each for its own reason:
        // avg_daily_sales (0, a new row has no sales history);
        // product_shelves / shelf_location_id (a shelf is physical and belongs
        //   to one warehouse);
        // product_selling_units (migration 115 puts a GLOBAL UNIQUE(barcode) on
        //   it and the column is NOT NULL, so a second copy cannot exist);
        // parent_id / conversion_factor (families: only root products);
        // supplier_product_mapping (neither TransferStockService nor
        //   family-sync copies it).
        // There is NO field sync between these rows, before or after creation.
        for (const entry of secondaryEntries) {
          const rowId = `product_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          await connection.query(
            `INSERT INTO products (
               id, name, description, additional_description, category, brand, department,
               subcategory, supplier_id, warehouse_id, stock, reorder_point, avg_daily_sales,
               price, cost, barcode, image_url, image_hint, unit_of_measure,
               income_account, expense_account, vat_status, availability, earns_points,
               is_perishable, type
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              rowId, primary.name, primary.description, primary.additional_description,
              primary.category, primary.brand, primary.department, primary.subcategory,
              primary.supplier_id, entry.warehouseId, entry.stock, primary.reorder_point,
              primary.price, primary.cost, primary.barcode, primary.image_url,
              primary.image_hint, primary.unit_of_measure, primary.income_account,
              primary.expense_account, primary.vat_status, primary.availability,
              primary.earns_points, primary.is_perishable, primary.type,
            ],
          );
          for (const pl of levelRows) {
            await connection.query(
              'INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, ?, ?)',
              [rowId, pl.price_level_id, pl.price, pl.min_quantity],
            );
          }
          // A zero-stock row gets a product row but NO batch and NO movement.
          await writeOpeningStock(rowId, entry.stock);
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
