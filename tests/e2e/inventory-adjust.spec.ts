import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { INVENTORY_PRODUCT } from './fixtures/test-data';

/**
 * Inventory stock adjustment (DB-backed) — i-drive ang Adjust Stock dialog sa
 * /inventory batok sa alon_pos_test. Naggamit ug dedicated INV-ADJ product.
 */
test.describe('Inventory adjustment', () => {
  test('admin makadugang ug stock pinaagi sa Adjust Stock dialog', async ({ page, request }) => {
    const addQty = 25;
    const expectedStock = INVENTORY_PRODUCT.stock + addQty; // 100 + 25 = 125

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/inventory');

    // I-search ang target product aron usa ra ka card ang makita.
    await page.getByPlaceholder(/search products by name or sku/i).fill(INVENTORY_PRODUCT.sku);

    // Ablihi ang row action menu → Adjust Stock.
    await page.getByRole('button', { name: 'Actions' }).first().click();
    await page.getByRole('menuitem', { name: 'Adjust Stock' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Adjust Stock')).toBeVisible();

    // Add tab default na; i-fill ang quantity ug pili ug reason.
    await dialog.getByLabel(/quantity to add/i).fill(String(addQty));
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'New Shipment' }).click();

    await dialog.getByRole('button', { name: 'Confirm Adjustment' }).click();
    await expect(dialog).toBeHidden();

    // I-verify nga ang stock midugang sa DB.
    await expect(async () => {
      const res = await request.get(`/api/products?search=${INVENTORY_PRODUCT.sku}&limit=50`);
      const body = await res.json();
      const match = (body.data ?? []).find((p: any) => p.sku === INVENTORY_PRODUCT.sku);
      expect(match, 'inventory product makita').toBeTruthy();
      expect(Number(match.stock)).toBe(expectedStock);
    }).toPass({ timeout: 10_000 });
  });
});
