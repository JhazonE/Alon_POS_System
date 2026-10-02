import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { selectCategory } from './helpers/product-form';
import { testQuery, resetPosState } from './helpers/db';
import {
  TEST_USERS,
  TEST_BRAND,
  TEST_CATEGORY,
  TEST_PRICE_LEVEL,
  TEST_PRICE_LEVEL_WHOLESALE,
} from './fixtures/test-data';

/**
 * Price level quantity tiers, end to end against the real alon_pos_test DB.
 *
 * Proves the whole chain carries a minimum quantity:
 *   Selling Units tab -> product_selling_unit_prices -> dual-write bridge ->
 *   product_price_levels -> /api/products -> POS cart (price + badge).
 *
 * The tab stores ONE price and ONE minimum per level, so the tier lives on the
 * Wholesale level: Retail 100 (no minimum), Wholesale 85 from 10 pieces. Tiers
 * are strictly scoped to their own level, so ONLY a customer on the Wholesale
 * level can ever reach 85 — walk-in/Retail customers and customers on a level
 * with no price row for the product must stay on 100 at any quantity. That
 * cross-level leak is the money bug this feature exists to prevent.
 */

const P = {
  name: 'QA Tier Widget',
  description: 'Product created by the e2e price level tiers test.',
  unitName: 'Piece',
  barcode: '5300000000017',
  cost: 60,
  stock: 100,
  retail: 100,
  wholesale: 85,
  wholesaleMinQty: 10,
};

const DEALER_LEVEL = { id: 'test-dealer-level', name: 'Dealer' };
const CUSTOMERS = {
  wholesale: { id: 'cust-tier-wholesale', name: 'Tier Wholesale Customer', levelId: TEST_PRICE_LEVEL_WHOLESALE.id },
  retail: { id: 'cust-tier-retail', name: 'Tier Retail Customer', levelId: TEST_PRICE_LEVEL.id },
  // On a level that has NO price row for the product: must fall back to Retail, never Wholesale.
  dealer: { id: 'cust-tier-dealer', name: 'Tier Dealer Customer', levelId: DEALER_LEVEL.id },
};

const cashier = TEST_USERS.cashier;

// Later tests depend on the product the first test creates; after a failure skip
// them rather than report misleading follow-on failures.
test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Admin UI helpers (same conventions as selling-units.spec.ts)
// ---------------------------------------------------------------------------

async function selectOption(page: Page, dialog: Locator, label: string | RegExp, optionName: string) {
  await dialog.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: optionName }).click();
}

function unitRows(dialog: Locator): Locator {
  return dialog.locator('div.bg-card.border.rounded-md.shadow-sm');
}

async function selectUnitName(page: Page, row: Locator, optionName: string) {
  await row.getByLabel('Unit Name', { exact: true }).click();
  await page.getByRole('option', { name: optionName }).click();
}

async function openRowMenu(page: Page, search: string, name: string) {
  await page.getByPlaceholder('Search products...').fill(search);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open menu' }).click();
}

async function setEnableAutomaticMarkup(request: import('@playwright/test').APIRequestContext, value: boolean) {
  const res = await request.post('/api/pos-settings', { data: { enableAutomaticMarkup: value } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

// ---------------------------------------------------------------------------
// POS helpers (same conventions as pos-sale.spec.ts, where they are file-local)
// ---------------------------------------------------------------------------

async function posLogin(page: Page) {
  await page.goto('/pos');
  await expect(page.getByRole('heading', { name: /cashier login/i })).toBeVisible();
  await page.getByLabel('Username').fill(cashier.username);
  await page.getByLabel('Password').fill(cashier.password);
  await page.getByRole('button', { name: /login to pos/i }).click();
}

async function startShift(page: Page) {
  await expect(page.getByRole('heading', { name: /start new shift/i })).toBeVisible();
  await page.getByRole('button', { name: /start shift/i }).click();
  await expect(page.getByPlaceholder(/scan barcode or enter product sku/i)).toBeVisible();
}

async function addProductByCode(page: Page, code: string, name: string) {
  const barcode = page.getByPlaceholder(/scan barcode or enter product sku/i);
  await expect(async () => {
    await barcode.fill(code);
    await barcode.press('Enter');
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

/** Open the customer sheet, pick a customer by name and confirm. */
async function selectCustomer(page: Page, customerName: string) {
  // Two buttons open this sheet (the actions rail and the footer); use the rail's, whose name is fixed.
  await page.getByRole('button', { name: 'Customer Ctrl+3', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('combobox').click();
  await page.getByRole('option', { name: customerName }).click();
  await sheet.getByRole('button', { name: 'Confirm Selection' }).click();
  await expect(sheet).toBeHidden();
}

/** The cart line for the tier product. */
function cartLine(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: P.name });
}

/** Set the cart line's quantity the way a cashier does: click the qty, type, Enter. */
async function setQuantity(page: Page, qty: number) {
  const line = cartLine(page);
  await line.getByTitle('Edit quantity (F6)').click();
  const input = line.locator('input[id^="pos-qty-"]');
  await input.fill(String(qty));
  await input.press('Enter');
  await expect(line.getByTitle('Edit quantity (F6)')).toHaveText(String(qty));
}

/** Assert the unit price shown on the cart line. */
async function expectUnitPrice(page: Page, price: number) {
  await expect(cartLine(page).getByTitle('Edit price (F7)')).toHaveText(
    `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
  );
}

/** Log in, start a shift, optionally pick a customer, and put the tier product in the cart at qty 1. */
async function startSaleWithProduct(page: Page, customerName?: string) {
  await posLogin(page);
  await startShift(page);
  if (customerName) await selectCustomer(page, customerName);
  await addProductByCode(page, P.barcode, P.name);
  await expect(cartLine(page).getByTitle('Edit quantity (F6)')).toHaveText('1');
}

// ---------------------------------------------------------------------------
// 1 + 2: admin sets the tier on the Selling Units tab and it round-trips
// ---------------------------------------------------------------------------

test.describe('Price level tiers — admin setup', () => {
  // Auto-markup rewrites the base Retail from cost x category markup; off for determinism.
  test.beforeAll(async ({ request }) => {
    await setEnableAutomaticMarkup(request, false);
  });
  test.afterAll(async ({ request }) => {
    await setEnableAutomaticMarkup(request, true);
  });

  test('base unit with Retail 100 and Wholesale 85 from 10 pieces persists to both price tables', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await page.getByRole('button', { name: 'Add Product' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add New Product')).toBeVisible();

    await dialog.getByLabel('Product Name').fill(P.name);
    await dialog.getByLabel('Description', { exact: true }).fill(P.description);
    await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
    await selectCategory(page, dialog, TEST_CATEGORY.name);

    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await dialog.getByLabel('Initial Stock').fill(String(P.stock));

    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    const base = unitRows(dialog).nth(0);
    await selectUnitName(page, base, P.unitName);
    await base.getByLabel('Barcode').fill(P.barcode);
    await base.getByLabel('Cost (₱)').fill(String(P.cost));
    // Retail first: typing the default level's price auto-suggests the other levels.
    await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(P.retail));
    await base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`).fill(String(P.wholesale));
    // Min Qty is a base-row-only column, one per level. Retail's is left blank.
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL.name} Min Qty`, { exact: true })).toBeVisible();
    await base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} Min Qty`, { exact: true }).fill(String(P.wholesaleMinQty));
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} Min Qty`, { exact: true })).toHaveValue(String(P.wholesaleMinQty));

    await dialog.getByRole('button', { name: 'Add Product' }).click();
    await expect(dialog).toBeHidden();

    // Source table: product_selling_unit_prices.
    await expect(async () => {
      const rows = await testQuery(
        `SELECT psup.price_level_id, psup.price, psup.min_quantity
         FROM product_selling_unit_prices psup
         JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
         JOIN products p ON p.id = psu.product_id
         WHERE p.name = ? AND psu.is_base = 1`,
        [P.name],
      );
      expect(rows).toHaveLength(2);
      const byLevel = (id: string) => rows.find((r: any) => r.price_level_id === id);
      expect(Number(byLevel(TEST_PRICE_LEVEL.id)?.price)).toBe(P.retail);
      expect(Number(byLevel(TEST_PRICE_LEVEL.id)?.min_quantity)).toBe(0);
      expect(Number(byLevel(TEST_PRICE_LEVEL_WHOLESALE.id)?.price)).toBe(P.wholesale);
      expect(Number(byLevel(TEST_PRICE_LEVEL_WHOLESALE.id)?.min_quantity)).toBe(P.wholesaleMinQty);
    }).toPass({ timeout: 15_000 });

    // Table the POS actually reads: product_price_levels (written by the bridge).
    const legacy = await testQuery(
      `SELECT ppl.price_level_id, ppl.price, ppl.min_quantity
       FROM product_price_levels ppl JOIN products p ON p.id = ppl.product_id
       WHERE p.name = ?`,
      [P.name],
    );
    expect(legacy).toHaveLength(2);
    const legacyBy = (id: string) => legacy.find((r: any) => r.price_level_id === id);
    expect(Number(legacyBy(TEST_PRICE_LEVEL.id)?.price)).toBe(P.retail);
    expect(Number(legacyBy(TEST_PRICE_LEVEL.id)?.min_quantity)).toBe(0);
    expect(Number(legacyBy(TEST_PRICE_LEVEL_WHOLESALE.id)?.price)).toBe(P.wholesale);
    expect(Number(legacyBy(TEST_PRICE_LEVEL_WHOLESALE.id)?.min_quantity)).toBe(P.wholesaleMinQty);
  });

  test('reopening the product shows the saved Min Qty', async ({ page }) => {
    const [product] = await testQuery('SELECT id FROM products WHERE name = ?', [P.name]);
    expect(product, 'the product from the previous test must exist').toBeTruthy();

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    // A product added through the form has no SKU, so find it by name.
    await openRowMenu(page, P.name, P.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Product')).toBeVisible();
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();

    const base = unitRows(dialog).nth(0);
    // Wait on a value that only appears once the stored row has loaded.
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`)).toHaveValue(String(P.wholesale));
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} Min Qty`, { exact: true })).toHaveValue(String(P.wholesaleMinQty));
    // Retail has no minimum: the field shows nothing or 0, never the Wholesale value.
    await expect(base.getByLabel(`${TEST_PRICE_LEVEL.name} Min Qty`, { exact: true })).toHaveValue(/^(0)?$/);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 3 + 4 + 5: the POS prices the line by the customer's level and quantity
// ---------------------------------------------------------------------------

test.describe('Price level tiers — POS', () => {
  test.beforeAll(async () => {
    await testQuery('DELETE FROM customers WHERE id IN (?, ?, ?)', [CUSTOMERS.wholesale.id, CUSTOMERS.retail.id, CUSTOMERS.dealer.id]);
    await testQuery('DELETE FROM price_levels WHERE id = ?', [DEALER_LEVEL.id]);
    await testQuery(
      `INSERT INTO price_levels (id, name, calculation_base, is_default, percentage_adjustment)
       VALUES (?, ?, 'retail', 0, 100.00)`,
      [DEALER_LEVEL.id, DEALER_LEVEL.name],
    );
    for (const c of Object.values(CUSTOMERS)) {
      await testQuery('INSERT INTO customers (id, name, price_level_id) VALUES (?, ?, ?)', [c.id, c.name, c.levelId]);
    }
  });

  test.afterAll(async () => {
    await testQuery('DELETE FROM customers WHERE id IN (?, ?, ?)', [CUSTOMERS.wholesale.id, CUSTOMERS.retail.id, CUSTOMERS.dealer.id]);
    await testQuery('DELETE FROM price_levels WHERE id = ?', [DEALER_LEVEL.id]);
  });

  test.beforeEach(async () => {
    await resetPosState();
  });

  test('Wholesale customer: Retail price at qty 1, tier price and badge from qty 10', async ({ page }) => {
    await startSaleWithProduct(page, CUSTOMERS.wholesale.name);

    // Qty 1 and just under the minimum: the Wholesale row does not qualify, so Retail.
    await expectUnitPrice(page, P.retail);
    await setQuantity(page, P.wholesaleMinQty - 1);
    await expectUnitPrice(page, P.retail);
    await expect(cartLine(page)).not.toContainText('10+');

    // At the minimum the tier fires and the cashier is told why.
    await setQuantity(page, P.wholesaleMinQty);
    await expectUnitPrice(page, P.wholesale);
    await expect(cartLine(page)).toContainText(`${TEST_PRICE_LEVEL_WHOLESALE.name} · ${P.wholesaleMinQty}+`);

    // Dropping back below the minimum loses the tier again.
    await setQuantity(page, P.wholesaleMinQty - 1);
    await expectUnitPrice(page, P.retail);
    await expect(cartLine(page)).not.toContainText('10+');
  });

  // The money bug: a tier must never apply to a customer on a different level.
  const nonWholesale: { label: string; customerName?: string }[] = [
    { label: 'walk-in (default Retail level)' },
    { label: 'Retail-level customer', customerName: CUSTOMERS.retail.name },
    { label: 'customer on a level with no row for the product', customerName: CUSTOMERS.dealer.name },
  ];
  for (const { label, customerName } of nonWholesale) {
    test(`no cross-level leak: ${label} stays on Retail at qty 10`, async ({ page }) => {
      await startSaleWithProduct(page, customerName);

      await expectUnitPrice(page, P.retail);
      await setQuantity(page, P.wholesaleMinQty);
      await expectUnitPrice(page, P.retail);
      await setQuantity(page, P.wholesaleMinQty * 5);
      await expectUnitPrice(page, P.retail);
      await expect(cartLine(page)).not.toContainText(TEST_PRICE_LEVEL_WHOLESALE.name);
    });
  }

  test('switching a qty-10 line from a Wholesale customer to a Retail customer reprices it back to Retail', async ({ page }) => {
    await startSaleWithProduct(page, CUSTOMERS.wholesale.name);
    await setQuantity(page, P.wholesaleMinQty);
    await expectUnitPrice(page, P.wholesale);

    await selectCustomer(page, CUSTOMERS.retail.name);

    await expectUnitPrice(page, P.retail);
    await expect(cartLine(page)).not.toContainText(TEST_PRICE_LEVEL_WHOLESALE.name);
  });
});
