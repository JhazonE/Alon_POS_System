import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import {
  SHELF_A, SHELF_B, SHELF_XFER_PRODUCT,
  TEST_WAREHOUSE, TRANSFER_TARGET_WAREHOUSE,
  TRANSFER_NULL_SKU_SOURCE, TRANSFER_NULL_SKU_TARGET,
} from './fixtures/test-data';

/**
 * Transfers pinaagi sa Bulk Adjustment page — mao na ang usa ra nga lugar para
 * sa tanan nga transfer human matangal ang Transfer Board ug Shelf Board.
 *
 * Ang assertions mo-adto sa DATABASE: ang success toast dili pruweba nga naka-
 * landing ang write. Ilabi na sa shelf transfer — ang `products.stock` kinahanglan
 * DILI gyud mausab, ug ang toast dili makasulti niana.
 */

async function shelfQty(productId: string, shelfId: string): Promise<number> {
  const rows = await testQuery(
    'SELECT quantity FROM product_shelves WHERE product_id = ? AND shelf_id = ?',
    [productId, shelfId],
  );
  return rows.length ? Number(rows[0].quantity) : 0;
}

async function totalStock(productId: string): Promise<number> {
  const rows = await testQuery('SELECT stock FROM products WHERE id = ?', [productId]);
  return Number(rows[0].stock);
}

test.describe('Bulk Adjustment transfers', () => {
  test('shelf transfer: mobalhin ang product_shelves, DILI mausab ang total stock', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);

    const stockBefore = await totalStock(SHELF_XFER_PRODUCT.id);
    const aBefore = await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_A.id);
    const bBefore = await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_B.id);
    expect(aBefore).toBe(SHELF_XFER_PRODUCT.onShelfA);

    await page.goto('/inventory/bulk-adjustment');

    await page.getByRole('button', { name: /^transfer$/i }).click();
    await page.getByRole('button', { name: /^shelf$/i }).click();

    await page.getByRole('combobox').filter({ hasText: /select source shelf/i }).click();
    await page.getByRole('option', { name: SHELF_A.name }).click();
    await page.getByRole('combobox').filter({ hasText: /select destination shelf/i }).click();
    await page.getByRole('option', { name: SHELF_B.name }).click();

    await page.getByPlaceholder(/search products by name or sku/i).fill(SHELF_XFER_PRODUCT.sku);
    await page.getByText(SHELF_XFER_PRODUCT.name).first().click();

    await page.getByRole('button', { name: /process|confirm|apply/i }).first().click();

    await expect(async () => {
      expect(await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_A.id)).toBe(aBefore - 1);
      expect(await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_B.id)).toBe(bBefore + 1);
      // Ang pinakaimportante nga assertion sa tibuok file.
      expect(await totalStock(SHELF_XFER_PRODUCT.id)).toBe(stockBefore);
    }).toPass({ timeout: 15_000 });
  });

  test('shelf mode: ang ceiling kay ang shelf quantity, dili ang total stock', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);

    // Gibasa gikan sa DB, dili gi-hardcode: ang shelf-transfer test sa ibabaw
    // nagbalhin ug 1 gikan sa SHELF_A sa parehas nga DB (workers: 1, shared), mao
    // nga 3 na ni, dili 4. Importante lang nga mas gamay kini kaysa total stock.
    const shelfAQty = await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_A.id);
    const stock = await totalStock(SHELF_XFER_PRODUCT.id);
    expect(shelfAQty).toBeGreaterThan(0);
    expect(shelfAQty).toBeLessThan(stock);

    await page.goto('/inventory/bulk-adjustment');

    await page.getByRole('button', { name: /^transfer$/i }).click();
    await page.getByRole('button', { name: /^shelf$/i }).click();

    await page.getByRole('combobox').filter({ hasText: /select source shelf/i }).click();
    await page.getByRole('option', { name: SHELF_A.name }).click();
    await page.getByRole('combobox').filter({ hasText: /select destination shelf/i }).click();
    await page.getByRole('option', { name: SHELF_B.name }).click();

    await page.getByPlaceholder(/search products by name or sku/i).fill(SHELF_XFER_PRODUCT.sku);
    await page.getByText(SHELF_XFER_PRODUCT.name).first().click();

    // Gamay ra ang naa sa SHELF_A kaysa total stock (30). Ang item row kinahanglan
    // mo-clamp sa shelf quantity — kung 30 ang resulta, naguba ang per-shelf limit.
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('99');
    await qtyInput.blur();
    await expect(qtyInput).toHaveValue(String(shelfAQty));
  });

  test('warehouse transfer: mo-move ang stock tali sa duha ka warehouse', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);

    // Gibasa gikan sa DB sa sinugdan — dili gi-hardcode, aron dili depende sa order sa mga test.
    const srcBefore = await totalStock(TRANSFER_NULL_SKU_SOURCE.id);
    const destBefore = await totalStock(TRANSFER_NULL_SKU_TARGET.id);

    await page.goto('/inventory/bulk-adjustment');

    await page.getByRole('button', { name: /^transfer$/i }).click();
    // Ang warehouse mao ang default nga destination type — gi-click gihapon
    // aron ma-pruweba nga mo-trabaho ang toggle sa duha ka direksyon.
    await page.getByRole('button', { name: /^warehouse$/i }).click();

    await page.getByRole('combobox').filter({ hasText: /all warehouses/i }).click();
    await page.getByRole('option', { name: TEST_WAREHOUSE.name }).click();
    await page.getByRole('combobox').filter({ hasText: /select destination/i }).click();
    await page.getByRole('option', { name: TRANSFER_TARGET_WAREHOUSE.name }).click();

    // Walay SKU kini nga produkto (NULL), mao nga pangitaon pinaagi sa name.
    await page.getByPlaceholder(/search products by name or sku/i).fill(TRANSFER_NULL_SKU_SOURCE.name);
    await page.getByText(TRANSFER_NULL_SKU_SOURCE.name).first().click();

    await page.getByRole('button', { name: /process|confirm|apply/i }).first().click();

    await expect(async () => {
      expect(await totalStock(TRANSFER_NULL_SKU_SOURCE.id)).toBe(srcBefore - 1);
      expect(await totalStock(TRANSFER_NULL_SKU_TARGET.id)).toBe(destBefore + 1);
    }).toPass({ timeout: 15_000 });
  });

  test('ang tangal na nga board UI dili na makita', async ({ page }) => {
    // Ang test dili mo-assert 404 status (ang [productId] catch-all route mo-match
    // sa paths ug mo-render "Product Not Found" 200). Instead, mo-assert na ang
    // board's distinctive heading (UI) ay wala na sa rendered page.

    const headings = [
      { path: '/inventory/transfer-board', heading: 'Warehouse Transfer Board' },
      { path: '/inventory/shelf-board', heading: 'Shelf Transfer Board' },
    ];

    for (const { path, heading } of headings) {
      await page.goto(path);

      // Board UI is gone
      await expect(page.locator(`h1:has-text("${heading}")`)).toHaveCount(0);

      // Catch-all [productId] route renders "Product Not Found" instead
      await expect(page.locator('text=Product Not Found')).toHaveCount(1);
    }
  });
});
