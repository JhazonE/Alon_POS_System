import { test, expect } from '@playwright/test';
import { migration } from '../../scripts/migrations/144_backfill_product_warehouse_fanout';
import { query } from '../../lib/mysql';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  seedProductInWarehouse,
  seedSaleOnTerminal,
  cleanupSale,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Migration 144 is INERT on this schema, and that is all this spec can still
 * assert.
 *
 * WHAT THIS SPEC USED TO COVER (14 tests) AND WHY IT CANNOT ANY MORE.
 * Migration 144 backfilled every existing product with a zero-stock copy in the
 * other active warehouses of its branch. The old tests executed migration.up()
 * and migration.down() live against alon_pos_test and asserted:
 *   - the fan-out itself: a copy appears in each sibling active warehouse, at
 *     stock = 0 and avg_daily_sales = 0, with the source keeping its quantity;
 *   - idempotency across two runs (both with and without a sku);
 *   - that services, non-root family members (parent_id NOT NULL) and
 *     NULL-warehouse products are skipped;
 *   - that no inventory_batches, no stock and no stock_movements rows are
 *     created;
 *   - that the fan-out never crosses branches and ignores inactive warehouses;
 *   - that a product already present by name in the target is not duplicated;
 *   - that product_price_levels rows are copied under the copy's id;
 *   - and five down() properties: untouched copies removed but the source kept;
 *     a copy that has since received stock, a stock_movements row or an
 *     inventory_batches row is kept; a copy created outside the 10-minute window
 *     is kept; nothing is deleted when every copy of a product is itself a
 *     candidate; and down() throws without changing anything when the migrations
 *     row is absent.
 *
 * Migration 145 dropped products.sku. Migration 144 keys on that column in three
 * places (it is in COPIED_COLUMNS and so in up()'s source SELECT and INSERT; it
 * is the first leg of the identity match; down() selects and compares it), so on
 * this schema both up() and down() now early-return via the compatibility guard
 * in that file WITHOUT reading or writing anything. None of the behaviour listed
 * above is reachable, so none of it is testable. That coverage is lost to the
 * schema change, not dropped by choice - it is recorded here deliberately.
 *
 * SPECIFICALLY LOST, and worth naming because it protects filed BIR documents:
 * down() refuses to delete a copy referenced by sale_items,
 * sales_invoice_items, pos_transaction_items or purchase_order_items, because
 * those FKs are ON DELETE CASCADE and deleting the copy would destroy filed sale
 * lines. That protection is NOT reachable now: down() returns before it builds
 * its INFORMATION_SCHEMA reference scan, before it reads the migrations row, and
 * before it deletes anything. It is covered transitively instead - down() now
 * deletes NOTHING AT ALL, which the "down deletes nothing" test below asserts
 * with a real sale_items line pointing at a real product, so the cascade would
 * fire if down() ever regained the ability to delete. A test that re-created the
 * old assertion exactly would have to restore products.sku to do it, which is
 * the thing CLAUDE.md forbids.
 *
 * What remains genuinely reachable, and is covered below: both up() and down()
 * must complete without throwing (the defect this replaces was
 * ER_BAD_FIELD_ERROR 1054 Unknown column 'sku'), must leave every row untouched,
 * and down() must NOT throw its "no migrations row" error - the guard returns
 * before that check, so an absent migrations row is no longer an error path.
 *
 * runBackfill() calls the migration's own up(). That goes through lib/mysql's
 * pool, whose database comes from DB_NAME; playwright.config.ts sets
 * DB_NAME=alon_pos_test before the workers start (the same reason the other
 * specs that import lib/* hit the test DB). The helper asserts it rather than
 * trusting it: if a future change ever made 144 non-inert again, this must not
 * run against the dev `alon_pos` catalogue.
 */
async function runBackfill(): Promise<void> {
  const rows = (await query('SELECT DATABASE() AS db')) as Array<{ db: string }>;
  if (rows[0].db !== 'alon_pos_test') {
    throw new Error(`runBackfill refuses to run against "${rows[0].db}" - expected alon_pos_test`);
  }
  await migration.up();
}

/** Row counts across every table 144 would have written to, plus the FK-cascade targets. */
async function snapshot(): Promise<Record<string, number>> {
  const tables = [
    'products',
    'product_price_levels',
    'inventory_batches',
    'stock_movements',
    'sale_items',
    'sales_invoice_items',
    'pos_transaction_items',
    'purchase_order_items',
  ];
  const out: Record<string, number> = {};
  for (const t of tables) {
    const rows = await testQuery(`SELECT COUNT(*) AS n FROM \`${t}\``);
    out[t] = Number(rows[0].n);
  }
  const stock = await testQuery('SELECT COALESCE(SUM(stock), 0) AS s FROM products');
  out['SUM(products.stock)'] = Number(stock[0].s);
  return out;
}

test.describe('migration 144 - inert after products.sku was dropped', () => {
  const seededBranches: SeededBranch[] = [];
  const extraWarehouses: string[] = [];
  const barcodes: string[] = [];
  const sales: string[] = [];

  test.afterEach(async () => {
    // Sale lines first: sale_items.product_id FKs to products.id, so the
    // barcode cleanup below cannot run while a line still points at the row.
    for (const saleId of sales.splice(0)) {
      await testQuery('DELETE FROM sale_items WHERE sale_id = ?', [saleId]);
      await cleanupSale(saleId);
    }
    for (const barcode of barcodes.splice(0)) {
      await testQuery('DELETE FROM product_price_levels WHERE product_id IN (SELECT id FROM products WHERE barcode = ?)', [barcode]);
      await testQuery('DELETE FROM products WHERE barcode = ?', [barcode]);
    }
    for (const id of extraWarehouses.splice(0)) {
      await testQuery('DELETE FROM warehouses WHERE id = ?', [id]);
    }
    for (const b of seededBranches.splice(0)) {
      await cleanupSecondBranch(b);
    }
  });

  /**
   * The exact arrangement the fan-out used to act on: a branch with a product in
   * one active warehouse and a second active warehouse beside it. Pre-145 this
   * produced one copy; it must now produce none.
   */
  async function seedFanoutCandidate(): Promise<{ branch: SeededBranch; extra: string; barcode: string }> {
    const branch = await seedSecondBranch();
    seededBranches.push(branch);
    const extra = await addWarehouseToBranch(branch.branchId, { active: true });
    extraWarehouses.push(extra);
    const barcode = `BF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    barcodes.push(barcode);
    await seedProductInWarehouse(branch.warehouseId, barcode);
    return { branch, extra, barcode };
  }

  test('the schema this spec assumes really has no products.sku', async () => {
    // If this fails, 144 is NOT inert and the rest of this spec asserts the
    // wrong thing - the old fan-out assertions (see the docblock) would be the
    // correct coverage again.
    const rows = await testQuery(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sku'`
    );
    expect(rows).toHaveLength(0);
  });

  test('up does not throw and fans nothing out', async () => {
    const { branch, extra, barcode } = await seedFanoutCandidate();
    const before = await snapshot();

    await runBackfill();

    // No ER_BAD_FIELD_ERROR, and no copy in the sibling warehouse.
    const rows = await testQuery('SELECT warehouse_id FROM products WHERE barcode = ?', [barcode]);
    expect(rows.map((r: any) => r.warehouse_id)).toEqual([branch.warehouseId]);
    expect(rows.map((r: any) => r.warehouse_id)).not.toContain(extra);
    expect(await snapshot()).toEqual(before);
  });

  test('up is inert when run twice', async () => {
    await seedFanoutCandidate();
    const before = await snapshot();

    await runBackfill();
    await runBackfill();

    expect(await snapshot()).toEqual(before);
  });

  test('down does not throw and deletes nothing, including a product with a sale line', async () => {
    const { branch, extra, barcode } = await seedFanoutCandidate();
    // The seeded test DB has no sale_items rows, so one is created here: the
    // protection down() used to enforce explicitly was "never delete a product a
    // filed sale line points at", and sale_items.product_id is ON DELETE
    // CASCADE. With a real line in place, "down() deleted nothing" covers it.
    const productId = (await testQuery('SELECT id FROM products WHERE barcode = ?', [barcode]))[0].id;
    const saleId = await seedSaleOnTerminal(branch.terminalId, branch.userUid);
    sales.push(saleId);
    const lineId = `bf-si-${Date.now()}`;
    await testQuery(
      `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, price)
       VALUES (?, ?, ?, 'inert spec line', 1, 1.00)`,
      [lineId, saleId, productId]
    );

    const before = await snapshot();
    expect(before['sale_items']).toBeGreaterThan(0);

    await migration.down();

    expect(await snapshot()).toEqual(before);
    const rows = await testQuery('SELECT warehouse_id FROM products WHERE barcode = ?', [barcode]);
    expect(rows.map((r: any) => r.warehouse_id)).toEqual([branch.warehouseId]);
    expect(extraWarehouses).toContain(extra);
    expect(await testQuery('SELECT id FROM sale_items WHERE id = ?', [lineId])).toHaveLength(1);
  });

  test('down no longer throws when the migrations row is absent', async () => {
    // Pre-145 this was down()'s loudest guarantee: with no migrations row the
    // 10-minute window cannot be established, so it threw "Cannot roll back"
    // rather than guess. The compatibility guard returns before that check, so
    // the error is unreachable - asserted here so the change is explicit rather
    // than discovered later.
    const existing = await testQuery('SELECT executed_at FROM migrations WHERE name = ?', [migration.name]);
    await testQuery('DELETE FROM migrations WHERE name = ?', [migration.name]);
    try {
      const before = await snapshot();
      await expect(migration.down()).resolves.toBeUndefined();
      expect(await snapshot()).toEqual(before);
    } finally {
      if (existing.length > 0) {
        await testQuery('INSERT INTO migrations (name, timestamp, executed_at) VALUES (?, ?, ?)', [
          migration.name,
          migration.timestamp,
          existing[0].executed_at,
        ]);
      }
    }
  });
});
