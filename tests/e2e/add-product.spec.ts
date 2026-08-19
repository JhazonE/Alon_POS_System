import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { TEST_BRAND, TEST_CATEGORY, TEST_UNIT, NEW_PRODUCT } from './fixtures/test-data';

/**
 * Add Product (DB-backed) — i-drive ang tinuod nga Add Product dialog batok sa
 * alon_pos_test. Nagsalig sa seeded brand/category/unit + category markup (ang form
 * walay standalone price input; ang price mo-auto-calculate gikan sa cost × markup).
 */

/** I-pili ang usa ka Radix Select option pinaagi sa label sa sulod sa dialog. */
async function selectOption(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
  label: string | RegExp,
  optionName: string,
) {
  // exact:true aron dili mag-match ang "Category" sa "Subcategory" (substring).
  await dialog.getByLabel(label, { exact: true }).click();
  // Ang Radix Select content mo-portal sa body — page-level ang option locator.
  await page.getByRole('option', { name: optionName }).click();
}

test.describe('Add product', () => {
  test('admin makahimo ug bag-ong product pinaagi sa dialog', async ({ page, request }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    // Ablihi ang Add Product dialog (usa ra ka trigger sa pag-load).
    await page.getByRole('button', { name: 'Add Product' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add New Product')).toBeVisible();

    // --- Basic Info ---
    await dialog.getByLabel('Product Name').fill(NEW_PRODUCT.name);
    await dialog.getByLabel('SKU').fill(NEW_PRODUCT.sku);
    await dialog.getByLabel('Description', { exact: true }).fill(NEW_PRODUCT.description);
    await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
    await selectOption(page, dialog, 'Category', TEST_CATEGORY.name);

    // --- Inventory ---
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await selectOption(page, dialog, /unit of measure/i, `${TEST_UNIT.name} (${TEST_UNIT.abbreviation})`);
    await dialog.getByLabel('Initial Stock').fill(String(NEW_PRODUCT.stock));
    // Cost → mo-trigger sa auto-markup price calculation (price > 0 kinahanglan para sa submit).
    await dialog.getByLabel(/^cost/i).fill('80');

    // --- Submit ---
    await dialog.getByRole('button', { name: 'Add Product' }).click();

    // Mo-close ang dialog human sa malampuson nga pag-save.
    await expect(dialog).toBeHidden();

    // I-verify nga na-persist sa DB.
    const res = await request.get(`/api/products?search=${NEW_PRODUCT.sku}&limit=50`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.sku === NEW_PRODUCT.sku);
    expect(match, 'bag-ong product makita sa /api/products').toBeTruthy();
    expect(match.name).toBe(NEW_PRODUCT.name);
    expect(Number(match.stock)).toBe(NEW_PRODUCT.stock);
    expect(Number(match.price)).toBeGreaterThan(0);
  });
});
