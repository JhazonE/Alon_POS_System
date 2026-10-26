import { test, expect } from '@playwright/test';
import { migration } from '../../scripts/migrations/144_backfill_product_warehouse_fanout';
import { query } from '../../lib/mysql';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  seedProductInWarehouse,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Migration 144 backfills EVERY product in the database, not just the ones a
 * test seeded, so each test snapshots the product ids first and removes whatever
 * the backfill added to the shared seed catalogue afterwards.
 *
 * runBackfill() calls the migration's own up(). That goes through lib/mysql's
 * pool, whose database comes from DB_NAME; playwright.config.ts sets
 * DB_NAME=alon_pos_test before the workers start (the same reason the other
 * specs that import lib/* hit the test DB). The helper asserts it rather than
 * trusting it: if this ever ran against the dev `alon_pos` it would backfill the
 * real catalogue.
 */
async function runBackfill(): Promise<void> {
  const rows = (await query('SELECT DATABASE() AS db')) as Array<{ db: string }>;
  if (rows[0].db !== 'alon_pos_test') {
    throw new Error(`runBackfill refuses to run against "${rows[0].db}" - expected alon_pos_test`);
  }
  await migration.up();
}

test.describe('migration 144 - backfill product warehouse fan-out', () => {
  const seededBranches: SeededBranch[] = [];
  const extraWarehouses: string[] = [];
  const skus: string[] = [];
  const names: string[] = [];
  let preexisting = new Set<string>();
  const backdated: Array<[string, Date]> = [];
  let migrationRow: { existed: boolean; executed_at: Date | null } | null = null;

  test.beforeEach(async () => {
    const rows = await testQuery('SELECT id FROM products');
    preexisting = new Set(rows.map((r: any) => r.id));
  });

  test.afterEach(async () => {
    // Children first: products.parent_id is a FK to products.id.
    const now = await testQuery('SELECT id FROM products ORDER BY (parent_id IS NULL), id');
    for (const r of now) {
      if (preexisting.has(r.id)) continue;
      await testQuery('DELETE FROM product_price_levels WHERE product_id = ?', [r.id]);
      await testQuery('DELETE FROM products WHERE id = ?', [r.id]);
    }
    for (const name of names.splice(0)) {
      await testQuery('DELETE FROM products WHERE name = ?', [name]);
    }
    for (const sku of skus.splice(0)) {
      await testQuery('DELETE FROM products WHERE sku = ?', [sku]);
    }
    for (const [id, createdAt] of backdated.splice(0)) {
      await testQuery('UPDATE products SET created_at = ? WHERE id = ?', [createdAt, id]);
    }
    for (const id of extraWarehouses.splice(0)) {
      await testQuery('DELETE FROM warehouses WHERE id = ?', [id]);
    }
    for (const b of seededBranches.splice(0)) {
      await cleanupSecondBranch(b);
    }
    if (migrationRow) {
      if (migrationRow.existed) {
        await testQuery('UPDATE migrations SET executed_at = ? WHERE name = ?', [
          migrationRow.executed_at,
          migration.name,
        ]);
      } else {
        await testQuery('DELETE FROM migrations WHERE name = ?', [migration.name]);
      }
      migrationRow = null;
    }
  });

  async function seed(): Promise<SeededBranch> {
    const b = await seedSecondBranch();
    seededBranches.push(b);
    return b;
  }

  async function addWarehouse(branchId: string, active = true): Promise<string> {
    const id = await addWarehouseToBranch(branchId, { active });
    extraWarehouses.push(id);
    return id;
  }

  function newSku(): string {
    const sku = `BF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    skus.push(sku);
    return sku;
  }

  /** Raw product insert for the shapes seedProductInWarehouse cannot make. */
  async function insertProduct(f: {
    id: string;
    name: string;
    warehouseId: string | null;
    sku?: string | null;
    type?: 'standard' | 'service';
    parentId?: string | null;
    stock?: number;
  }): Promise<void> {
    await testQuery(
      `INSERT INTO products (id, name, price, sku, stock, warehouse_id, type, parent_id)
       VALUES (?, ?, 1.00, ?, ?, ?, ?, ?)`,
      [f.id, f.name, f.sku ?? null, f.stock ?? 0, f.warehouseId, f.type ?? 'standard', f.parentId ?? null]
    );
  }

  /** Pretend migration 144 was recorded one minute from now, so copies made now fall in down()'s window. */
  async function recordMigrationInWindow(): Promise<void> {
    // down() looks at products created in the ten minutes before executed_at. The
    // seed catalogue was created minutes ago, so push it out of that window
    // (restored in afterEach) - otherwise down() would delete seed rows too.
    const seedRows = await testQuery('SELECT id, created_at FROM products WHERE id IN (?)', [[...preexisting, '']]);
    for (const r of seedRows) backdated.push([r.id, r.created_at]);
    await testQuery("UPDATE products SET created_at = '2000-01-01 00:00:00' WHERE id IN (?)", [[...preexisting, '']]);
    const existing = await testQuery('SELECT executed_at FROM migrations WHERE name = ?', [migration.name]);
    migrationRow = { existed: existing.length > 0, executed_at: existing[0]?.executed_at ?? null };
    if (existing.length > 0) {
      await testQuery('UPDATE migrations SET executed_at = DATE_ADD(NOW(), INTERVAL 1 MINUTE) WHERE name = ?', [
        migration.name,
      ]);
    } else {
      await testQuery(
        'INSERT INTO migrations (name, timestamp, executed_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 MINUTE))',
        [migration.name, migration.timestamp]
      );
    }
  }

  test('backfill fans existing products into their branch warehouses at zero stock', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    await seedProductInWarehouse(b.warehouseId, sku);

    await runBackfill();

    const rows = await testQuery('SELECT warehouse_id, stock, avg_daily_sales FROM products WHERE sku = ?', [sku]);
    expect(rows).toHaveLength(2);
    const copy = rows.find((r: any) => r.warehouse_id === extra);
    expect(copy).toBeTruthy();
    expect(Number(copy.stock)).toBe(0);
    expect(Number(copy.avg_daily_sales)).toBe(0);
    // The source keeps its quantity.
    expect(Number(rows.find((r: any) => r.warehouse_id === b.warehouseId).stock)).toBe(10);
  });

  test('backfill is idempotent across two runs', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    const sku = newSku();
    await seedProductInWarehouse(b.warehouseId, sku);

    await runBackfill();
    await runBackfill();

    const rows = await testQuery('SELECT id FROM products WHERE sku = ?', [sku]);
    expect(rows).toHaveLength(2);
  });

  test('backfill skips services, non-root products and NULL-warehouse products', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    const tag = `BFSKIP-${Date.now()}`;
    const parentSku = newSku();
    const parentId = await seedProductInWarehouse(b.warehouseId, parentSku);
    names.push(`${tag}-service`, `${tag}-child`, `${tag}-nowh`);
    await insertProduct({ id: `${tag}-svc`, name: `${tag}-service`, warehouseId: b.warehouseId, type: 'service' });
    await insertProduct({ id: `${tag}-chd`, name: `${tag}-child`, warehouseId: b.warehouseId, parentId });
    await insertProduct({ id: `${tag}-nwh`, name: `${tag}-nowh`, warehouseId: null });

    await runBackfill();

    for (const n of [`${tag}-service`, `${tag}-child`, `${tag}-nowh`]) {
      const rows = await testQuery('SELECT id FROM products WHERE name = ?', [n]);
      expect(rows, n).toHaveLength(1);
    }
    // The root parent in the same warehouse IS still fanned out.
    expect(await testQuery('SELECT id FROM products WHERE sku = ?', [parentSku])).toHaveLength(2);
  });

  test('backfill creates no inventory batches and no stock', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    await seedProductInWarehouse(b.warehouseId, newSku());

    const batchesBefore = await testQuery('SELECT COUNT(*) n FROM inventory_batches');
    const stockBefore = await testQuery('SELECT COALESCE(SUM(stock), 0) s FROM products');
    const movesBefore = await testQuery('SELECT COUNT(*) n FROM stock_movements');
    await runBackfill();
    const batchesAfter = await testQuery('SELECT COUNT(*) n FROM inventory_batches');
    const stockAfter = await testQuery('SELECT COALESCE(SUM(stock), 0) s FROM products');
    const movesAfter = await testQuery('SELECT COUNT(*) n FROM stock_movements');

    expect(Number(batchesAfter[0].n)).toBe(Number(batchesBefore[0].n));
    expect(Number(stockAfter[0].s)).toBe(Number(stockBefore[0].s));
    expect(Number(movesAfter[0].n)).toBe(Number(movesBefore[0].n));
  });

  test('backfill never crosses branches and ignores inactive warehouses', async () => {
    const a = await seed();
    const other = await seed();
    const inactive = await addWarehouse(a.branchId, false);
    const sku = newSku();
    await seedProductInWarehouse(a.warehouseId, sku);

    await runBackfill();

    // Branch A has one active warehouse (the source) and one inactive: nowhere to fan out to.
    const rows = await testQuery('SELECT warehouse_id FROM products WHERE sku = ?', [sku]);
    expect(rows.map((r: any) => r.warehouse_id)).toEqual([a.warehouseId]);
    expect(rows.map((r: any) => r.warehouse_id)).not.toContain(inactive);
    expect(rows.map((r: any) => r.warehouse_id)).not.toContain(other.warehouseId);
  });

  test('a product already present by sku, or by name when it has no sku, is not duplicated', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    await seedProductInWarehouse(b.warehouseId, sku);
    // Same sku already in the target, under a different name: sku match wins.
    await insertProduct({ id: `bf-sku-${Date.now()}`, name: `Renamed ${sku}`, warehouseId: extra, sku });
    // No sku anywhere: only the name can identify it.
    const noSkuName = `BFNOSKU-${Date.now()}`;
    names.push(noSkuName);
    await insertProduct({ id: `bf-n1-${Date.now()}`, name: noSkuName, warehouseId: b.warehouseId });
    await insertProduct({ id: `bf-n2-${Date.now()}`, name: noSkuName, warehouseId: extra });

    await runBackfill();

    expect(await testQuery('SELECT id FROM products WHERE sku = ?', [sku])).toHaveLength(2);
    expect(await testQuery('SELECT id FROM products WHERE name = ?', [noSkuName])).toHaveLength(2);
  });

  test('a product with no sku is fanned out once and not again on a second run', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    const name = `BFNOSKU2-${Date.now()}`;
    names.push(name);
    await insertProduct({ id: `bf-ns-${Date.now()}`, name, warehouseId: b.warehouseId });

    await runBackfill();
    await runBackfill();

    expect(await testQuery('SELECT id FROM products WHERE name = ?', [name])).toHaveLength(2);
  });

  test('price levels are copied under the copy id', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const sourceId = await seedProductInWarehouse(b.warehouseId, sku);
    const levels = (await testQuery('SELECT id FROM price_levels LIMIT 1')) as Array<{ id: string }>;
    await testQuery(
      'INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, 7.50, 3)',
      [sourceId, levels[0].id]
    );

    await runBackfill();

    const copy = await testQuery('SELECT id FROM products WHERE sku = ? AND warehouse_id = ?', [sku, extra]);
    const copied = await testQuery(
      'SELECT price_level_id, price, min_quantity FROM product_price_levels WHERE product_id = ?',
      [copy[0].id]
    );
    expect(copied).toHaveLength(1);
    expect(copied[0].price_level_id).toBe(levels[0].id);
    expect(Number(copied[0].price)).toBe(7.5);
    expect(Number(copied[0].min_quantity)).toBe(3);
  });

  test('down removes untouched copies but keeps the source', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    await seedProductInWarehouse(b.warehouseId, sku);
    await runBackfill();
    await recordMigrationInWindow();

    await migration.down();

    const rows = await testQuery('SELECT warehouse_id FROM products WHERE sku = ?', [sku]);
    expect(rows.map((r: any) => r.warehouse_id)).toEqual([b.warehouseId]);
    expect(rows.map((r: any) => r.warehouse_id)).not.toContain(extra);
  });

  test('down keeps a copy that has since received stock, history or a document', async () => {
    const b = await seed();
    const wStock = await addWarehouse(b.branchId);
    const wMove = await addWarehouse(b.branchId);
    const wBatch = await addWarehouse(b.branchId);
    const sku = newSku();
    await seedProductInWarehouse(b.warehouseId, sku);
    await runBackfill();

    const idIn = async (w: string) =>
      (await testQuery('SELECT id FROM products WHERE sku = ? AND warehouse_id = ?', [sku, w]))[0].id as string;
    await testQuery('UPDATE products SET stock = 4 WHERE id = ?', [await idIn(wStock)]);
    await testQuery(
      `INSERT INTO stock_movements (id, product_id, product_name, movement_type, quantity_change, previous_stock, new_stock)
       VALUES (?, ?, 'x', 'adjustment', 0, 0, 0)`,
      [`bf-mv-${Date.now()}`, await idIn(wMove)]
    );
    await testQuery(
      `INSERT INTO inventory_batches (id, product_id, quantity_in, quantity_remaining, received_date, selling_price, unit_cost)
       VALUES (?, ?, 0, 0, CURDATE(), 1, 1)`,
      [`bf-ib-${Date.now()}`, await idIn(wBatch)]
    );
    await recordMigrationInWindow();

    await migration.down();

    const rows = await testQuery('SELECT warehouse_id FROM products WHERE sku = ?', [sku]);
    const left = rows.map((r: any) => r.warehouse_id);
    expect(left).toContain(wStock); // received stock
    expect(left).toContain(wMove); // has a stock_movements row
    expect(left).toContain(wBatch); // has an inventory_batches row
    expect(left).toContain(b.warehouseId);
  });

  test('down throws, changing nothing, when the migration was never recorded', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    const sku = newSku();
    await seedProductInWarehouse(b.warehouseId, sku);
    await runBackfill();
    await testQuery('DELETE FROM migrations WHERE name = ?', [migration.name]);

    await expect(migration.down()).rejects.toThrow(/Cannot roll back/);

    expect(await testQuery('SELECT id FROM products WHERE sku = ?', [sku])).toHaveLength(2);
  });
});
