import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { TEST_BRAND, TEST_CATEGORY, TEST_UNIT, TEST_SUPPLIER } from './fixtures/test-data';

/**
 * Add Product > Suppliers tab (DB-backed) — i-drive ang Add Product dialog's
 * local-state supplier mapping (nagkalahi ni sa Edit Product's ProductSuppliers,
 * nga naga-live-save; kini ang form-bundled nga tab, sama sa Selling Units).
 */

// SKU is timestamped — addProduct does not enforce SKU uniqueness, so a
// fixed SKU would silently create a duplicate row on a CI retry (retries
// reuse the same seeded DB; global-setup only runs once per invocation),
// which then breaks this test's own row lookup via a Playwright strict-mode
// "multiple elements" error rather than a useful assertion failure.
const NEW_PRODUCT = {
  name: 'QA Widget With Supplier',
  sku: `QA-WIDGET-SUP-${Date.now()}`,
  description: 'A widget created by the e2e Add Product Suppliers test.',
  stock: 10,
};

/** I-pili ang usa ka Radix Select option pinaagi sa label sa sulod sa dialog. */
async function selectOption(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
  label: string | RegExp,
  optionName: string,
) {
  await dialog.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: optionName }).click();
}

test.describe('Add product with a supplier mapping', () => {
  test('admin makahimo ug product nga adunay supplier mapping', async ({ page, request }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

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
    await dialog.getByLabel('Initial Stock').fill(String(NEW_PRODUCT.stock));

    // --- Selling Units (base row owns unit-of-measure, barcode, cost, price;
    // Unit Name is a free-text input here, not a picker) ---
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    await dialog.getByLabel('Unit Name').fill(TEST_UNIT.name);
    await dialog.getByLabel('Barcode').fill(`SUP-${NEW_PRODUCT.sku}`);
    await dialog.getByLabel(/^cost/i).fill('80');

    // --- Suppliers (new tab, local state — nothing persists until final submit) ---
    await dialog.getByRole('tab', { name: 'Suppliers' }).click();
    await expect(dialog.getByText('No suppliers mapped yet.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Add Supplier' }).click();
    await selectOption(page, dialog, 'Supplier', TEST_SUPPLIER.name);
    await dialog.getByLabel('Lead Time (days)').fill('7');
    await dialog.getByLabel('Reorder Point').fill('15');
    await dialog.getByLabel('Set as primary').check();

    // --- Submit ---
    await dialog.getByRole('button', { name: 'Add Product' }).click();
    await expect(dialog).toBeHidden();

    // I-verify nga na-persist ang product mismo.
    const res = await request.get(`/api/products?search=${NEW_PRODUCT.sku}&limit=50`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.sku === NEW_PRODUCT.sku);
    expect(match, 'bag-ong product makita sa /api/products').toBeTruthy();

    // I-verify nga na-persist ang supplier mapping pinaagi sa pag-abli sa Edit
    // Product's Suppliers tab (walay REST endpoint para sa supplier_product_mapping,
    // mao nga ang UI mismo ang verification layer, sama sa Edit Product's own test).
    await page.getByPlaceholder('Search products...').fill(NEW_PRODUCT.sku);
    const row = page.getByRole('row', { name: new RegExp(NEW_PRODUCT.sku) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Open menu' }).click();
    const editMenuItem = page.getByRole('menuitem', { name: 'Edit Product' });
    await expect(editMenuItem).toBeVisible();
    await editMenuItem.click();

    const editDialog = page.getByRole('dialog');
    await expect(editDialog.getByText('Edit Product')).toBeVisible();
    await editDialog.getByRole('tab', { name: 'Suppliers' }).click();

    const mappingRow = editDialog.getByRole('row', { name: new RegExp(TEST_SUPPLIER.name) });
    await expect(mappingRow).toBeVisible();
    await expect(mappingRow.getByText('7 days')).toBeVisible();
    await expect(mappingRow.getByText('15')).toBeVisible();
    await expect(mappingRow.getByText('Primary', { exact: true })).toBeVisible();
  });
});
