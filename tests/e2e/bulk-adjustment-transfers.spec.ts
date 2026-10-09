import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import { SHELF_A, SHELF_B, SHELF_XFER_PRODUCT } from './fixtures/test-data';

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

  test('ang tangal na nga boards mo-404', async ({ page }) => {
    for (const path of ['/inventory/transfer-board', '/inventory/shelf-board']) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} kinahanglan 404`).toBe(404);
    }
  });
});
