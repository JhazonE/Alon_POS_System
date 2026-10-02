'use server';

import { query, withTransaction } from '@/lib/mysql';
import { generateBatchId } from '@/lib/batch-utils';
import { checkApprovalRequired, submitToApprovalQueue } from '@/lib/approvals';
import { PriceLevel, Category, Brand, Supplier, Warehouse, Department, UnitOfMeasure, ShelfLocation, Account, TaxRate } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { findUltimateRoot, deductFamilyStock, addFamilyStock } from '@/lib/family-sync';
import { syncBaseSellingUnit } from '@/lib/selling-unit-sync';
import { baseUnitPriceLevelRows } from '@/lib/base-unit-price-level-rows';


export type ProductFormData = {
  name: string;
  brand: string;
  sku?: string;
  barcode?: string;
  description: string;
  additionalDescription?: string;
  category: string;
  department?: string;
  subcategory?: string;
  supplier?: string;
  warehouse?: string;
  shelfLocationIds?: string[];
  image?: string;
  imageFile?: File;
  unitOfMeasure: string;
  stock?: number;
  reorderPoint: number;
  price: number;
  cost?: number;
  incomeAccount?: string;
  expenseAccount?: string;
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
  supplierMappings?: {
    supplierId: string;
    leadTime: number;
    rop: number;
    cost?: number;
    supplierSku?: string;
    isPrimary: boolean;
  }[];
  vatStatus?: string;
  availability?: string;
  earnsPoints?: boolean;
  isPerishable?: boolean;
  itemType?: 'standard' | 'service';
};

export type ProductFilters = {
  search?: string;
  brand?: string;
  category?: string;
  department?: string;
  supplier?: string;
  warehouse?: string;
  shelfLocation?: string;
  status?: 'in-stock' | 'low-stock' | 'out-of-stock' | 'all' | string;
};

export async function getProducts(limit?: number, offset?: number, filters?: ProductFilters) {
  try {
    let sql = `
      SELECT p.*, 
             s_legacy.name as legacy_supplier_name, 
             w.name as warehouse_name,
             (SELECT GROUP_CONCAT(sl.name) FROM product_shelves ps JOIN shelf_locations sl ON ps.shelf_id = sl.id WHERE ps.product_id = p.id) as shelf_location_names,
             (SELECT GROUP_CONCAT(ps.shelf_id) FROM product_shelves ps WHERE ps.product_id = p.id) as shelf_location_ids,
             (SELECT GROUP_CONCAT(CONCAT(ps.shelf_id, ':', ps.quantity)) FROM product_shelves ps WHERE ps.product_id = p.id) as shelf_id_quantities,
             spm.supplier_id as primary_supplier_id,
             spm.supplier_specific_rop as primary_supplier_rop,
             s_primary.name as primary_supplier_name,
             EXISTS (SELECT 1 FROM approval_queue aq WHERE (JSON_UNQUOTE(JSON_EXTRACT(aq.transaction_data, '$.productId')) = p.id OR JSON_UNQUOTE(JSON_EXTRACT(aq.transaction_data, '$.sourceProductId')) = p.id) AND aq.status = 'Pending') as has_pending_approval
      FROM products p
      LEFT JOIN suppliers s_legacy ON p.supplier_id = s_legacy.id
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
      LEFT JOIN supplier_product_mapping spm ON p.id = spm.product_id AND spm.is_primary = 1
      LEFT JOIN suppliers s_primary ON spm.supplier_id = s_primary.id
    `;

    const whereClauses: string[] = [];
    const params: any[] = [];

    const hasActiveFilters = filters && (
      (filters.brand && filters.brand !== 'all') ||
      (filters.category && filters.category !== 'all') ||
      (filters.department && filters.department !== 'all') ||
      (filters.supplier && filters.supplier !== 'all') ||
      (filters.warehouse && filters.warehouse !== 'all') ||
      (filters.shelfLocation && filters.shelfLocation !== 'all') ||
      (filters.status && filters.status !== 'all') ||
      filters.search
    );

    if (filters) {
      if (filters.search) {
        whereClauses.push(`(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)`);
        const searchParam = `%${filters.search}%`;
        params.push(searchParam, searchParam, searchParam);
      }
      if (filters.brand && filters.brand !== 'all') {
        whereClauses.push(`p.brand = ?`);
        params.push(filters.brand);
      }
      if (filters.category && filters.category !== 'all') {
        whereClauses.push(`p.category = ?`);
        params.push(filters.category);
      }
      if (filters.department && filters.department !== 'all') {
        whereClauses.push(`p.department = ?`);
        params.push(filters.department);
      }
      if (filters.supplier && filters.supplier !== 'all') {
        whereClauses.push(`(p.supplier_id = ? OR EXISTS (SELECT 1 FROM supplier_product_mapping spm_check WHERE spm_check.product_id = p.id AND spm_check.supplier_id = ?))`);
        params.push(filters.supplier, filters.supplier);
      }
      if (filters.warehouse && filters.warehouse !== 'all') {
        whereClauses.push(`p.warehouse_id = ?`);
        params.push(filters.warehouse);
      }
      if (filters.shelfLocation && filters.shelfLocation !== 'all') {
        whereClauses.push(`EXISTS (SELECT 1 FROM product_shelves ps_filter WHERE ps_filter.product_id = p.id AND ps_filter.shelf_id = ?)`);
        params.push(filters.shelfLocation);
      }
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'out-of-stock') {
          whereClauses.push(`p.stock <= 0`);
        } else if (filters.status === 'low-stock') {
          whereClauses.push(`p.stock > 0 AND (p.stock < p.reorder_point OR p.stock < (SELECT COALESCE(low_stock_threshold, 0) FROM pos_settings LIMIT 1))`);
        } else if (filters.status === 'in-stock') {
           whereClauses.push(`p.stock > 0 AND p.stock >= p.reorder_point AND p.stock >= (SELECT COALESCE(low_stock_threshold, 0) FROM pos_settings LIMIT 1)`);
        }
      }
    }

    if (!hasActiveFilters && limit !== undefined && offset !== undefined) {
      whereClauses.push(`p.parent_id IS NULL`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ` ORDER BY p.created_at DESC`;

    if (limit !== undefined && offset !== undefined) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);
    }

    const pagedProducts = await query(sql, params.length > 0 ? params : undefined);
    
    let products = pagedProducts;
    if (!hasActiveFilters && limit !== undefined && offset !== undefined && pagedProducts.length > 0) {
      const rootIds = pagedProducts.map((p: any) => p.id);
      
      try {
        const recursiveSql = `
          WITH RECURSIVE product_tree AS (
            SELECT p.*, 
                   s_legacy.name as legacy_supplier_name, 
                   w.name as warehouse_name,
                   (SELECT GROUP_CONCAT(sl.name) FROM product_shelves ps JOIN shelf_locations sl ON ps.shelf_id = sl.id WHERE ps.product_id = p.id) as shelf_location_names,
                   (SELECT GROUP_CONCAT(ps.shelf_id) FROM product_shelves ps WHERE ps.product_id = p.id) as shelf_location_ids,
                   (SELECT GROUP_CONCAT(CONCAT(ps.shelf_id, ':', ps.quantity)) FROM product_shelves ps WHERE ps.product_id = p.id) as shelf_id_quantities,
                   spm.supplier_id as primary_supplier_id,
                   spm.supplier_specific_rop as primary_supplier_rop,
                   s_primary.name as primary_supplier_name,
                   p.warehouse_id as inherited_warehouse_id,
                   p.department as inherited_department,
                   p.vat_status as inherited_vat_status,
                   EXISTS (SELECT 1 FROM approval_queue aq WHERE (JSON_UNQUOTE(JSON_EXTRACT(aq.transaction_data, '$.productId')) = p.id OR JSON_UNQUOTE(JSON_EXTRACT(aq.transaction_data, '$.sourceProductId')) = p.id) AND aq.status = 'Pending') as has_pending_approval
            FROM products p
            LEFT JOIN suppliers s_legacy ON p.supplier_id = s_legacy.id
            LEFT JOIN warehouses w ON p.warehouse_id = w.id
            LEFT JOIN supplier_product_mapping spm ON p.id = spm.product_id AND spm.is_primary = 1
            LEFT JOIN suppliers s_primary ON spm.supplier_id = s_primary.id
            WHERE p.id IN (?)
            
            UNION ALL
            
            SELECT p.*, 
                   COALESCE(s_legacy.name, pt.legacy_supplier_name) as legacy_supplier_name, 
                   COALESCE(w.name, pt.warehouse_name) as warehouse_name,
                   (SELECT GROUP_CONCAT(sl.name) FROM product_shelves ps JOIN shelf_locations sl ON ps.shelf_id = sl.id WHERE ps.product_id = p.id) as shelf_location_names,
                   (SELECT GROUP_CONCAT(ps.shelf_id) FROM product_shelves ps WHERE ps.product_id = p.id) as shelf_location_ids,
                   (SELECT GROUP_CONCAT(CONCAT(ps.shelf_id, ':', ps.quantity)) FROM product_shelves ps WHERE ps.product_id = p.id) as shelf_id_quantities,
                   COALESCE(spm.supplier_id, pt.primary_supplier_id) as primary_supplier_id,
                   COALESCE(spm.supplier_specific_rop, pt.primary_supplier_rop) as primary_supplier_rop,
                   COALESCE(s_primary.name, pt.primary_supplier_name) as primary_supplier_name,
                   COALESCE(p.warehouse_id, pt.inherited_warehouse_id) as inherited_warehouse_id,
                   COALESCE(p.department, pt.inherited_department) as inherited_department,
                   COALESCE(p.vat_status, pt.inherited_vat_status) as inherited_vat_status,
                   EXISTS (SELECT 1 FROM approval_queue aq WHERE (JSON_UNQUOTE(JSON_EXTRACT(aq.transaction_data, '$.productId')) = p.id OR JSON_UNQUOTE(JSON_EXTRACT(aq.transaction_data, '$.sourceProductId')) = p.id) AND aq.status = 'Pending') as has_pending_approval
            FROM products p
            INNER JOIN product_tree pt ON p.parent_id = pt.id
            LEFT JOIN suppliers s_legacy ON p.supplier_id = s_legacy.id
            LEFT JOIN warehouses w ON p.warehouse_id = w.id
            LEFT JOIN supplier_product_mapping spm ON p.id = spm.product_id AND spm.is_primary = 1
            LEFT JOIN suppliers s_primary ON spm.supplier_id = s_primary.id
          )
          SELECT * FROM product_tree ORDER BY created_at DESC
        `;
        products = await query(recursiveSql, [rootIds]);
      } catch (err) {
        console.warn('Recursive CTE failed, falling back to flat list. Error:', err);
        products = pagedProducts;
      }
    }

    const conversionFactorsSql = `SELECT * FROM conversion_factors ORDER BY product_id, created_at`;
    const allConversionFactors = await query(conversionFactorsSql);

    const cfMap = new Map();
    allConversionFactors.forEach((cf: any) => {
      if (!cfMap.has(cf.product_id)) {
        cfMap.set(cf.product_id, []);
      }
      cfMap.get(cf.product_id).push({
        unit: cf.unit,
        factor: cf.factor,
      });
    });
    
    const priceLevelsSql = `SELECT * FROM product_price_levels`;
    const allPriceLevels = await query(priceLevelsSql);
    
    const plMap = new Map();
    allPriceLevels.forEach((pl: any) => {
      if (!plMap.has(pl.product_id)) {
        plMap.set(pl.product_id, []);
      }
      plMap.get(pl.product_id).push({
        levelId: pl.price_level_id,
        price: parseFloat(pl.price),
        minQuantity: pl.min_quantity ? parseInt(pl.min_quantity) : 0
      });
    });

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

    const defaultPriceLevelSql = `SELECT id FROM price_levels WHERE is_default = 1 LIMIT 1`;
    const defaultPriceLevelResult = await query(defaultPriceLevelSql);
    const defaultLevelId = defaultPriceLevelResult.length > 0 ? defaultPriceLevelResult[0].id : 'retail-level';

    return products.map((product: any) => {
      const productPriceLevels = plMap.get(product.id) || [];
      const retailPriceOverrides = productPriceLevels
        .filter((pl: any) => pl.levelId === defaultLevelId)
        .sort((a: any, b: any) => (a.minQuantity || 0) - (b.minQuantity || 0));
      
      const effectivePrice = retailPriceOverrides.length > 0 
        ? retailPriceOverrides[0].price 
        : (parseFloat(product.price) || 0);

      return {
        ...product,
        department: product.inherited_department || product.department,
        shelfLocationId: product.shelf_location_ids ? product.shelf_location_ids.split(',')[0] : product.shelf_location_id,
        shelfLocationIds: product.shelf_location_ids ? product.shelf_location_ids.split(',') : (product.shelf_location_id ? [product.shelf_location_id] : []),
        shelfLocationName: product.shelf_location_names || product.shelf_location_name,
        shelfLocationNames: product.shelf_location_names ? product.shelf_location_names.split(',') : (product.shelf_location_name ? [product.shelf_location_name] : []),
        shelfQuantities: product.shelf_id_quantities ? Object.fromEntries(product.shelf_id_quantities.split(',').map((s: string) => {
          const [id, qty] = s.split(':');
          return [id, parseInt(qty) || 0];
        })) : {},
        additionalDescription: product.additional_description,
        reorderPoint: product.reorder_point,
        primarySupplierRop: product.primary_supplier_rop,
        avgDailySales: product.avg_daily_sales,
        price: effectivePrice,
        cost: product.cost ? parseFloat(product.cost) : undefined,
        imageUrl: product.image_url,
        imageHint: product.image_hint,
        unitOfMeasure: product.unit_of_measure,
        parentId: product.parent_id,
        conversionFactor: product.conversion_factor,
        conversionFactors: cfMap.get(product.id) || [],
        sellingUnits: suMap.get(product.id) || [],
        incomeAccount: product.income_account,
        expenseAccount: product.expense_account,
        supplier: product.primary_supplier_id || product.supplier_id,
        supplierName: product.primary_supplier_name || product.legacy_supplier_name,
        warehouse: product.inherited_warehouse_id || product.warehouse_id,
        warehouseId: product.inherited_warehouse_id || product.warehouse_id,
        warehouseName: product.warehouse_name,
        priceLevels: productPriceLevels,
        vatStatus: product.inherited_vat_status || product.vat_status,
        availability: product.availability,
        earns_points: product.earns_points === 1,
        expirationDate: product.expiration_date,
        isPerishable: Boolean(product.is_perishable),
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        hasPendingApproval: product.has_pending_approval === 1,
      };
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export async function getProductsCount(filters?: ProductFilters) {
  try {
    let sql = `
        SELECT COUNT(*) as count 
        FROM products p
        LEFT JOIN supplier_product_mapping spm ON p.id = spm.product_id AND spm.is_primary = 1
    `;
    
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (filters) {
       if (filters.search) {
        whereClauses.push(`(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)`);
        const searchParam = `%${filters.search}%`;
        params.push(searchParam, searchParam, searchParam);
      }
      if (filters.brand && filters.brand !== 'all') {
        whereClauses.push(`p.brand = ?`);
        params.push(filters.brand);
      }
      if (filters.category && filters.category !== 'all') {
        whereClauses.push(`p.category = ?`);
        params.push(filters.category);
      }
      if (filters.department && filters.department !== 'all') {
        whereClauses.push(`p.department = ?`);
        params.push(filters.department);
      }
      if (filters.supplier && filters.supplier !== 'all') {
        whereClauses.push(`(p.supplier_id = ? OR EXISTS (SELECT 1 FROM supplier_product_mapping spm_check WHERE spm_check.product_id = p.id AND spm_check.supplier_id = ?))`);
        params.push(filters.supplier, filters.supplier);
      }
      if (filters.warehouse && filters.warehouse !== 'all') {
        whereClauses.push(`p.warehouse_id = ?`);
        params.push(filters.warehouse);
      }
      if (filters.shelfLocation && filters.shelfLocation !== 'all') {
        whereClauses.push(`EXISTS (SELECT 1 FROM product_shelves ps_filter WHERE ps_filter.product_id = p.id AND ps_filter.shelf_id = ?)`);
        params.push(filters.shelfLocation);
      }
      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'out-of-stock') {
          whereClauses.push(`p.stock <= 0`);
        } else if (filters.status === 'low-stock') {
          whereClauses.push(`p.stock > 0 AND (p.stock < p.reorder_point OR p.stock < (SELECT COALESCE(low_stock_threshold, 0) FROM pos_settings LIMIT 1))`);
        } else if (filters.status === 'in-stock') {
           whereClauses.push(`p.stock > 0 AND p.stock >= p.reorder_point AND p.stock >= (SELECT COALESCE(low_stock_threshold, 0) FROM pos_settings LIMIT 1)`);
        }
      }
    }

    const hasActiveFilters = filters && (
      (filters.brand && filters.brand !== 'all') ||
      (filters.category && filters.category !== 'all') ||
      (filters.department && filters.department !== 'all') ||
      (filters.supplier && filters.supplier !== 'all') ||
      (filters.warehouse && filters.warehouse !== 'all') ||
      (filters.shelfLocation && filters.shelfLocation !== 'all') ||
      (filters.status && filters.status !== 'all') ||
      filters.search
    );

    if (!hasActiveFilters) {
      whereClauses.push(`p.parent_id IS NULL`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const result = await query(sql, params);
    return result[0].count;
  } catch (error) {
    console.error('Error fetching products count:', error);
    return 0;
  }
}

export async function getLowStockAlerts() {
  try {
    const settingsResult = await query('SELECT low_stock_threshold FROM pos_settings LIMIT 1');
    const globalThreshold = settingsResult.length > 0 ? settingsResult[0].low_stock_threshold : 10;

    // Services are excluded: they have no stock, so they would otherwise sit
    // permanently in the notification bell as a low-stock alert.
    const sql = `
      SELECT id, name, stock, reorder_point
      FROM products
      WHERE type = 'standard' AND (stock < reorder_point OR stock < ?)
    `;
    const products = await query(sql, [globalThreshold]);
    return products.map((p: any) => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      reorderPoint: Math.max(p.reorder_point || 0, globalThreshold)
    }));
  } catch (error) {
    console.error('Error fetching low stock alerts:', error);
    return [];
  }
}

/**
 * A selling-unit save that must be refused with a specific message rather
 * than the generic one: it rolls back the transaction like any other throw,
 * and updateProduct returns `message` to the user.
 */
class SellingUnitConflictError extends Error {}

/**
 * Writes one product's selling units and their per-price-level prices.
 *
 * Upsert, not delete-then-reinsert: a unit that carries an `id` is UPDATEd in
 * place (scoped to this product), and that UPDATE must match a row — an id
 * that is stale (removed by a concurrent edit) or belongs to another product
 * throws SellingUnitConflictError, rolling back the caller's transaction,
 * rather than silently dropping the unit. A unit with no `id` is INSERTed
 * under a freshly minted id. This is required, not stylistic — MySQL/
 * InnoDB does not defer foreign-key checks to transaction commit the way
 * Postgres can, so `DELETE FROM product_selling_units` immediately fires the
 * `ON DELETE SET NULL` FKs from sale_items / inventory_batches /
 * sales_invoice_items / pos_transaction_items / etc., and a later re-INSERT
 * of a row with the same id does NOT undo that: those historical references
 * stay NULL forever. Callers that want to remove units the user dropped must
 * delete only those specific rows themselves (by id) before calling this.
 *
 * Before the per-unit writes, kept rows (those with an `id`) are first
 * renamed to a unique `__tmp_<id>` placeholder for `unit_name`/`barcode`.
 * This avoids transiently tripping `unique_selling_unit_barcode` or
 * `unique_product_unit_name` when the submission swaps names/barcodes
 * between two kept units (e.g. renaming unit A to what used to be unit B's
 * name) — row-by-row UPDATEs in submission order could otherwise collide
 * mid-way through.
 *
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

  // Two-phase rename: blank out kept rows' unit_name/barcode to a unique
  // placeholder before writing real values below, so two kept units can
  // swap names/barcodes with each other without tripping the unique
  // constraints mid-update.
  for (const u of units) {
    if (!u.id) continue;
    await connection.query(
      'UPDATE product_selling_units SET unit_name = ?, barcode = ? WHERE id = ? AND product_id = ?',
      [`__tmp_${u.id}`, `__tmp_${u.id}`, u.id, productId],
    );
  }

  let basePrice: number | undefined;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const unitId = u.id || `psu_${uuidv4()}`;

    // product_selling_units.price is the unit's default-level price. Resolve
    // it from, in order: the submitted default-level entry; for a kept unit,
    // the price already stored on the row; any other submitted level; 0.
    //
    // The stored-price step matters: units written by the parent/child data
    // migration (120) have a real `price` but no product_selling_unit_prices
    // rows, and a form session that never renders the Selling Units tab
    // (Radix unmounts inactive tabs) submits an empty `prices` map for them.
    // Without this step such a save silently zeroed the unit's price.
    const defaultLevelPrice = defaultPriceLevelId ? validPrice(u.prices?.[defaultPriceLevelId]) : undefined;
    let storedPrice: number | undefined;
    if (u.id && defaultLevelPrice === undefined) {
      const [storedRows]: any = await connection.query(
        'SELECT price FROM product_selling_units WHERE id = ? AND product_id = ?',
        [u.id, productId],
      );
      const stored = Number(storedRows?.[0]?.price);
      if (Number.isFinite(stored) && stored > 0) storedPrice = stored;
    }
    const firstAnyPrice = Object.values(u.prices || {})
      .map(validPrice)
      .find((p) => p !== undefined);
    const resolvedPrice = defaultLevelPrice ?? storedPrice ?? firstAnyPrice;
    const unitPrice = resolvedPrice ?? 0;
    if (u === baseUnit) basePrice = resolvedPrice;

    if (u.id) {
      // Existing row — UPDATE in place. MySQL applies ON DELETE SET NULL
      // immediately when a referenced row is deleted, even inside a
      // transaction (InnoDB has no deferred constraint checking), so
      // sale_items / inventory_batches / sales_invoice_items / etc. FK
      // references to this row must never go through a delete+reinsert.
      const [updateResult]: any = await connection.query(
        `UPDATE product_selling_units
           SET unit_name = ?, qty_base = ?, barcode = ?, cost = ?, price = ?, is_base = ?, sort_order = ?
         WHERE id = ? AND product_id = ?`,
        [
          u.unitName,
          Number(u.qtyBase),
          u.barcode,
          u.cost == null ? null : Number(u.cost),
          unitPrice,
          u.isBase ? 1 : 0,
          i,
          u.id,
          productId,
        ],
      );
      // No match means the id is stale or not this product's. Fail loudly
      // (rolls back the whole save) instead of silently dropping the unit.
      // mysql2 reports matched rows here (CLIENT_FOUND_ROWS is on by
      // default), and the placeholder rename above guarantees a real change
      // anyway, so 0 can only mean "no such row for this product".
      if (!updateResult || updateResult.affectedRows === 0) {
        throw new SellingUnitConflictError(
          'One of this product\'s selling units was changed or removed by someone else. Reload the product and try again.',
        );
      }
    } else {
      // New row — nothing to preserve.
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
    }

    // Prices are always rewritten wholesale per unit (delete then reinsert).
    // This is safe even for a kept unit: nothing else references
    // product_selling_unit_prices rows individually — it has a composite
    // PK (selling_unit_id, price_level_id), no surrogate id, no dependents.
    // Scoped through product_selling_units to this product as defense in
    // depth, so a wrong unitId can never touch another product's prices.
    await connection.query(
      `DELETE psup FROM product_selling_unit_prices psup
         JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
        WHERE psup.selling_unit_id = ? AND psu.product_id = ?`,
      [unitId, productId],
    );
    for (const [levelId, entry] of Object.entries(u.prices || {})) {
      const price = validPrice(entry);
      if (price === undefined) continue;
      await connection.query(
        `INSERT INTO product_selling_unit_prices
           (selling_unit_id, price_level_id, price, min_quantity)
         VALUES (?, ?, ?, ?)`,
        [
          unitId,
          levelId,
          price,
          entry.minQuantity == null ? null : Number(entry.minQuantity),
        ],
      );
    }
  }

  // basePrice is undefined when nothing resolved it (no valid submitted price
  // and no stored price) — callers then fall back to the form's own price.
  return { baseUnit, basePrice };
}

/**
 * A submitted price entry's price as a finite number, or undefined when the
 * entry is absent or its field was left blank (the tab's inputs write
 * `undefined` for an empty field).
 */
function validPrice(entry: { price?: unknown } | null | undefined): number | undefined {
  if (entry == null || entry.price == null || entry.price === '') return undefined;
  const n = Number(entry.price);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Dual-write bridge: mirrors the BASE selling unit's per-level prices into the
 * legacy `product_price_levels` table, which POS checkout
 * (lib/pricing.ts calculateEffectivePrice, level-scoped resolution: active level,
 * then default level, then base price) and the products list (getProducts' effectivePrice) still read.
 * Without it a price entered in the Selling Units tab never reaches the POS,
 * and a stale row for the wrong level could incorrectly apply.
 *
 * Upserts on the table's real PRIMARY KEY (product_id, price_level_id), the
 * same way PO receiving and bulk price update do — a check filtered on
 * min_quantity can miss an existing tiered row and then collide on INSERT.
 * On conflict both `price` and `min_quantity` are written, so clearing a
 * minimum in the tab clears the stored tier. A level with no minimum stores 0,
 * which the POS reads as "no minimum".
 *
 * `removedLevelIds` are deleted: levels the caller established the user
 * explicitly removed (see updateProduct). Nothing else is ever deleted here —
 * a row for a level the tab never showed (e.g. a Wholesale override that
 * predates selling units) is left alone.
 */
async function writeBaseUnitPriceLevels(
  connection: any,
  productId: string,
  baseUnit: NonNullable<ProductFormData['sellingUnits']>[number],
  removedLevelIds: string[] = [],
) {
  for (const row of baseUnitPriceLevelRows(baseUnit.prices as any)) {
    await connection.query(
      `INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), min_quantity = VALUES(min_quantity)`,
      [productId, row.levelId, row.price, row.minQuantity],
    );
  }
  for (const levelId of removedLevelIds) {
    await connection.query(
      'DELETE FROM product_price_levels WHERE product_id = ? AND price_level_id = ?',
      [productId, levelId],
    );
  }
}

/** The default price level's id, or the first one, or null if none exist. */
async function resolveDefaultPriceLevelId(connection: any): Promise<string | null> {
  const [rows]: any = await connection.query(
    'SELECT id FROM price_levels ORDER BY is_default DESC, name ASC LIMIT 1',
  );
  return rows?.[0]?.id ?? null;
}

export async function addProduct(
  formData: ProductFormData,
  userId: string = 'system',
  isInternalFinalization: boolean = false,
) {
  try {
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
      const [mainWarehouse]: any = await query(
        `SELECT id FROM warehouses
         WHERE is_active = 1
         ORDER BY is_main DESC, (id = 'wh_main') DESC, created_at ASC
         LIMIT 1`,
      );
      resolvedWarehouseId = mainWarehouse?.id ?? null;
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

export async function updateProduct(id: string, formData: ProductFormData) {
  try {
    await withTransaction(async (connection) => {
      // Fetch existing product to preserve fields not in the form
      const [existingRows]: any = await connection.query('SELECT * FROM products WHERE id = ?', [id]);
      if (!existingRows || existingRows.length === 0) {
        throw new Error('Product not found');
      }
      const existing = existingRows[0];

      const productData = {
        name: formData.name ?? existing.name,
        description: formData.description ?? existing.description,
        additional_description: (formData.additionalDescription !== undefined ? formData.additionalDescription : existing.additional_description) || null,
        category: formData.category ?? existing.category,
        brand: formData.brand ?? existing.brand,
        department: (formData.department !== undefined ? formData.department : existing.department) || null,
        subcategory: (formData.subcategory !== undefined ? formData.subcategory : existing.subcategory) || null,
        supplier_id: (formData.supplier !== undefined ? formData.supplier : existing.supplier_id) || null,
        warehouse_id: (formData.warehouse !== undefined ? formData.warehouse : existing.warehouse_id) || null,
        stock: formData.stock !== undefined ? formData.stock : existing.stock,
        reorder_point: formData.reorderPoint !== undefined ? formData.reorderPoint : existing.reorder_point,
        price: formData.price !== undefined ? formData.price : existing.price,
        cost: (formData.cost !== undefined ? formData.cost : existing.cost) || null,
        // '' or null from the form (SKU-less products, or forms that no longer
        // collect a SKU) must not overwrite what is stored — and '' must never
        // be written (the (sku, warehouse_id) unique index treats '' as a value).
        sku: formData.sku || existing.sku || null,
        barcode: (formData.barcode !== undefined ? formData.barcode : existing.barcode) || null,
        image_url: (formData.image !== undefined ? formData.image : existing.image_url) || null,
        image_hint: formData.name ? formData.name.toLowerCase().replace(/\s+/g, '-') : existing.image_hint,
        unit_of_measure: formData.unitOfMeasure ?? existing.unit_of_measure,
        income_account: (formData.incomeAccount !== undefined ? formData.incomeAccount : existing.income_account) || null,
        expense_account: (formData.expenseAccount !== undefined ? formData.expenseAccount : existing.expense_account) || null,
        vat_status: formData.vatStatus ?? existing.vat_status,
        availability: formData.availability ?? existing.availability,
        earns_points: formData.earnsPoints !== undefined ? formData.earnsPoints : (existing.earns_points === 1),
        is_perishable: formData.isPerishable !== undefined ? (formData.isPerishable ? 1 : 0) : existing.is_perishable,
      };

      const sql = `
        UPDATE products SET
          name = ?, description = ?, additional_description = ?, category = ?, brand = ?,
          department = ?, subcategory = ?, supplier_id = ?, warehouse_id = ?, stock = ?,
          reorder_point = ?, price = ?, cost = ?, sku = ?, barcode = ?,
          image_url = ?, image_hint = ?, unit_of_measure = ?,
          income_account = ?, expense_account = ?, vat_status = ?,
          availability = ?, earns_points = ?, shelf_location_id = ?, is_perishable = ?
        WHERE id = ?
      `;

      const legacyShelfId = formData.shelfLocationIds && formData.shelfLocationIds.length > 0 ? formData.shelfLocationIds[0] : existing.shelf_location_id;

      // --- Family Stock Sync for manual stock edits ---
      if (productData.stock !== undefined) {
        const originalStock = Number(existing.stock || 0);
        const newStock = Number(productData.stock);
        const delta = newStock - originalStock;

        if (delta !== 0) {
          const { rootId, factorToRoot } = await findUltimateRoot(id, connection as any);
          const rootDelta = delta / factorToRoot;

          if (delta < 0) {
            await deductFamilyStock(rootId, Math.abs(rootDelta), `adj_edit_${Date.now()}`, 'adjustment', `Manual edit of ${existing.name}`, connection as any);
          } else {
            await addFamilyStock(rootId, rootDelta, `adj_edit_${Date.now()}`, 'adjustment', `Manual edit of ${existing.name}`, connection as any);
          }
        }
      }

      const values_array = [
        productData.name, productData.description, productData.additional_description,
        productData.category, productData.brand, productData.department, productData.subcategory,
        productData.supplier_id, productData.warehouse_id, productData.stock, productData.reorder_point,
        productData.price, productData.cost, productData.sku, productData.barcode,
        productData.image_url, productData.image_hint, productData.unit_of_measure,
        productData.income_account, productData.expense_account, productData.vat_status,
        productData.availability, productData.earns_points, legacyShelfId, productData.is_perishable, id
      ];

      await connection.query(sql, values_array);

      // Handle shelf assignments with quantity preservation
      const [currentShelves]: any = await connection.query('SELECT shelf_id, quantity FROM product_shelves WHERE product_id = ?', [id]);
      const currentQtyMap = new Map(currentShelves.map((s: any) => [s.shelf_id, s.quantity]));

      await connection.query('DELETE FROM product_shelves WHERE product_id = ?', [id]);
      if (formData.shelfLocationIds && formData.shelfLocationIds.length > 0) {
        for (let i = 0; i < formData.shelfLocationIds.length; i++) {
          const shelfId = formData.shelfLocationIds[i];
          let qty = currentQtyMap.get(shelfId) || 0;
          
          // If product was previously unassigned to any shelf, move all stock to the first assigned shelf
          if (currentShelves.length === 0 && i === 0) {
            qty = productData.stock || 0;
          }
          
          await connection.query('INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)', [id, shelfId, qty]);
        }
      }

      // Diff-aware: delete only the units the user removed (those whose id is
      // no longer in the submitted set), then upsert the rest via
      // writeSellingUnits. We deliberately do NOT delete-then-reinsert kept
      // units: MySQL/InnoDB fires ON DELETE SET NULL immediately (no deferred
      // constraint checking like Postgres), so a blanket DELETE would
      // permanently null out sale_items / inventory_batches /
      // sales_invoice_items / pos_transaction_items / etc. FK references to
      // every selling unit on every edit, even ones the user didn't touch.
      // Only a unit that's genuinely gone from the submission should lose
      // those references.
      //
      // `undefined` means "leave the selling-unit tables alone" — a service
      // edit, or any caller that does not manage units.
      if (formData.sellingUnits !== undefined) {
        const keptIds = formData.sellingUnits.filter((u) => u.id).map((u) => u.id!);
        if (keptIds.length > 0) {
          await connection.query(
            `DELETE FROM product_selling_units WHERE product_id = ? AND id NOT IN (${keptIds.map(() => '?').join(',')})`,
            [id, ...keptIds],
          );
        } else {
          // No submitted unit carries an id. For a product that already has
          // stored units this can only be a caller that never hydrated them
          // (e.g. toFormSellingUnits' synthesized fallback row) — a blanket
          // DELETE here would permanently null every sale_items /
          // inventory_batches / etc. reference to them. Refuse the save.
          // A product with no stored units yet (a real first save) is fine.
          const [countRows]: any = await connection.query(
            'SELECT COUNT(*) AS cnt FROM product_selling_units WHERE product_id = ?',
            [id],
          );
          if (Number(countRows?.[0]?.cnt ?? 0) > 0) {
            throw new SellingUnitConflictError(
              'This product\'s selling units could not be loaded, so saving now would replace them. Reload the product and try again.',
            );
          }
        }

        if (formData.sellingUnits.length > 0) {
          const defaultLevelId = await resolveDefaultPriceLevelId(connection);

          // Which levels the base unit showed a price for BEFORE this save —
          // read now, since writeSellingUnits rewrites these rows. A level in
          // this list that the submission no longer carries is one the user
          // removed in the tab, so its product_price_levels row goes too. A
          // level never stored here was never visible in the tab, so its
          // product_price_levels row (if any) is not this form's to delete.
          const submittedBase = formData.sellingUnits.find((u) => u.isBase) ?? formData.sellingUnits[0];
          let removedLevelIds: string[] = [];
          if (submittedBase?.id) {
            const [prevLevelRows]: any = await connection.query(
              `SELECT psup.price_level_id
                 FROM product_selling_unit_prices psup
                 JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
                WHERE psu.id = ? AND psu.product_id = ? AND psu.is_base = 1`,
              [submittedBase.id, id],
            );
            removedLevelIds = (prevLevelRows as any[])
              .map((r) => r.price_level_id as string)
              .filter((levelId) => validPrice(submittedBase.prices?.[levelId]) === undefined);
          }

          const { baseUnit, basePrice: resolvedBasePrice } =
            await writeSellingUnits(connection, id, formData.sellingUnits, defaultLevelId);

          // Sync the scalar columns from the base row — one source of truth.
          if (baseUnit) {
            await writeBaseUnitPriceLevels(connection, id, baseUnit, removedLevelIds);
            const basePrice = resolvedBasePrice ?? Number(productData.price ?? 0);
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

      if (formData.supplierMappings) {
        await connection.query('DELETE FROM supplier_product_mapping WHERE product_id = ?', [id]);
        for (const mapping of formData.supplierMappings) {
          // See the matching comment in addProduct — id is VARCHAR(50), and a
          // uuid-based id is both well under the limit and collision-safe
          // across concurrent requests.
          const mappingId = `spm_${uuidv4()}`;
          await connection.query('INSERT INTO supplier_product_mapping (id, product_id, supplier_id, supplier_sku, supplier_lead_time, supplier_specific_rop, supplier_cost, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [mappingId, id, mapping.supplierId, mapping.supplierSku || null, mapping.leadTime, mapping.rop, mapping.cost || null, mapping.isPrimary ? 1 : 0]);
        }
      }
    });

    return { success: true, message: `${formData.name} has been updated.` };
  } catch (error: any) {
    console.error('Error updating product:', error);
    if (error instanceof SellingUnitConflictError) {
      return { success: false, message: error.message };
    }
    if (error.code === 'ER_DUP_ENTRY' && error.message?.includes('unique_selling_unit_barcode')) {
      return { success: false, message: "That barcode is already used by another product's selling unit." };
    }
    if (error.code === 'ER_DUP_ENTRY' && error.message?.includes('unique_product_unit_name')) {
      return { success: false, message: 'Two selling units of this product have the same unit name.' };
    }
    return { success: false, message: 'There was an error updating the product.' };
  }
}

export async function deleteProduct(id: string) {
  try {
    await withTransaction(async (connection) => {
      await connection.query('DELETE FROM product_shelves WHERE product_id = ?', [id]);
      await connection.query('DELETE FROM conversion_factors WHERE product_id = ?', [id]);
      await connection.query('DELETE FROM product_price_levels WHERE product_id = ?', [id]);
      await connection.query('DELETE FROM supplier_product_mapping WHERE product_id = ?', [id]);
      await connection.query('DELETE FROM products WHERE id = ?', [id]);
    });
    return { success: true, message: 'Product deleted successfully.' };
  } catch (error) {
    console.error('Error deleting product:', error);
    return { success: false, message: 'Error deleting product. It might be referenced by other records.' };
  }
}

export async function updateProductPrice(id: string, newPrice: number) {
  try {
    const defaultPriceLevelSql = `SELECT id FROM price_levels WHERE is_default = 1 LIMIT 1`;
    const defaultPriceLevelResult = await query(defaultPriceLevelSql);
    const defaultLevelId = defaultPriceLevelResult.length > 0 ? defaultPriceLevelResult[0].id : 'retail-level';

    await withTransaction(async (connection) => {
      const checkSql = `SELECT * FROM product_price_levels WHERE product_id = ? AND price_level_id = ? AND (min_quantity IS NULL OR min_quantity = 0)`;
      const existing = await connection.query(checkSql, [id, defaultLevelId]);

      if (existing.length > 0) {
        await connection.query(
          'UPDATE product_price_levels SET price = ? WHERE product_id = ? AND price_level_id = ? AND (min_quantity IS NULL OR min_quantity = 0)',
          [newPrice, id, defaultLevelId]
        );
      } else {
        await connection.query(
          'INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, ?, 0)',
          [id, defaultLevelId, newPrice]
        );
      }
      
      await connection.query('UPDATE products SET price = ? WHERE id = ?', [newPrice, id]);
      // Keep the base selling unit (what the Edit form hydrates from) in step.
      await syncBaseSellingUnit(connection, id, {
        price: newPrice,
        levelPrices: { [defaultLevelId]: newPrice },
      });
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating product price:', error);
    return { success: false };
  }
}

export async function updateProductStock(id: string, newStock: number) {
  try {
    await query('UPDATE products SET stock = ? WHERE id = ?', [newStock, id]);
    return { success: true };
  } catch (error) {
    console.error('Error updating product stock:', error);
    return { success: false };
  }
}

export type BreakPackNewProductData = {
  name: string;
  unitOfMeasure: string;
  conversionFactor: number;
  price: number;
  cost?: number;
  barcode?: string;
};

export async function breakPack(
  parentId: string, 
  childId: string | null, 
  quantityToBreak: number, 
  manualFactor?: number,
  newProductData?: BreakPackNewProductData,
  userId: string = 'system',
  isInternalFinalization: boolean = false
) {
  try {
    // --- Check if approval is required ---
    if (!isInternalFinalization) {
      const isApprovalRequired = await checkApprovalRequired('REPACKAGING');
      if (isApprovalRequired) {
        // Enrich data for the approval card
        const parentRows: any = await query('SELECT p.name, p.stock, p.unit_of_measure, p.sku, p.barcode, p.price, p.cost, w.name as warehouse_name FROM products p LEFT JOIN warehouses w ON p.warehouse_id = w.id WHERE p.id = ? OR p.sku = ?', [parentId, parentId]);
        const parentInfo = (Array.isArray(parentRows) && parentRows.length > 0) ? parentRows[0] : null;
        
        let targetName = newProductData?.name || 'New Product';
        let targetUnit = newProductData?.unitOfMeasure || '';
        let targetBarcode = newProductData?.barcode || '';
        let targetSku = 'NEW';
        let targetPrice = newProductData?.price || 0;
        let targetCost = newProductData?.cost || 0;
        
        if (childId) {
          const childRows: any = await query('SELECT name, unit_of_measure, sku, barcode, price, cost FROM products WHERE id = ? OR sku = ?', [childId, childId]);
          const childInfo = (Array.isArray(childRows) && childRows.length > 0) ? childRows[0] : null;
          if (childInfo) {
            targetName = childInfo.name;
            targetUnit = childInfo.unit_of_measure;
            targetBarcode = childInfo.barcode;
            targetSku = childInfo.sku;
            targetPrice = childInfo.price;
            targetCost = childInfo.cost;
          }
        }

        const factor = manualFactor || newProductData?.conversionFactor || 1;
        const sourceName = parentInfo?.name || parentId;
        
        // Create an items array for standard UI rendering in approvals
        const items = [
          {
            productId: parentId,
            productName: sourceName,
            sku: parentInfo?.sku || '',
            barcode: parentInfo?.barcode || '',
            price: parentInfo?.price || 0,
            cost: parentInfo?.cost || 0,
            quantity: -quantityToBreak,
            unit: parentInfo?.unit_of_measure || ''
          },
          {
            productId: childId || 'NEW',
            productName: targetName,
            sku: targetSku,
            barcode: targetBarcode,
            price: targetPrice,
            cost: targetCost,
            quantity: quantityToBreak * factor,
            unit: targetUnit
          }
        ];

        const { queueId, pendingApproval } = await submitToApprovalQueue('REPACKAGING', {
          parentId,
          childId,
          quantityToBreak,
          manualFactor,
          newProductData,
          sourceProductName: sourceName,
          targetProductName: targetName,
          sourceUnit: parentInfo?.unit_of_measure || '',
          currentStock: parentInfo?.stock || 0,
          quantity: `${quantityToBreak} ${parentInfo?.unit_of_measure || ''}`.trim(),
          warehouseName: parentInfo?.warehouse_name || 'N/A',
          reason: 'Break Pack',
          items // Add items array for consistency with other transaction types
        }, userId);
        if (pendingApproval) {
          return { success: true, pendingApproval: true, queueId, message: `Repackaging request submitted for approval.` };
        }
        // If all steps auto-skipped, fall through to immediate execution
      }
    }

    return await withTransaction(async (connection) => {
      const repackagingId = `rpkg_${uuidv4()}`;
      // 1. Fetch parent info
      const [parentResult]: any = await connection.query(
        'SELECT id, name, stock, unit_of_measure, sku, brand, category, subcategory, department, supplier_id, warehouse_id, vat_status, income_account, expense_account FROM products WHERE id = ?', 
        [parentId]
      );
      const parent = parentResult[0];
      if (!parent) throw new Error('Parent product not found.');
      if (parent.stock < quantityToBreak) {
        throw new Error(`Insufficient stock of ${parent.name}. Available: ${parent.stock}`);
      }

      let resolvedChildId = childId;
      let childName: string;
      let childStock: number;
      let childUnit: string;
      let factor: number;

      // --- Scenario A: Auto-create a new child product ---
      if (!resolvedChildId && newProductData) {
        const newId = `product_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newSku = parent.sku
          ? `${parent.sku}-${newProductData.unitOfMeasure.replace(/\s+/g, '').toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
          : null;
        factor = newProductData.conversionFactor;

        await connection.query(
          `INSERT INTO products (
            id, name, brand, sku, description, category, subcategory, 
            unit_of_measure, stock, reorder_point, price, cost, barcode, 
            warehouse_id, department, supplier_id, vat_status, 
            income_account, expense_account, availability
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId, newProductData.name, parent.brand, newSku,
            `Repackaged from ${parent.name}`,
            parent.category, parent.subcategory,
            newProductData.unitOfMeasure, 0, 0,
            newProductData.price, newProductData.cost || null, newProductData.barcode || null,
            parent.warehouse_id, parent.department, parent.supplier_id,
            parent.vat_status, parent.income_account, parent.expense_account,
            'Available'
          ]
        );

        resolvedChildId = newId;
        childName = newProductData.name;
        childStock = 0;
        childUnit = newProductData.unitOfMeasure;

      // --- Scenario B or C: Existing product ---
      } else if (resolvedChildId) {
        const [childResult]: any = await connection.query(
          'SELECT id, name, stock, unit_of_measure, conversion_factor, parent_id FROM products WHERE id = ?', 
          [resolvedChildId]
        );
        const child = childResult[0];
        if (!child) throw new Error('Target product not found.');

        childName = child.name;
        childStock = child.stock;
        childUnit = child.unit_of_measure;

        // Use manual factor provided in transaction
        factor = manualFactor || 1;
      } else {
        throw new Error('No target product specified for break pack.');
      }

      const childQuantityToAdd = quantityToBreak * factor;

      // 2. Perform Stock Update with Family Sync
      const { rootId: sourceRootId, factorToRoot: sourceFactorToRoot } = await findUltimateRoot(parentId, connection as any);
      const sourceRootQty = quantityToBreak / sourceFactorToRoot;
      await deductFamilyStock(sourceRootId, sourceRootQty, repackagingId, 'adjustment', `Repackaging: Break Pack from ${parentId}`, connection as any);

      const { rootId: destRootId, factorToRoot: destFactorToRoot } = await findUltimateRoot(resolvedChildId, connection as any);
      const destRootQty = childQuantityToAdd / destFactorToRoot;
      await addFamilyStock(destRootId, destRootQty, repackagingId, 'adjustment', `Repackaging: Produced from ${parentId}`, connection as any);

      // 4. Record repackaging logs

      // 5. Log to repackaging_logs
      const logId = `rpkg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await connection.query(
        `INSERT INTO repackaging_logs (id, source_product_id, source_product_name, source_qty, target_product_id, target_product_name, target_qty_produced, factor, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
        [logId, parentId, parent.name, quantityToBreak, resolvedChildId!, childName!, childQuantityToAdd, factor, userId]
      );

      // 6. --- BATCH COSTING: Create child batch (inherit parent cost or use current cost) ---
      try {
        const [bcsRows]: any = await connection.query(
          'SELECT batch_costing_repack_inherit FROM pos_settings LIMIT 1'
        );
        const repackInherit = !bcsRows || bcsRows.length === 0 || bcsRows[0].batch_costing_repack_inherit !== 0;

        let childUnitCost: number;
        let sourceType: string;

        if (repackInherit) {
          // Find the oldest batch for the parent with remaining qty
          const [parentBatches]: any = await connection.query(
            `SELECT unit_cost FROM inventory_batches
             WHERE product_id = ? AND quantity_remaining > 0
             ORDER BY received_date ASC, created_at ASC LIMIT 1`,
            [parentId]
          );
          if (parentBatches && parentBatches.length > 0) {
            // Cost per child unit = parent batch cost / conversion factor
            childUnitCost = parseFloat(parentBatches[0].unit_cost) / factor;
            sourceType = 'repack_inherit';
          } else {
            // Fallback: use parent product.cost
            const [parentCostRow]: any = await connection.query('SELECT cost FROM products WHERE id = ?', [parentId]);
            childUnitCost = parseFloat(parentCostRow?.[0]?.cost || 0) / factor;
            sourceType = 'repack_inherit';
          }
        } else {
          // Use current child product cost directly
          const [childCostRow]: any = await connection.query('SELECT cost FROM products WHERE id = ?', [resolvedChildId]);
          childUnitCost = parseFloat(childCostRow?.[0]?.cost || 0);
          sourceType = 'repack_new';
        }

        // Get child selling price
        const [childPriceRow]: any = await connection.query('SELECT price FROM products WHERE id = ?', [resolvedChildId]);
        const childSellingPrice = parseFloat(childPriceRow?.[0]?.price || 0);

        const childBatchId = generateBatchId();
        await connection.query(
          `INSERT INTO inventory_batches
             (id, product_id, purchase_order_id, received_date, quantity_in, quantity_remaining, unit_cost, selling_price, source_type, notes)
           VALUES (?, ?, NULL, CURDATE(), ?, ?, ?, ?, ?, ?)`,
          [childBatchId, resolvedChildId!, childQuantityToAdd, childQuantityToAdd, childUnitCost, childSellingPrice, sourceType, `Repackaged from ${parent.name} (${logId})`]
        );
      } catch (batchErr) {
        // Non-fatal (migration may not have run yet)
        console.warn('[BatchCosting] Could not create repack child batch:', batchErr);
      }
      // --- END BATCH COSTING ---

      return { success: true, message: `Successfully repackaged ${quantityToBreak} ${parent.unit_of_measure} into ${childQuantityToAdd} ${childUnit!}.` };

    });
  } catch (error: any) {
    console.error('Error in breakPack:', error);
    return { success: false, message: error.message || 'Internal server error during break pack operation.' };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CONSOLIDATE PACK  (Reverse of Break Pack: Pack/Small → Bulk/Large)
// Source = pack product (stock ↓)
// Target = bulk product (stock ↑)
// bulkQtyProduced = packQtyUsed / factor
// ──────────────────────────────────────────────────────────────────────────────

export type ConsolidatePackNewProductData = {
  name: string;
  unitOfMeasure: string;
  conversionFactor: number; // how many pack units make 1 bulk unit
  price: number;
  cost?: number;
  barcode?: string;
};

export async function consolidatePack(
  packId: string,
  bulkId: string | null,
  packQtyUsed: number,
  manualFactor?: number,
  newProductData?: ConsolidatePackNewProductData,
  userId: string = 'system',
  isInternalFinalization: boolean = false
) {
  try {
    // --- Check if approval is required ---
    if (!isInternalFinalization) {
      const isApprovalRequired = await checkApprovalRequired('REPACKAGING');
      if (isApprovalRequired) {
        const packRows: any = await query(
          'SELECT p.name, p.stock, p.unit_of_measure, p.sku, p.barcode, p.price, p.cost, w.name as warehouse_name FROM products p LEFT JOIN warehouses w ON p.warehouse_id = w.id WHERE p.id = ?',
          [packId]
        );
        const packInfo = Array.isArray(packRows) && packRows.length > 0 ? packRows[0] : null;

        let targetName = newProductData?.name || 'New Bulk Product';
        let targetUnit = newProductData?.unitOfMeasure || '';
        let targetBarcode = newProductData?.barcode || '';
        let targetSku = 'NEW';
        let targetPrice = newProductData?.price || 0;
        let targetCost = newProductData?.cost || 0;

        if (bulkId) {
          const bulkRows: any = await query(
            'SELECT name, unit_of_measure, sku, barcode, price, cost FROM products WHERE id = ?',
            [bulkId]
          );
          const bulkInfo = Array.isArray(bulkRows) && bulkRows.length > 0 ? bulkRows[0] : null;
          if (bulkInfo) {
            targetName = bulkInfo.name;
            targetUnit = bulkInfo.unit_of_measure;
            targetBarcode = bulkInfo.barcode;
            targetSku = bulkInfo.sku;
            targetPrice = bulkInfo.price;
            targetCost = bulkInfo.cost;
          }
        }

        const factor = manualFactor ?? newProductData?.conversionFactor ?? 1;
        const sourceName = packInfo?.name || packId;
        const bulkQtyProduced = packQtyUsed / factor;

        const items = [
          {
            productId: packId,
            productName: sourceName,
            sku: packInfo?.sku || '',
            barcode: packInfo?.barcode || '',
            price: packInfo?.price || 0,
            cost: packInfo?.cost || 0,
            quantity: -packQtyUsed,
            unit: packInfo?.unit_of_measure || '',
          },
          {
            productId: bulkId || 'NEW',
            productName: targetName,
            sku: targetSku,
            barcode: targetBarcode,
            price: targetPrice,
            cost: targetCost,
            quantity: bulkQtyProduced,
            unit: targetUnit,
          },
        ];

        const { queueId, pendingApproval } = await submitToApprovalQueue(
          'REPACKAGING',
          {
            direction: 'consolidate',
            packId,
            bulkId,
            packQtyUsed,
            manualFactor,
            newProductData,
            sourceProductName: sourceName,
            targetProductName: targetName,
            sourceUnit: packInfo?.unit_of_measure || '',
            currentStock: packInfo?.stock || 0,
            quantity: `${packQtyUsed} ${packInfo?.unit_of_measure || ''}`.trim(),
            warehouseName: packInfo?.warehouse_name || 'N/A',
            reason: 'Consolidate Pack',
            items,
          },
          userId
        );

        if (pendingApproval) {
          return {
            success: true,
            pendingApproval: true,
            queueId,
            message: 'Consolidation request submitted for approval.',
          };
        }
      }
    }

    return await withTransaction(async (connection) => {
      const repackagingId = `rpkg_${uuidv4()}`;
      // 1. Fetch pack (source) info
      const [packResult]: any = await connection.query(
        'SELECT id, name, stock, unit_of_measure, sku, brand, category, subcategory, department, supplier_id, warehouse_id, vat_status, income_account, expense_account FROM products WHERE id = ?',
        [packId]
      );
      const pack = packResult[0];
      if (!pack) throw new Error('Pack product not found.');
      if (pack.stock < packQtyUsed) {
        throw new Error(
          `Insufficient stock of ${pack.name}. Available: ${pack.stock}`
        );
      }

      let resolvedBulkId = bulkId;
      let bulkName: string;
      let bulkStock: number;
      let bulkUnit: string;
      let factor: number;

      // --- Scenario A: Auto-create a new bulk product ---
      if (!resolvedBulkId && newProductData) {
        const newId = `product_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newSku = pack.sku ? `${pack.sku}-BULK-${Date.now().toString(36).toUpperCase()}` : null;
        factor = newProductData.conversionFactor;

        await connection.query(
          `INSERT INTO products (
            id, name, brand, sku, description, category, subcategory,
            unit_of_measure, stock, reorder_point, price, cost, barcode,
            warehouse_id, department, supplier_id, vat_status,
            income_account, expense_account, availability
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId, newProductData.name, pack.brand, newSku,
            `Consolidated from ${pack.name}`,
            pack.category, pack.subcategory,
            newProductData.unitOfMeasure, 0, 0,
            newProductData.price, newProductData.cost || null, newProductData.barcode || null,
            pack.warehouse_id, pack.department, pack.supplier_id,
            pack.vat_status, pack.income_account, pack.expense_account,
            'Available',
          ]
        );

        resolvedBulkId = newId;
        bulkName = newProductData.name;
        bulkStock = 0;
        bulkUnit = newProductData.unitOfMeasure;

      // --- Scenario B: Existing bulk product ---
      } else if (resolvedBulkId) {
        const [bulkResult]: any = await connection.query(
          'SELECT id, name, stock, unit_of_measure, conversion_factor FROM products WHERE id = ?',
          [resolvedBulkId]
        );
        const bulk = bulkResult[0];
        if (!bulk) throw new Error('Bulk/target product not found.');

        bulkName = bulk.name;
        bulkStock = bulk.stock;
        bulkUnit = bulk.unit_of_measure;
        factor = manualFactor ?? 1;
      } else {
        throw new Error('No target bulk product specified for consolidation.');
      }

      const bulkQtyToAdd = packQtyUsed / factor;

      // 2. Deduct pack stock
      // 2. Perform Stock Update with Family Sync
      const { rootId: packRootId, factorToRoot: packFactorToRoot } = await findUltimateRoot(packId, connection as any);
      const packRootQty = packQtyUsed / packFactorToRoot;
      await deductFamilyStock(packRootId, packRootQty, repackagingId, 'adjustment', `Consolidation: Used ${packQtyUsed} of ${packId}`, connection as any);

      const { rootId: bulkRootId, factorToRoot: bulkFactorToRoot } = await findUltimateRoot(resolvedBulkId, connection as any);
      const bulkRootQty = bulkQtyToAdd / bulkFactorToRoot;
      await addFamilyStock(bulkRootId, bulkRootQty, repackagingId, 'adjustment', `Consolidation: Produced from ${packId}`, connection as any);

      // 4. Record stock movements
      const movementId1 = `mov_cons_p_${Date.now()}`;
      const movementId2 = `mov_cons_b_${Date.now() + 1}`;

      await connection.query(
        `INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity_change, previous_stock, new_stock, reference_id, reference_type, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [movementId1, packId, pack.name, 'adjustment', -packQtyUsed, pack.stock, pack.stock - packQtyUsed, resolvedBulkId, 'consolidate_pack', `Consolidated ${packQtyUsed} ${pack.unit_of_measure} into ${bulkName!}`]
      );

      await connection.query(
        `INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity_change, previous_stock, new_stock, reference_id, reference_type, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [movementId2, resolvedBulkId!, bulkName!, 'adjustment', bulkQtyToAdd, bulkStock!, bulkStock! + bulkQtyToAdd, packId, 'consolidate_pack', `Received ${bulkQtyToAdd} ${bulkUnit!} from consolidating ${pack.name}`]
      );

      // 5. Log to repackaging_logs (reuses same table)
      const logId = `rpkg_cons_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await connection.query(
        `INSERT INTO repackaging_logs (id, source_product_id, source_product_name, source_qty, target_product_id, target_product_name, target_qty_produced, factor, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'consolidate', ?)`,
        [logId, packId, pack.name, packQtyUsed, resolvedBulkId!, bulkName!, bulkQtyToAdd, factor, userId]
      );

      return {
        success: true,
        message: `Successfully consolidated ${packQtyUsed} ${pack.unit_of_measure} into ${bulkQtyToAdd} ${bulkUnit!}.`,
      };
    });
  } catch (error: any) {
    console.error('Error in consolidatePack:', error);
    return {
      success: false,
      message: error.message || 'Internal server error during consolidation operation.',
    };
  }
}

export async function updateProductShelfLocations(updates: { 
  productId: string; 
  shelfLocationId?: string | null; 
  sourceShelfId?: string | null;
  targetShelfId?: string | null;
  quantity?: number;
}[], userId: string = 'system', isInternalFinalization: boolean = false) {
  try {
    if (!isInternalFinalization) {
      const isApprovalRequired = await checkApprovalRequired('SHELF_TRANSFER');
      if (isApprovalRequired) {
          // Enrich data for approval
          const enrichedUpdates = await Promise.all(updates.map(async u => {
              const pRows: any = await query('SELECT name, sku, barcode, stock FROM products WHERE id = ?', [u.productId]);
              const p = pRows[0];
              
              let sourceName = 'Unassigned';
              if (u.sourceShelfId && u.sourceShelfId !== 'unassigned') {
                  const sRows: any = await query('SELECT name FROM shelf_locations WHERE id = ?', [u.sourceShelfId]);
                  sourceName = sRows[0]?.name || u.sourceShelfId;
              }
              
              let targetName = 'Unassigned';
              if (u.targetShelfId && u.targetShelfId !== 'unassigned') {
                  const tRows: any = await query('SELECT name FROM shelf_locations WHERE id = ?', [u.targetShelfId]);
                  targetName = tRows[0]?.name || u.targetShelfId;
              }

              return {
                  ...u,
                  productName: p?.name || 'Unknown',
                  productSku: p?.sku || '',
                  productBarcode: p?.barcode || '',
                  sourceShelfName: sourceName,
                  targetShelfName: targetName,
              };
          }));

          const { queueId, pendingApproval } = await submitToApprovalQueue('SHELF_TRANSFER', {
              updates: enrichedUpdates,
              items: enrichedUpdates.map(u => ({
                  productId: u.productId,
                  productName: u.productName,
                  sku: u.productSku,
                  barcode: u.productBarcode,
                  quantity: u.quantity,
                  sourceShelfName: u.sourceShelfName,
                  targetShelfName: u.targetShelfName,
                  notes: `Transfer from ${u.sourceShelfName} to ${u.targetShelfName}`
              }))
          }, userId);

          if (pendingApproval) {
              return { success: true, pendingApproval: true, queueId, message: 'Shelf transfer submitted for approval.' };
          }
      }
    }

    await withTransaction(async (connection) => {
      for (const update of updates) {
        // Handle Legacy/Bulk move (entire stock to a new shelf or unassigned)
        if (update.shelfLocationId !== undefined) {
          // Clear all existing shelf assignments for this product
          await connection.query('DELETE FROM product_shelves WHERE product_id = ?', [update.productId]);
          
          // Update the legacy column as well for backward compatibility
          await connection.query('UPDATE products SET shelf_location_id = ? WHERE id = ?', [update.shelfLocationId, update.productId]);

          // Add new assignment if not unassigned
          if (update.shelfLocationId && update.shelfLocationId !== 'unassigned' && update.shelfLocationId !== 'none') {
            const [product]: any = await connection.query('SELECT stock FROM products WHERE id = ?', [update.productId]);
            const stock = (product as any[])[0]?.stock || 0;
            await connection.query('INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)', [update.productId, update.shelfLocationId, stock]);
          }
          continue;
        }

        // Handle Partial Transfer
        const { productId, sourceShelfId, targetShelfId, quantity = 0 } = update;
        if (quantity <= 0) continue;

        // 1. Decrement from source (if not unassigned)
        if (sourceShelfId && sourceShelfId !== 'unassigned') {
          await connection.query(
            'UPDATE product_shelves SET quantity = quantity - ? WHERE product_id = ? AND shelf_id = ?',
            [quantity, productId, sourceShelfId]
          );
          // Clean up 0 quantity records
          await connection.query('DELETE FROM product_shelves WHERE product_id = ? AND shelf_id = ? AND quantity <= 0', [productId, sourceShelfId]);
        }

        // 2. Increment target (if not unassigned)
        if (targetShelfId && targetShelfId !== 'unassigned') {
          const [existingRows]: any = await connection.query(
            'SELECT quantity FROM product_shelves WHERE product_id = ? AND shelf_id = ?',
            [productId, targetShelfId]
          );

          if ((existingRows as any[]).length > 0) {
            await connection.query(
              'UPDATE product_shelves SET quantity = quantity + ? WHERE product_id = ? AND shelf_id = ?',
              [quantity, productId, targetShelfId]
            );
          } else {
            await connection.query(
              'INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)',
              [productId, targetShelfId, quantity]
            );
          }
        }

        // 3. Update legacy shelf_location_id on products table
        // We'll set it to the shelf with the highest quantity, or null if no shelves remain
        const [remainingRows]: any = await connection.query(
          'SELECT shelf_id FROM product_shelves WHERE product_id = ? ORDER BY quantity DESC LIMIT 1',
          [productId]
        );
        const topShelf = (remainingRows as any[]).length > 0 ? (remainingRows as any[])[0].shelf_id : null;
        await connection.query('UPDATE products SET shelf_location_id = ? WHERE id = ?', [topShelf, productId]);

        // 4. Record stock movement for the transfer
        const movementId = `mov_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const [pInfo]: any = await connection.query('SELECT name FROM products WHERE id = ?', [productId]);
        const pName = (pInfo as any[])[0]?.name || 'Unknown Product';
        
        let sourceName = 'Unassigned';
        if (sourceShelfId && sourceShelfId !== 'unassigned') {
            const [sInfo]: any = await connection.query('SELECT name FROM shelf_locations WHERE id = ?', [sourceShelfId]);
            sourceName = (sInfo as any[])[0]?.name || sourceShelfId;
        }

        let targetName = 'Unassigned';
        if (targetShelfId && targetShelfId !== 'unassigned') {
            const [tInfo]: any = await connection.query('SELECT name FROM shelf_locations WHERE id = ?', [targetShelfId]);
            targetName = (tInfo as any[])[0]?.name || targetShelfId;
        }

        await connection.query(
          `INSERT INTO stock_movements (
            id, product_id, product_name, movement_type, quantity_change, previous_stock, new_stock,
            reference_id, reference_type, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            movementId, productId, pName, 'transfer', 0, 0, 0, 
            productId, 'shelf_transfer', `Shelf Transfer: ${sourceName} -> ${targetName} (${quantity} units)`
          ]
        );
      }
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating product shelf locations:', error);
    return { success: false, message: 'Internal server error' };
  }
}

export async function getLowStockProducts() {
  try {
    const settingsResult = await query('SELECT low_stock_threshold FROM pos_settings LIMIT 1');
    const globalThreshold = settingsResult.length > 0 ? settingsResult[0].low_stock_threshold : 10;

    const sql = `
      SELECT p.*, w.name as warehouse_name
      FROM products p
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
      WHERE p.stock > 0 AND (p.stock < p.reorder_point OR p.stock < ?)
      ORDER BY p.stock ASC
    `;
    return await query(sql, [globalThreshold]);
  } catch (error) {
    console.error('Error fetching low stock products:', error);
    return [];
  }
}

export async function getOutOfStockProducts() {
  try {
    const sql = `
      SELECT p.*, w.name as warehouse_name
      FROM products p
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
      WHERE p.stock <= 0 AND p.type = 'standard'
      ORDER BY p.name ASC
    `;
    return await query(sql);
  } catch (error) {
    console.error('Error fetching out of stock products:', error);
    return [];
  }
}

// Lookup Functions
export async function getCategories() {
  try {
    const categories = await query('SELECT * FROM categories ORDER BY name');
    return categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      markupPercentage: cat.markup_percentage ? parseFloat(cat.markup_percentage) : undefined
    }));
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

export async function addCategory(name: string, markupPercentage?: number) {
  try {
    const id = `cat_${Date.now()}`;
    await query('INSERT INTO categories (id, name, markup_percentage) VALUES (?, ?, ?)', [id, name, markupPercentage || null]);
    return { success: true, message: 'Category added successfully.' };
  } catch (error) {
    console.error('Error adding category:', error);
    return { success: false, message: 'Error adding category.' };
  }
}

export async function updateCategory(id: string, name: string, markupPercentage?: number) {
  try {
    await query('UPDATE categories SET name = ?, markup_percentage = ? WHERE id = ?', [name, markupPercentage || null, id]);
    return { success: true, message: 'Category updated successfully.' };
  } catch (error) {
    console.error('Error updating category:', error);
    return { success: false, message: 'Error updating category.' };
  }
}

export async function deleteCategory(id: string) {
  try {
    await query('DELETE FROM categories WHERE id = ?', [id]);
    return { success: true, message: 'Category deleted successfully.' };
  } catch (error) {
    console.error('Error deleting category:', error);
    return { success: false, message: 'Error deleting category.' };
  }
}

export async function getBrands() {
  try {
    const brands = await query('SELECT * FROM brands ORDER BY name');
    return brands.map((brand: any) => ({
      id: brand.id,
      name: brand.name,
      markupPercentage: brand.markup_percentage ? parseFloat(brand.markup_percentage) : undefined
    }));
  } catch (error) {
    console.error('Error fetching brands:', error);
    return [];
  }
}

export async function addBrand(name: string, markupPercentage?: number) {
  try {
    const id = `brand_${Date.now()}`;
    await query('INSERT INTO brands (id, name, markup_percentage) VALUES (?, ?, ?)', [id, name, markupPercentage || null]);
    return { success: true, message: 'Brand added successfully.' };
  } catch (error) {
    console.error('Error adding brand:', error);
    return { success: false, message: 'Error adding brand.' };
  }
}

export async function updateBrand(id: string, name: string, markupPercentage?: number) {
  try {
    await query('UPDATE brands SET name = ?, markup_percentage = ? WHERE id = ?', [name, markupPercentage || null, id]);
    return { success: true, message: 'Brand updated successfully.' };
  } catch (error) {
    console.error('Error updating brand:', error);
    return { success: false, message: 'Error updating brand.' };
  }
}

export async function deleteBrand(id: string) {
  try {
    await query('DELETE FROM brands WHERE id = ?', [id]);
    return { success: true, message: 'Brand deleted successfully.' };
  } catch (error) {
    console.error('Error deleting brand:', error);
    return { success: false, message: 'Error deleting brand.' };
  }
}

export async function getSubcategories() {
  try {
    const subcategories = await query('SELECT * FROM subcategories ORDER BY name');
    return subcategories.map((sub: any) => ({
      id: sub.id,
      name: sub.name,
      markupPercentage: sub.markup_percentage ? parseFloat(sub.markup_percentage) : undefined
    }));
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    return [];
  }
}

export async function addSubcategory(name: string, markupPercentage?: number) {
  try {
    const id = `subcat_${Date.now()}`;
    await query('INSERT INTO subcategories (id, name, markup_percentage) VALUES (?, ?, ?)', [id, name, markupPercentage || null]);
    return { success: true, message: 'Subcategory added successfully.' };
  } catch (error) {
    console.error('Error adding subcategory:', error);
    return { success: false, message: 'Error adding subcategory.' };
  }
}

export async function updateSubcategory(id: string, name: string, markupPercentage?: number) {
  try {
    await query('UPDATE subcategories SET name = ?, markup_percentage = ? WHERE id = ?', [name, markupPercentage || null, id]);
    return { success: true, message: 'Subcategory updated successfully.' };
  } catch (error) {
    console.error('Error updating subcategory:', error);
    return { success: false, message: 'Error updating subcategory.' };
  }
}

export async function deleteSubcategory(id: string) {
  try {
    await query('DELETE FROM subcategories WHERE id = ?', [id]);
    return { success: true, message: 'Subcategory deleted successfully.' };
  } catch (error) {
    console.error('Error deleting subcategory:', error);
    return { success: false, message: 'Error deleting subcategory.' };
  }
}

export async function getUnitsOfMeasure(): Promise<UnitOfMeasure[]> {
  try {
    const units = await query('SELECT * FROM units_of_measure ORDER BY name');
    return units.map((u: any) => ({
      id: u.id,
      name: u.name,
      abbreviation: u.abbreviation
    }));
  } catch (error) {
    console.error('Error fetching units of measure:', error);
    return [];
  }
}

export async function addUnitOfMeasure(name: string, abbreviation: string) {
  try {
    const id = `uom_${Date.now()}`;
    await query('INSERT INTO units_of_measure (id, name, abbreviation) VALUES (?, ?, ?)', [id, name, abbreviation]);
    return { success: true, message: 'Unit of measure added successfully.' };
  } catch (error) {
    console.error('Error adding unit of measure:', error);
    return { success: false, message: 'Error adding unit of measure.' };
  }
}

export async function updateUnitOfMeasure(id: string, name: string, abbreviation: string) {
  try {
    await query('UPDATE units_of_measure SET name = ?, abbreviation = ? WHERE id = ?', [name, abbreviation, id]);
    return { success: true, message: 'Unit of measure updated successfully.' };
  } catch (error) {
    console.error('Error updating unit of measure:', error);
    return { success: false, message: 'Error updating unit of measure.' };
  }
}

export async function deleteUnitOfMeasure(id: string) {
  try {
    await query('DELETE FROM units_of_measure WHERE id = ?', [id]);
    return { success: true, message: 'Unit of measure deleted successfully.' };
  } catch (error) {
    console.error('Error deleting unit of measure:', error);
    return { success: false, message: 'Error deleting unit of measure.' };
  }
}

export async function getSuppliers(): Promise<Supplier[]> {
  try {
    const suppliers = await query('SELECT * FROM suppliers ORDER BY name');
    return suppliers.map((s: any) => ({
      id: s.id,
      name: s.name,
      contactNumber: s.contact_number,
      telephone: s.telephone,
      mobilePhone: s.mobile_phone,
      email: s.email,
      address: s.address,
      company: s.company,
      tin: s.tin,
      paymentTerms: s.payment_terms,
      markupPercentage: s.markup_percentage ? parseFloat(s.markup_percentage) : undefined,
      orderSchedule: s.order_schedule
    }));
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return [];
  }
}

export async function addSupplier(data: any) {
  try {
    const id = `supplier_${Date.now()}`;
    const sql = `
      INSERT INTO suppliers (
        id, name, contact_number, telephone, mobile_phone, email, 
        address, company, tin, payment_terms, order_schedule
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await query(sql, [
      id, 
      data.name, 
      data.contactNumber || null, 
      data.telephone || null, 
      data.mobilePhone || null, 
      data.email || null, 
      data.address || null, 
      data.company || null, 
      data.tin || null, 
      data.paymentTerms || null, 
      data.orderSchedule || null
    ]);
    return { success: true, message: 'Supplier added successfully.' };
  } catch (error) {
    console.error('Error adding supplier:', error);
    return { success: false, message: 'Error adding supplier.' };
  }
}

export async function updateSupplier(id: string, data: any) {
  try {
    const sql = `
      UPDATE suppliers SET 
        name = ?, contact_number = ?, telephone = ?, mobile_phone = ?, 
        email = ?, address = ?, company = ?, tin = ?, 
        payment_terms = ?, order_schedule = ?
      WHERE id = ?
    `;
    await query(sql, [
      data.name, 
      data.contactNumber || null, 
      data.telephone || null, 
      data.mobilePhone || null, 
      data.email || null, 
      data.address || null, 
      data.company || null, 
      data.tin || null, 
      data.paymentTerms || null, 
      data.orderSchedule || null,
      id
    ]);
    return { success: true, message: 'Supplier updated successfully.' };
  } catch (error) {
    console.error('Error updating supplier:', error);
    return { success: false, message: 'Error updating supplier.' };
  }
}

export async function getPaymentTerms() {
  try {
    return await query('SELECT * FROM payment_terms ORDER BY description');
  } catch (error) {
    console.error('Error fetching payment terms:', error);
    return [];
  }
}

export async function deleteSupplier(id: string) {
  try {
    await query('DELETE FROM suppliers WHERE id = ?', [id]);
    return { success: true, message: 'Supplier deleted successfully.' };
  } catch (error) {
    console.error('Error deleting supplier:', error);
    return { success: false, message: 'Error deleting supplier.' };
  }
}

export async function getWarehouses(): Promise<Warehouse[]> {
  try {
    const warehouses = await query('SELECT * FROM warehouses ORDER BY name');
    return warehouses.map((w: any) => ({
      id: w.id,
      name: w.name,
      location: w.location,
      isActive: w.is_active === 1,
      createdAt: w.created_at
    }));
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return [];
  }
}

export async function addWarehouse(name: string, location?: string) {
  try {
    const id = `wh_${Date.now()}`;
    await query('INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)', [id, name, location || null]);
    return { success: true, message: 'Warehouse added successfully.' };
  } catch (error) {
    console.error('Error adding warehouse:', error);
    return { success: false, message: 'Error adding warehouse.' };
  }
}

export async function updateWarehouse(id: string, name: string, location?: string) {
  try {
    await query('UPDATE warehouses SET name = ?, location = ? WHERE id = ?', [name, location || null, id]);
    return { success: true, message: 'Warehouse updated successfully.' };
  } catch (error) {
    console.error('Error updating warehouse:', error);
    return { success: false, message: 'Error updating warehouse.' };
  }
}

export async function deleteWarehouse(id: string) {
  try {
    await query('DELETE FROM warehouses WHERE id = ?', [id]);
    return { success: true, message: 'Warehouse deleted successfully.' };
  } catch (error) {
    console.error('Error deleting warehouse:', error);
    return { success: false, message: 'Error deleting warehouse.' };
  }
}

export async function getDepartments(): Promise<Department[]> {
  try {
    const departments = await query('SELECT * FROM departments ORDER BY name');
    return departments.map((d: any) => ({
      id: d.id,
      name: d.name,
      markupPercentage: d.markup_percentage ? parseFloat(d.markup_percentage) : undefined
    }));
  } catch (error) {
    console.error('Error fetching departments:', error);
    return [];
  }
}

export async function addDepartment(name: string, markupPercentage?: number) {
  try {
    const id = `dept_${Date.now()}`;
    await query('INSERT INTO departments (id, name, markup_percentage) VALUES (?, ?, ?)', [id, name, markupPercentage || null]);
    return { success: true, message: 'Department added successfully.' };
  } catch (error) {
    console.error('Error adding department:', error);
    return { success: false, message: 'Error adding department.' };
  }
}

export async function updateDepartment(id: string, name: string, markupPercentage?: number) {
  try {
    await query('UPDATE departments SET name = ?, markup_percentage = ? WHERE id = ?', [name, markupPercentage || null, id]);
    return { success: true, message: 'Department updated successfully.' };
  } catch (error) {
    console.error('Error updating department:', error);
    return { success: false, message: 'Error updating department.' };
  }
}

export async function deleteDepartment(id: string) {
  try {
    await query('DELETE FROM departments WHERE id = ?', [id]);
    return { success: true, message: 'Department deleted successfully.' };
  } catch (error) {
    console.error('Error deleting department:', error);
    return { success: false, message: 'Error deleting department.' };
  }
}

export async function getShelfLocations(): Promise<ShelfLocation[]> {
  try {
    const locations = await query('SELECT * FROM shelf_locations ORDER BY name');
    return locations.map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      description: loc.description,
      isActive: loc.is_active === 1,
      createdAt: loc.created_at,
      updatedAt: loc.updated_at
    }));
  } catch (error) {
    console.error('Error fetching shelf locations:', error);
    return [];
  }
}

export async function addShelfLocation(name: string, description?: string) {
  try {
    const id = `shelf_${Date.now()}`;
    await query('INSERT INTO shelf_locations (id, name, description) VALUES (?, ?, ?)', [id, name, description || null]);
    return { success: true, message: 'Shelf location added successfully.' };
  } catch (error) {
    console.error('Error adding shelf location:', error);
    return { success: false, message: 'Error adding shelf location.' };
  }
}

export async function updateShelfLocation(id: string, name: string, description?: string) {
  try {
    await query('UPDATE shelf_locations SET name = ?, description = ? WHERE id = ?', [name, description || null, id]);
    return { success: true, message: 'Shelf location updated successfully.' };
  } catch (error) {
    console.error('Error updating shelf location:', error);
    return { success: false, message: 'Error updating shelf location.' };
  }
}

export async function deleteShelfLocation(id: string) {
  try {
    await query('DELETE FROM shelf_locations WHERE id = ?', [id]);
    return { success: true, message: 'Shelf location deleted successfully.' };
  } catch (error) {
    console.error('Error deleting shelf location:', error);
    return { success: false, message: 'Error deleting shelf location.' };
  }
}

export async function getAccounts(): Promise<Account[]> {
  try {
    const accounts = await query('SELECT * FROM accounts ORDER BY name');
    return accounts.map((acc: any) => ({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      code: acc.code
    }));
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return [];
  }
}

export async function addAccount(name: string, type: 'income' | 'expense', code?: string) {
  try {
    const id = `acc_${Date.now()}`;
    await query('INSERT INTO accounts (id, name, type, code) VALUES (?, ?, ?, ?)', [id, name, type, code || null]);
    const [account] = await query('SELECT * FROM accounts WHERE id = ?', [id]);
    return { success: true, message: 'Account added successfully.', account, accountId: id };
  } catch (error) {
    console.error('Error adding account:', error);
    return { success: false, message: 'Error adding account.' };
  }
}

export async function updateAccount(id: string, name: string, type: 'income' | 'expense', code?: string) {
  try {
    await query('UPDATE accounts SET name = ?, type = ?, code = ? WHERE id = ?', [name, type, code || null, id]);
    return { success: true, message: 'Account updated successfully.' };
  } catch (error) {
    console.error('Error updating account:', error);
    return { success: false, message: 'Error updating account.' };
  }
}

export async function deleteAccount(id: string) {
  try {
    await query('DELETE FROM accounts WHERE id = ?', [id]);
    return { success: true, message: 'Account deleted successfully.' };
  } catch (error) {
    console.error('Error deleting account:', error);
    return { success: false, message: 'Error deleting account.' };
  }
}

export async function getPriceLevels(): Promise<PriceLevel[]> {
  try {
    const levels = await query('SELECT * FROM price_levels ORDER BY name');
    return levels.map((level: any) => ({
      id: level.id,
      name: level.name,
      description: level.description,
      isDefault: level.is_default === 1,
      calculationBase: level.calculation_base,
      adjustmentType: level.adjustment_type === 'fixed' ? 'fixed' : 'percentage',
      percentageAdjustment: parseFloat(level.percentage_adjustment),
      minQuantity: level.min_quantity,
      createdAt: level.created_at,
      updatedAt: level.updated_at
    }));
  } catch (error) {
    console.error('Error fetching price levels:', error);
    return [];
  }
}

export async function addPriceLevel(name: string, description: string, isDefault: boolean, percentageAdjustment: number, minQuantity: number = 0, calculationBase: 'retail' | 'cost' = 'retail', adjustmentType: 'percentage' | 'fixed' = 'percentage') {
  try {
    const id = `pl_${Date.now()}`;
    if (isDefault) {
      await query('UPDATE price_levels SET is_default = 0', []);
    }
    await query('INSERT INTO price_levels (id, name, description, is_default, percentage_adjustment, min_quantity, calculation_base, adjustment_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, name, description || null, isDefault ? 1 : 0, percentageAdjustment, minQuantity, calculationBase, adjustmentType]);
    return { success: true, message: 'Price level added successfully.' };
  } catch (error) {
    console.error('Error adding price level:', error);
    return { success: false, message: 'Error adding price level.' };
  }
}

export async function updatePriceLevel(id: string, name: string, description: string, isDefault: boolean, percentageAdjustment: number, minQuantity: number = 0, calculationBase: 'retail' | 'cost' = 'retail', adjustmentType: 'percentage' | 'fixed' = 'percentage') {
  try {
    if (isDefault) {
      await query('UPDATE price_levels SET is_default = 0', []);
    }
    await query('UPDATE price_levels SET name = ?, description = ?, is_default = ?, percentage_adjustment = ?, min_quantity = ?, calculation_base = ?, adjustment_type = ? WHERE id = ?', [name, description || null, isDefault ? 1 : 0, percentageAdjustment, minQuantity, calculationBase, adjustmentType, id]);
    return { success: true, message: 'Price level updated successfully.' };
  } catch (error) {
    console.error('Error updating price level:', error);
    return { success: false, message: 'Error updating price level.' };
  }
}

export async function deletePriceLevel(id: string) {
  try {
    await query('DELETE FROM price_levels WHERE id = ?', [id]);
    return { success: true, message: 'Price level deleted successfully.' };
  } catch (error) {
    console.error('Error deleting price level:', error);
    return { success: false, message: 'Error deleting price level.' };
  }
}

export async function addSupplierMapping(productId: string, supplierId: string, leadTime: number, rop: number, cost?: number, supplierSku?: string, isPrimary: boolean = false) {
  try {
    const id = `spm_${Date.now()}`;
    if (isPrimary) {
      await query('UPDATE supplier_product_mapping SET is_primary = 0 WHERE product_id = ?', [productId]);
    }
    await query('INSERT INTO supplier_product_mapping (id, product_id, supplier_id, supplier_lead_time, supplier_specific_rop, supplier_cost, supplier_sku, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, productId, supplierId, leadTime, rop, cost || null, supplierSku || null, isPrimary ? 1 : 0]);
    return { success: true, message: 'Supplier mapping added successfully.' };
  } catch (error) {
    console.error('Error adding supplier mapping:', error);
    return { success: false, message: 'Error adding supplier mapping.' };
  }
}

export async function updateSupplierMapping(id: string, leadTime: number, rop: number, cost?: number, supplierSku?: string, isPrimary: boolean = false) {
  try {
    const [mapping]: any = await query('SELECT product_id FROM supplier_product_mapping WHERE id = ?', [id]);
    if (isPrimary && mapping) {
      await query('UPDATE supplier_product_mapping SET is_primary = 0 WHERE product_id = ?', [mapping.product_id]);
    }
    await query('UPDATE supplier_product_mapping SET supplier_lead_time = ?, supplier_specific_rop = ?, supplier_cost = ?, supplier_sku = ?, is_primary = ? WHERE id = ?', [leadTime, rop, cost || null, supplierSku || null, isPrimary ? 1 : 0, id]);
    return { success: true, message: 'Supplier mapping updated successfully.' };
  } catch (error) {
    console.error('Error updating supplier mapping:', error);
    return { success: false, message: 'Error updating supplier mapping.' };
  }
}

export async function deleteSupplierMapping(id: string) {
  try {
    await query('DELETE FROM supplier_product_mapping WHERE id = ?', [id]);
    return { success: true, message: 'Supplier mapping deleted successfully.' };
  } catch (error) {
    console.error('Error deleting supplier mapping:', error);
    return { success: false, message: 'Error deleting supplier mapping.' };
  }
}

async function fetchSupplierMappings(productId: string) {
  // Column aliases match the camelCase `SupplierProductMapping` shape the
  // UI renders (product-suppliers.tsx) — `spm.*` alone would return raw
  // snake_case columns and every field but supplierName would render blank.
  const sql = `
    SELECT
      spm.id,
      spm.product_id as productId,
      spm.supplier_id as supplierId,
      s.name as supplierName,
      spm.supplier_sku as supplierSku,
      spm.supplier_lead_time as supplierLeadTime,
      spm.supplier_specific_rop as supplierSpecificRop,
      CAST(spm.supplier_cost AS DOUBLE) as supplierCost,
      spm.is_primary as isPrimary,
      spm.created_at as createdAt,
      spm.updated_at as updatedAt
    FROM supplier_product_mapping spm
    JOIN suppliers s ON spm.supplier_id = s.id
    WHERE spm.product_id = ?
  `;
  const rows: any[] = await query(sql, [productId]);
  // MySQL has no native boolean — is_primary comes back as 0/1 through
  // mysql2 even with a `= 1` boolean expression in SQL. Coerce here so
  // `mapping.isPrimary && <Badge/>` in product-suppliers.tsx renders
  // nothing for a falsy row instead of the literal text "0".
  return rows.map((row) => ({ ...row, isPrimary: !!row.isPrimary }));
}

export async function getSupplierMappings(productId: string) {
  try {
    return await fetchSupplierMappings(productId);
  } catch (error) {
    console.error('Error fetching supplier mappings:', error);
    return [];
  }
}

/**
 * Same rows as getSupplierMappings, but a failure THROWS instead of resolving
 * to []. For callers (the Edit Product form) that must tell "this product has
 * no mappings" apart from "the read failed" - saving a form built from a
 * swallowed failure would make updateProduct delete every stored mapping.
 */
export async function getSupplierMappingsStrict(productId: string) {
  return fetchSupplierMappings(productId);
}

export async function setPrimarySupplier(productId: string, mappingId: string) {
  try {
    await withTransaction(async (connection) => {
      // 1. Reset all primary flags for this product
      await connection.query('UPDATE supplier_product_mapping SET is_primary = 0 WHERE product_id = ?', [productId]);
      
      // 2. Set new primary mapping
      await connection.query('UPDATE supplier_product_mapping SET is_primary = 1 WHERE id = ?', [mappingId]);
      
      // 3. Get the ROP from the new primary mapping.
      // connection.query() is the raw PoolConnection API — unlike the query()
      // helper in lib/mysql.ts, it does NOT unwrap to rows and returns
      // [rows, fields]. Destructuring straight to `[mapping]` binds `mapping`
      // to the rows array itself (always truthy), so `mapping.supplier_specific_rop`
      // was always undefined and this silently wrote NULL to reorder_point.
      const [[mapping]]: any = await connection.query('SELECT supplier_specific_rop FROM supplier_product_mapping WHERE id = ?', [mappingId]);

      if (mapping) {
        // 4. Update the product's main reorder point
        await connection.query('UPDATE products SET reorder_point = ? WHERE id = ?', [mapping.supplier_specific_rop, productId]);
      }
    });
    return { success: true, message: 'Primary supplier updated successfully.' };
  } catch (error) {
    console.error('Error setting primary supplier:', error);
    return { success: false, message: 'Error setting primary supplier.' };
  }
}

export async function getChildProducts(parentId: string) {
  try {
    const products = await query(`
      SELECT p.*, p.parent_id as parentId, p.conversion_factor as conversionFactor,
             COALESCE(w.name, pw.name) as warehouseName,
             (SELECT GROUP_CONCAT(sl.name) FROM product_shelves ps JOIN shelf_locations sl ON ps.shelf_id = sl.id WHERE ps.product_id = p.id) as shelfLocationNames
      FROM products p 
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
      LEFT JOIN products parent ON p.parent_id = parent.id
      LEFT JOIN warehouses pw ON parent.warehouse_id = pw.id
      WHERE p.parent_id = ?
    `, [parentId]);
    return products as any[];
  } catch (error) {
    console.error('Error fetching child products:', error);
    return [];
  }
}

export async function getTaxRates(): Promise<TaxRate[]> {
  try {
    const rates = await query('SELECT * FROM tax_rates ORDER BY name');
    return rates.map((rate: any) => ({
      id: rate.id,
      name: rate.name,
      rate: parseFloat(rate.rate),
      description: rate.description,
      isDefault: rate.is_default === 1,
      createdAt: rate.created_at,
      updatedAt: rate.updated_at
    }));
  } catch (error) {
    console.error('Error fetching tax rates:', error);
    return [];
  }
}

export async function getProductOptions() {
  try {
    const [
      brands,
      categories,
      subcategories,
      units,
      suppliers,
      accounts,
      warehouses,
      priceLevels,
      departments,
      shelfLocations,
      taxRates
    ] = await Promise.all([
      getBrands(),
      getCategories(),
      getSubcategories(),
      getUnitsOfMeasure(),
      getSuppliers(),
      getAccounts(),
      getWarehouses(),
      getPriceLevels(),
      getDepartments(),
      getShelfLocations(),
      getTaxRates()
    ]);

    return {
      brands,
      categories,
      subcategories,
      units,
      suppliers,
      accounts,
      warehouses,
      priceLevels,
      departments,
      shelfLocations,
      taxRates,
      errors: {}
    };
  } catch (error) {
    console.error('Error fetching product options:', error);
    return {
      brands: [],
      categories: [],
      subcategories: [],
      units: [],
      suppliers: [],
      accounts: [],
      warehouses: [],
      priceLevels: [],
      departments: [],
      shelfLocations: [],
      errors: { message: 'Failed to load options' }
    };
  }
}

export async function searchProducts(searchQuery: string) {
  try {
    if (!searchQuery || searchQuery.trim().length < 2) return [];
    const like = `%${searchQuery.trim()}%`;
    // Services are excluded: repackaging (break pack / consolidate) moves
    // physical stock between products, which services never have.
    const sql = `
      SELECT p.id, p.name, p.sku, p.barcode, p.stock, p.unit_of_measure, p.parent_id, p.conversion_factor, p.price, p.cost,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT('unit', unit, 'factor', factor))
              FROM conversion_factors cf
              WHERE cf.product_id = p.id) as conversion_factors
      FROM products p
      WHERE (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?) AND p.type = 'standard'
      ORDER BY p.name ASC
      LIMIT 20
    `;
    const results = await query(sql, [like, like, like]);
    return results.map((r: any) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      barcode: r.barcode,
      stock: r.stock,
      unitOfMeasure: r.unit_of_measure,
      parentId: r.parent_id,
      conversionFactor: r.conversion_factor,
      price: parseFloat(r.price) || 0,
      cost: r.cost ? parseFloat(r.cost) : undefined,
      conversionFactors: typeof r.conversion_factors === 'string' ? JSON.parse(r.conversion_factors) : (r.conversion_factors || []),
    }));
  } catch (error) {
    console.error('Error searching products:', error);
    return [];
  }
}
