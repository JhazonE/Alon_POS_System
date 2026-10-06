import { test, expect } from './helpers/authed-test';
import { mockLoginEndpoint, seedSession, loginViaUI, DEFAULT_ADMIN } from './helpers/auth';

/**
 * Authenticated flow tests.
 * Gi-mock ang `/api/auth/login` aron deterministic ug walay dependency sa DB.
 */
test.describe('Authentication flow', () => {
  test('successful admin login → mo-store ug session ug mobiya sa /login', async ({ page }) => {
    await mockLoginEndpoint(page, { user: DEFAULT_ADMIN });
    await loginViaUI(page, DEFAULT_ADMIN.username, 'correct-password');

    // Admin → router.push('/') → root mo-redirect sa /dashboard.
    await expect(page).not.toHaveURL(/\/login$/);

    const session = await page.evaluate(() => localStorage.getItem('mock-user-session'));
    expect(session).toContain(DEFAULT_ADMIN.username);
  });

  test('cashier login → mo-redirect sa /pos', async ({ page }) => {
    await mockLoginEndpoint(page, {
      user: { ...DEFAULT_ADMIN, username: 'test.cashier', userType: 'Cashier' },
    });
    await loginViaUI(page, 'test.cashier', 'correct-password');

    await expect(page).toHaveURL(/\/pos$/);
  });

  test('invalid credentials → mo-pakita ug error alert', async ({ page }) => {
    await mockLoginEndpoint(page, { ok: false, error: 'Invalid credentials' });
    await loginViaUI(page, 'wrong.user', 'wrong-password');

    await expect(page.getByText('Login Failed')).toBeVisible();
    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('seeded session → ang protected route dili mo-bounce sa /login', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/settings');

    // Ang auth guard mo-allow — dili mo-redirect balik sa /login.
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page).toHaveURL(/\/settings/);
  });
});
