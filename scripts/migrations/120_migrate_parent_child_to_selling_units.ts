import { registerMigration, Migration } from './runner';
import { withTransaction } from '../../lib/mysql';
import { toSafeNumber } from '../../lib/utils';
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput } from '../../lib/selling-units-migration';

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

const migration: Migration = {
  name: '120_migrate_parent_child_to_selling_units',
  timestamp: '2026-09-21_11-30-00',

  async up(): Promise<void> {
    await withTransaction(async (connection) => {
      await connection.query(`
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

      for (const unit of plan.sellingUnits) {
        await connection.query(
          `INSERT INTO product_selling_units
             (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [unit.id, unit.rootProductId, unit.unitName, unit.qtyBase, unit.barcode, unit.cost, unit.price, unit.isBase ? 1 : 0, unit.sortOrder]
        );
      }

      for (const r of plan.reassignments) {
        await connection.query(
          `UPDATE inventory_batches SET product_id = ?, selling_unit_id = ? WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, r.fromProductId]
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

            await connection.query(
              'UPDATE inventory_batches SET product_id = ?, selling_unit_id = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );
            await connection.query(
              'UPDATE sale_items SET product_id = ?, selling_unit_id = NULL, selling_unit_name = NULL, selling_unit_qty_base = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );
            await connection.query(
              'UPDATE purchase_order_items SET product_id = ?, selling_unit_id = NULL, selling_unit_name = NULL, selling_unit_qty_base = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );

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
      await connection.query('DROP TABLE IF EXISTS migration_120_backup');
      console.log('✅ Rolled back selling-units data migration');
    });
  }
};

registerMigration(migration);
