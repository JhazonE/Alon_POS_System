import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Set a deterministic secret BEFORE signing: the module reads it lazily.
process.env.SERVER_SESSION_SECRET = 'test-secret-do-not-use-in-production';

import { NextRequest } from 'next/server';
import proxy from '../../proxy';
import { signSession } from '../../lib/auth/session';
import { isPublicApiRoute, PUBLIC_API_ROUTES, AUTH_HEADERS } from '../../lib/auth/public-routes';

// The allowlist is the whole security boundary: anything on it is reachable
// with no credentials. This test pins it to exactly the intended set so a
// future edit that widens it fails the suite.

const EXPECTED = [
  'POST /api/auth/login',
  'POST /api/license/activate',
  'POST /api/license/activate-online',
  'GET /api/license/status',
  'POST /api/license/heartbeat',
];

const actual = PUBLIC_API_ROUTES.map((r) => `${r.method} ${r.path}`).sort();
assert.deepEqual(
  actual.filter((r) => !r.includes('mock-sta-lucia')),
  EXPECTED.slice().sort(),
  'the public allowlist is exactly the intended set (plus the dev-only mock)'
);

// --- the specific hazards ---

assert.equal(
  isPublicApiRoute('POST', '/api/license/deactivate'),
  false,
  'license deactivate is NOT public: it takes no arguments, removes the ' +
    'installed license and drops the POS to the activation screen'
);
assert.equal(
  isPublicApiRoute('POST', '/api/auth/signup'),
  false,
  'signup is NOT public: its only guard is whether the username is taken, ' +
    'not whether any user exists, so it is a second user-creation door'
);
assert.equal(
  isPublicApiRoute('POST', '/api/users'),
  false,
  'user creation is NOT public'
);
assert.equal(
  isPublicApiRoute('POST', '/api/data-management/reset'),
  false,
  'the sales/BIR reset is NOT public'
);

// --- method is part of the match ---

assert.equal(isPublicApiRoute('POST', '/api/auth/login'), true, 'login POST is public');
assert.equal(
  isPublicApiRoute('GET', '/api/auth/login'),
  false,
  'only the POST on login is public — the allowlist matches method, not just path'
);
assert.equal(
  isPublicApiRoute('GET', '/api/license/status'),
  true,
  'license status GET is public (the activation screen reads it pre-login)'
);
assert.equal(
  isPublicApiRoute('POST', '/api/license/status'),
  false,
  'a POST to license status is not public'
);

// --- no prefix wildcards for license ---

assert.equal(
  PUBLIC_API_ROUTES.some((r) => r.path === '/api/license' || r.path.endsWith('/*')),
  false,
  'the license allowlist is per-route, never a /api/license/* wildcard'
);

// --- proxy source assertions ---

// proxy.ts, not middleware.ts: Next 16 deprecates the middleware convention,
// and middleware runs on the Edge Runtime where Node's crypto (needed by
// verifySession) is unavailable. A proxy file always runs on Node.
const proxyPath = path.join(__dirname, '../../proxy.ts');
assert.ok(
  fs.existsSync(proxyPath),
  'the auth entry point is proxy.ts (middleware.ts would run on the Edge ' +
    "Runtime, where verifySession's crypto import is unsupported)"
);
assert.equal(
  fs.existsSync(path.join(__dirname, '../../middleware.ts')),
  false,
  'there is no leftover middleware.ts — two entry points would both run'
);

const proxySource = fs.readFileSync(proxyPath, 'utf-8');

assert.match(
  proxySource,
  /export default function proxy/,
  'the proxy is a default export (the convention Next 16 expects)'
);
assert.equal(
  /export const config/.test(proxySource),
  false,
  'a proxy file must NOT export config — it is a hard build error: ' +
    '"Route segment config is not allowed in Proxy file"'
);
assert.match(
  proxySource,
  /pathname\.startsWith\(['"`]\/api\//,
  'the proxy scopes itself to /api paths, since no matcher config is available'
);

// Cheap structural guard: the strip is driven by AUTH_HEADERS, so a header
// added there is stripped automatically. The behavioural tests below prove
// the strip actually works.
assert.match(
  proxySource,
  /for \(const \w+ of Object\.values\(AUTH_HEADERS\)\)\s*headers\.delete\(/,
  'the proxy strips every AUTH_HEADERS entry from the inbound request'
);

assert.match(
  proxySource,
  /status:\s*401/,
  'the proxy returns 401 when verification fails'
);
assert.ok(
  proxySource.includes('verifySession'),
  'the proxy verifies the token rather than merely checking it is present'
);

// verifySession throws (by design) in production when SERVER_SESSION_SECRET is
// unset. That is a server misconfiguration, not an unauthenticated request:
// it must surface as a clear 500 naming the variable, never as a 401 (which
// would hide the misconfiguration) and never as an opaque unhandled throw.
assert.match(
  proxySource,
  /status:\s*500/,
  'a thrown verifySession (missing secret) becomes a 500, not a 401'
);
assert.ok(
  proxySource.includes('SERVER_SESSION_SECRET'),
  'the 500 message names SERVER_SESSION_SECRET so the operator can fix it'
);

// --- behaviour: call the proxy for real ---
// The source-text assertions above only prove text exists. These prove the
// proxy actually authenticates: an early unconditional pass-through would
// leave every assertion above green but fail here.

const call = (method: string, urlPath: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(new Request('http://x' + urlPath, { method, headers })));

assert.equal(call('GET', '/api/products').status, 401, 'protected route denies without a token');
assert.equal(
  call('POST', '/api/license/deactivate').status,
  401,
  'deactivate denies without a token'
);
assert.equal(call('POST', '/api/auth/signup').status, 401, 'signup denies without a token');
assert.equal(
  call('GET', '/api/auth/login').status,
  401,
  'method matters: GET on login is not public'
);
assert.equal(
  call('GET', '/api/products', { authorization: 'Bearer not.avalidtoken' }).status,
  401,
  'a forged token is denied'
);
assert.equal(
  call('GET', '/api/products', {
    'x-auth-uid': 'attacker',
    'x-auth-permissions': '["manage_users"]',
  }).status,
  401,
  'forged x-auth-* headers without a token do not authenticate'
);
assert.equal(call('POST', '/api/auth/login').status, 200, 'login passes through');
assert.equal(call('GET', '/api/license/status').status, 200, 'license status passes through');
assert.equal(call('GET', '/pos').status, 200, 'non-API page routes are not gated by the proxy');

const tok = signSession({
  uid: 'real-user',
  username: 'u',
  userType: 'Cashier',
  roleId: null,
  permissions: ['access_pos'],
});
const ok = call('GET', '/api/products', {
  authorization: `Bearer ${tok}`,
  'x-auth-uid': 'attacker',
  'x-auth-user-type': 'Admin',
  'x-auth-permissions': '["manage_users"]',
});
assert.equal(ok.status, 200, 'a valid token is accepted');
assert.equal(
  ok.headers.get('x-middleware-request-x-auth-uid'),
  'real-user',
  'forged uid is overwritten, not merged'
);
assert.equal(
  ok.headers.get('x-middleware-request-x-auth-user-type'),
  'Cashier',
  'forged user type is overwritten'
);
assert.equal(
  ok.headers.get('x-middleware-request-x-auth-permissions'),
  '["access_pos"]',
  'forged permissions are overwritten'
);

// A forged identity header must not reach a handler on a public route either.
// Next encodes the forwarded request headers as x-middleware-request-<name>
// plus an x-middleware-override-headers name list; the forged uid must be in
// neither.
const pub = call('POST', '/api/auth/login', { 'x-auth-uid': 'attacker' });
assert.equal(pub.status, 200, 'login passes through with a forged header present');
assert.equal(
  pub.headers.get('x-middleware-request-x-auth-uid'),
  null,
  'a forged x-auth-uid is not forwarded on a public route'
);
assert.equal(
  (pub.headers.get('x-middleware-override-headers') ?? '').split(',').includes('x-auth-uid'),
  false,
  'a forged x-auth-uid is not in the forwarded header list on a public route'
);

// Production with no secret: a token that gets past the shape checks makes
// verifySession throw. That is a server misconfiguration, so it must be a 500
// (not a 401 that hides it) with a generic body (no env var name leaked to
// anonymous callers). Run in a child process: the secret is cached per
// process, so this cannot be exercised in-process once any test has signed.
{
  const repoRoot = path.join(__dirname, '../..');
  const script = `
    const { NextRequest } = require('next/server');
    const proxy = require('./proxy.ts').default;
    const res = proxy(new NextRequest(new Request('http://x/api/products', {
      headers: { authorization: 'Bearer eyJhIjoxfQ.abc' },
    })));
    res.json().then((body) => console.log('RESULT ' + res.status + ' ' + JSON.stringify(body)));
  `;
  let out = '';
  try {
    out = execFileSync(
      process.execPath,
      [path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs'), '-e', script],
      {
        cwd: repoRoot,
        env: { ...process.env, NODE_ENV: 'production', SERVER_SESSION_SECRET: '' } as any,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      }
    );
  } catch (e: any) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const line = out.split('\n').find((l) => l.startsWith('RESULT '));
  assert.ok(line, `child produced a result line; output was: ${out}`);
  assert.match(line!, /^RESULT 500 /, 'missing production secret is a 500, not a 401');
  assert.equal(
    line!.includes('SERVER_SESSION_SECRET'),
    false,
    'the 500 response body does not leak the env var name'
  );
  assert.match(line!, /Server configuration error/, 'the 500 body is the generic message');
}

console.log('✓ proxy-allowlist');
