import { test, expect } from '@playwright/test';

// Real server, real /api/auth/login. Each test uses its own username and
// X-Forwarded-For so the in-memory counters never bleed into other specs that
// log in through the same server process.

const login = (request: any, username: string, ip: string) =>
  request.post('/api/auth/login', {
    data: { username, password: 'definitely-wrong' },
    headers: { 'x-forwarded-for': ip },
  });

test('repeated failed logins are locked out with 429 + Retry-After', async ({ request }) => {
  const user = `rl-lock-${Date.now()}`;
  const ip = '203.0.113.10';

  // Unknown user and wrong password both count, so the lockout cannot be used
  // to tell which usernames exist.
  for (let i = 0; i < 5; i++) {
    const res = await login(request, user, ip);
    expect(res.status(), `attempt ${i + 1}`).toBe(401);
  }

  const locked = await login(request, user, ip);
  expect(locked.status()).toBe(429);
  expect(Number(locked.headers()['retry-after'])).toBeGreaterThanOrEqual(1);
  expect((await locked.json()).success).toBe(false);
});

test('a lockout is scoped: another username and another address still get a normal 401', async ({ request }) => {
  const user = `rl-scope-${Date.now()}`;
  const ip = '203.0.113.20';
  for (let i = 0; i < 6; i++) await login(request, user, ip);
  expect((await login(request, user, ip)).status()).toBe(429);

  expect((await login(request, `${user}-other`, ip)).status()).toBe(401);
  expect((await login(request, user, '203.0.113.21')).status()).toBe(401);
});
