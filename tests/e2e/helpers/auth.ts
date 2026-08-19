import type { Page } from '@playwright/test';

/**
 * Auth helpers para sa e2e tests.
 *
 * Ang app naggamit ug localStorage key nga `mock-user-session` isip auth guard,
 * ug ang login UI mo-POST sa `/api/auth/login`. Para dili magsalig sa tinuod nga
 * database, i-mock nato ang login API response.
 */

export type SessionUser = {
  uid: string;
  username: string;
  userType: 'Admin' | 'Manager' | 'Cashier' | 'Employee' | string;
  roleId?: string | number | null;
  displayName?: string;
  photoURL?: string | null;
  permissions?: string[];
};

export const DEFAULT_ADMIN: SessionUser = {
  uid: 'test-admin-uid',
  username: 'test.admin',
  userType: 'Admin',
  roleId: 1,
  displayName: 'Test Admin',
  photoURL: null,
  permissions: ['*'],
};

/**
 * I-intercept ang `/api/auth/login` ug mo-balik ug fixed nga user — walay DB hit.
 * Itawag ni una sa page.goto('/login').
 */
export async function mockLoginEndpoint(
  page: Page,
  opts: { user?: SessionUser; ok?: boolean; error?: string } = {},
): Promise<void> {
  const { user = DEFAULT_ADMIN, ok = true, error = 'Invalid credentials' } = opts;

  await page.route('**/api/auth/login', async (route) => {
    if (!ok) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...user,
        email: user.username,
      }),
    });
  });
}

/**
 * I-prepopulate ang localStorage session aron makasulod direkta sa protected
 * routes nga dili mo-agi sa login form. Itawag ni una mo-navigate.
 */
export async function seedSession(page: Page, user: SessionUser = DEFAULT_ADMIN): Promise<void> {
  await page.addInitScript((u) => {
    window.localStorage.setItem(
      'mock-user-session',
      JSON.stringify({ ...u, email: u.username }),
    );
  }, user);
}

/** Buhata ang tinuod nga login UI flow batok sa gi-mock nga endpoint. */
export async function loginViaUI(
  page: Page,
  username = DEFAULT_ADMIN.username,
  password = 'whatever',
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

/**
 * Real login — WALAY mock; mo-agi sa tinuod nga `/api/auth/login` batok sa
 * alon_pos_test database. Gamita ang seeded fixture credentials.
 */
export async function realLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}
