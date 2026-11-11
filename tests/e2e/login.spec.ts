import { test, expect } from '@playwright/test';

/**
 * Smoke test para sa login page.
 * Wala kini nagsalig sa database — UI rendering ug client-side validation ra
 * ang gi-check, mao nga modagan ni bisan walay test data.
 */
test.describe('Login page', () => {
  test('mo-render ang login form', async ({ page }) => {
    await page.goto('/login');

    // The login screen was rebuilt (c00dd43): its h1 is the product name, there
    // is no longer a "Welcome back" heading.
    await expect(page.getByRole('heading', { level: 1, name: /alon pos system/i })).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('mo-pakita ug validation error kung blangko ang fields', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Username is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('mo-redirect ang root (/) ngadto sa /login kung walay session', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});
