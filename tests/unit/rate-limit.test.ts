import assert from 'node:assert/strict';

// Tiny limits so the tests stay fast. Limiters take their options from the
// environment at first use, so this must be set before anything is consumed.
process.env.SERVER_SESSION_SECRET = 'test-secret-do-not-use-in-production';
process.env.RATE_LIMIT_API_MAX = '5';
process.env.RATE_LIMIT_REPORTS_MAX = '2';
process.env.RATE_LIMIT_PUBLIC_MAX = '50';
process.env.RATE_LIMIT_LOGIN_MAX = '3';
process.env.RATE_LIMIT_LOGIN_FAILURES = '3';
process.env.RATE_LIMIT_LOGIN_FAILURES_PER_USER = '6';
delete process.env.RATE_LIMIT_DISABLED;

import { NextRequest } from 'next/server';
import proxy from '../../proxy';
import { signSession } from '../../lib/auth/session';
import {
  clientAddress,
  createRateLimiter,
  resetRateLimiters,
} from '../../lib/rate-limit';
import {
  checkLoginLock,
  clearLoginFailures,
  recordLoginFailure,
} from '../../lib/rate-limit-policy';

// ---------------------------------------------------------------------------
// The limiter itself, on a fake clock.
// ---------------------------------------------------------------------------
{
  let t = 1_000_000;
  const rl = createRateLimiter({ max: 3, windowMs: 60_000, now: () => t });

  assert.equal(rl.consume('a').allowed, true, '1st request allowed');
  assert.equal(rl.consume('a').allowed, true, '2nd request allowed');
  const third = rl.consume('a');
  assert.equal(third.allowed, true, '3rd request (the limit) is still allowed');
  assert.equal(third.remaining, 0, 'nothing remains after the limit');
  const fourth = rl.consume('a');
  assert.equal(fourth.allowed, false, '4th request is refused');
  assert.ok(fourth.retryAfterSeconds >= 1, 'a refusal says when to come back');

  assert.equal(rl.consume('b').allowed, true, 'a different key has its own allowance');

  const before = rl.peek('b').remaining;
  rl.peek('b');
  assert.equal(rl.peek('b').remaining, before, 'peek never counts a request');

  t += 60_001;
  assert.equal(rl.consume('a').allowed, true, 'the window resets after windowMs');

  rl.reset('a');
  assert.equal(rl.peek('a').remaining, 3, 'reset forgets the key');
}

// Memory is bounded: rotating keys cannot grow the store without limit.
{
  const t = 5_000;
  const rl = createRateLimiter({ max: 1, windowMs: 60_000, maxKeys: 50, now: () => t });
  for (let i = 0; i < 500; i++) rl.consume(`k${i}`);
  assert.ok(rl.size() <= 50, `store stays within maxKeys (size ${rl.size()})`);
  assert.equal(rl.consume('fresh').allowed, true, 'a new key is still served when full');
}

// ---------------------------------------------------------------------------
// clientAddress
// ---------------------------------------------------------------------------
assert.equal(
  clientAddress(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })),
  '1.2.3.4',
  'first X-Forwarded-For hop is the client'
);
assert.equal(clientAddress(new Headers({ 'x-real-ip': '5.6.7.8' })), '5.6.7.8');
assert.equal(clientAddress(new Headers()), 'unknown', 'no header falls back to one shared bucket');

// ---------------------------------------------------------------------------
// The proxy, called for real.
// ---------------------------------------------------------------------------
const call = (method: string, urlPath: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(new Request('http://x' + urlPath, { method, headers })));

const tokenFor = (uid: string) =>
  signSession({ uid, username: uid, userType: 'Cashier', roleId: null, permissions: [] });
const authed = (uid: string) => ({ authorization: `Bearer ${tokenFor(uid)}` });

// Per-user isolation: one user exhausting their allowance must not touch another.
{
  resetRateLimiters();
  for (let i = 0; i < 5; i++) assert.equal(call('GET', '/api/products', authed('u1')).status, 200);
  const blocked = call('GET', '/api/products', authed('u1'));
  assert.equal(blocked.status, 429, 'the 6th request in the window is refused');
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1, '429 carries Retry-After');
  assert.equal(blocked.headers.get('x-ratelimit-limit'), '5');
  assert.match(blocked.headers.get('content-type') ?? '', /json/, '429 body is JSON');
  assert.equal(
    call('GET', '/api/products', authed('u2')).status,
    200,
    "a different user is NOT throttled by u1's burst"
  );
}

// A cashier mid-sale is never refused, however busy the account is.
{
  resetRateLimiters();
  for (let i = 0; i < 20; i++) call('GET', '/api/products', authed('cashier'));
  assert.equal(
    call('GET', '/api/products', authed('cashier')).status,
    429,
    'precondition: the general allowance is spent'
  );
  assert.equal(
    call('POST', '/api/pos/checkout', authed('cashier')).status,
    200,
    'POST /api/pos/checkout is exempt from the limit'
  );
}

// Expensive route families have their own, tighter bucket.
{
  resetRateLimiters();
  assert.equal(call('GET', '/api/reports/stats', authed('r1')).status, 200);
  assert.equal(call('GET', '/api/reports/stats', authed('r1')).status, 200);
  assert.equal(call('GET', '/api/reports/stats', authed('r1')).status, 429, 'reports bucket trips at 2');
  assert.equal(
    call('GET', '/api/products', authed('r1')).status,
    200,
    'tripping the reports bucket does not block ordinary routes'
  );
}

// Unauthenticated floods are a 401, never a counter: they cannot be used to
// exhaust a real user's allowance, and they cost no memory.
{
  resetRateLimiters();
  for (let i = 0; i < 30; i++) {
    assert.equal(call('GET', '/api/products').status, 401, 'no token is a 401, not a 429');
  }
  assert.equal(call('GET', '/api/products', authed('victim')).status, 200, 'a real user is unaffected');
}

// Login is limited per address, and other addresses are unaffected.
{
  resetRateLimiters();
  const a = { 'x-forwarded-for': '9.9.9.9' };
  for (let i = 0; i < 3; i++) assert.equal(call('POST', '/api/auth/login', a).status, 200);
  assert.equal(call('POST', '/api/auth/login', a).status, 429, 'login is capped per address');
  assert.equal(
    call('POST', '/api/auth/login', { 'x-forwarded-for': '8.8.8.8' }).status,
    200,
    'another address can still log in'
  );
  assert.equal(
    call('GET', '/api/license/status', a).status,
    200,
    'the login bucket does not block other public routes'
  );
}

// Master switch.
{
  resetRateLimiters();
  process.env.RATE_LIMIT_DISABLED = 'true';
  for (let i = 0; i < 20; i++) {
    assert.equal(call('GET', '/api/products', authed('free')).status, 200, 'disabled means no 429');
  }
  delete process.env.RATE_LIMIT_DISABLED;
}

// ---------------------------------------------------------------------------
// Login failure lockout.
// ---------------------------------------------------------------------------
{
  resetRateLimiters();
  const h = new Headers({ 'x-forwarded-for': '1.1.1.1' });

  assert.equal(checkLoginLock(h, 'maria'), null, 'no failures, no lock');
  recordLoginFailure(h, 'maria');
  recordLoginFailure(h, 'maria');
  assert.equal(checkLoginLock(h, 'maria'), null, 'below the threshold, still allowed');
  recordLoginFailure(h, 'maria');
  const lock = checkLoginLock(h, 'maria');
  assert.ok(lock && !lock.allowed, 'locked after the 3rd failure');
  assert.ok(lock!.retryAfterSeconds >= 1);

  assert.ok(checkLoginLock(h, 'MARIA '), 'username is normalised: case/space cannot dodge the lock');
  assert.equal(
    checkLoginLock(h, 'juan'),
    null,
    'a different username from the same address is not locked'
  );
  assert.equal(
    checkLoginLock(new Headers({ 'x-forwarded-for': '2.2.2.2' }), 'maria'),
    null,
    "a stranger's guesses do not lock the real user out from their own address"
  );

  // Locking must not be reachable with an unlock-by-success trick: peek is
  // free, and a success clears only the pair counter.
  clearLoginFailures(h, 'maria');
  assert.equal(checkLoginLock(h, 'maria'), null, 'a successful login clears the pair lock');
}

// Rotating the address header does not defeat the per-username ceiling.
{
  resetRateLimiters();
  for (let i = 0; i < 6; i++) {
    recordLoginFailure(new Headers({ 'x-forwarded-for': `10.0.0.${i}` }), 'victim');
  }
  const lock = checkLoginLock(new Headers({ 'x-forwarded-for': '10.0.0.200' }), 'victim');
  assert.ok(lock && !lock.allowed, 'a fresh address is still locked once the username ceiling is hit');
  assert.equal(
    checkLoginLock(new Headers({ 'x-forwarded-for': '10.0.0.200' }), 'someone-else'),
    null,
    'the ceiling is per username, not global'
  );
}

resetRateLimiters();
console.log('✓ rate-limit');
