import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

// Review Focus #1: inbound header injection.
for (const header of Object.values(AUTH_HEADERS)) {
  assert.ok(
    proxySource.includes(`delete(${JSON.stringify(header)})`) ||
      proxySource.includes(`delete('${header}')`),
    `the proxy deletes the inbound ${header} header before setting it, so a ` +
      `client cannot inject its own identity`
  );
}

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
  /try\s*\{[^}]*verifySession\([^}]*\}\s*catch/,
  'the proxy wraps verifySession in try/catch so a secret-configuration ' +
    'error does not escape as an opaque 500 stack trace'
);
assert.match(
  proxySource,
  /status:\s*500/,
  'a thrown verifySession (missing secret) becomes a 500, not a 401'
);
assert.ok(
  proxySource.includes('SERVER_SESSION_SECRET'),
  'the 500 message names SERVER_SESSION_SECRET so the operator can fix it'
);

console.log('✓ proxy-allowlist');
