import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import { TEST_PRICE_LEVEL, TEST_PRICE_LEVEL_WHOLESALE, TEST_MAIN_WAREHOUSE } from './fixtures/test-data';

/**
 * Products data table — stock color indicator (walay Status column na) ug ang
 * expandable selling-units accordion panel. Gi-seed direkta sa DB kay ang
 * gi-test dinhi mao ang display, dili ang Add/Edit Product form.
 */

const PRODUCT_ID = 'e2e-ptsu-product';
const PRODUCT_NAME = 'E2E Table Selling Units';
const PRODUCT_SKU = 'E2E-PTSU-001';

async function cleanup() {
  await testQuery('DELETE FROM products WHERE id = ?', [PRODUCT_ID]);
}

test.describe('Products table — stock indicator & selling units panel', () => {
  test.beforeEach(async () => {
    await cleanup();
    // Ang products table mo-land sa default warehouse (TEST_MAIN_WAREHOUSE), mao nga
    // ang produkto kinahanglan naa didto -- ang NULL warehouse_id dili na makita.
    // stock 24 sa base (Piece); reorder_point 0 → in-stock kung wala'y global threshold.
    await testQuery(
      `INSERT INTO products (id, name, description, category, brand, sku, barcode, stock, reorder_point, price, cost, unit_of_measure, availability, warehouse_id)
       VALUES (?, ?, 'E2E', 'General', 'Generic', ?, 'E2E-PTSU-BASE', 24, 0, 10, 5, 'Piece', 'in-stock', ?)`,
      [PRODUCT_ID, PRODUCT_NAME, PRODUCT_SKU, TEST_MAIN_WAREHOUSE.id],
    );
    await testQuery(
      `INSERT INTO product_selling_units (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
       VALUES ('e2e-ptsu-pc', ?, 'Piece', 1, 'E2E-PTSU-BASE', 5, 10, 1, 0),
              ('e2e-ptsu-box', ?, 'Box', 12, 'E2E-PTSU-BOX', 60, 110, 0, 1)`,
      [PRODUCT_ID, PRODUCT_ID],
    );
    await testQuery(
      `INSERT INTO product_selling_unit_prices (selling_unit_id, price_level_id, price, min_quantity)
       VALUES ('e2e-ptsu-box', ?, 110, 0), ('e2e-ptsu-box', ?, 100, 0)`,
      [TEST_PRICE_LEVEL.id, TEST_PRICE_LEVEL_WHOLESALE.id],
    );
  });

  test.afterEach(cleanup);

  test('shows a stock dot instead of a Status column', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await page.getByPlaceholder('Search products...').fill(PRODUCT_SKU);

    await expect(page.getByRole('columnheader', { name: 'Status' })).toHaveCount(0);
    const row = page.getByRole('row', { name: new RegExp(PRODUCT_NAME) });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('stock-indicator')).toHaveAttribute('data-status', 'in-stock');
  });

  test('out-of-stock products get the red dot', async ({ page }) => {
    await testQuery('UPDATE products SET stock = 0 WHERE id = ?', [PRODUCT_ID]);
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await page.getByPlaceholder('Search products...').fill(PRODUCT_SKU);

    const row = page.getByRole('row', { name: new RegExp(PRODUCT_NAME) });
    await expect(row.getByTestId('stock-indicator')).toHaveAttribute('data-status', 'out-of-stock');
  });

  test('a product with selling units advertises the count before it is expanded', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await page.getByPlaceholder('Search products...').fill(PRODUCT_SKU);

    const row = page.getByRole('row', { name: new RegExp(PRODUCT_NAME) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('2 units');
    // Closed by default: the unit rows must not be in the DOM yet.
    await expect(page.getByTestId('selling-unit-item')).toHaveCount(0);
  });

  test('expanding a row lists selling units with barcode, derived stock and price levels', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await page.getByPlaceholder('Search products...').fill(PRODUCT_SKU);

    const row = page.getByRole('row', { name: new RegExp(PRODUCT_NAME) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: `Expand ${PRODUCT_NAME}` }).click();

    const items = page.getByTestId('selling-unit-item');
    await expect(items).toHaveCount(2);

    const box = items.filter({ hasText: 'Box' });
    await expect(box).toContainText('E2E-PTSU-BOX');
    await expect(box).toContainText('₱110.00');
    // 24 base pcs / 12 per Box = 2 boxes
    await expect(box.getByTestId('selling-unit-stock')).toHaveAttribute('data-status', 'in-stock');
    await expect(box).toContainText('2');

    // Both price levels are visible on the FIRST expand -- the old nested
    // accordion needed a second click to reach the wholesale price.
    await expect(box).toContainText(TEST_PRICE_LEVEL.name);
    await expect(box).toContainText(TEST_PRICE_LEVEL_WHOLESALE.name);
    await expect(box).toContainText('₱100.00');
    // Cost sits in the table's own Cost column now, not in a "Cost: x" line.
    await expect(box).toContainText('₱60.00');
  });

  test('selling-unit rows share the products table columns', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await page.getByPlaceholder('Search products...').fill(PRODUCT_SKU);

    const row = page.getByRole('row', { name: new RegExp(PRODUCT_NAME) });
    await row.getByRole('button', { name: `Expand ${PRODUCT_NAME}` }).click();

    const box = page.getByTestId('selling-unit-item').filter({ hasText: 'Box' });
    // Same cell count as the product row => the columns line up. This is the
    // whole point of the redesign, so it gets an assertion of its own.
    await expect(box.locator('td')).toHaveCount(await row.locator('td').count());
  });
});
