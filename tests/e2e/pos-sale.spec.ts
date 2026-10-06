import { test, expect } from './helpers/authed-test';
import { TEST_USERS, TEST_PRODUCTS } from './fixtures/test-data';
import { resetPosState } from './helpers/db';

/**
 * POS sale flow (DB-backed, walay mock).
 *
 * Gi-test ang tinuod nga POS gates: cashier login → start shift → add product →
 * cart. Nagsalig sa seeded terminal + Cash payment method gikan sa global setup.
 *
 * Note: ang /pos page mo-bypass sa global auth guard ug mo-render sa iyang kaugalingong
 * PosLoginForm, mao nga direkta ta makaadto sa /pos.
 */

const cashier = TEST_USERS.cashier;
const product = TEST_PRODUCTS[0]; // Test Coffee 3-in-1 @ 12.50

async function posLogin(page: import('@playwright/test').Page) {
  await page.goto('/pos');
  await expect(page.getByRole('heading', { name: /cashier login/i })).toBeVisible();
  await page.getByLabel('Username').fill(cashier.username);
  await page.getByLabel('Password').fill(cashier.password);
  await page.getByRole('button', { name: /login to pos/i }).click();
}

async function startShift(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: /start new shift/i })).toBeVisible();
  await page.getByRole('button', { name: /start shift/i }).click();
  // Human ma-start ang shift, mawala ang overlay ug mogawas ang barcode input.
  await expect(page.getByPlaceholder(/scan barcode or enter product sku/i)).toBeVisible();
}

/**
 * I-add ang product pinaagi sa SKU. Gi-retry kay ang `products` state mag-load ug
 * asynchronous — posible nga wala pa ma-load sa pag-type (race), busa i-retry
 * hangtod motungha ang item sa cart.
 */
async function addProductBySku(page: import('@playwright/test').Page, sku: string, name: string) {
  const barcode = page.getByPlaceholder(/scan barcode or enter product sku/i);
  await expect(async () => {
    await barcode.fill(sku);
    await barcode.press('Enter');
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

test.describe('POS sale flow', () => {
  // Ang POS mo-resume ug active shift — i-reset ang shift/sale state kada test
  // aron limpyo ang StartShiftDialog flow ug isolated ang mga test.
  test.beforeEach(async () => {
    await resetPosState();
  });

  test('cashier login → mogawas ang Start Shift dialog', async ({ page }) => {
    await posLogin(page);
    await expect(page.getByRole('heading', { name: /start new shift/i })).toBeVisible();
  });

  test('start shift → add product by SKU → makita sa cart', async ({ page }) => {
    await posLogin(page);
    await startShift(page);

    await addProductBySku(page, product.sku, product.name);
    await expect(page.getByText(product.name).first()).toBeVisible();
  });

  test('add 2 products → tukma ang running total', async ({ page }) => {
    await posLogin(page);
    await startShift(page);

    const p1 = TEST_PRODUCTS[0]; // 12.50
    const p2 = TEST_PRODUCTS[1]; // 20.00

    await addProductBySku(page, p1.sku, p1.name);
    await addProductBySku(page, p2.sku, p2.name);

    // Total = 12.50 + 20.00 = 32.50. Magpakita ni bisan asa sa POS total area.
    const expectedTotal = (p1.price + p2.price).toFixed(2);
    await expect(page.getByText(new RegExp(expectedTotal.replace('.', '\\.'))).first()).toBeVisible();
  });

  test('kompleto nga cash sale → na-save → cart mo-clear', async ({ page }) => {
    await posLogin(page);
    await startShift(page);
    await addProductBySku(page, product.sku, product.name);

    // Empty barcode + Enter → default tender (Cash) → ablihi ang TenderDialog.
    const barcode = page.getByPlaceholder(/scan barcode or enter product sku/i);
    await barcode.click();
    await barcode.press('Enter');

    // Tender view — ang amount pre-filled na sa total (exact cash, walay sukli).
    await expect(page.getByText(/tender payment/i)).toBeVisible();
    await page.getByRole('button', { name: /confirm payment/i }).click();

    // Sale na-save → print prompt nagpakita sa order number.
    await expect(page.getByText(/saved successfully/i)).toBeVisible();
    await page.getByRole('button', { name: /no, skip/i }).click();

    // Human sa sale, mo-clear ang cart.
    await expect(page.getByText(/cart is empty/i)).toBeVisible();
  });
});
