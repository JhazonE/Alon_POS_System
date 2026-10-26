import { registerMigration, Migration } from './runner';
import { query, withTransaction } from '../../lib/mysql';
import { randomBytes } from 'crypto';

/**
 * Give every EXISTING product a zero-stock copy in the other active warehouses
 * of its branch - the same thing lib/product-create.ts now does for a product
 * created from here on, so the catalogue is consistent whichever side of the
 * deploy a product was created on.
 *
 * ZERO inventory, always. Every inserted row is stock = 0 and
 * avg_daily_sales = 0, and NO inventory_batches row is written. A copied
 * quantity would be stock that was never received: it breaks valuation and
 * FIFO cost depletion (lib/batch-deduction.ts pulls from the oldest batch, so a
 * batch-less quantity is stock the system can sell but cannot cost). A copy
 * becomes real stock only when a stock-in / transfer / count is recorded
 * against it.
 *
 * Never cross-branch. A product is fanned out only to warehouses of the branch
 * that its OWN warehouse_id belongs to. A product with warehouse_id NULL
 * belongs to no branch (only head office may edit it) and is skipped.
 *
 * Why SERVICES are skipped: a service (type = 'service') has no stock, no
 * batches and no physical location, so there is no per-warehouse row for a
 * copy to represent. The runtime path skips them for the same reason.
 *
 * Why NON-ROOT products are skipped (parent_id IS NOT NULL): they are family
 * members (a 250g sachet whose parent is the 1kg bag). Their stock is derived
 * from the parent through conversion_factor by lib/family-sync.ts, which walks
 * parent_id. A copy that carries no parent_id would be a free-floating product
 * with its own independent stock; a copy that DID carry parent_id would point
 * at a parent that lives in a different warehouse, so every stock change in one
 * warehouse would rewrite the other's. Neither is defensible, so a family
 * member is left alone: families move between warehouses through
 * TransferStockService, which knows how to copy a family together.
 * (Roots are copied; their children are not, so a root that has children
 * arrives in the other warehouse as a lone product.)
 *
 * Identity match - sku FIRST, then name - mirrors TransferStockService, and is
 * what makes this idempotent. products.sku is NULLABLE and a MySQL unique index
 * does not treat NULLs as equal, so (sku, warehouse_id) UNIQUE (migration 056)
 * cannot be relied on alone: a product with no sku would be duplicated on every
 * run. If the target warehouse already holds a row with the same sku, or failing
 * that the same name, the product is considered present and nothing is inserted.
 *
 * Which columns are copied is the exact list lib/product-create.ts copies, plus
 * the product's product_price_levels rows. Deliberately NOT copied:
 * inventory_batches (above), product_shelves / shelf_location_id (physical to
 * one warehouse), product_selling_units (migration 115 made barcode GLOBALLY
 * unique), parent_id / conversion_factor (families, above) and
 * supplier_product_mapping (neither TransferStockService nor family-sync copies
 * it).
 *
 * Inactive warehouses are neither targets nor sources. is_active is the source
 * of truth; the runtime-added `active` column is stale and is never read.
 *
 * Single pass in one transaction, no chunking: if any insert fails, nothing is
 * kept and the migration is not recorded, so it can simply be re-run.
 *
 * down() CANNOT safely undo this in general, so it is deliberately narrow. Rows
 * created here carry no marker, and deleting a product CASCADES to
 * sale_items, sales_invoice_items, purchase_order_items, stock_movements,
 * inventory_batches and more (see the FKs on products). So down() deletes a
 * copy only when ALL of these hold: stock = 0; it is a root, non-service
 * product; no row in ANY table with an FK to products (other than its own
 * price levels) refers to it - which covers inventory_batches, stock_movements
 * and every sale/PO/invoice line, resolved from INFORMATION_SCHEMA so a new FK
 * is covered automatically; it was created in the ten minutes up to this
 * migration's recorded executed_at (so copies made at runtime afterwards are
 * kept); and a sibling with the same identity survives in the same branch, so a
 * product never disappears from a branch altogether. A copy that has since
 * received stock or been sold from is real inventory and is KEPT. If the
 * migrations row is missing, the window cannot be established and down()
 * THROWS rather than guess (same stance as migration 142).
 */
const MIGRATION_NAME = '144_backfill_product_warehouse_fanout';
/** Copies are made during up(), moments before the runner records executed_at. */
const DOWN_WINDOW_MINUTES = 10;

const COPIED_COLUMNS = [
  'name', 'description', 'additional_description', 'category', 'brand', 'department',
  'subcategory', 'supplier_id', 'reorder_point', 'price', 'cost', 'sku', 'barcode',
  'image_url', 'image_hint', 'unit_of_measure', 'income_account', 'expense_account',
  'vat_status', 'availability', 'earns_points', 'is_perishable', 'type',
] as const;

function newProductId(): string {
  // A random suffix rather than Date.now() alone: a whole catalogue is inserted
  // inside one millisecond-scale loop.
  return `product_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

export const migration: Migration = {
  name: MIGRATION_NAME,
  timestamp: '2026-10-26_12-00-00',

  async up() {
    console.log(`Running migration: ${MIGRATION_NAME}`);

    const warehouses = (await query(
      'SELECT id, branch_id FROM warehouses WHERE is_active = 1 AND branch_id IS NOT NULL'
    )) as Array<{ id: string; branch_id: string }>;
    const byBranch = new Map<string, string[]>();
    for (const w of warehouses) {
      const list = byBranch.get(w.branch_id) ?? [];
      list.push(w.id);
      byBranch.set(w.branch_id, list);
    }
    const branchOf = new Map(warehouses.map((w) => [w.id, w.branch_id]));

    const sources = (await query(
      `SELECT id, warehouse_id, ${COPIED_COLUMNS.map((c) => `\`${c}\``).join(', ')}
         FROM products
        WHERE warehouse_id IS NOT NULL
          AND type <> 'service'
          AND parent_id IS NULL
        ORDER BY created_at, id`
    )) as Array<Record<string, any>>;

    let inserted = 0;
    await withTransaction(async (connection) => {
      for (const src of sources) {
        const branchId = branchOf.get(src.warehouse_id);
        if (!branchId) continue; // source warehouse inactive or branchless
        const targets = (byBranch.get(branchId) ?? []).filter((id) => id !== src.warehouse_id);
        if (targets.length === 0) continue;

        const [levels]: any = await connection.query(
          'SELECT price_level_id, price, min_quantity FROM product_price_levels WHERE product_id = ?',
          [src.id]
        );

        for (const targetWarehouseId of targets) {
          // Identity match: sku first, then name (TransferStockService order).
          let present = false;
          if (src.sku) {
            const [bySku]: any = await connection.query(
              'SELECT id FROM products WHERE sku = ? AND warehouse_id = ? LIMIT 1',
              [src.sku, targetWarehouseId]
            );
            present = bySku.length > 0;
          }
          if (!present) {
            const [byName]: any = await connection.query(
              'SELECT id FROM products WHERE name = ? AND warehouse_id = ? LIMIT 1',
              [src.name, targetWarehouseId]
            );
            present = byName.length > 0;
          }
          if (present) continue;

          const copyId = newProductId();
          await connection.query(
            `INSERT INTO products (
               id, name, description, additional_description, category, brand, department,
               subcategory, supplier_id, warehouse_id, stock, reorder_point, avg_daily_sales,
               price, cost, sku, barcode, image_url, image_hint, unit_of_measure,
               income_account, expense_account, vat_status, availability, earns_points,
               is_perishable, type
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              copyId, src.name, src.description, src.additional_description,
              src.category, src.brand, src.department, src.subcategory,
              src.supplier_id, targetWarehouseId, src.reorder_point,
              src.price, src.cost, src.sku, src.barcode, src.image_url,
              src.image_hint, src.unit_of_measure, src.income_account,
              src.expense_account, src.vat_status, src.availability,
              src.earns_points, src.is_perishable, src.type,
            ]
          );
          for (const pl of levels) {
            await connection.query(
              'INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, ?, ?)',
              [copyId, pl.price_level_id, pl.price, pl.min_quantity]
            );
          }
          inserted++;
        }
      }
    });
    console.log(`✅ Backfilled ${inserted} zero-stock product cop${inserted === 1 ? 'y' : 'ies'} across branch warehouses`);
  },

  async down() {
    console.log(`Rolling back migration: ${MIGRATION_NAME}`);

    const rec = (await query(
      'SELECT executed_at FROM migrations WHERE name = ?',
      [MIGRATION_NAME]
    )) as Array<{ executed_at: Date }>;
    if (rec.length === 0) {
      throw new Error(
        `Cannot roll back ${MIGRATION_NAME}: no migrations row, so the set of rows it created ` +
          'cannot be identified. Deleting products by shape alone could remove real inventory ' +
          '(and cascade into sale and purchase lines), so nothing was changed.'
      );
    }
    const executedAt = rec[0].executed_at;

    // Every table with an FK to products, except the copy's own price levels.
    // A reference in any of them means the copy has been used.
    const refs = (await query(
      `SELECT DISTINCT TABLE_NAME AS t, COLUMN_NAME AS c
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME = 'products'
          AND REFERENCED_COLUMN_NAME = 'id'
          AND TABLE_NAME <> 'product_price_levels'`
    )) as Array<{ t: string; c: string }>;
    const unreferenced = refs
      .map((r) => `NOT EXISTS (SELECT 1 FROM \`${r.t}\` x WHERE x.\`${r.c}\` = p.id)`)
      .join(' AND ');

    const candidates = (await query(
      `SELECT p.id, p.sku, p.name, p.warehouse_id, w.branch_id
         FROM products p
         JOIN warehouses w ON w.id = p.warehouse_id
        WHERE p.stock = 0
          AND p.parent_id IS NULL
          AND p.type <> 'service'
          AND p.created_at BETWEEN DATE_SUB(?, INTERVAL ${DOWN_WINDOW_MINUTES} MINUTE) AND ?
          ${unreferenced ? `AND ${unreferenced}` : ''}`,
      [executedAt, executedAt]
    )) as Array<{ id: string; sku: string | null; name: string; warehouse_id: string; branch_id: string | null }>;

    const candidateIds = new Set(candidates.map((c) => c.id));
    let removed = 0;
    await withTransaction(async (connection) => {
      for (const c of candidates) {
        if (!c.branch_id) continue;
        // A surviving sibling = same identity, same branch, another warehouse,
        // and NOT itself a deletion candidate. Without it, deleting would make
        // the product vanish from the branch.
        const [sibs]: any = await connection.query(
          `SELECT p.id FROM products p
             JOIN warehouses w ON w.id = p.warehouse_id
            WHERE w.branch_id = ? AND p.warehouse_id <> ? AND p.id <> ?
              AND ((? IS NOT NULL AND p.sku = ?) OR p.name = ?)`,
          [c.branch_id, c.warehouse_id, c.id, c.sku, c.sku, c.name]
        );
        if (!sibs.some((s: { id: string }) => !candidateIds.has(s.id))) continue;
        await connection.query('DELETE FROM product_price_levels WHERE product_id = ?', [c.id]);
        await connection.query('DELETE FROM products WHERE id = ?', [c.id]);
        removed++;
      }
    });
    console.log(`✅ Removed ${removed} untouched backfill cop${removed === 1 ? 'y' : 'ies'}; copies with stock, history or documents were kept`);
  },
};

registerMigration(migration);
