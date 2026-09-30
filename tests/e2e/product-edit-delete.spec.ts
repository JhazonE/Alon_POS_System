import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import { EDITABLE_PRODUCT, DELETABLE_PRODUCT, TEST_SUPPLIER } from './fixtures/test-data';

/**
 * Edit / Delete product (DB-backed) — i-drive ang products table row actions batok
 * sa alon_pos_test. Naggamit ug dedicated seeded products (EDIT-ME / DELETE-ME) aron
 * dili maapektuhan ang ubang specs.
 */

/** I-search ang product pinaagi sa SKU dayon ablihi ang iyang row action menu. */
async function openRowMenu(page: Page, sku: string, name: string) {
  await page.getByPlaceholder('Search products...').fill(sku);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open menu' }).click();
}

test.describe('Edit product', () => {
  test('admin makausab sa ngalan sa product', async ({ page, request }) => {
    const newName = 'Edited Widget Name';

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await openRowMenu(page, EDITABLE_PRODUCT.sku, EDITABLE_PRODUCT.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Product')).toBeVisible();
    // Ang legacy read-only SKU line makita ug mao ang stored value.
    await expect(dialog.getByLabel('SKU', { exact: true })).toHaveValue(EDITABLE_PRODUCT.sku);

    // I-usab ang Product Name dayon i-save.
    await dialog.getByLabel('Product Name').fill(newName);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();

    // I-verify nga na-persist ang bag-ong ngalan (parehas ra nga SKU).
    const res = await request.get(`/api/products?search=${EDITABLE_PRODUCT.sku}&limit=50`);
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.sku === EDITABLE_PRODUCT.sku);
    expect(match, 'product gihapon naa pinaagi sa SKU').toBeTruthy();
    expect(match.name).toBe(newName);
  });

  test('admin makausab ug product nga walay SKU — dili mo-require ug dili mag-set ug SKU', async ({ page, request }) => {
    const id = 'test-no-sku-1';
    const name = 'No SKU Widget';
    const newName = 'No SKU Widget Renamed';
    await testQuery('DELETE FROM products WHERE id = ?', [id]);
    await testQuery(
      `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability)
       VALUES (?, ?, 40, 5, NULL, 'Product nga walay SKU.', ?, ?, ?, 'Available')`,
      [id, name, EDITABLE_PRODUCT.brand, EDITABLE_PRODUCT.category, EDITABLE_PRODUCT.unitOfMeasure],
    );
    try {
      await seedSession(page, DEFAULT_ADMIN);
      await page.goto('/products');
      await openRowMenu(page, name, name);
      await page.getByRole('menuitem', { name: 'Edit Product' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Edit Product')).toBeVisible();
      // No SKU line for a product that has none.
      await expect(dialog.getByLabel('SKU', { exact: true })).toHaveCount(0);

      await dialog.getByLabel('Product Name').fill(newName);
      await dialog.getByRole('button', { name: 'Save Changes' }).click();
      await expect(dialog).toBeHidden();

      const [row] = await testQuery('SELECT name, sku FROM products WHERE id = ?', [id]);
      expect(row.name).toBe(newName);
      expect(row.sku, 'SKU stays NULL, not empty string').toBeNull();
    } finally {
      await testQuery('DELETE FROM products WHERE id = ?', [id]);
    }
  });
});

test.describe('Product Suppliers tab', () => {
  test('admin makadugang ug supplier mapping sa product', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    // I-search pinaagi sa SKU ra — ang laing test niini nga file ("Edit product")
    // usab og-usab sa ngalan sa EDITABLE_PRODUCT, mao nga dili ni mo-depend sa
    // current name aron dili ma-break kung ma-ayo ra na nga laing test.
    await page.getByPlaceholder('Search products...').fill(EDITABLE_PRODUCT.sku);
    const row = page.getByRole('row', { name: new RegExp(EDITABLE_PRODUCT.sku) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Product')).toBeVisible();

    await dialog.getByRole('tab', { name: 'Suppliers' }).click();
    await expect(dialog.getByText('No suppliers mapped yet.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Add Supplier' }).click();

    const mappingDialog = page.getByRole('dialog', { name: /Add Supplier Mapping/i });
    await expect(mappingDialog).toBeVisible();

    await mappingDialog.getByRole('combobox').click();
    await page.getByRole('option', { name: TEST_SUPPLIER.name }).click();
    await mappingDialog.getByLabel('Lead Time (Days)').fill('5');
    await mappingDialog.getByLabel('Reorder Point').fill('20');
    await mappingDialog.getByLabel('Cost (₱)').fill('123.45');
    await mappingDialog.getByRole('button', { name: 'Save' }).click();

    await expect(mappingDialog).toBeHidden();

    const mappingRow = dialog.getByRole('row', { name: new RegExp(TEST_SUPPLIER.name) });
    await expect(mappingRow).toBeVisible();
    await expect(mappingRow.getByText('5 days')).toBeVisible();
    await expect(mappingRow.getByText('20')).toBeVisible();
    await expect(mappingRow.getByText('₱123.45')).toBeVisible();
    // Not yet primary — no "0" leaking from a non-boolean isPrimary value,
    // and no Primary badge.
    await expect(mappingRow.getByText('0', { exact: true })).not.toBeVisible();
    await expect(mappingRow.getByText('Primary', { exact: true })).not.toBeVisible();

    // Star the mapping primary — this propagates its ROP (20) onto the
    // product's own reorder_point via setPrimarySupplier.
    await mappingRow.getByRole('button').first().click();
    const confirmPrimary = page.getByRole('alertdialog');
    await expect(confirmPrimary.getByText('Change Primary Supplier?')).toBeVisible();
    await confirmPrimary.getByRole('button', { name: 'Confirm Change' }).click();
    await expect(confirmPrimary).toBeHidden();
    await expect(mappingRow.getByText('Primary', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // I-verify nga na-propagate ang ROP (20) sa product mismo, dili NULL.
    const res = await page.request.get(`/api/products?search=${EDITABLE_PRODUCT.sku}&limit=50`);
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.sku === EDITABLE_PRODUCT.sku);
    expect(match, 'product kinahanglan naa gihapon').toBeTruthy();
    expect(Number(match.reorderPoint ?? match.reorder_point)).toBe(20);
  });
});

test.describe('Delete product', () => {
  test('admin makapapas sa product', async ({ page, request }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await openRowMenu(page, DELETABLE_PRODUCT.sku, DELETABLE_PRODUCT.name);
    await page.getByRole('menuitem', { name: 'Delete Product' }).click();

    // Kumpirmahon sa AlertDialog (Radix role = alertdialog).
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText('Are you sure?')).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete' }).click();

    // I-verify nga wala na ang product sa DB.
    await expect(async () => {
      const res = await request.get(`/api/products?search=${DELETABLE_PRODUCT.sku}&limit=50`);
      const body = await res.json();
      const match = (body.data ?? []).find((p: any) => p.sku === DELETABLE_PRODUCT.sku);
      expect(match, 'product kinahanglan wala na').toBeFalsy();
    }).toPass({ timeout: 10_000 });
  });
});
