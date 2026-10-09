# API Authentication Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every API route reject unauthenticated requests by default, and require a permission on the routes where a forged request causes irreversible damage.

**Architecture:** Login issues an HMAC-SHA256-signed bearer token carrying the user's identity and permissions. A root `proxy.ts` (Next 16 replaces `middleware.ts`; a proxy file runs on the Node.js runtime, which `crypto` requires) verifies it on every `/api` path against a small per-route public allowlist, then forwards trusted identity as request headers it first strips from the inbound request. A `requirePermission()` helper reads those trusted headers on destructive routes. Client calls move from bare `fetch` to an `authFetch()` wrapper in the same branch, so `main` is never in a state where the server demands a token the client does not send.

**Tech Stack:** Next.js 16 middleware, Node built-in `crypto` (no new dependency), TypeScript, `node:assert` unit tests via `tests/unit/run.ts`, Playwright E2E on port 3100.

**Spec:** `docs/superpowers/specs/2026-10-05-api-authentication-design.md`

## Global Constraints

- **No new runtime dependencies.** Node's built-in `crypto` only.
- **Secret env var name:** `SERVER_SESSION_SECRET`. No default literal may appear anywhere in source.
- **Token TTL:** 12 hours (`12 * 60 * 60` seconds).
- **Token format:** `base64url(payloadJson) + "." + base64url(hmacSha256(payloadJson, secret))`.
- **Trusted header names:** `x-auth-uid`, `x-auth-user-type`, `x-auth-permissions`. Middleware MUST strip these from the inbound request before setting them.
- **Permission vocabulary:** only the 13 strings seeded by `scripts/migrations/070_create_user_types_tables.ts` — `access_pos`, `view_dashboard`, `manage_products`, `manage_inventory`, `view_sales`, `manage_purchases`, `manage_customers`, `manage_suppliers`, `view_reports`, `manage_users`, `manage_settings`, `view_approvals`, `manage_approval_settings`. Invent none.
- **`super_admin` is NOT a server-side bypass.** It is not in the 13 and must never short-circuit `requirePermission`.
- **`localStorage` key `mock-user-session` keeps its existing shape.** 18 files read it; only an additional token key is introduced.
- **Never attach the session header to outbound third-party calls:** everything in `lib/integrations/sta-lucia/` and the license-server call in `app/api/license/heartbeat/route.ts`.
- **Unit tests** use `node:assert/strict`, self-execute on import, log `✓ <name>` on success, and are registered in `tests/unit/run.ts`.

## Review Focus

Five failure modes the spec implies that no task's happy-path tests would exercise. Each has its test assigned to the task that owns the code.

1. **A client that injects `x-auth-uid` directly, with no token.** If middleware sets headers without stripping inbound ones, the attacker picks their own identity and the whole design fails. → Task 3.
2. **A token signed with a different secret** (e.g. copied from a dev machine to production). Must be rejected, not accepted because the payload parses. → Task 1.
3. **An expired token on an in-progress POS shift.** Must yield 401 that routes to login, not a silent partial failure mid-sale. → Task 3 (verification), Task 7 (client handling).
4. **A request with a valid token but a permission the user lacks.** Must be 403 and must NOT be treated as unauthenticated (a 401 would log them out, losing an in-progress sale). → Task 4.
5. **A `fetch` whose URL is a variable** (`fetch(url, ...)`), where the codemod cannot tell our API from a third party's. Attaching the header to a Sta. Lucia call leaks a credential. → Task 6.

---

### Task 1: Session signing and verification

**Files:**
- Create: `lib/auth/session.ts`
- Test: `tests/unit/session.test.ts`
- Modify: `tests/unit/run.ts` (register the test)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `export type SessionPayload = { uid: string; username: string; userType: string; roleId: string | null; permissions: string[]; iat: number; exp: number }`
  - `export function signSession(input: Omit<SessionPayload, 'iat' | 'exp'>): string`
  - `export function verifySession(token: string | null | undefined): SessionPayload | null`
  - `export const SESSION_TTL_SECONDS = 12 * 60 * 60`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/session.test.ts`:

```typescript
import assert from 'node:assert/strict';

// Set a deterministic secret BEFORE importing the module under test: the
// module reads it at load time.
process.env.SERVER_SESSION_SECRET = 'test-secret-do-not-use-in-production';

import { signSession, verifySession, SESSION_TTL_SECONDS } from '../../lib/auth/session';

const USER = {
  uid: 'u-1',
  username: 'cashier1',
  userType: 'Cashier',
  roleId: 'rt-2',
  permissions: ['access_pos', 'view_sales'],
};

// --- round trip ---

const token = signSession(USER);
const verified = verifySession(token);

assert.ok(verified, 'a freshly signed token verifies');
assert.equal(verified!.uid, 'u-1', 'uid survives the round trip');
assert.equal(verified!.username, 'cashier1', 'username survives the round trip');
assert.equal(verified!.userType, 'Cashier', 'userType survives the round trip');
assert.equal(verified!.roleId, 'rt-2', 'roleId survives the round trip');
assert.deepEqual(
  verified!.permissions,
  ['access_pos', 'view_sales'],
  'permissions survive the round trip'
);
assert.equal(typeof verified!.iat, 'number', 'iat is stamped');
assert.equal(verified!.exp - verified!.iat, SESSION_TTL_SECONDS, 'exp is iat + 12h');

// --- tampering is rejected ---

const [payloadPart, sigPart] = token.split('.');

// Re-encode a payload claiming manage_users, keeping the original signature.
const elevated = Buffer.from(
  JSON.stringify({ ...verified!, permissions: ['manage_users'] })
).toString('base64url');
assert.equal(
  verifySession(`${elevated}.${sigPart}`),
  null,
  'a payload edited to grant manage_users is rejected (signature no longer matches)'
);

assert.equal(
  verifySession(`${payloadPart}.${Buffer.from('bogus').toString('base64url')}`),
  null,
  'a token with a forged signature is rejected'
);

// --- a token signed with a DIFFERENT secret is rejected (Review Focus #2) ---
// Build one by hand with another key rather than reloading the module.
{
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const payloadJson = JSON.stringify({
    ...USER,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
  const foreignSig = crypto
    .createHmac('sha256', 'a-different-machines-secret')
    .update(payloadJson)
    .digest('base64url');
  const foreignToken = `${Buffer.from(payloadJson).toString('base64url')}.${foreignSig}`;
  assert.equal(
    verifySession(foreignToken),
    null,
    'a token signed with another secret is rejected (copied from another machine)'
  );
}

// --- expiry ---

{
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const past = Math.floor(Date.now() / 1000) - 60;
  const payloadJson = JSON.stringify({ ...USER, iat: past - SESSION_TTL_SECONDS, exp: past });
  const sig = crypto
    .createHmac('sha256', 'test-secret-do-not-use-in-production')
    .update(payloadJson)
    .digest('base64url');
  const expired = `${Buffer.from(payloadJson).toString('base64url')}.${sig}`;
  assert.equal(
    verifySession(expired),
    null,
    'a correctly signed but expired token is rejected'
  );
}

// --- malformed input returns null rather than throwing ---

for (const bad of [
  null,
  undefined,
  '',
  'no-dot-at-all',
  'too.many.dots.here',
  '!!!not-base64!!!.!!!also-not!!!',
  '.',
]) {
  assert.equal(
    verifySession(bad as any),
    null,
    `malformed token ${JSON.stringify(bad)} returns null instead of throwing`
  );
}

console.log('✓ session');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/session.test.ts`
Expected: FAIL — `Cannot find module '../../lib/auth/session'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/auth/session.ts`:

```typescript
/**
 * HMAC-SHA256 signed session tokens. Zero external deps.
 *
 * Layout: base64url(payloadJson) "." base64url(hmac)
 *
 * Verification never throws — it returns null for malformed, mis-signed, and
 * expired tokens alike, so callers have one failure path and no partial
 * trust. The uniform null also avoids giving a caller an oracle that
 * distinguishes "tampered" from "expired".
 */
import crypto from 'crypto';

export const SESSION_TTL_SECONDS = 12 * 60 * 60; // one retail shift

export type SessionPayload = {
  uid: string;
  username: string;
  userType: string;
  roleId: string | null;
  permissions: string[];
  iat: number;
  exp: number;
};

let cachedSecret: string | null = null;

/**
 * The signing secret.
 *
 * Production with SERVER_SESSION_SECRET unset throws: failing loudly at the
 * first signing/verifying call is correct, because the alternative is a server
 * that silently accepts forged tokens. Development falls back to a random
 * per-boot secret (tokens simply do not survive a restart).
 *
 * There is deliberately no default literal — a committed fallback is how this
 * kind of guard gets quietly defeated.
 */
function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.SERVER_SESSION_SECRET;
  if (fromEnv && fromEnv.length > 0) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SERVER_SESSION_SECRET is not set. Refusing to sign or verify sessions ' +
        'in production without it — an unset secret means forged tokens would ' +
        'be accepted. Set it in .env and restart.'
    );
  }

  cachedSecret = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[auth] SERVER_SESSION_SECRET is unset; using a random per-boot secret. ' +
      'Sessions will not survive a restart. Set it in .env for stable dev sessions.'
  );
  return cachedSecret;
}

function hmac(payloadJson: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payloadJson).digest('base64url');
}

export function signSession(input: Omit<SessionPayload, 'iat' | 'exp'>): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { ...input, iat, exp: iat + SESSION_TTL_SECONDS };
  const payloadJson = JSON.stringify(payload);
  return `${Buffer.from(payloadJson).toString('base64url')}.${hmac(payloadJson)}`;
}

export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
  if (!payloadJson) return null;

  // Constant-time comparison. timingSafeEqual throws on length mismatch, so
  // compare lengths first.
  const expected = Buffer.from(hmac(payloadJson));
  const actual = Buffer.from(sigB64);
  if (expected.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(expected, actual)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  if (typeof payload?.exp !== 'number') return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  if (!Array.isArray(payload.permissions)) return null;

  return payload;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/session.test.ts`
Expected: PASS — prints `✓ session`

- [ ] **Step 5: Register the test in the runner**

In `tests/unit/run.ts`, add to the `TEST_FILES` array (keep alphabetical-ish grouping with the other new auth tests at the end):

```typescript
  'session.test',
```

- [ ] **Step 6: Run the whole suite**

Run: `npm run test:unit`
Expected: PASS — `All <N> unit test files passed.`, exit 0

- [ ] **Step 7: Commit**

```bash
git add lib/auth/session.ts tests/unit/session.test.ts tests/unit/run.ts
git commit -m "feat(auth): add HMAC-signed session tokens"
```

---

### Task 2: Secret-handling guards

**Files:**
- Test: `tests/unit/session-secret.test.ts`
- Modify: `tests/unit/run.ts`
- Modify: `.env.example` (create if absent)

**Interfaces:**
- Consumes: `lib/auth/session.ts` from Task 1 (unchanged by this task).
- Produces: nothing new. This task only pins the secret rules with tests.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/session-secret.test.ts`:

```typescript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The secret rules are process-wide and read at module load, so they are
// checked by running a child process per scenario rather than by re-importing.

const repoRoot = path.join(__dirname, '../..');

function runWithEnv(env: Record<string, string | undefined>): { ok: boolean; output: string } {
  const script = `
    require('${path.join(repoRoot, 'lib/auth/session.ts').replace(/\\/g, '/')}');
    const { signSession } = require('${path.join(repoRoot, 'lib/auth/session.ts').replace(/\\/g, '/')}');
    signSession({ uid: 'u', username: 'u', userType: 'Admin', roleId: null, permissions: [] });
    console.log('SIGNED_OK');
  `;
  try {
    const output = execFileSync('npx', ['tsx', '-e', script], {
      cwd: repoRoot,
      env: { ...process.env, ...env } as any,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    return { ok: true, output };
  } catch (e: any) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// --- production with no secret must refuse to sign ---

const prodNoSecret = runWithEnv({
  NODE_ENV: 'production',
  SERVER_SESSION_SECRET: undefined,
});
assert.equal(
  prodNoSecret.ok && prodNoSecret.output.includes('SIGNED_OK'),
  false,
  'production with SERVER_SESSION_SECRET unset must NOT sign a session'
);
assert.match(
  prodNoSecret.output,
  /SERVER_SESSION_SECRET/,
  'the production failure names the missing variable so an operator can act on it'
);

// --- production WITH a secret works ---

const prodWithSecret = runWithEnv({
  NODE_ENV: 'production',
  SERVER_SESSION_SECRET: 'a-real-secret',
});
assert.ok(
  prodWithSecret.ok && prodWithSecret.output.includes('SIGNED_OK'),
  'production with the secret set signs normally'
);

// --- development without a secret still works (warns) ---

const devNoSecret = runWithEnv({
  NODE_ENV: 'development',
  SERVER_SESSION_SECRET: undefined,
});
assert.ok(
  devNoSecret.ok && devNoSecret.output.includes('SIGNED_OK'),
  'development without the secret falls back to a per-boot secret'
);

// --- no committed default secret ---

const sessionSource = fs.readFileSync(path.join(repoRoot, 'lib/auth/session.ts'), 'utf-8');
assert.equal(
  /SERVER_SESSION_SECRET\s*(\|\||\?\?)\s*['"`]/.test(sessionSource),
  false,
  'session.ts must not fall back to a hardcoded secret literal — a committed ' +
    'default is how this guard gets defeated'
);

console.log('✓ session-secret');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/session-secret.test.ts`
Expected: FAIL. If Task 1 was implemented exactly as written it may already pass the behavioral assertions — in that case confirm the failure is absent for the right reason by temporarily adding `|| 'fallback'` to the `process.env.SERVER_SESSION_SECRET` read in `lib/auth/session.ts`, re-running (the no-default assertion must FAIL), then reverting.

- [ ] **Step 3: Document the variable**

Add to `.env.example` (create the file if it does not exist):

```
# Required in production. Signs API session tokens; the server refuses to
# sign or verify sessions without it. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SERVER_SESSION_SECRET=
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/session-secret.test.ts`
Expected: PASS — prints `✓ session-secret`

- [ ] **Step 5: Register and run the suite**

Add `'session-secret.test',` to `TEST_FILES` in `tests/unit/run.ts`, then:

Run: `npm run test:unit`
Expected: PASS, exit 0

- [ ] **Step 6: Commit**

```bash
git add tests/unit/session-secret.test.ts tests/unit/run.ts .env.example
git commit -m "test(auth): pin session secret handling rules"
```

---

### Task 3: Proxy middleware (deny-by-default)

> **Verified against this repo's Next 16.2.6 before planning.** Two things that
> would otherwise break this task:
>
> 1. **The file must be `proxy.ts`, not `middleware.ts`.** Next 16 deprecates
>    the `middleware` convention: a `middleware.ts` build prints
>    `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.`
> 2. **`middleware.ts` runs on the Edge Runtime, where Node's `crypto` is
>    unavailable** — a `middleware.ts` importing `crypto` builds with
>    `A Node.js module is loaded ('crypto') which is not supported in the Edge
>    Runtime` and would fail at runtime. `proxy.ts` **always runs on the
>    Node.js runtime**, so `crypto` works. Do **not** add a `config` export
>    with `runtime: 'nodejs'` — a `config` block in a proxy file is a hard
>    build error: `Route segment config is not allowed in Proxy file`.
>
> Consequence: there is no `matcher` config either. The proxy runs for all
> requests and must return early for non-`/api` paths itself.

**Files:**
- Create: `proxy.ts` (repo root)
- Create: `lib/auth/public-routes.ts`
- Test: `tests/unit/proxy-allowlist.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `verifySession` from `lib/auth/session.ts` (Task 1).
- Produces:
  - `lib/auth/public-routes.ts`: `export const PUBLIC_API_ROUTES: readonly { method: string; path: string }[]` and `export function isPublicApiRoute(method: string, pathname: string): boolean`
  - `proxy.ts`: a **default-exported** `proxy(request)` function that sets `x-auth-uid`, `x-auth-user-type`, `x-auth-permissions` on authenticated requests.
  - Header names exported as `export const AUTH_HEADERS = { uid: 'x-auth-uid', userType: 'x-auth-user-type', permissions: 'x-auth-permissions' } as const` from `lib/auth/public-routes.ts`, so Task 4 and the proxy cannot drift.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/proxy-allowlist.test.ts`:

```typescript
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

console.log('✓ proxy-allowlist');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/proxy-allowlist.test.ts`
Expected: FAIL — `Cannot find module '../../lib/auth/public-routes'`

- [ ] **Step 3: Write the allowlist module**

Create `lib/auth/public-routes.ts`:

```typescript
/**
 * The API routes reachable without a session.
 *
 * This list IS the security boundary — everything on it is callable by anyone
 * who can reach the server. It is matched per method and exact path, never by
 * prefix: an earlier draft allowlisted all of /api/license/*, which would have
 * exposed POST /api/license/deactivate, a no-argument endpoint that removes the
 * installed license and halts a paying store.
 */

export const AUTH_HEADERS = {
  uid: 'x-auth-uid',
  userType: 'x-auth-user-type',
  permissions: 'x-auth-permissions',
} as const;

export const PUBLIC_API_ROUTES: readonly { method: string; path: string }[] = [
  // Issues the token; cannot itself require one.
  { method: 'POST', path: '/api/auth/login' },

  // Activation runs before any user exists.
  { method: 'POST', path: '/api/license/activate' },
  { method: 'POST', path: '/api/license/activate-online' },

  // The activation screen reads this pre-login. Discloses machineId and the
  // customer label; accepted in the design as a narrow, deliberate trade-off.
  { method: 'GET', path: '/api/license/status' },

  // Unattended liveness ping; fails safe when the license server is offline.
  { method: 'POST', path: '/api/license/heartbeat' },
];

/** Development-only local mock of the Sta. Lucia mall API. */
const DEV_MOCK_PREFIX = '/api/dev/mock-sta-lucia';

export function isPublicApiRoute(method: string, pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';

  if (
    process.env.NODE_ENV !== 'production' &&
    (normalized === DEV_MOCK_PREFIX || normalized.startsWith(`${DEV_MOCK_PREFIX}/`))
  ) {
    return true;
  }

  return PUBLIC_API_ROUTES.some(
    (route) => route.method === method.toUpperCase() && route.path === normalized
  );
}
```

- [ ] **Step 4: Write the proxy**

Create `proxy.ts` at the repo root. Note: default export, no `config` block, and it filters non-`/api` paths itself (there is no `matcher` in a proxy file).

```typescript
/**
 * Deny-by-default authentication for every /api route.
 *
 * A route added later is protected because nobody did anything, which is the
 * inverse of the previous situation (no middleware at all, identity read from
 * request bodies).
 *
 * This is proxy.ts rather than middleware.ts for two reasons: Next 16
 * deprecates the middleware convention, and middleware runs on the Edge
 * Runtime where Node's `crypto` (which verifySession needs) is unavailable.
 * A proxy file always runs on the Node.js runtime. It must NOT export a
 * `config` object — that is a build error here — so there is no `matcher`
 * and non-/api paths are filtered below.
 *
 * On success the verified identity is forwarded as x-auth-* request headers,
 * which are DELETED from the inbound request first — otherwise a client could
 * set them itself and choose its own identity.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { AUTH_HEADERS, isPublicApiRoute } from '@/lib/auth/public-routes';

function unauthorized(reason: string) {
  // The reason is deliberately coarse: a tampered token and an expired one
  // both read as "unauthenticated", so a caller gets no oracle.
  return NextResponse.json({ success: false, error: reason }, { status: 401 });
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // No matcher is available in a proxy file, so scope to the API here. Page
  // routes keep their existing client-side auth redirect.
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Strip any client-supplied identity headers up front, on every API path,
  // so they can never reach a route handler from the outside.
  const headers = new Headers(request.headers);
  headers.delete('x-auth-uid');
  headers.delete('x-auth-user-type');
  headers.delete('x-auth-permissions');

  if (isPublicApiRoute(request.method, pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;

  const session = verifySession(token);
  if (!session) {
    return unauthorized('Authentication required');
  }

  headers.set(AUTH_HEADERS.uid, session.uid);
  headers.set(AUTH_HEADERS.userType, session.userType);
  headers.set(AUTH_HEADERS.permissions, JSON.stringify(session.permissions));

  return NextResponse.next({ request: { headers } });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx tests/unit/proxy-allowlist.test.ts`
Expected: PASS — prints `✓ proxy-allowlist`

- [ ] **Step 6: Register and run the suite**

Add `'proxy-allowlist.test',` to `TEST_FILES` in `tests/unit/run.ts`, then:

Run: `npm run test:unit`
Expected: PASS, exit 0

- [ ] **Step 7: Verify the build still compiles**

Run: `npm run build`
Expected: exit 0, `✓ Compiled successfully`. (Background sync/scheduler log lines are pre-existing noise, not failures.)

- [ ] **Step 8: Commit**

```bash
git add proxy.ts lib/auth/public-routes.ts tests/unit/proxy-allowlist.test.ts tests/unit/run.ts
git commit -m "feat(auth): add deny-by-default API middleware"
```

---

### Task 4: requirePermission helper

**Files:**
- Create: `lib/auth/require-permission.ts`
- Test: `tests/unit/require-permission.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `AUTH_HEADERS` from `lib/auth/public-routes.ts` (Task 3).
- Produces:
  - `export function getAuthContext(request: Request): { uid: string; userType: string; permissions: string[] } | null`
  - `export function requirePermission(request: Request, permission: string): NextResponse | null` — returns a 403 response to return early, or `null` to proceed.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/require-permission.test.ts`:

```typescript
import assert from 'node:assert/strict';
import { AUTH_HEADERS } from '../../lib/auth/public-routes';
import { getAuthContext, requirePermission } from '../../lib/auth/require-permission';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/users', { method: 'POST', headers });
}

// --- the happy path proceeds ---

const allowed = requestWith({
  [AUTH_HEADERS.uid]: 'u-1',
  [AUTH_HEADERS.userType]: 'Admin',
  [AUTH_HEADERS.permissions]: JSON.stringify(['manage_users', 'view_sales']),
});

assert.equal(
  requirePermission(allowed, 'manage_users'),
  null,
  'a user holding the permission proceeds (null means "no early return")'
);

const ctx = getAuthContext(allowed);
assert.ok(ctx, 'auth context parses from the trusted headers');
assert.equal(ctx!.uid, 'u-1', 'uid comes from the header, not a request body');

// --- Review Focus #4: wrong permission is 403, not 401 ---

const lacking = requestWith({
  [AUTH_HEADERS.uid]: 'u-2',
  [AUTH_HEADERS.userType]: 'Cashier',
  [AUTH_HEADERS.permissions]: JSON.stringify(['access_pos']),
});

const denied = requirePermission(lacking, 'manage_users');
assert.ok(denied, 'a user lacking the permission is rejected');
assert.equal(
  denied!.status,
  403,
  'the rejection is 403, NOT 401 — a 401 would log the cashier out and lose ' +
    'an in-progress sale, when the real problem is authorization'
);

// --- super_admin must NOT be a bypass ---

const superAdmin = requestWith({
  [AUTH_HEADERS.uid]: 'u-3',
  [AUTH_HEADERS.userType]: 'Super Admin',
  [AUTH_HEADERS.permissions]: JSON.stringify(['super_admin']),
});

assert.ok(
  requirePermission(superAdmin, 'manage_users'),
  "the 'super_admin' string is not a server-side bypass: it is not one of the " +
    '13 seeded permissions, and honouring it would hand the dev-preview ' +
    'session a master key. The Super Admin ROLE already carries all 13 ' +
    'permissions explicitly.'
);

// --- missing or malformed headers deny ---

assert.equal(getAuthContext(requestWith({})), null, 'no headers means no context');
assert.ok(
  requirePermission(requestWith({}), 'manage_users'),
  'a request with no identity headers is denied (middleware should have ' +
    'stopped it, so this is defence in depth)'
);

const malformed = requestWith({
  [AUTH_HEADERS.uid]: 'u-4',
  [AUTH_HEADERS.userType]: 'Admin',
  [AUTH_HEADERS.permissions]: 'not-json',
});
assert.equal(getAuthContext(malformed), null, 'unparseable permissions deny rather than throw');
assert.ok(
  requirePermission(malformed, 'manage_users'),
  'unparseable permissions are denied, not treated as empty-and-allowed'
);

console.log('✓ require-permission');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/require-permission.test.ts`
Expected: FAIL — `Cannot find module '../../lib/auth/require-permission'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/auth/require-permission.ts`:

```typescript
/**
 * Authorization on top of the middleware's authentication.
 *
 * Reads identity from the x-auth-* headers the middleware sets. Those headers
 * are trustworthy only because the middleware deletes any inbound copy first;
 * never read identity from a request body.
 */
import { NextResponse } from 'next/server';
import { AUTH_HEADERS } from './public-routes';

export type AuthContext = {
  uid: string;
  userType: string;
  permissions: string[];
};

export function getAuthContext(request: Request): AuthContext | null {
  const uid = request.headers.get(AUTH_HEADERS.uid);
  const userType = request.headers.get(AUTH_HEADERS.userType);
  const rawPermissions = request.headers.get(AUTH_HEADERS.permissions);

  if (!uid || !rawPermissions) return null;

  let permissions: unknown;
  try {
    permissions = JSON.parse(rawPermissions);
  } catch {
    return null;
  }
  if (!Array.isArray(permissions)) return null;

  return {
    uid,
    userType: userType ?? '',
    permissions: permissions.filter((p): p is string => typeof p === 'string'),
  };
}

/**
 * Returns a 403 response to return early, or null to proceed.
 *
 * 403 rather than 401: the caller IS authenticated, and a 401 would make the
 * client clear its session and redirect to login — losing an in-progress sale
 * over what is really an authorization problem.
 *
 * There is intentionally no 'super_admin' escape hatch. It is not one of the
 * 13 permissions seeded by migration 070, and the Super Admin role already
 * carries all of them explicitly.
 */
export function requirePermission(request: Request, permission: string): NextResponse | null {
  const context = getAuthContext(request);

  if (!context) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  if (!context.permissions.includes(permission)) {
    return NextResponse.json(
      { success: false, error: `Missing required permission: ${permission}` },
      { status: 403 }
    );
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/require-permission.test.ts`
Expected: PASS — prints `✓ require-permission`

- [ ] **Step 5: Register and run the suite**

Add `'require-permission.test',` to `TEST_FILES` in `tests/unit/run.ts`, then:

Run: `npm run test:unit`
Expected: PASS, exit 0

- [ ] **Step 6: Commit**

```bash
git add lib/auth/require-permission.ts tests/unit/require-permission.test.ts tests/unit/run.ts
git commit -m "feat(auth): add requirePermission helper"
```

---

### Task 5: Issue tokens at login, and guard the destructive routes

**Files:**
- Modify: `app/api/auth/login/route.ts` (the `NextResponse.json({...})` success block near line 62)
- Modify: `app/api/users/route.ts` (POST), `app/api/users/[uid]/route.ts` (PUT, DELETE)
- Modify: `app/api/auth/signup/route.ts` (POST)
- Modify: `app/api/user-types/route.ts` (POST), `app/api/user-types/[id]/route.ts` (PUT, DELETE)
- Modify: `app/api/data-management/reset/route.ts` (POST)
- Modify: `app/api/sales/z-reading/route.ts` (POST)
- Modify: `app/api/license/deactivate/route.ts` (POST)
- Test: `tests/unit/destructive-route-guards.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `signSession` (Task 1), `requirePermission` (Task 4).
- Produces: `POST /api/auth/login` response gains a `token` field (string). The rest of the response shape is unchanged, so the 18 files reading `mock-user-session` keep working.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/destructive-route-guards.test.ts`:

```typescript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Source assertions, matching the technique in checkout-terminal-lock.test.ts:
// these routes are the ones where a forged request is irreversible, so each
// must call requirePermission with the expected permission.

const repoRoot = path.join(__dirname, '../..');

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf-8');
}

const GUARDED: { file: string; permission: string; why: string }[] = [
  { file: 'app/api/users/route.ts', permission: 'manage_users', why: 'privilege escalation (POST) and user deletion (DELETE ?uid=)' },
  { file: 'app/api/users/[uid]/route.ts', permission: 'manage_users', why: 'privilege escalation (PUT only — this file has no DELETE)' },
  { file: 'app/api/auth/signup/route.ts', permission: 'manage_users', why: 'second user-creation door' },
  { file: 'app/api/user-types/route.ts', permission: 'manage_users', why: 'rewrites the permission model' },
  { file: 'app/api/user-types/[id]/route.ts', permission: 'manage_users', why: 'rewrites the permission model' },
  { file: 'app/api/data-management/reset/route.ts', permission: 'manage_settings', why: 'wipes sales; resets BIR SI numbering' },
  { file: 'app/api/sales/z-reading/route.ts', permission: 'view_sales', why: 'legally locked BIR report' },
  { file: 'app/api/license/deactivate/route.ts', permission: 'manage_settings', why: 'removes the license; halts the store' },
];

for (const { file, permission, why } of GUARDED) {
  const source = read(file);

  assert.ok(
    source.includes('requirePermission'),
    `${file} calls requirePermission (${why})`
  );
  assert.ok(
    source.includes(`requirePermission(request, '${permission}')`) ||
      source.includes(`requirePermission(request, "${permission}")`),
    `${file} requires '${permission}' (${why})`
  );
  // The guard must return early, not merely compute a value.
  assert.match(
    source,
    /const\s+\w*[Dd]enied\w*\s*=\s*requirePermission\([^)]*\);\s*\n\s*if\s*\(\s*\w*[Dd]enied\w*\s*\)\s*return\s+\w*[Dd]enied\w*;/,
    `${file} returns the 403 early instead of ignoring it`
  );

  // EVERY mutating handler in the file must be guarded, not just the first.
  // app/api/users/route.ts has both POST and DELETE (the latter deletes by
  // ?uid= and was unauthenticated); guarding only POST would leave it open.
  const handlerCount = (
    source.match(/export async function (POST|PUT|PATCH|DELETE)\b/g) ?? []
  ).length;
  const guardCount = (source.match(/requirePermission\(/g) ?? []).length;
  assert.ok(
    guardCount >= handlerCount,
    `${file} guards every mutating handler: found ${handlerCount} handler(s) ` +
      `but only ${guardCount} requirePermission call(s)`
  );
}

// --- login issues a token ---

const loginSource = read('app/api/auth/login/route.ts');
assert.ok(loginSource.includes('signSession'), 'login signs a session token');
assert.match(
  loginSource,
  /token/,
  'login returns the token to the client'
);

console.log('✓ destructive-route-guards');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/destructive-route-guards.test.ts`
Expected: FAIL — `app/api/users/route.ts calls requirePermission (privilege escalation)`

- [ ] **Step 3: Issue the token at login**

In `app/api/auth/login/route.ts`, add the import at the top:

```typescript
import { signSession } from '@/lib/auth/session';
```

Then replace the success response (the `return NextResponse.json({ uid: user.uid, ... })` block) with:

```typescript
        // The token is what the server will actually trust on later requests;
        // the rest of this object is kept for the 18 client files that read
        // the `mock-user-session` shape.
        const token = signSession({
            uid: user.uid,
            username: user.username,
            userType: user.userType,
            roleId: user.roleId ?? null,
            permissions: userPermissions,
        });

        return NextResponse.json({
            token,
            uid: user.uid,
            username: user.username, // using "username" as the field
            email: user.username, // keeping "email" for compatibility if frontend expects it, or we can just use username
            userType: user.userType,
            roleId: user.roleId,
            displayName: user.displayName,
            photoURL: user.photoURL,
            permissions: userPermissions,
        });
```

- [ ] **Step 4: Add the dev-preview login path**

Still in `app/api/auth/login/route.ts`, immediately after `const { username, password } = await request.json();` add:

```typescript
        // Dev-only: app/(app)/use-app-layout.ts previews the back office
        // without credentials. It used to fabricate a client-side session;
        // now it must get a REAL signed token, through this same path, so
        // there is no separate trust mechanism. Compiled out in production.
        if (process.env.NODE_ENV !== 'production') {
            const body = await request.clone().json().catch(() => ({}));
            if (body?.devPreview === true) {
                const devPermissions = [
                    'access_pos', 'view_dashboard', 'manage_products', 'manage_inventory',
                    'view_sales', 'manage_purchases', 'manage_customers', 'manage_suppliers',
                    'view_reports', 'manage_users', 'manage_settings', 'view_approvals',
                    'manage_approval_settings',
                ];
                const devUser = {
                    uid: 'dev-preview',
                    username: 'dev-preview',
                    userType: 'Super Admin',
                    roleId: null,
                    permissions: devPermissions,
                };
                return NextResponse.json({
                    token: signSession(devUser),
                    ...devUser,
                    email: 'dev-preview',
                    displayName: 'Dev Preview (no login)',
                    photoURL: null,
                });
            }
        }
```

Note: the dev identity gets the 13 real permissions, not `'super_admin'` — matching the server's refusal to treat that string as a bypass.

- [ ] **Step 5: Guard each destructive route**

For each file in the table below, add the import and the guard as the first statement inside the named handler.

Import line (adjust depth to the file's location — `app/api/users/route.ts` is 3 levels deep, `app/api/users/[uid]/route.ts` is 4):

```typescript
import { requirePermission } from '@/lib/auth/require-permission';
```

Guard body, placed as the first statement inside the handler, before `try`:

```typescript
  const denied = requirePermission(request, 'manage_users');
  if (denied) return denied;
```

These are the **actual** handlers present in each file — verified, not assumed. Note the asymmetry: `users/route.ts` has a `DELETE` (it deletes by `?uid=` query param, and is today unauthenticated), `users/[uid]/route.ts` has only `PUT`, and `user-types/[id]/route.ts` uses `PATCH`, not `PUT`.

| File | Handlers to guard | Permission |
|---|---|---|
| `app/api/users/route.ts` | POST, DELETE | `manage_users` |
| `app/api/users/[uid]/route.ts` | PUT | `manage_users` |
| `app/api/auth/signup/route.ts` | POST | `manage_users` |
| `app/api/user-types/route.ts` | POST | `manage_users` |
| `app/api/user-types/[id]/route.ts` | PATCH, DELETE | `manage_users` |
| `app/api/data-management/reset/route.ts` | POST | `manage_settings` |
| `app/api/sales/z-reading/route.ts` | POST | `view_sales` |
| `app/api/license/deactivate/route.ts` | POST | `manage_settings` |

The dynamic-route handlers have a multi-line signature, so place the guard after the closing `) {` — for example in `app/api/users/[uid]/route.ts`:

```typescript
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const denied = requirePermission(request, 'manage_users');
  if (denied) return denied;

  try {
```

`app/api/license/deactivate/route.ts` currently takes no argument (`export async function POST()`), so its signature must change:

```typescript
export async function POST(request: Request) {
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx tsx tests/unit/destructive-route-guards.test.ts`
Expected: PASS — prints `✓ destructive-route-guards`

- [ ] **Step 7: Register, run the suite, and build**

Add `'destructive-route-guards.test',` to `TEST_FILES` in `tests/unit/run.ts`, then:

Run: `npm run test:unit`
Expected: PASS, exit 0

Run: `npx tsc --noEmit 2>&1 | grep -v "^\.next" | grep -vE "^\s"`
Expected: no source-file errors

Run: `npm run build`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add app/api/auth/login/route.ts app/api/auth/signup/route.ts app/api/users app/api/user-types app/api/data-management/reset/route.ts app/api/sales/z-reading/route.ts app/api/license/deactivate/route.ts tests/unit/destructive-route-guards.test.ts tests/unit/run.ts
git commit -m "feat(auth): issue tokens at login and guard destructive routes"
```

---

### Task 6: authFetch and the client migration

**Files:**
- Modify: `lib/api-config.ts` (append `authFetch`, `getStoredToken`, `clearStoredSession`)
- Modify: `app/login/page.tsx:80` (store the token)
- Modify: `app/(app)/use-app-layout.ts:30-53` (dev preview calls the real login)
- Modify: ~171 client files — all `fetch(` call sites outside `app/api/`
- Create: `scripts/codemod/auth-fetch.ts` (one-shot migration script)
- Test: `tests/unit/auth-fetch-migration.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime; pairs with the middleware from Task 3.
- Produces:
  - `export function getStoredToken(): string | null`
  - `export function clearStoredSession(): void`
  - `export async function authFetch(input: string, init?: RequestInit): Promise<Response>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/auth-fetch-migration.test.ts`:

```typescript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.join(__dirname, '../..');

// --- authFetch exists and attaches the header ---

const apiConfig = fs.readFileSync(path.join(repoRoot, 'lib/api-config.ts'), 'utf-8');
assert.ok(apiConfig.includes('export async function authFetch'), 'authFetch is exported');
assert.match(apiConfig, /Authorization/, 'authFetch sets the Authorization header');
assert.match(apiConfig, /Bearer /, 'authFetch uses the Bearer scheme');
assert.match(apiConfig, /401/, 'authFetch handles 401 centrally');
assert.match(
  apiConfig,
  /403/,
  'authFetch handles 403 separately from 401 — a 403 must not log the user out'
);
assert.ok(
  apiConfig.includes('clearStoredSession()') &&
    apiConfig.indexOf('403') > apiConfig.indexOf('clearStoredSession()'),
  'the session is cleared only on the 401 path, not the 403 path'
);

// --- Review Focus #5: no client call site still uses bare fetch for our API ---
// ripgrep via git grep keeps this fast and respects .gitignore.

function gitGrep(pattern: string, pathspecs: string[]): string[] {
  try {
    return execFileSync(
      'git',
      ['grep', '-n', '-E', pattern, '--', ...pathspecs],
      { cwd: repoRoot, encoding: 'utf-8' }
    )
      .split('\n')
      .filter(Boolean);
  } catch {
    return []; // git grep exits 1 when there are no matches
  }
}

const bareApiFetches = gitGrep(
  'fetch\\(getApiUrl\\(',
  ['app', 'lib', 'hooks', 'components', ':!app/api', ':!lib/integrations/sta-lucia']
);
assert.deepEqual(
  bareApiFetches,
  [],
  'no client call site still uses bare fetch(getApiUrl(...)) — all migrated to ' +
    `authFetch. Remaining:\n${bareApiFetches.slice(0, 20).join('\n')}`
);

const hardcodedApiFetches = gitGrep(
  "fetch\\((['\"\`]|\\`)/api/",
  ['app', 'lib', 'hooks', 'components', ':!app/api', ':!lib/integrations/sta-lucia']
);
assert.deepEqual(
  hardcodedApiFetches,
  [],
  'no client call site still calls a hardcoded /api/ path with bare fetch. ' +
    `Remaining:\n${hardcodedApiFetches.slice(0, 20).join('\n')}`
);

// --- the outbound third-party calls must NOT have been touched ---

const staLucia = fs.readFileSync(
  path.join(repoRoot, 'lib/integrations/sta-lucia/client.ts'),
  'utf-8'
);
assert.equal(
  staLucia.includes('authFetch'),
  false,
  'the Sta. Lucia mall client still uses plain fetch: it calls a THIRD ' +
    "PARTY's /api/login and /api/get-sales, and attaching our session header " +
    'would leak a credential to the mall'
);

const heartbeat = fs.readFileSync(
  path.join(repoRoot, 'app/api/license/heartbeat/route.ts'),
  'utf-8'
);
assert.equal(
  heartbeat.includes('authFetch'),
  false,
  'the license heartbeat still uses plain fetch: it calls the license server, ' +
    'not our own API'
);

console.log('✓ auth-fetch-migration');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/auth-fetch-migration.test.ts`
Expected: FAIL — `authFetch is exported`

- [ ] **Step 3: Implement authFetch**

Append to `lib/api-config.ts`. Note the `toast` import: `hooks/use-toast.ts` exports `toast` as a standalone function (not only the `useToast` hook), so a non-component module can call it.

```typescript
import { toast } from '@/hooks/use-toast';

const TOKEN_STORAGE_KEY = 'alon-session-token';
const SESSION_STORAGE_KEY = 'mock-user-session';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* private mode / blocked storage — the next request 401s and re-logs in */
  }
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * fetch for OUR API: attaches the session token and handles 401 centrally.
 *
 * Use this for every call to this app's /api routes. Do NOT use it for
 * outbound third-party calls (the Sta. Lucia mall consolidator in
 * lib/integrations/sta-lucia/, the license server) — those share the /api/
 * path shape but belong to other systems, and sending them our token would
 * leak a credential.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();

  const headers = new Headers(init.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });

  // 401 means the token is absent, tampered with, or expired (a 12h TTL means
  // a shift that starts before midnight can cross it). Clear and send the user
  // to login.
  if (response.status === 401 && typeof window !== 'undefined') {
    clearStoredSession();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  // 403 is NOT a logout: the caller is authenticated and merely lacks a
  // permission. Logging a cashier out here would lose an in-progress sale.
  // Surface it and let the caller carry on handling the response.
  if (response.status === 403 && typeof window !== 'undefined') {
    toast({
      variant: 'destructive',
      title: 'Not permitted',
      description: "You don't have permission to do that.",
    });
  }

  return response;
}
```

- [ ] **Step 4: Store the token at login**

In `app/login/page.tsx`, add the import:

```typescript
import { setStoredToken } from '@/lib/api-config';
```

Then directly before the existing `localStorage.setItem('mock-user-session', ...)` call, add:

```typescript
      // The token is what the server trusts; the session object below is kept
      // for the existing client reads. Use the helper rather than the raw key
      // so the storage key lives in exactly one place.
      if (result.token) {
        setStoredToken(result.token);
      }
```

- [ ] **Step 5: Route the dev preview through real login**

In `app/(app)/use-app-layout.ts`, add `setStoredToken` to the existing `@/lib/api-config` import (the file already imports `getApiUrl` from it):

```typescript
import { getApiUrl, setStoredToken } from '@/lib/api-config';
```

Then replace the `else if (process.env.NODE_ENV === 'development')` branch (which fabricated a session with `permissions: ['super_admin']`) with a call to the real endpoint:

```typescript
    } else if (process.env.NODE_ENV === 'development') {
      // Dev-only: get a REAL signed token for the preview identity instead of
      // fabricating a client-side session, which the server no longer trusts.
      fetch(getApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devPreview: true }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((result) => {
          if (!result?.token) { router.push('/login'); return; }
          setStoredToken(result.token);
          const devSession = {
            uid: result.uid,
            email: result.email,
            username: result.username,
            displayName: result.displayName,
            userType: result.userType,
            roleId: result.roleId,
            permissions: result.permissions,
            photoURL: result.photoURL,
          };
          localStorage.setItem('mock-user-session', JSON.stringify(devSession));
          setUser(devSession);
        })
        .catch(() => router.push('/login'))
        .finally(() => setIsUserLoading(false));
      return;
    } else {
```

Note `use-app-layout.ts:89` keeps its `permissions?.includes('super_admin')` client-side shortcut; it is now simply never true, and the 13 real permissions drive access. Leave it — removing it is Phase 2's concern.

- [ ] **Step 6: Write the codemod**

Create `scripts/codemod/auth-fetch.ts`:

```typescript
/**
 * One-shot migration: bare fetch -> authFetch for this app's own API calls.
 *
 * Deliberately excluded:
 *  - app/api/**            server-side route handlers
 *  - lib/integrations/sta-lucia/**  THIRD-PARTY mall API (leaking our token
 *                          there would hand a credential to the mall)
 *  - app/api/license/heartbeat  calls the license server, not us
 *
 * Only the two mechanical shapes are rewritten:
 *    fetch(getApiUrl(...))        -> authFetch(getApiUrl(...))
 *    fetch('/api/...')            -> authFetch('/api/...')
 * Anything indirect (fetch(url), fetch(fullUrl)) is REPORTED, never rewritten:
 * the script cannot tell our API from a third party's through a variable.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['app', 'lib', 'hooks', 'components'];
const EXCLUDE = [
  path.join('app', 'api'),
  path.join('lib', 'integrations', 'sta-lucia'),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const manual: string[] = [];
let rewritten = 0;
let filesChanged = 0;

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;

  for (const file of walk(root)) {
    if (EXCLUDE.some((ex) => file.startsWith(ex))) continue;

    const original = fs.readFileSync(file, 'utf-8');
    let source = original;

    // Shape 1 and 2: the two mechanical forms.
    source = source.replace(/\bfetch\(getApiUrl\(/g, 'authFetch(getApiUrl(');
    source = source.replace(/\bfetch\((['"`])\/api\//g, 'authFetch($1/api/');

    // Report, do not rewrite, indirect call sites.
    for (const match of original.matchAll(/\bfetch\(\s*(?!getApiUrl|['"`]\/api\/|['"`]https?:)/g)) {
      const line = original.slice(0, match.index).split('\n').length;
      manual.push(`${file}:${line}`);
    }

    if (source !== original) {
      // Ensure authFetch is imported from the api-config module.
      if (!/\bauthFetch\b/.test(original) && !/from ['"]@\/lib\/api-config['"]/.test(source)) {
        source = `import { authFetch } from '@/lib/api-config';\n${source}`;
      } else if (/from ['"]@\/lib\/api-config['"]/.test(source)) {
        source = source.replace(
          /import \{([^}]*)\} from (['"])@\/lib\/api-config\2/,
          (full, names: string, q: string) =>
            names.includes('authFetch')
              ? full
              : `import {${names.replace(/\s*$/, '')}, authFetch } from ${q}@/lib/api-config${q}`
        );
      }
      fs.writeFileSync(file, source);
      filesChanged++;
      rewritten += (original.match(/\bfetch\(getApiUrl\(|\bfetch\((['"`])\/api\//g) ?? []).length;
    }
  }
}

console.log(`Rewrote ${rewritten} call site(s) across ${filesChanged} file(s).`);
if (manual.length > 0) {
  console.log(`\n${manual.length} call site(s) need MANUAL review (indirect URL):`);
  for (const m of manual) console.log(`  ${m}`);
}
```

- [ ] **Step 7: Run the codemod**

Run: `npx tsx scripts/codemod/auth-fetch.ts`
Expected: reports roughly 336+ rewritten call sites, plus a manual-review list of the ~15 indirect ones.

- [ ] **Step 8: Fix the dev-preview call back to plain fetch**

The codemod will have rewritten the `use-app-layout.ts` dev-preview login from Step 5 into `authFetch`. That call must stay plain `fetch`: it runs *before* a token exists, and `/api/auth/login` is public. Revert that one call site to `fetch(` and remove the now-unused `authFetch` import if nothing else in the file uses it.

Likewise check `app/login/page.tsx` — its login POST must remain plain `fetch`.

- [ ] **Step 9: Resolve each manual call site**

For every file:line the codemod listed, open it and decide:
- the URL resolves to **our** API → change to `authFetch` and add the import;
- it resolves to a **third party** → leave `fetch` and add a one-line comment saying why;
- it is `/api/auth/login` or another public route called pre-token → leave `fetch`.

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx tsx tests/unit/auth-fetch-migration.test.ts`
Expected: PASS — prints `✓ auth-fetch-migration`

- [ ] **Step 11: Typecheck, suite, build**

Add `'auth-fetch-migration.test',` to `TEST_FILES` in `tests/unit/run.ts`, then:

Run: `npx tsc --noEmit 2>&1 | grep -v "^\.next" | grep -vE "^\s"`
Expected: no source errors (missing `authFetch` imports surface here)

Run: `npm run test:unit`
Expected: PASS, exit 0

Run: `npm run build`
Expected: exit 0

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(auth): route client API calls through authFetch"
```

---

### Task 7: E2E coverage and the test helper

**Files:**
- Modify: `tests/e2e/helpers/auth.ts` (`seedSession` must mint a real token)
- Create: `tests/e2e/api-auth.spec.ts`

**Interfaces:**
- Consumes: `signSession` (Task 1), `authFetch` behavior (Task 6).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Update the E2E session helper**

`tests/e2e/helpers/auth.ts` currently seeds only `mock-user-session`, so every existing E2E test would now 401. Add a real token.

In `tests/e2e/helpers/auth.ts`, import the signer and extend `seedSession`:

```typescript
import { signSession } from '../../../lib/auth/session';
```

Replace the body of `seedSession` with:

```typescript
export async function seedSession(page: Page, user: SessionUser = DEFAULT_ADMIN): Promise<void> {
  // A real signed token, not a fabricated one: the middleware verifies it, so
  // seeding only localStorage would 401 every request.
  const token = signSession({
    uid: user.uid,
    username: user.username,
    userType: user.userType,
    roleId: (user as any).roleId ?? null,
    permissions: user.permissions ?? [],
  });

  await page.addInitScript(
    ({ u, t }) => {
      window.localStorage.setItem('mock-user-session', JSON.stringify({ ...u, email: u.username }));
      window.localStorage.setItem('alon-session-token', t);
    },
    { u: user, t: token }
  );
}
```

The E2E server must run with the same `SERVER_SESSION_SECRET` as the test process. Confirm `playwright.config.ts`'s `webServer.env` passes it (add `SERVER_SESSION_SECRET: process.env.SERVER_SESSION_SECRET ?? 'e2e-test-secret'` and set the same value in the test process) so signing and verification agree.

- [ ] **Step 2: Write the E2E spec**

Create `tests/e2e/api-auth.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { seedSession } from './helpers/auth';

const CASHIER = {
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
  await seedSession(page, CASHIER as any);
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
```

- [ ] **Step 3: Run the new E2E spec**

Run: `npx playwright test tests/e2e/api-auth.spec.ts`
Expected: all 7 tests PASS

- [ ] **Step 4: Run the whole E2E suite**

Run: `npm run test:e2e`
Expected: PASS. Any failure here most likely means a call site still uses bare `fetch` (401) or a route needs a guard adjustment — fix the call site, not the test.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers/auth.ts tests/e2e/api-auth.spec.ts playwright.config.ts
git commit -m "test(auth): add API authentication E2E coverage"
```

---

### Task 8: Final verification and documentation

**Files:**
- Modify: `CLAUDE.md` (Environment table, Auth pattern paragraph)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Full verification**

Run each and confirm:

```bash
npm run test:unit    # All <N> unit test files passed. exit 0
npx tsc --noEmit 2>&1 | grep -v "^\.next" | grep -vE "^\s"   # no source errors
npm run build        # exit 0
npm run test:e2e     # pass
```

- [ ] **Step 2: Update CLAUDE.md**

In the Environment table, add:

```
| `SERVER_SESSION_SECRET` | **Required in production.** HMAC secret for API session tokens; the server refuses to sign or verify sessions without it |
```

Replace the existing **Auth pattern** paragraph with:

```markdown
**Auth pattern** — `POST /api/auth/login` verifies the password and returns
`{ token, uid, displayName, userType, permissions[] }`. The token is an
HMAC-SHA256-signed bearer token (`lib/auth/session.ts`, 12h TTL, signed with
`SERVER_SESSION_SECRET`); the rest is stored in `localStorage` as
`mock-user-session` for the UI.

Root `proxy.ts` enforces authentication on every `/api` path
**deny-by-default** — every route requires a valid token except the small
per-method allowlist in `lib/auth/public-routes.ts` (login, license
activate/activate-online/status/heartbeat, and the dev mock). It is a per-route
list, never a prefix wildcard: `POST /api/license/deactivate` takes no
arguments and halts the store, so it is guarded.

It is `proxy.ts`, not `middleware.ts`: Next 16 deprecated the `middleware`
convention, and middleware runs on the Edge Runtime where Node's `crypto` —
which session verification needs — is unavailable. A proxy file always runs on
the Node.js runtime, and must not export a `config` object (that is a build
error), so it filters non-`/api` paths in code rather than via a `matcher`.

The proxy forwards the verified identity as `x-auth-uid` / `x-auth-user-type`
/ `x-auth-permissions`, **deleting any inbound copy first** so a client cannot
inject its own identity. Route handlers read identity from those headers via
`getAuthContext()` — never from the request body.

Destructive routes additionally call `requirePermission(request, '<perm>')`
(`lib/auth/require-permission.ts`), which returns 403 (not 401, which would log
a cashier out mid-sale). Permissions are the 13 seeded by migration 070;
`super_admin` is deliberately NOT a server-side bypass.

Client code calls this app's API through `authFetch()` in `lib/api-config.ts`,
which attaches the token and handles 401 centrally. **Do not use `authFetch`
for outbound third-party calls** — `lib/integrations/sta-lucia/` (the mall
consolidator) and `app/api/license/heartbeat/route.ts` (the license server) use
plain `fetch`, because sending them our token would leak a credential.

Phase 1 scope: all routes are authenticated; only the destructive ones are
permission-checked. Mapping the remaining ~150 routes to permissions is Phase 2
(see `docs/superpowers/specs/2026-10-05-api-authentication-design.md`).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document API authentication in CLAUDE.md"
```

---

## Notes for the executor

**Order matters.** Tasks 1→5 build the server side; Task 6 migrates the client. Between Task 3 (middleware lands) and the end of Task 6 the app is *intentionally* broken in the working tree — the server requires a token the client does not yet send. Do not "fix" this by weakening the middleware. Complete Task 6. This is why the whole plan is one branch.

**If an E2E test fails after Task 6** the cause is almost always a missed call site returning 401. Find it with:

```bash
git grep -nE "fetch\(getApiUrl\(|fetch\(['\"\`]/api/" -- app lib hooks components ':!app/api' ':!lib/integrations/sta-lucia'
```

**Do not normalize `userType` casing.** `'ADMIN'`, `'Admin'`, `'MANAGER'` and friends coexist in existing comparisons. Authorization keys on `permissions[]`, never `userType`, so this cannot cause a bypass. Changing it is out of scope.

**The `/api/auth/signup` route queries a non-existent `email` column** (`users` has `username`). It looks like dead code. Guarding it is in scope; fixing or deleting it is not — flag it and move on.
