import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import {
  TEST_BRAND,
  TEST_CATEGORY,
  TEST_PRICE_LEVEL,
  TEST_PRICE_LEVEL_WHOLESALE,
  SELLING_UNITS_NEW_PRODUCT,
  SELLING_UNITS_PRODUCT,
} from './fixtures/test-data';

/**
 * Selling Units tab (DB-backed) — i-drive ang tinuod nga Add/Edit Product dialog
 * batok sa alon_pos_test, dayon i-assert direkta sa product_selling_units ug
 * product_selling_unit_prices. Ang /api/products DILI mo-expose sa selling units
 * sa paagi nga sayon i-assert, mao nga testQuery ang gigamit.
 */

/** I-pili ang usa ka Radix Select option pinaagi sa label sa sulod sa dialog. */
async function selectOption(page: Page, dialog: Locator, label: string | RegExp, optionName: string) {
  // exact:true aron dili mag-match ang "Category" sa "Subcategory" (substring).
  await dialog.getByLabel(label, { exact: true }).click();
  // Ang Radix Select content mo-portal sa body — page-level ang option locator.
  await page.getByRole('option', { name: optionName }).click();
}

/** Ang mga row sa Selling Units tab — usa ka bordered card kada unit. */
function unitRows(dialog: Locator): Locator {
  return dialog.locator('div.bg-card.border.rounded-md.shadow-sm');
}

/**
 * I-pili ang Unit Name para sa usa ka row (Select — InlineEditableSelect over
 * units_of_measure, dili free-text input). Kada row naay kaugalingong "Unit
 * Name" label, mao nga i-scope ang locator sa row aron dili mag-ambiguous.
 */
async function selectUnitName(page: Page, row: Locator, optionName: string) {
  await row.getByLabel('Unit Name', { exact: true }).click();
  await page.getByRole('option', { name: optionName }).click();
}

/** I-search ang product pinaagi sa SKU dayon ablihi ang iyang row action menu. */
async function openRowMenu(page: Page, sku: string, name: string) {
  await page.getByPlaceholder('Search products...').fill(sku);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open menu' }).click();
}

async function setEnableAutomaticMarkup(request: import('@playwright/test').APIRequestContext, value: boolean) {
  const res = await request.post('/api/pos-settings', { data: { enableAutomaticMarkup: value } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test.describe('Selling Units — add', () => {
  test('admin makahimo ug product nga naa\'y 2 selling units ug prices kada level', async ({ page }) => {
    const P = SELLING_UNITS_NEW_PRODUCT;

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await page.getByRole('button', { name: 'Add Product' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add New Product')).toBeVisible();

    // --- Basic Info ---
    await dialog.getByLabel('Product Name').fill(P.name);
    await dialog.getByLabel('SKU').fill(P.sku);
    await dialog.getByLabel('Description', { exact: true }).fill(P.description);
    await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
    await selectOption(page, dialog, 'Category', TEST_CATEGORY.name);

    // --- Inventory (initial stock ra — ang unit of measure naa na sa base row) ---
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await dialog.getByLabel('Initial Stock').fill(String(P.stock));

    // --- Selling Units ---
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();

    // Row 1 is the base unit: Qty Base is static text "1", no remove button.
    const base = unitRows(dialog).nth(0);
    await expect(base.getByRole('button', { name: 'Remove selling unit' })).toHaveCount(0);
    await selectUnitName(page, base, P.baseUnitName);
    await base.getByLabel('Barcode').fill(P.baseBarcode);
    await base.getByLabel('Cost (₱)').fill(String(P.baseCost));
    await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(P.baseRetail));
    await base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`).fill(String(P.baseWholesale));

    // Row 2 — a new row starts with an EMPTY Qty Base (no silent default).
    await dialog.getByRole('button', { name: 'Add Selling Unit' }).click();
    const box = unitRows(dialog).nth(1);
    await expect(box.getByLabel('Qty Base')).toHaveValue('');
    await selectUnitName(page, box, P.boxUnitName);
    await box.getByLabel('Qty Base').fill(String(P.boxQtyBase));
    await box.getByLabel('Barcode').fill(P.boxBarcode);
    await box.getByLabel('Cost (₱)').fill(String(P.boxCost));
    await box.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(P.boxRetail));
    await box.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`).fill(String(P.boxWholesale));

    // --- Submit ---
    await dialog.getByRole('button', { name: 'Add Product' }).click();
    await expect(dialog).toBeHidden();

    // --- Assert both units landed, with both levels' prices ---
    await expect(async () => {
      const units = await testQuery(
        `SELECT psu.unit_name, psu.qty_base, psu.barcode, psu.cost, psu.is_base
         FROM product_selling_units psu
         JOIN products p ON p.id = psu.product_id
         WHERE p.sku = ?
         ORDER BY psu.sort_order`,
        [P.sku],
      );
      expect(units).toHaveLength(2);
      expect(units[0].unit_name).toBe(P.baseUnitName);
      expect(Number(units[0].qty_base)).toBe(1);
      expect(units[0].is_base).toBe(1);
      expect(units[0].barcode).toBe(P.baseBarcode);
      expect(units[1].unit_name).toBe(P.boxUnitName);
      expect(Number(units[1].qty_base)).toBe(P.boxQtyBase);
      expect(units[1].is_base).toBe(0);
      expect(units[1].barcode).toBe(P.boxBarcode);
    }).toPass({ timeout: 15_000 });

    const prices = await testQuery(
      `SELECT psu.unit_name, psup.price_level_id, psup.price
       FROM product_selling_unit_prices psup
       JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
       JOIN products p ON p.id = psu.product_id
       WHERE p.sku = ?
       ORDER BY psu.sort_order, psup.price_level_id`,
      [P.sku],
    );
    const priceOf = (unitName: string, levelId: string) =>
      Number(prices.find((r: any) => r.unit_name === unitName && r.price_level_id === levelId)?.price);
    expect(priceOf(P.baseUnitName, TEST_PRICE_LEVEL.id)).toBe(P.baseRetail);
    expect(priceOf(P.baseUnitName, TEST_PRICE_LEVEL_WHOLESALE.id)).toBe(P.baseWholesale);
    expect(priceOf(P.boxUnitName, TEST_PRICE_LEVEL.id)).toBe(P.boxRetail);
    expect(priceOf(P.boxUnitName, TEST_PRICE_LEVEL_WHOLESALE.id)).toBe(P.boxWholesale);

    // The base row mirrors onto the product's scalar columns.
    const [product] = await testQuery(
      'SELECT price, cost, barcode, unit_of_measure FROM products WHERE sku = ?',
      [P.sku],
    );
    expect(Number(product.price)).toBe(P.baseRetail);
    expect(Number(product.cost)).toBe(P.baseCost);
    expect(product.barcode).toBe(P.baseBarcode);
    expect(product.unit_of_measure).toBe(P.baseUnitName);
  });
});

test.describe('Selling Units — edit', () => {
  // The Edit dialog auto-recalculates the base row's DEFAULT-level price from
  // cost × category markup shortly after it loads (enable_automatic_markup,
  // on by default) — real, unrelated app behaviour that would otherwise
  // silently overwrite SELLING_UNITS_PRODUCT's seeded base Retail before
  // these tests get to assert "stored rows load as seeded". Disabling it for
  // this describe block keeps that assertion meaningful; must be restored so
  // other specs (e.g. add-product-approval.spec.ts, which relies on the
  // default-on auto-markup badge) aren't affected.
  test.beforeAll(async ({ request }) => {
    await setEnableAutomaticMarkup(request, false);
  });
  test.afterAll(async ({ request }) => {
    await setEnableAutomaticMarkup(request, true);
  });

  test('stored units mo-load sa tab, ug ang pag-usab mo-persist', async ({ page }) => {
    const P = SELLING_UNITS_PRODUCT;
    const newCaseRetail = 599;

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await openRowMenu(page, P.sku, P.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Product')).toBeVisible();
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();

    // Both stored units load, base first, with their stored values.
    await expect(unitRows(dialog)).toHaveCount(2);
    const base = unitRows(dialog).nth(0);
    const caseRow = unitRows(dialog).nth(1);
    // Unit Name is a Select (InlineEditableSelect) — its trigger renders the
    // matched item's full option label ("Piece (pcs)"), not the bare stored
    // value, so assert the stored unit name is contained within it.
    await expect(base.getByLabel('Unit Name')).toContainText(P.units[0].unitName);
    await expect(base.getByLabel('Barcode')).toHaveValue(P.units[0].barcode);
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`)).toHaveValue(String(P.units[0].retail));
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`)).toHaveValue(String(P.units[0].wholesale));
    await expect(caseRow.getByLabel('Unit Name')).toContainText(P.units[1].unitName);
    await expect(caseRow.getByLabel('Qty Base')).toHaveValue(String(P.units[1].qtyBase));

    // Change the Case row's Retail price and save.
    await caseRow.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(newCaseRetail));
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();

    await expect(async () => {
      const rows = await testQuery(
        `SELECT psu.unit_name, psup.price
         FROM product_selling_unit_prices psup
         JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
         WHERE psu.product_id = ? AND psup.price_level_id = ?`,
        [P.id, TEST_PRICE_LEVEL.id],
      );
      const caseRetail = Number(rows.find((r: any) => r.unit_name === P.units[1].unitName)?.price);
      expect(caseRetail).toBe(newCaseRetail);
    }).toPass({ timeout: 15_000 });

    // The kept rows keep their original ids, so FK references survive the edit.
    const kept = await testQuery(
      'SELECT id FROM product_selling_units WHERE product_id = ? ORDER BY sort_order',
      [P.id],
    );
    expect(kept.map((r: any) => r.id)).toEqual([P.units[0].id, P.units[1].id]);

    // The base row still mirrors onto the product's scalar columns.
    const [product] = await testQuery(
      'SELECT price, barcode, unit_of_measure FROM products WHERE id = ?',
      [P.id],
    );
    expect(Number(product.price)).toBe(P.units[0].retail);
    expect(product.barcode).toBe(P.units[0].barcode);
    expect(product.unit_of_measure).toBe(P.units[0].unitName);
  });

  test('pag-remove sa usa ka non-base selling unit mo-papas sa iyang row', async ({ page }) => {
    const P = SELLING_UNITS_PRODUCT;

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await openRowMenu(page, P.sku, P.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    await expect(unitRows(dialog)).toHaveCount(2);

    // The base row has no remove button — only the non-base row can go.
    await expect(unitRows(dialog).nth(0).getByRole('button', { name: 'Remove selling unit' })).toHaveCount(0);
    await unitRows(dialog).nth(1).getByRole('button', { name: 'Remove selling unit' }).click();
    await expect(unitRows(dialog)).toHaveCount(1);

    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();

    await expect(async () => {
      const rows = await testQuery(
        'SELECT id, unit_name, is_base FROM product_selling_units WHERE product_id = ?',
        [P.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].unit_name).toBe(P.units[0].unitName);
      expect(rows[0].is_base).toBe(1);
    }).toPass({ timeout: 15_000 });

    // The removed unit's prices went with it via fk_psup_selling_unit CASCADE.
    const orphanPrices = await testQuery(
      'SELECT * FROM product_selling_unit_prices WHERE selling_unit_id = ?',
      [P.units[1].id],
    );
    expect(orphanPrices).toHaveLength(0);
  });
});
