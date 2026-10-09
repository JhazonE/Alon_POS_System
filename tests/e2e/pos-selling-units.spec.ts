import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TEST_USERS, TEST_PRODUCTS, SELLING_UNITS_PRODUCT } from './fixtures/test-data';
import { resetPosState, testQuery } from './helpers/db';

/**
 * POS selling units (DB-backed, walay mock) — search, scan, two-line cart,
 * FIFO checkout in BASE units, and the void round trip.
 *
 * Ang void gihimo pinaagi sa tinuod nga /api/pos/void-transaction endpoint (ang
 * gi-tawag sa VoidSalesDialog), dili pinaagi sa dialog — ang dialog naay optional
 * auth step ug date/search UI nga walay kalabutan sa stock restoration.
 */

const P = SELLING_UNITS_PRODUCT;
const BASE = P.units.find(u => u.isBase)!;
const CASE = P.units.find(u => !u.isBase)!;
const CASE_NAME = `${P.name} ${CASE.unitName}`;
const cashier = TEST_USERS.cashier;

const barcodeInput = (page: Page) => page.getByPlaceholder(/scan barcode or enter product sku/i);
const cartRows = (page: Page) => page.locator('tr[id^="pos-item-"]');

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
  await expect(barcodeInput(page)).toBeVisible();
}

/** Login + start shift — ready to scan. */
async function openPos(page: Page) {
  await posLogin(page);
  await startShift(page);
}

/**
 * I-scan ang barcode ug hulat nga motaas ang cart-line count. Gi-retry kay ang
 * `products` state mag-load ug asynchronous — posible nga wala pa ma-load sa
 * unang pag-type. Ang retry dili mag-double-add: ang count lang ang gi-check
 * sa matag attempt batok sa gipaabot nga katapusang numero.
 */
async function scan(page: Page, code: string, expectedLines: number) {
  const input = barcodeInput(page);
  await expect(async () => {
    if ((await cartRows(page).count()) >= expectedLines) return;
    await input.fill(code);
    await input.press('Enter');
    await expect(cartRows(page)).toHaveCount(expectedLines, { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

/** I-confirm ang default (Cash) tender — exact cash, walay sukli. */
async function checkoutCash(page: Page) {
  const input = barcodeInput(page);
  await input.click();
  await input.press('Enter');
  await expect(page.getByText(/tender payment/i)).toBeVisible();
  await page.getByRole('button', { name: /confirm payment/i }).click();
  await expect(page.getByText(/saved successfully/i)).toBeVisible();
  await page.getByRole('button', { name: /no, skip/i }).click();
  await expect(page.getByText(/cart is empty/i)).toBeVisible();
}

/**
 * Ibalik ang selling-units product ug ang iyang batches sa seeded baseline
 * (stock 60; batch-su-old 40, batch-su-new 20). Ang void nag-restore sa
 * products.stock apan DILI sa batch quantity_remaining, mao nga kung walay
 * reset ang batch state mo-anod tali sa mga test.
 */
async function resetSellingUnitStock() {
  await testQuery('UPDATE products SET stock = ? WHERE id = ?', [P.stock, P.id]);
  await testQuery('UPDATE inventory_batches SET quantity_remaining = quantity_in WHERE product_id = ?', [P.id]);
}

async function stockOf(): Promise<number> {
  const [row] = await testQuery('SELECT stock FROM products WHERE id = ?', [P.id]);
  return Number(row.stock);
}

async function batchRemaining(): Promise<Record<string, number>> {
  const rows = await testQuery(
    'SELECT id, quantity_remaining FROM inventory_batches WHERE product_id = ?', [P.id],
  );
  return Object.fromEntries(rows.map((r: any) => [r.id, Number(r.quantity_remaining)]));
}

async function lastSale() {
  const [row] = await testQuery(
    `SELECT st.id AS sale_id, st.status, si.quantity, si.selling_unit_name, si.selling_unit_qty_base
     FROM sales_transactions st JOIN sale_items si ON si.sale_id = st.id
     WHERE si.product_id = ? ORDER BY st.created_at DESC LIMIT 1`,
    [P.id],
  );
  return row;
}

async function voidSale(page: Page, saleId: string) {
  const res = await page.request.post('/api/pos/void-transaction', {
    data: { saleId, voidReason: 'e2e selling-units void' },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  expect((await res.json()).success).toBe(true);
}

test.describe('POS selling units', () => {
  test.beforeEach(async () => {
    await resetPosState();
    await resetSellingUnitStock();
  });

  test('search shows one row per selling unit with unit-converted stock', async ({ page }) => {
    await openPos(page);
    await page.keyboard.press('F9');
    const search = page.getByPlaceholder(/search by name or barcode/i);
    await expect(search).toBeFocused();
    await page.keyboard.type(P.name);

    const rows = page.locator('[cmdk-item]');
    await expect(rows).toHaveCount(2);

    const pieceRow = rows.filter({ hasText: '₱25.00' });
    const caseRow = rows.filter({ hasText: CASE_NAME });
    await expect(pieceRow).toHaveCount(1);
    await expect(caseRow).toHaveCount(1);
    await expect(caseRow).toContainText('₱580.00');
    // 60 base units / 24 = 2 whole Cases — NOT 60.
    // The stock badge is the pill span; assert on it alone so digits in the
    // barcode/category text can't satisfy or break the match.
    await expect(caseRow.locator('span.rounded-full')).toHaveText(/^2 /);
    // The Piece row keeps the base figure.
    await expect(pieceRow.locator('span.rounded-full')).toHaveText(/^60 /);
    await expect(pieceRow).not.toContainText(CASE_NAME);
  });

  test('scanning a Case barcode adds a Case line at the Case price', async ({ page }) => {
    await openPos(page);
    await scan(page, CASE.barcode, 1);

    const row = cartRows(page).first();
    await expect(row).toContainText(CASE_NAME);
    await expect(row).toContainText('₱580.00');
    // Added straight away — no unit-picker dialog interposed.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Total Amount').locator('..')).toContainText('580.00');
  });

  test('a Case and a Piece are two separate cart lines', async ({ page }) => {
    await openPos(page);
    await scan(page, CASE.barcode, 1);
    await scan(page, BASE.barcode, 2);

    await expect(cartRows(page)).toHaveCount(2);
    await expect(cartRows(page).filter({ hasText: CASE_NAME })).toHaveCount(1);
    // The Piece line carries the bare product name (not "... Case").
    const piece = cartRows(page).filter({ hasText: P.name }).filter({ hasNotText: CASE_NAME });
    await expect(piece).toHaveCount(1);
    await expect(piece).toContainText('₱25.00');
    // 580 + 25 = 605
    await expect(page.getByText('Total Amount').locator('..')).toContainText('605.00');
  });

  test('checking out one Case deducts 24 base units FIFO', async ({ page }) => {
    const stockBefore = await stockOf();
    const batchesBefore = await batchRemaining();
    expect(batchesBefore['batch-su-old']).toBeGreaterThanOrEqual(24);

    await openPos(page);
    await scan(page, CASE.barcode, 1);
    await checkoutCash(page);

    await expect(async () => {
      expect(await stockOf()).toBe(stockBefore - 24);
    }).toPass({ timeout: 10_000 });

    const batchesAfter = await batchRemaining();
    expect(batchesAfter['batch-su-old']).toBe(batchesBefore['batch-su-old'] - 24);
    expect(batchesAfter['batch-su-new']).toBe(batchesBefore['batch-su-new']);

    const sale = await lastSale();
    expect(Number(sale.quantity)).toBe(1);
    expect(Number(sale.selling_unit_qty_base)).toBe(24);
    expect(sale.selling_unit_name).toBe('Case');
  });

  test('voiding that Case sale restores all 24 base units', async ({ page }) => {
    const stockBefore = await stockOf();

    await openPos(page);
    await scan(page, CASE.barcode, 1);
    await checkoutCash(page);
    await expect(async () => {
      expect(await stockOf()).toBe(stockBefore - 24);
    }).toPass({ timeout: 10_000 });

    const sale = await lastSale();
    await voidSale(page, sale.sale_id);

    // Exactly the pre-sale value — not stockBefore - 23 (the quantity-only restore bug).
    expect(await stockOf()).toBe(stockBefore);
    const [after] = await testQuery('SELECT status FROM sales_transactions WHERE id = ?', [sale.sale_id]);
    expect(String(after.status).toLowerCase()).toBe('voided');
  });

  test('a base-unit sale and void round-trips unchanged', async ({ page }) => {
    const stockBefore = await stockOf();

    await openPos(page);
    await scan(page, BASE.barcode, 1);
    await checkoutCash(page);
    await expect(async () => {
      expect(await stockOf()).toBe(stockBefore - 1);
    }).toPass({ timeout: 10_000 });

    const sale = await lastSale();
    expect(Number(sale.quantity)).toBe(1);
    expect(Number(sale.selling_unit_qty_base)).toBe(1);

    await voidSale(page, sale.sale_id);
    expect(await stockOf()).toBe(stockBefore);
  });

  test('a product with no selling units behaves exactly as before', async ({ page }) => {
    const plain = TEST_PRODUCTS[0]; // Test Coffee 3-in-1 @ 12.50, stock 100
    const [{ n }] = await testQuery(
      'SELECT COUNT(*) AS n FROM product_selling_units WHERE product_id = ?', [plain.id],
    );
    expect(Number(n)).toBe(0);

    await openPos(page);
    await page.keyboard.press('F9');
    await expect(page.getByPlaceholder(/search by name or barcode/i)).toBeFocused();
    await page.keyboard.type(plain.name);

    const rows = page.locator('[cmdk-item]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(plain.name);
    await expect(rows.first()).toContainText(`₱${plain.price.toFixed(2)}`);
    // Compare against the DB's current stock, not the seeded 100 — earlier specs
    // (pos-sale) legitimately sell this product and the suite shares one DB.
    const [{ stock }] = await testQuery('SELECT stock FROM products WHERE id = ?', [plain.id]);
    await expect(rows.first().locator('span.rounded-full')).toHaveText(new RegExp(`^${Number(stock)}\\b`));
  });
});
