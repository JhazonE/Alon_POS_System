import { test, expect } from '@playwright/test';
import { seedSession, type SessionUser } from './helpers/auth';

const CASHIER: SessionUser = {
  uid: 'e2e-cashier',
  username: 'e2e-cashier',
  userType: 'Cashier',
  displayName: 'E2E Cashier',
  permissions: ['access_pos', 'view_sales'],
};

test('an API request with no token is rejected', async ({ request }) => {
  const res = await request.get('/api/products');
  expect(res.status()).toBe(401);
});

test('a forged x-auth-uid header does not authenticate', async ({ request }) => {
  // The middleware strips inbound x-auth-* headers, so this must not pass.
  const res = await request.get('/api/products', {
    headers: {
      'x-auth-uid': 'attacker',
      'x-auth-user-type': 'Super Admin',
      'x-auth-permissions': JSON.stringify(['manage_users', 'manage_settings']),
    },
  });
  expect(res.status()).toBe(401);
});

test('a garbage bearer token is rejected', async ({ request }) => {
  const res = await request.get('/api/products', {
    headers: { Authorization: 'Bearer not-a-real-token' },
  });
  expect(res.status()).toBe(401);
});

test('the public login route is reachable without a token', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { username: 'nobody-such-user', password: 'wrong' },
  });
  // 401 for bad credentials is fine; what matters is that it is NOT the
  // middleware's blanket rejection, i.e. the route actually ran.
  expect([400, 401, 403]).toContain(res.status());
  const body = await res.json();
  expect(body.error).toBeDefined();
});

test('license deactivate is not publicly callable', async ({ request }) => {
  const res = await request.post('/api/license/deactivate');
  expect(res.status()).toBe(401);
});

test('a seeded session can read the API', async ({ page }) => {
  await seedSession(page);
  await page.goto('/products');
  const status = await page.evaluate(async () => {
    const token = window.localStorage.getItem('alon-session-token');
    const res = await fetch('/api/products', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.status;
  });
  expect(status).toBe(200);
});

test('a cashier lacking manage_users gets 403, not 401', async ({ page }) => {
  await seedSession(page, CASHIER);
  await page.goto('/pos');
  const status = await page.evaluate(async () => {
    const token = window.localStorage.getItem('alon-session-token');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ username: 'escalated', password: 'x', userType: 'Admin' }),
    });
    return res.status;
  });
  // 403 and not 401: a 401 would log the cashier out mid-shift.
  expect(status).toBe(403);
});
