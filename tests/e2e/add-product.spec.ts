import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { selectCategory } from './helpers/product-form';
import {
  TEST_BRAND,
  TEST_CATEGORY,
  TEST_UNIT,
  TEST_PRICE_LEVEL,
  TEST_PRICE_LEVEL_WHOLESALE,
  NEW_PRODUCT,
} from './fixtures/test-data';

/**
 * Add Product (DB-backed) — i-drive ang tinuod nga Add Product dialog batok sa
 * alon_pos_test. Nagsalig sa seeded brand/category/price-level. Ang presyo, cost,
 * barcode ug unit name gikan sa base selling-unit row sa Selling Units tab —
 * wala nay standalone nga price/cost/barcode/unit input sa ubang tabs.
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
    await dialog.getByLabel('Description', { exact: true }).fill(NEW_PRODUCT.description);
    await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
    await selectCategory(page, dialog, TEST_CATEGORY.name);

    // --- Inventory ---
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await dialog.getByLabel('Initial Stock').fill(String(NEW_PRODUCT.stock));

    // --- Selling Units (base row owns unit name, barcode, cost ug price) ---
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    const base = dialog.locator('div.bg-card.border.rounded-md.shadow-sm').nth(0);
    // Unit Name kay Select (InlineEditableSelect), dili free-text input.
    await selectOption(page, dialog, 'Unit Name', `${TEST_UNIT.name} (${TEST_UNIT.abbreviation})`);
    await base.getByLabel('Barcode').fill(NEW_PRODUCT.barcode);
    await base.getByLabel('Cost (₱)').fill(String(NEW_PRODUCT.cost));
    await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(NEW_PRODUCT.retail));
    // Every active price level's column is required — a second (Wholesale)
    // level now exists, so it needs a value too or submit fails validation.
    await base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`).fill(String(NEW_PRODUCT.retail));

    // --- Submit ---
    await dialog.getByRole('button', { name: 'Add Product' }).click();

    // Mo-close ang dialog human sa malampuson nga pag-save.
    await expect(dialog).toBeHidden();

    // I-verify nga na-persist sa DB — walay SKU ang bag-ong product.
    const res = await request.get(`/api/products?search=${encodeURIComponent(NEW_PRODUCT.name)}&limit=50`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.name === NEW_PRODUCT.name);
    expect(match, 'bag-ong product makita sa /api/products').toBeTruthy();
    expect(match.sku ?? null).toBeNull();
    expect(Number(match.stock)).toBe(NEW_PRODUCT.stock);
    expect(Number(match.price)).toBe(NEW_PRODUCT.retail);
  });

  test('category picker: inline add category/subcategory ug "None" (walay submit)', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await page.getByRole('button', { name: 'Add Product' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add New Product')).toBeVisible();

    const trigger = dialog.getByLabel('Category / Subcategory', { exact: true });
    await trigger.click();
    const popover = page.locator('[data-radix-popper-content-wrapper]');

    // Inline add category — awtomatikong napili human ma-save.
    const catName = `QA Inline Cat ${Date.now()}`;
    await popover.getByRole('button', { name: 'Add Category', exact: true }).click();
    await popover.getByPlaceholder('New name...').fill(catName);
    await popover.getByPlaceholder('New name...').press('Enter');
    await expect(trigger).toContainText(catName);

    // Inline add subcategory.
    const subName = `QA Inline Sub ${Date.now()}`;
    await popover.getByRole('button', { name: 'Add Subcategory', exact: true }).click();
    await popover.getByPlaceholder('New name...').fill(subName);
    await popover.getByPlaceholder('New name...').press('Enter');
    await expect(trigger).toContainText(`${catName} › ${subName}`);

    // "None" mo-clear sa subcategory apan mo-tipig ang category.
    await popover.getByRole('button', { name: 'None', exact: true }).click();
    await expect(trigger).toContainText(catName);
    await expect(trigger).not.toContainText('›');

    await popover.getByRole('button', { name: 'Done' }).click();
    await expect(popover).toBeHidden();

    // I-close ang dialog nga walay pag-save.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});
