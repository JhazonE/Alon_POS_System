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

test.describe('dashboard layout', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('tulo ka hero cards ang naa sa taas, naay values', async ({ page }) => {
    await page.goto('/dashboard');
    for (const key of ['today', 'month', 'profit']) {
      const card = page.locator(`[data-stat="${key}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator('[data-stat-value]')).not.toBeEmpty();
    }
  });

  test('upat ka tiles ang stat strip', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-matte="strip"]')).toBeVisible();
    const keys = await page.locator('[data-matte="tile"]').evaluateAll(
      els => els.map(e => e.getAttribute('data-stat')),
    );
    expect(keys).toEqual(['txns', 'items-sold', 'products', 'low-stock']);
  });

  test('ang low-stock tile mo-link sa report', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-stat="low-stock"]')).toHaveAttribute('href', '/reports/low-stock');
  });

  test('ang all-time revenue wala na sa hero row', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-stat="today"]')).toBeVisible();
    await expect(page.locator('[data-stat="revenue-all-time"]')).toHaveCount(0);
  });

  test('ang dashboard root nagbutang sa matte ground', async ({ page }) => {
    await page.goto('/dashboard');
    const bg = await page.locator('[data-dashboard="root"]')
      .evaluate(el => getComputedStyle(el).backgroundColor);
    expect(['rgb(241, 247, 246)', 'rgb(11, 42, 45)']).toContain(bg);
  });

  test('kung mapakyas ang refetch, magpabilin ang cards ug motungha ang banner', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-stat="today"] [data-stat-value]')).not.toBeEmpty();
    const before = await page.locator('[data-stat="today"] [data-stat-value]').innerText();

    // Ang sunod ra nga fetch ang paltuson -- ang una nagsugod na sa cards.
    await page.route('**/api/reports/stats**', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Database unavailable"}' }),
    );
    await page.click('[data-dashboard="refresh"]');

    await expect(page.locator('[data-dashboard="error"]')).toContainText('Database unavailable');
    // Ang mga numero dili mawala samtang naa ang error -- dili gub-on sa
    // pakyas nga refresh ang usa ka screen nga mabasa nga data.
    await expect(page.locator('[data-stat="today"] [data-stat-value]')).toHaveText(before);
  });

  test('ang fiscal-year select naa sa page header, dili sulod sa metric card', async ({ page }) => {
    await page.goto('/dashboard');
    const select = page.locator('[data-dashboard="fiscal-year"]');
    if (await select.count() === 0) test.skip(true, 'calendar fiscal year ang test DB');
    await expect(select.locator('xpath=ancestor::*[@data-matte="stat"]')).toHaveCount(0);
  });
});

test.describe('chart cards', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('tanang dashboard cards kay matte, walay glass ug walay shadow', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-matte="card"]').first()).toBeVisible();

    // Walay nahabilin nga glass-card sa dashboard.
    await expect(page.locator('main .glass-card')).toHaveCount(0);

    const styles = await page.locator('[data-matte="card"]').evaluateAll(els =>
      els.map(el => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, shadow: s.boxShadow, filter: s.backdropFilter };
      }),
    );
    expect(styles.length).toBeGreaterThanOrEqual(4);
    for (const s of styles) {
      expect(MATTE_SURFACES).toContain(s.bg);
      expect(s.shadow).toBe('none');
      expect(['none', '']).toContain(s.filter);
    }
  });

  test('ang hourly chart wala nay kaugalingong col-span', async ({ page }) => {
    await page.goto('/dashboard');
    const card = page.locator('[data-matte="card"]').filter({ hasText: 'Hourly Sales' });
    await expect(card).toBeVisible();
    await expect(card).not.toHaveClass(/col-span-4/);
  });
});
