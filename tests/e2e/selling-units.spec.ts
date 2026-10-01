import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { selectCategory } from './helpers/product-form';
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
    await dialog.getByLabel('Description', { exact: true }).fill(P.description);
    await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
    await selectCategory(page, dialog, TEST_CATEGORY.name);

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
         WHERE p.name = ?
         ORDER BY psu.sort_order`,
        [P.name],
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
       WHERE p.name = ?
       ORDER BY psu.sort_order, psup.price_level_id`,
      [P.name],
    );
    const priceOf = (unitName: string, levelId: string) =>
      Number(prices.find((r: any) => r.unit_name === unitName && r.price_level_id === levelId)?.price);
    expect(priceOf(P.baseUnitName, TEST_PRICE_LEVEL.id)).toBe(P.baseRetail);
    expect(priceOf(P.baseUnitName, TEST_PRICE_LEVEL_WHOLESALE.id)).toBe(P.baseWholesale);
    expect(priceOf(P.boxUnitName, TEST_PRICE_LEVEL.id)).toBe(P.boxRetail);
    expect(priceOf(P.boxUnitName, TEST_PRICE_LEVEL_WHOLESALE.id)).toBe(P.boxWholesale);

    // The base row mirrors onto the product's scalar columns.
    const [product] = await testQuery(
      'SELECT price, cost, barcode, unit_of_measure FROM products WHERE name = ?',
      [P.name],
    );
    expect(Number(product.price)).toBe(P.baseRetail);
    expect(Number(product.cost)).toBe(P.baseCost);
    expect(product.barcode).toBe(P.baseBarcode);
    expect(product.unit_of_measure).toBe(P.baseUnitName);
  });

  // Wala mag-save — ang bag-ong unit row mo-suggest sa Retail gikan sa base Retail × Qty Base.
  test('bag-ong selling unit mo-auto-calculate sa Retail gikan sa base Retail × Qty Base', async ({ page, request }) => {
    // Ang auto-markup mag-set sa base Retail sa iyang kaugalingon — i-off para deterministic.
    await setEnableAutomaticMarkup(request, false);
    try {
      await seedSession(page, DEFAULT_ADMIN);
      await page.goto('/products');
      await page.getByRole('button', { name: 'Add Product' }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Add New Product')).toBeVisible();
      await dialog.getByRole('tab', { name: 'Selling Units' }).click();

      const base = unitRows(dialog).nth(0);
      const retailLabel = `${TEST_PRICE_LEVEL.name} (₱)`;
      const wholesaleLabel = `${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`;
      await base.getByLabel('Cost (₱)').fill('20');
      await base.getByLabel(retailLabel).fill('50');

      await dialog.getByRole('button', { name: 'Add Selling Unit' }).click();
      const box = unitRows(dialog).nth(1);
      await box.getByLabel('Qty Base').fill('12');
      await expect(box.getByLabel(retailLabel)).toHaveValue('600');
      await expect(box.getByLabel(wholesaleLabel)).toHaveValue(String(+(600 * 1.9).toFixed(2)));

      // Ang pag-usab sa Qty Base mo-follow samtang ang Retail suggestion pa gihapon.
      await box.getByLabel('Qty Base').fill('10');
      await expect(box.getByLabel(retailLabel)).toHaveValue('500');

      // Ang base Retail nga gi-usab mo-follow sab.
      await base.getByLabel(retailLabel).fill('60');
      await expect(box.getByLabel(retailLabel)).toHaveValue('600');

      // Ang hand-typed Retail dili na ma-overwrite.
      await box.getByLabel(retailLabel).fill('999');
      await box.getByLabel('Qty Base').fill('5');
      await expect(box.getByLabel(retailLabel)).toHaveValue('999');
      await base.getByLabel(retailLabel).fill('70');
      await expect(box.getByLabel(retailLabel)).toHaveValue('999');

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    } finally {
      await setEnableAutomaticMarkup(request, true);
    }
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

  // Wala mag-save — ang fixture state kay gamiton pa sa sunod nga test.
  test('pag-type sa Retail price mo-auto-calculate sa laing price levels sa row', async ({ page }) => {
    const P = SELLING_UNITS_PRODUCT;
    // Seeded levels: Retail = retail-based +100% (default), Wholesale = retail-based +90%.
    const baseRetail = 50;
    const baseWholesale = +(baseRetail * 1.9).toFixed(2);
    const caseRetail = 600;
    const caseWholesale = +(caseRetail * 1.9).toFixed(2);

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await openRowMenu(page, P.sku, P.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    await expect(unitRows(dialog)).toHaveCount(2);
    const base = unitRows(dialog).nth(0);
    const caseRow = unitRows(dialog).nth(1);

    // Wala na ang manual auto-fill button — ang Retail input na ang trigger.
    await expect(dialog.getByRole('button', { name: /auto-fill prices/i })).toHaveCount(0);

    await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(baseRetail));
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`)).toHaveValue(String(baseRetail));
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`)).toHaveValue(String(baseWholesale));

    // Ang non-base row nag-type sa iyang kaugalingong Retail — dili ma-overwrite kini.
    await caseRow.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(caseRetail));
    await expect(caseRow.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`)).toHaveValue(String(caseRetail));
    await expect(caseRow.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`)).toHaveValue(String(caseWholesale));

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
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

// ---------------------------------------------------------------------------
// Cost auto-suggestion for non-base rows (base Cost x Qty Base) + cost-based
// price levels. The seeded levels are both retail-based, so a cost-based level
// is inserted for these tests and removed again afterwards.
// ---------------------------------------------------------------------------

const COST_LEVEL = { id: 'test-cost-tier-level', name: 'CostTier', percentage: 30 };

async function seedCostLevel() {
  await testQuery('DELETE FROM price_levels WHERE id = ?', [COST_LEVEL.id]);
  await testQuery(
    `INSERT INTO price_levels (id, name, calculation_base, is_default, percentage_adjustment)
     VALUES (?, ?, 'cost', 0, ?)`,
    [COST_LEVEL.id, COST_LEVEL.name, COST_LEVEL.percentage],
  );
}

async function removeCostLevel() {
  await testQuery('DELETE FROM price_levels WHERE id = ?', [COST_LEVEL.id]);
}

/** 2-dp rounded cost x (1 + 30%) — what the CostTier field should show. */
const costTier = (cost: number) => String(+(cost * 1.3).toFixed(2));

test.describe('Selling Units — Cost auto-suggestion and cost-based levels', () => {
  test.beforeAll(async ({ request }) => {
    await setEnableAutomaticMarkup(request, false);
    await seedCostLevel();
  });
  test.afterAll(async ({ request }) => {
    await removeCostLevel();
    await setEnableAutomaticMarkup(request, true);
  });

  const retailLabel = `${TEST_PRICE_LEVEL.name} (₱)`;
  const wholesaleLabel = `${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`;
  const costTierLabel = `${COST_LEVEL.name} (₱)`;

  // Wala mag-save.
  test('add: Qty Base mo-fill sa row Cost (base Cost x qty) ug cost-based level, bisan walay base Retail', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await page.getByRole('button', { name: 'Add Product' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add New Product')).toBeVisible();
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();

    const base = unitRows(dialog).nth(0);
    // The price-level columns load asynchronously — wait for them before typing.
    await expect(base.getByLabel(costTierLabel)).toBeVisible();
    await base.getByLabel('Cost (₱)').fill('10');
    await expect(base.getByLabel(retailLabel)).toHaveValue(''); // NO base Retail typed
    await expect(base.getByLabel(costTierLabel)).toHaveValue(costTier(10));

    // (a) Qty Base -> Cost 120 and the cost-based level, with no Retail anywhere.
    await dialog.getByRole('button', { name: 'Add Selling Unit' }).click();
    const box = unitRows(dialog).nth(1);
    await box.getByLabel('Qty Base').fill('12');
    await expect(box.getByLabel('Cost (₱)')).toHaveValue('120');
    await expect(box.getByLabel(costTierLabel)).toHaveValue(costTier(120));
    await expect(box.getByLabel(retailLabel)).toHaveValue('');

    // The auto Cost follows a later Qty Base change.
    await box.getByLabel('Qty Base').fill('6');
    await expect(box.getByLabel('Cost (₱)')).toHaveValue('60');
    await expect(box.getByLabel(costTierLabel)).toHaveValue(costTier(60));
    await box.getByLabel('Qty Base').fill('12');
    await expect(box.getByLabel('Cost (₱)')).toHaveValue('120');

    // (b) A second row stays auto; the Box row gets a hand-typed Cost.
    await dialog.getByRole('button', { name: 'Add Selling Unit' }).click();
    const pack = unitRows(dialog).nth(2);
    await pack.getByLabel('Qty Base').fill('6');
    await expect(pack.getByLabel('Cost (₱)')).toHaveValue('60');

    await box.getByLabel('Cost (₱)').fill('500');
    await expect(box.getByLabel(costTierLabel)).toHaveValue(costTier(500));

    await base.getByLabel('Cost (₱)').fill('12');
    await expect(pack.getByLabel('Cost (₱)')).toHaveValue('72'); // auto Cost followed
    await expect(pack.getByLabel(costTierLabel)).toHaveValue(costTier(72));
    await expect(box.getByLabel('Cost (₱)')).toHaveValue('500'); // hand-typed Cost kept
    await expect(box.getByLabel(costTierLabel)).toHaveValue(costTier(500));

    // A hand-typed Cost is not overwritten by a later Qty Base change either.
    await box.getByLabel('Qty Base').fill('24');
    await expect(box.getByLabel('Cost (₱)')).toHaveValue('500');

    // (c) Retail-based levels still follow the base Retail (Retail = base x qty).
    await base.getByLabel(retailLabel).fill('50');
    await expect(pack.getByLabel(retailLabel)).toHaveValue('300');
    await expect(pack.getByLabel(wholesaleLabel)).toHaveValue(String(+(300 * 1.9).toFixed(2)));
    await expect(box.getByLabel(retailLabel)).toHaveValue('1200');
    await expect(box.getByLabel('Cost (₱)')).toHaveValue('500');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  // Wala mag-save — ang fixture state kay gamiton pa sa ubang test.
  test('edit: stored Costs dili ma-usab; bag-ong row mo-follow sa base Cost, hand-typed dili', async ({ page }) => {
    const P = SELLING_UNITS_PRODUCT;
    const baseCost = P.units[0].cost; // 18
    const baseRetail = P.units[0].retail; // 25

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await openRowMenu(page, P.sku, P.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    const base = unitRows(dialog).nth(0);
    await expect(base.getByLabel(costTierLabel)).toBeVisible();

    // Nothing runs on load: the stored base Cost is untouched.
    await expect(base.getByLabel('Cost (₱)')).toHaveValue(String(baseCost));
    // The Case unit may already have been removed by an earlier test in this file,
    // so add two fresh rows after whatever is stored.
    const stored = await unitRows(dialog).count();
    await dialog.getByRole('button', { name: 'Add Selling Unit' }).click();
    await dialog.getByRole('button', { name: 'Add Selling Unit' }).click();
    const auto = unitRows(dialog).nth(stored);
    const manual = unitRows(dialog).nth(stored + 1);

    // (a) Qty Base -> Cost = base Cost x qty, plus the cost-based level.
    await auto.getByLabel('Qty Base').fill('6');
    await expect(auto.getByLabel('Cost (₱)')).toHaveValue(String(baseCost * 6)); // 108
    await expect(auto.getByLabel(costTierLabel)).toHaveValue(costTier(baseCost * 6));
    // (c) Retail-based: base Retail x 6.
    await expect(auto.getByLabel(retailLabel)).toHaveValue(String(baseRetail * 6));
    await expect(auto.getByLabel(wholesaleLabel)).toHaveValue(String(+(baseRetail * 6 * 1.9).toFixed(2)));

    // (b) A hand-typed Cost on the other row.
    await manual.getByLabel('Qty Base').fill('12');
    await expect(manual.getByLabel('Cost (₱)')).toHaveValue(String(baseCost * 12));
    await manual.getByLabel('Cost (₱)').fill('200');
    await expect(manual.getByLabel(costTierLabel)).toHaveValue(costTier(200));

    // Base Cost changes: the untouched auto Cost follows, the hand-typed one stays.
    await base.getByLabel('Cost (₱)').fill('20');
    await expect(auto.getByLabel('Cost (₱)')).toHaveValue('120');
    await expect(auto.getByLabel(costTierLabel)).toHaveValue(costTier(120));
    await expect(manual.getByLabel('Cost (₱)')).toHaveValue('200');
    await expect(manual.getByLabel(costTierLabel)).toHaveValue(costTier(200));

    // Base Retail change: the auto Retail follows.
    await base.getByLabel(retailLabel).fill('30');
    await expect(auto.getByLabel(retailLabel)).toHaveValue('180');
    await expect(manual.getByLabel('Cost (₱)')).toHaveValue('200');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
