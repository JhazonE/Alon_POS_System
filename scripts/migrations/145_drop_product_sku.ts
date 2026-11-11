import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Drop the dead products.sku column and the unique index over it.
 *
 * products.sku had no form input and was NULL or blank on every row of the live
 * install. Every code reference to it was removed first (commits 5c34061 and
 * e289a71), so nothing reads or writes it by the time this runs. Product identity
 * lives on product_selling_units.barcode (global UNIQUE NOT NULL, migration 115);
 * products.barcode is only a derived copy of the base selling unit's barcode.
 * Deliberately NOT replaced with any new UNIQUE index on products: several specs
 * legitimately seed the same barcode into two warehouses.
 *
 * THE INDEX. Migration 056 created UNIQUE INDEX sku_warehouse (sku, warehouse_id),
 * but a database where 056's down() ran carries a plain UNIQUE INDEX sku (sku)
 * instead (and a fresh 001 install carries the latter until 056 swaps it). So
 * up() resolves which of the two exist from INFORMATION_SCHEMA and drops each one
 * that is present. The index must go before the column: dropping a column that is
 * the only member of a unique index would silently drop the index, but for a
 * composite index MySQL merely shrinks it to (warehouse_id) and keeps it UNIQUE,
 * which would make warehouse_id unique across products. Dropping it explicitly
 * first avoids that trap.
 *
 * Re-runnable: each step checks INFORMATION_SCHEMA first, so a rerun, or a crash
 * between the two steps, is a harmless no-op.
 *
 * ACCEPTED CONSEQUENCE FOR MIGRATION 144. 144 (backfill_product_warehouse_fanout)
 * matches products by sku first and name second, and its down() reads sku too. It
 * is applied and historical and is NOT edited. Once 145 is applied, 144 can never
 * be re-run and its down() becomes unrunnable, because both read a column that no
 * longer exists. This is accepted: 144 is already applied everywhere, and its
 * down() deliberately refuses most rows anyway. Order on a fresh install still
 * holds: 001 creates the column, 056 indexes it, 144 uses it, 145 drops it.
 *
 * DOWN() DOES NOT RECOVER DATA. It re-creates the column and the index, but the
 * values are gone after up(). That is acceptable here ONLY because every row's sku
 * was already NULL or blank before the drop, so there was nothing of value to
 * lose. It is not an oversight; do not "fix" it by trying to reconstruct values.
 */
const INDEX_NAMES = ['sku_warehouse', 'sku'];

async function indexExists(name: string): Promise<boolean> {
  const rows: any = await query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = ?
      LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function skuColumnExists(): Promise<boolean> {
  const rows: any = await query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sku'`
  );
  return rows.length > 0;
}

export const migration: Migration = {
  name: '145_drop_product_sku',
  timestamp: '2026-11-05_10-00-00',

  async up() {
    console.log('Running migration: 145_drop_product_sku');

    // 1. Indexes first (see THE INDEX). Handle both names.
    for (const name of INDEX_NAMES) {
      if (await indexExists(name)) {
        await query(`ALTER TABLE products DROP INDEX \`${name}\``);
        console.log(`✅ Dropped index "${name}" from products`);
      } else {
        console.log(`⚠️ Index "${name}" not present on products`);
      }
    }

    // 2. Then the column.
    if (await skuColumnExists()) {
      await query(`ALTER TABLE products DROP COLUMN sku`);
      console.log('✅ Dropped products.sku');
    } else {
      console.log('⚠️ products.sku already absent');
    }
  },

  async down() {
    console.log('Rolling back migration: 145_drop_product_sku');

    // NOT RECOVERABLE: the values are gone after up(). Acceptable only because
    // every row's sku was already NULL or blank before the drop, so nothing of
    // value is lost (see the header). Rows come back with sku NULL.
    // Also: migration 144 cannot be re-run or rolled back past this point (header).
    if (!(await skuColumnExists())) {
      await query(`ALTER TABLE products ADD COLUMN sku VARCHAR(100) NULL`);
      console.log('✅ Re-added products.sku (all values NULL; originals were not recoverable)');
    }

    // NULLs do not collide in a MySQL unique index, so every restored row (all
    // NULL) satisfies (sku, warehouse_id) trivially.
    if (!(await indexExists('sku_warehouse'))) {
      await query(`ALTER TABLE products ADD UNIQUE INDEX sku_warehouse (sku, warehouse_id)`);
      console.log('✅ Re-created UNIQUE INDEX sku_warehouse (sku, warehouse_id)');
    }
  }
};

registerMigration(migration);
