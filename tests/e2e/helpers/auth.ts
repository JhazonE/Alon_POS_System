import type { Page } from '@playwright/test';
import { signSession } from '../../../lib/auth/session';

// The test process mints tokens and the Playwright webServer verifies them, so
// both must share one secret. playwright.config.ts passes this same value to
// the server; setting it here (before the first signSession call, since the
// secret is read lazily and cached) keeps the two in agreement even when a
// spec is run without going through the config's env.
process.env.SERVER_SESSION_SECRET ??= 'e2e-test-secret';

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
/**
 * Mint a real signed session token for `user` (what /api/auth/login would
 * issue). Shared by seedSession (browser) and the authenticated `request`
 * fixture in authed-test.ts (API calls made directly from test code).
 */
export function mintSessionToken(user: SessionUser = DEFAULT_ADMIN): string {
  return signSession({
    uid: user.uid,
    username: user.username,
    userType: user.userType,
    roleId: user.roleId != null ? String(user.roleId) : null,
    permissions: user.permissions ?? [],
  });
}

export async function seedSession(page: Page, user: SessionUser = DEFAULT_ADMIN): Promise<void> {
  // A real signed token, not a fabricated one: the middleware verifies it, so
  // seeding only localStorage would 401 every request.
  const token = mintSessionToken(user);

  await page.addInitScript(
    ({ u, t }) => {
      window.localStorage.setItem('mock-user-session', JSON.stringify({ ...u, email: u.username }));
      window.localStorage.setItem('alon-session-token', t);
    },
    { u: user, t: token },
  );
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
