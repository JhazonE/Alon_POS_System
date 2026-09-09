import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';

const ADMIN = {
  ...DEFAULT_ADMIN,
  permissions: [
    'view_dashboard', 'manage_products', 'manage_inventory', 'view_sales',
    'manage_customers', 'manage_suppliers', 'manage_purchases', 'view_approvals',
    'manage_approval_settings', 'view_reports', 'manage_users', 'manage_settings',
  ],
};

/**
 * Ang matte surfaces solid gyud, walay alpha ug walay shadow. Duha ang
 * gidawat nga values kay depende sa theme sa runner; ang importante kay
 * ang token gigamit gyud, dili ang `--background`.
 */
const MATTE_SURFACES = ['rgb(255, 255, 255)', 'rgb(15, 51, 54)'];

test.describe('matte card system', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('ang supplier schedule kay matte card na', async ({ page }) => {
    await page.goto('/dashboard');
    const card = page.locator('[data-matte="card"]').filter({ hasText: 'Order Reminders' });
    await expect(card).toBeVisible();

    const style = await card.evaluate(el => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, shadow: s.boxShadow };
    });
    expect(MATTE_SURFACES).toContain(style.bg);
    expect(style.shadow).toBe('none');
  });
});
