import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';

/**
 * Customer management (DB-backed) batok sa alon_pos_test.
 *
 * Coverage:
 *  1. POST /api/customers → na-create ug na-persist sa DB.
 *  2. GET /api/customers → makita ang bag-ong customer sa list.
 *  3. UI smoke sa /customer/list: mo-load ang page nga walay crash.
 */

const TEST_CUSTOMER_ID = `e2e-cust-${Date.now()}`;

test.describe('Customer management', () => {
  test('POST /api/customers → na-persist ug makita sa GET', async ({ request }) => {
    const name = `E2E Customer ${Date.now()}`;
    const uniqueId = `e2e-c-${Date.now()}`;

    const res = await request.post('/api/customers', {
      data: {
        customerId: uniqueId,
        name,
        contactNumber: '09170000001',
      },
    });
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.success).toBeTruthy();

    // Verify nga makita ang customer sa list pinaagi sa search.
    await expect(async () => {
      const listRes = await request.get(`/api/customers?search=${encodeURIComponent(name)}&limit=10`);
      const listBody = await listRes.json();
      const match = (listBody.data ?? []).find((c: any) => c.name === name);
      expect(match, 'Customer makita sa list').toBeTruthy();
    }).toPass({ timeout: 10_000 });
  });

  test('UI smoke: /customer/list mo-load nga walay crash', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/customer');

    await expect(page).not.toHaveURL(/login/);

    // Ang page kinahanglan naa'y "Customer List" heading.
    await expect(page.getByRole('heading', { name: 'Customer List' })).toBeVisible({ timeout: 15_000 });
  });
});
