import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { EDITABLE_PRODUCT, DELETABLE_PRODUCT } from './fixtures/test-data';

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
