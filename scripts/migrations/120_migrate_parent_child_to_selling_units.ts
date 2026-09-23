import { registerMigration, Migration } from './runner';
import { query, withTransaction } from '../../lib/mysql';
import { toSafeNumber } from '../../lib/utils';
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput, convertChildQuantityToBase, convertChildUnitCostToBase } from '../../lib/selling-units-migration';

// MySQL JSON columns are auto-parsed by mysql2 (this pool never sets
// jsonStrings — see lib/mysql.ts), so values read back from
// migration_120_backup already arrive as JS objects/arrays, not strings.
// Guard against both shapes rather than assuming either.
function parseJsonColumn(value: any): any {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

// TIMESTAMP/DATETIME columns round-trip through JSON.stringify(Date) as
// ISO-8601 strings with a trailing "Z" (e.g. "2026-09-21T11:30:00.000Z").
// MySQL 8 strict mode rejects that literal format for TIMESTAMP/DATETIME
// columns, so convert any such string to "YYYY-MM-DD HH:MM:SS" before it
// is bound into an INSERT. Applied value-by-value (not by column name)
// because the products INSERT builds its column list dynamically.
//
// This must go through a real Date + local getters, not a naive string
// slice: this pool's mysql2 config sets no `timezone` option (default
// 'local') and this DB's session time_zone is SYSTEM, so both sides agree
// on the *local* wall clock — but the "Z" string is UTC. Slicing off the
// "Z" and reusing the UTC digits as a local-time literal re-interprets
// them in the local zone, silently shifting the restored value by the
// zone offset (verified: an 8-hour drift in this dev environment,
// UTC+8). Parsing into a Date and reading it back with local getters
// reproduces the exact original wall-clock literal instead.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function sanitizeForInsert(value: any): any {
  if (typeof value === 'string' && ISO_TIMESTAMP_RE.test(value)) {
    const d = new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return value;
}
function sanitizeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    out[key] = sanitizeForInsert(row[key]);
  }
  return out;
}

// product_price_levels is created by the standalone root-level
// run_price_level_migration.js script, not by a numbered migration in this
// directory — it may not exist on a fresh `npm run migrate` database. Guard
// every touch of it with this check so this migration stays a no-op for that
// table when it's absent, same posture as the rest of this file toward
// optional legacy tables.
async function tableExists(connection: { query: Function }, table: string): Promise<boolean> {
  const [rows]: any = await connection.query(`
    SELECT COUNT(*) as cnt
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, [table]);
  return rows[0]?.cnt > 0;
}

// Tables that reference products.id and were given their own nullable
// selling_unit_id column (migrations 121-127) so the re-pointing done here is
// precisely reversible in down(). inventory_batches / sale_items /
// purchase_order_items are handled separately below because they also carry
// unit-name/qty_base snapshot columns.
const SIMPLE_REPOINT_TABLES = [
  'stock_movements',
  'sales_invoice_items',
  'pos_transaction_items',
  'stock_adjustments',
  'bad_order_items',
  'sales_order_items',
  'stock_count_items',
] as const;

const migration: Migration = {
  name: '120_migrate_parent_child_to_selling_units',
  timestamp: '2026-09-21_11-30-00',

  async up(): Promise<void> {
    // DDL must run OUTSIDE withTransaction. Non-temporary CREATE TABLE is on
    // MySQL 8's implicit-commit list, so issuing it as the first statement
    // inside the transaction silently committed it and left every later
    // statement auto-committing individually — a mid-migration failure's
    // rollback() would then have undone nothing. Keep the transaction body
    // pure DML.
    await query(`
      CREATE TABLE IF NOT EXISTS migration_120_backup (
        id VARCHAR(50) NOT NULL,
        product_json JSON NOT NULL,
        conversion_factors_json JSON NOT NULL,
        root_product_id VARCHAR(50) NOT NULL,
        selling_unit_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);

    await withTransaction(async (connection) => {
      const [productRows]: any = await connection.query(`
        SELECT id, parent_id AS parentId, unit_of_measure AS unitOfMeasure,
               barcode, cost, price, conversion_factor AS conversionFactor
        FROM products
      `);
      const [cfRows]: any = await connection.query(`
        SELECT product_id AS productId, unit, factor FROM conversion_factors
      `);

      const products: MigrationProductInput[] = productRows.map((r: any) => ({
        id: r.id,
        parentId: r.parentId,
        unitOfMeasure: r.unitOfMeasure,
        barcode: r.barcode,
        cost: r.cost === null ? null : toSafeNumber(r.cost),
        price: toSafeNumber(r.price),
        conversionFactor: r.conversionFactor === null ? null : toSafeNumber(r.conversionFactor),
      }));
      const conversionFactors: MigrationConversionFactorInput[] = cfRows.map((r: any) => ({
        productId: r.productId,
        unit: r.unit,
        factor: toSafeNumber(r.factor),
      }));

      let idCounter = 0;
      const generateId = () => {
        idCounter += 1;
        return `psu_${Date.now()}_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
      };

      const plan = computeSellingUnitsPlan(products, conversionFactors, generateId);

      // --- Preflight guard: refuse to merge a child with an unsafe qty_base ---
      //
      // qty_base is used as a divisor when converting a child's inventory_batches
      // unit_cost into root-equivalent terms (see convertChildUnitCostToBase). A
      // qty_base <= 0 only happens on pre-existing bad conversion-factor data
      // (e.g. a missing or inverted conversion_factors row) — fail loudly rather
      // than divide by zero or silently flip a cost's sign. This runs before the
      // INSERT/UPDATE/DELETE loops below, so the throw aborts the transaction
      // with nothing written.
      const unsafeQtyBase: string[] = [];
      for (const unit of plan.sellingUnits) {
        if (!unit.isBase && unit.qtyBase <= 0) {
          unsafeQtyBase.push(`${unit.sourceProductId} (qty_base=${unit.qtyBase})`);
        }
      }
      if (unsafeQtyBase.length > 0) {
        throw new Error(
          `Migration 120 aborted: ${unsafeQtyBase.length} child product(s) have a qty_base <= 0, which cannot be ` +
          `safely used to convert stock/batch cost into root-equivalent terms (likely a bad or missing ` +
          `conversion_factors row). Nothing was written. Affected products:\n  ${unsafeQtyBase.join('\n  ')}\n` +
          `Fix the underlying conversion_factors data before re-running.`
        );
      }

      // Looked up per-reassignment below to convert that child's stock/batches.
      const sellingUnitById = new Map(plan.sellingUnits.map(u => [u.id, u]));

      for (const unit of plan.sellingUnits) {
        await connection.query(
          `INSERT INTO product_selling_units
             (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [unit.id, unit.rootProductId, unit.unitName, unit.qtyBase, unit.barcode, unit.cost, unit.price, unit.isBase ? 1 : 0, unit.sortOrder]
        );
      }

      // product_price_levels is created by a standalone script (not a
      // numbered migration), so it may not exist on a fresh DB. Check once,
      // outside the loop, since the schema doesn't change mid-transaction.
      const hasProductPriceLevels = await tableExists(connection, 'product_price_levels');

      for (const r of plan.reassignments) {
        const qtyBase = sellingUnitById.get(r.sellingUnitId)!.qtyBase;

        // Merge the child's own stock counter into the root's, converted to
        // base units. products.stock and inventory_batches are independently
        // maintained elsewhere in this codebase (lib/stock-movements.ts), so
        // this addition is separate from the batch conversion below, not
        // derived from it.
        const [[childProductRow]]: any = await connection.query(
          'SELECT stock FROM products WHERE id = ?',
          [r.fromProductId]
        );
        const childStock = childProductRow?.stock == null ? 0 : toSafeNumber(childProductRow.stock);
        await connection.query(
          'UPDATE products SET stock = stock + ? WHERE id = ?',
          [convertChildQuantityToBase(childStock, qtyBase), r.toRootProductId]
        );

        // Convert and re-point the child's inventory_batches in one statement.
        // quantity_in/quantity_remaining scale up by qtyBase; unit_cost scales
        // down by the same factor so total peso value (qty * unit_cost) is
        // preserved. The same batch id + received_date are kept, so FIFO order
        // against the root's own pre-existing batches is unaffected.
        await connection.query(
          `UPDATE inventory_batches
           SET product_id = ?, selling_unit_id = ?,
               quantity_in = quantity_in * ?,
               quantity_remaining = quantity_remaining * ?,
               unit_cost = unit_cost / ?
           WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, qtyBase, qtyBase, qtyBase, r.fromProductId]
        );
        await connection.query(
          `UPDATE sale_items
           SET product_id = ?,
               selling_unit_id = ?,
               selling_unit_name = (SELECT unit_name FROM product_selling_units WHERE id = ?),
               selling_unit_qty_base = (SELECT qty_base FROM product_selling_units WHERE id = ?)
           WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, r.sellingUnitId, r.sellingUnitId, r.fromProductId]
        );
        await connection.query(
          `UPDATE purchase_order_items
           SET product_id = ?,
               selling_unit_id = ?,
               selling_unit_name = (SELECT unit_name FROM product_selling_units WHERE id = ?),
               selling_unit_qty_base = (SELECT qty_base FROM product_selling_units WHERE id = ?)
           WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, r.sellingUnitId, r.sellingUnitId, r.fromProductId]
        );

        // Every other table with a products.id FK must be re-pointed too.
        // Eight of them are ON DELETE CASCADE, so leaving them alone would
        // silently destroy their rows when the child products row is deleted
        // below — including the BIR-significant sales_invoice_items and
        // pos_transaction_items. stock_count_items has no ON DELETE clause at
        // all (MySQL default RESTRICT), so it would have blocked the DELETE
        // outright and aborted the migration.
        for (const table of SIMPLE_REPOINT_TABLES) {
          await connection.query(
            `UPDATE ${table} SET product_id = ?, selling_unit_id = ? WHERE product_id = ?`,
            [r.toRootProductId, r.sellingUnitId, r.fromProductId]
          );
        }

        // product_shelves has PRIMARY KEY (product_id, shelf_id): a blind
        // UPDATE collides whenever the root is already shelved at the same
        // shelf as the child. Merge instead — the root's existing row wins.
        // Shelf placement is non-financial location data, so losing the exact
        // child-vs-root split here is acceptable (see down()).
        await connection.query(
          `INSERT IGNORE INTO product_shelves (product_id, shelf_id, quantity)
             SELECT ?, shelf_id, quantity FROM product_shelves WHERE product_id = ?`,
          [r.toRootProductId, r.fromProductId]
        );
        await connection.query('DELETE FROM product_shelves WHERE product_id = ?', [r.fromProductId]);

        // supplier_product_mapping has UNIQUE (product_id, supplier_id): same
        // problem, different shape. Drop the child's rows for suppliers the
        // root already maps to, then move the rest across.
        await connection.query(
          `DELETE FROM supplier_product_mapping
            WHERE product_id = ?
              AND supplier_id IN (SELECT supplier_id FROM (
                    SELECT supplier_id FROM supplier_product_mapping WHERE product_id = ?
                  ) AS root_suppliers)`,
          [r.fromProductId, r.toRootProductId]
        );
        await connection.query(
          'UPDATE supplier_product_mapping SET product_id = ? WHERE product_id = ?',
          [r.toRootProductId, r.fromProductId]
        );

        // product_price_levels has PRIMARY KEY (product_id, price_level_id):
        // same collision risk as product_shelves above, whenever the root and
        // the child each carry their own price-level override for the same
        // price_level_id (this happens on real data — e.g. both a root and
        // its child have their own "retail-level" row). Merge instead — the
        // root's existing row wins. Only touch this table if it exists: it's
        // created by the standalone run_price_level_migration.js script, not
        // a numbered migration here.
        if (hasProductPriceLevels) {
          await connection.query(
            `INSERT IGNORE INTO product_price_levels (product_id, price_level_id, price, min_quantity)
               SELECT ?, price_level_id, price, min_quantity FROM product_price_levels WHERE product_id = ?`,
            [r.toRootProductId, r.fromProductId]
          );
          await connection.query('DELETE FROM product_price_levels WHERE product_id = ?', [r.fromProductId]);
        }
      }

      // Deepest-first order from the plan means a node's own children (if
      // any) are already gone by the time we delete it, so the self-FK on
      // products.parent_id never blocks a delete here.
      for (const deletedId of plan.deletedProductIds) {
        const [[productRow]]: any = await connection.query('SELECT * FROM products WHERE id = ?', [deletedId]);
        const [cfForThisProduct]: any = await connection.query(
          'SELECT id, product_id, unit, factor, created_at FROM conversion_factors WHERE product_id = ?',
          [deletedId]
        );
        const r = plan.reassignments.find(x => x.fromProductId === deletedId)!;

        await connection.query(
          `INSERT INTO migration_120_backup (id, product_json, conversion_factors_json, root_product_id, selling_unit_id)
           VALUES (?, ?, ?, ?, ?)`,
          [deletedId, JSON.stringify(productRow), JSON.stringify(cfForThisProduct), r.toRootProductId, r.sellingUnitId]
        );

        await connection.query('DELETE FROM products WHERE id = ?', [deletedId]);
      }

      const rootCount = new Set(plan.sellingUnits.map(u => u.rootProductId)).size;
      console.log(`✅ Migrated ${plan.sellingUnits.length} selling unit(s) across ${rootCount} product(s); removed ${plan.deletedProductIds.length} legacy child product row(s)`);
    });
  },

  async down(): Promise<void> {
    await withTransaction(async (connection) => {
      const [backupRows]: any = await connection.query('SELECT * FROM migration_120_backup');

      if (backupRows.length === 0) {
        console.log('ℹ️  No migration_120_backup rows found, nothing to restore');
      } else {
        const pending = new Map<string, any>(backupRows.map((r: any) => [r.id, r]));
        let progress = true;

        while (pending.size > 0 && progress) {
          progress = false;
          for (const [id, row] of Array.from(pending.entries())) {
            const productData = parseJsonColumn(row.product_json);
            const parentId = productData.parent_id;
            if (parentId) {
              const [[parentExists]]: any = await connection.query('SELECT id FROM products WHERE id = ?', [parentId]);
              if (!parentExists) continue; // parent not restored yet, retry next pass
            }

            const sanitizedProductData = sanitizeRow(productData);
            const columns = Object.keys(sanitizedProductData);
            const placeholders = columns.map(() => '?').join(', ');
            await connection.query(
              `INSERT INTO products (${columns.join(', ')}) VALUES (${placeholders})`,
              columns.map(c => sanitizedProductData[c])
            );

            const cfRows = parseJsonColumn(row.conversion_factors_json);
            for (const cf of cfRows) {
              const sanitizedCf = sanitizeRow(cf);
              await connection.query(
                'INSERT INTO conversion_factors (id, product_id, unit, factor, created_at) VALUES (?, ?, ?, ?, ?)',
                [sanitizedCf.id, sanitizedCf.product_id, sanitizedCf.unit, sanitizedCf.factor, sanitizedCf.created_at]
              );
            }

            const [[suRow]]: any = await connection.query(
              'SELECT qty_base FROM product_selling_units WHERE id = ?',
              [row.selling_unit_id]
            );
            const qtyBase = suRow ? toSafeNumber(suRow.qty_base) : 1;

            // Reverse the batch conversion done in up(): divide quantities back
            // down, multiply unit_cost back up, and un-repoint to the restored
            // child. Scoped to (root_product_id, selling_unit_id) so only the
            // batches that came from THIS child are touched, not the root's own
            // or another merged sibling's.
            await connection.query(
              `UPDATE inventory_batches
               SET product_id = ?, selling_unit_id = NULL,
                   quantity_in = quantity_in / ?,
                   quantity_remaining = quantity_remaining / ?,
                   unit_cost = unit_cost * ?
               WHERE product_id = ? AND selling_unit_id = ?`,
              [id, qtyBase, qtyBase, qtyBase, row.root_product_id, row.selling_unit_id]
            );

            // Reverse the stock merge: subtract the same converted amount that
            // up() added, using the child's original stock value already
            // captured in this backup row.
            const backedUpChildStock = productData.stock == null ? 0 : toSafeNumber(productData.stock);
            await connection.query(
              'UPDATE products SET stock = stock - ? WHERE id = ?',
              [convertChildQuantityToBase(backedUpChildStock, qtyBase), row.root_product_id]
            );
            await connection.query(
              'UPDATE sale_items SET product_id = ?, selling_unit_id = NULL, selling_unit_name = NULL, selling_unit_qty_base = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );
            await connection.query(
              'UPDATE purchase_order_items SET product_id = ?, selling_unit_id = NULL, selling_unit_name = NULL, selling_unit_qty_base = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );
            for (const table of SIMPLE_REPOINT_TABLES) {
              await connection.query(
                `UPDATE ${table} SET product_id = ?, selling_unit_id = NULL WHERE product_id = ? AND selling_unit_id = ?`,
                [id, row.root_product_id, row.selling_unit_id]
              );
            }
            // product_shelves and supplier_product_mapping are intentionally
            // NOT reversed: up() merged them into the root (deduping against
            // its PK / UNIQUE constraint) rather than tagging them, so which
            // rows came from the child is no longer recoverable. Both hold
            // non-financial association data — a restored product can simply
            // be re-shelved and re-linked to its suppliers by hand.
            //
            // product_price_levels has the same limitation and for the same
            // reason: up() merges it into the root via the same composite-PK
            // INSERT-IGNORE-then-DELETE shape (root's existing row wins on a
            // price_level_id collision), so it isn't tagged and can't be
            // precisely un-merged here either. Acceptable because these rows
            // are price overrides, not audit/financial transaction history —
            // they can be manually re-entered if a rollback is ever needed.

            pending.delete(id);
            progress = true;
          }
        }

        if (pending.size > 0) {
          throw new Error(`migration_120 rollback stalled: could not restore parent for ${[...pending.keys()].join(', ')}`);
        }
      }

      // up() created a selling unit for every surviving product too — remove all of them.
      await connection.query('DELETE FROM product_selling_units');
    });

    // DDL outside the transaction, for the same implicit-commit reason as up().
    await query('DROP TABLE IF EXISTS migration_120_backup');
    console.log('✅ Rolled back selling-units data migration');
  }
};

registerMigration(migration);
