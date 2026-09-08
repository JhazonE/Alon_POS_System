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

const bg = (page: import('@playwright/test').Page, selector: string) =>
  page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor);

test.describe('sidebar panel', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('renders group cards', async ({ page }) => {
    await page.goto('/dashboard');
    // evaluateAll does not auto-wait, and the layout renders a spinner until the
    // localStorage session has loaded, so pin the panel first.
    await expect(page.locator('[data-sidebar="card"]').first()).toBeVisible();
    const labels = await page.locator('[data-sidebar="card"]').evaluateAll(
      els => els.map(e => e.getAttribute('data-label')),
    );
    expect(labels).toContain('OVERVIEW');
    expect(labels).toContain('SELL');
    expect(labels).toContain('PURCHASING');
  });

  test('the active row is filled with the brand teal', async ({ page }) => {
    await page.goto('/products');
    await expect(page.locator('[data-sidebar="row"][data-href="/products"]')).toHaveAttribute('data-active', 'true');
    expect(await bg(page, '[data-sidebar="row"][data-href="/products"]')).toBe('rgb(14, 124, 134)');
  });

  test('a resting row has no background', async ({ page }) => {
    await page.goto('/products');
    expect(await bg(page, '[data-sidebar="row"][data-href="/dashboard"]')).toBe('rgba(0, 0, 0, 0)');
  });

  test('only one accordion section is open at a time', async ({ page }) => {
    await page.goto('/dashboard');
    const openLabels = () => page.locator('[data-sidebar="accordion"][data-state="open"]')
      .evaluateAll(els => els.map(e => e.getAttribute('data-label')));

    await page.click('[data-sidebar="accordion"][data-label="Sales"]');
    expect(await openLabels()).toEqual(['Sales']);

    await page.click('[data-sidebar="accordion"][data-label="Inventory"]');
    expect(await openLabels()).toEqual(['Inventory']);

    await page.click('[data-sidebar="accordion"][data-label="Inventory"]');
    expect(await openLabels()).toEqual([]);
  });

  test('navigating into a section opens it', async ({ page }) => {
    await page.goto('/inventory/stock-counts');
    await expect(page.locator('[data-sidebar="accordion"][data-label="Inventory"]')).toHaveAttribute('data-state', 'open');
  });

  test('a collapsed cookie survives a reload', async ({ page, context }) => {
    await context.addCookies([{
      name: 'sidebar_state', value: 'false', domain: 'localhost', path: '/',
    }]);
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="panel"]')).toHaveAttribute('data-state', 'collapsed');
  });

  test('Ctrl+B flips the state and writes the cookie', async ({ page, context }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="panel"]')).toHaveAttribute('data-state', 'expanded');

    await page.keyboard.press('Control+b');
    await expect(page.locator('[data-sidebar="panel"]')).toHaveAttribute('data-state', 'collapsed');

    const cookie = (await context.cookies()).find(c => c.name === 'sidebar_state');
    expect(cookie?.value).toBe('false');
  });
});
