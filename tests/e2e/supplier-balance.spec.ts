import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { TEST_SUPPLIER } from './fixtures/test-data';

/**
 * Supplier Balance (DB-backed) batok sa alon_pos_test.
 *
 * Coverage:
 *  1. GET /api/suppliers/[id]/balance → mo-balik ug valid supplier data (balance fields).
 *  2. UI smoke sa /suppliers/balance: mo-load ang page ug makita ang test supplier.
 */

test.describe('Supplier balance', () => {
  test('GET /api/suppliers/[id]/balance → mo-balik ug supplier data', async ({ request }) => {
    const res = await request.get(`/api/suppliers/${TEST_SUPPLIER.id}/balance`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.supplier?.name ?? body.name).toBe(TEST_SUPPLIER.name);

    // Balance fields kinahanglan naa (kahit 0 ang value).
    const hasBalance =
      'balance' in body ||
      'totalPurchases' in body ||
      (body.supplier && 'balance' in body.supplier);
    expect(hasBalance, 'response should include balance fields').toBeTruthy();
  });

  test('UI smoke: /suppliers/balance mo-load ug makita ang test supplier', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/suppliers/balance');

    // Ang supplier balance page kinahanglan dili mo-crash.
    await expect(page).not.toHaveURL(/login/);

    // Ang test supplier makita sa table (kahit zero ang balance).
    await expect(page.getByText(TEST_SUPPLIER.name, { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});
