import { test, expect } from '@playwright/test';
import { realLogin } from './helpers/auth';
import { TEST_USERS, TEST_PRODUCTS, TEST_PASSWORD, BUSINESS_NAME } from './fixtures/test-data';

/**
 * DB-backed tests — WALAY mock. Kini mo-agi sa tinuod nga API batok sa isolated
 * `alon_pos_test` database nga gi-seed sa global setup. Gi-prove niini nga ang
 * tibuok stack (UI → API → MySQL) nagdagan gamit ang known fixtures.
 */
test.describe('DB-backed: real authentication', () => {
  test('admin nga seeded → makasulod ug dili mo-bounce sa /login', async ({ page }) => {
    await realLogin(page, TEST_USERS.admin.username, TEST_USERS.admin.password);

    await expect(page).not.toHaveURL(/\/login$/);

    const session = await page.evaluate(() => localStorage.getItem('mock-user-session'));
    expect(session).toContain(TEST_USERS.admin.username);
    expect(session).toContain('Admin');
  });

  test('cashier nga seeded → mo-redirect sa /pos', async ({ page }) => {
    await realLogin(page, TEST_USERS.cashier.username, TEST_USERS.cashier.password);
    await expect(page).toHaveURL(/\/pos$/);
  });

  test('sayop nga password sa tinuod nga user → 401 error alert', async ({ page }) => {
    await realLogin(page, TEST_USERS.admin.username, 'wrong-password');

    await expect(page.getByText('Login Failed')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('DB-backed: seeded data', () => {
  test('pos_settings business name gikan sa test DB', async ({ request }) => {
    const res = await request.get('/api/pos-settings');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body?.data?.businessName ?? body?.data?.business_name).toBe(BUSINESS_NAME);
  });

  test('seeded products makita sa /api/products', async ({ request }) => {
    const res = await request.get('/api/products?limit=50');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBeTruthy();

    const skus: string[] = (body.data ?? []).map((p: any) => p.sku);
    for (const product of TEST_PRODUCTS) {
      expect(skus).toContain(product.sku);
    }
  });
});

// Gigamit ra para masiguro nga gi-import; mahimong tangtangon kung dili kinahanglan.
void TEST_PASSWORD;
