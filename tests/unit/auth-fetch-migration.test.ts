import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.join(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
}

// --- authFetch exists and attaches the header ---

const apiConfig = read('lib/api-config.ts');
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
// The 403 branch sits after the 401 branch; the text between "403" and the end
// of the function must not clear the session.
const afterFirst403 = apiConfig.slice(apiConfig.indexOf('response.status === 403'));
assert.equal(
  afterFirst403.includes('clearStoredSession'),
  false,
  'the 403 path never clears the session — logging a cashier out mid-sale loses the sale'
);
// The 401 branch: always clears the stale session, but does not redirect away
// from /pos (it owns its own login overlay and fires fetches on mount, before
// a cashier signs in) or from /login (a failed login must not redirect to itself).
const branch401Start = apiConfig.indexOf('response.status === 401');
const branch401 = apiConfig.slice(branch401Start, apiConfig.indexOf('response.status === 403'));
assert.ok(branch401Start > -1, 'authFetch has a 401 branch');
const clearIdx = branch401.indexOf('clearStoredSession()');
const redirectIdx = branch401.indexOf("window.location.href = '/login'");
assert.ok(clearIdx > -1, '401 clears the stored session');
assert.ok(redirectIdx > -1, '401 redirects to /login');
assert.match(
  branch401,
  /pathname\s*===\s*'\/pos'[\s\S]*pathname\.startsWith\('\/pos\/'\)/,
  'the 401 branch recognises /pos and /pos/* pages'
);
assert.ok(
  clearIdx < redirectIdx && /!onPos/.test(branch401.slice(clearIdx, redirectIdx)),
  'clearStoredSession() runs before, and independent of, the redirect, which is suppressed on /pos'
);
assert.match(
  branch401.slice(clearIdx, redirectIdx),
  /pathname\s*!==\s*'\/login'/,
  'the redirect is still suppressed on /login'
);
// clearStoredSession() sits directly inside the 401 `if`, not nested in a
// condition: it must run unconditionally on every 401, including on /pos.
assert.match(
  branch401,
  /\{\s*clearStoredSession\(\);/,
  'clearStoredSession() is the first statement of the 401 branch (unconditional)'
);
assert.ok(
  apiConfig.includes("'alon-session-token'"),
  'the token storage key lives in api-config.ts'
);

// --- supervisor elevation: a SEPARATE, time-boxed token ---
// The POS override dialog collects manager credentials for one action the
// cashier's permissions don't cover. The manager's token must not replace the
// cashier's session, and must expire on its own (10+ call sites, so no caller
// can be trusted to clear it).

assert.match(
  apiConfig,
  /getElevatedToken\(\)\s*\?\?\s*getStoredToken\(\)/,
  'authFetch prefers a live elevation token over the stored session token'
);
const adminAuth = read('app/(app)/pos/admin-auth/use-admin-auth.ts');
const successBranch = adminAuth.slice(
  adminAuth.indexOf('if (hasPermission)'),
  adminAuth.indexOf('onSuccess();', adminAuth.indexOf('if (hasPermission)'))
);
assert.ok(
  /setElevatedToken\(result\.token\)/.test(successBranch),
  'use-admin-auth stores the supervisor token as an elevation (not the session token) before onSuccess()'
);
assert.equal(
  /setStoredToken/.test(adminAuth),
  false,
  'a supervisor override must never overwrite the cashier session token'
);

{
  // Minimal localStorage stub on globalThis.window; always torn down so other
  // unit tests (which branch on `typeof window`) are unaffected.
  const store = new Map<string, string>();
  const g = globalThis as any;
  const hadWindow = 'window' in g;
  const previousWindow = g.window;
  g.window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cfg = require('../../lib/api-config') as typeof import('../../lib/api-config');
    const ELEV = 'alon-elevation-token';

    // round trip, and the cashier session token is left alone
    cfg.setStoredToken('cashier-token');
    cfg.setElevatedToken('manager-token');
    assert.equal(cfg.getElevatedToken(), 'manager-token', 'elevation round-trips');
    assert.equal(cfg.getStoredToken(), 'cashier-token', 'elevation does not replace the session token');

    // expired elevation: null AND the key is removed
    store.set(ELEV, JSON.stringify({ token: 'manager-token', expiresAt: Date.now() - 1 }));
    assert.equal(cfg.getElevatedToken(), null, 'an expired elevation is not returned');
    assert.equal(store.has(ELEV), false, 'an expired elevation is removed from storage');
    assert.equal(cfg.getStoredToken(), 'cashier-token', 'expiry leaves the cashier session alone');

    // TTL is short: ~2 minutes, not hours
    cfg.setElevatedToken('manager-token');
    const { expiresAt } = JSON.parse(store.get(ELEV)!);
    const ttl = expiresAt - Date.now();
    assert.ok(ttl > 0 && ttl <= 2 * 60 * 1000, `elevation TTL is at most 2 minutes (got ${ttl}ms)`);

    // malformed values never throw
    store.set(ELEV, '{not json');
    assert.equal(cfg.getElevatedToken(), null, 'malformed JSON yields null');
    store.set(ELEV, JSON.stringify({ token: 42, expiresAt: Date.now() + 60000 }));
    assert.equal(cfg.getElevatedToken(), null, 'a non-string token yields null');
    store.set(ELEV, JSON.stringify({ token: 'x' }));
    assert.equal(cfg.getElevatedToken(), null, 'a missing expiry yields null');

    // clearStoredSession drops both
    cfg.setElevatedToken('manager-token');
    cfg.clearStoredSession();
    assert.equal(store.has(ELEV), false, 'clearStoredSession() also removes the elevation');
    assert.equal(cfg.getStoredToken(), null, 'clearStoredSession() removes the session token');

    cfg.setElevatedToken('manager-token');
    cfg.clearElevatedToken();
    assert.equal(cfg.getElevatedToken(), null, 'clearElevatedToken() removes it');
  } finally {
    if (hadWindow) g.window = previousWindow;
    else delete g.window;
  }
}

// --- no client call site still uses bare fetch for our API, except the
// --- deliberately pre-token ones ---

// git grep respects .gitignore and is fast. It exits 1 on "no matches".
function gitGrep(pattern: string, pathspecs: string[]): string[] {
  try {
    return execFileSync('git', ['grep', '-n', '-E', pattern, '--', ...pathspecs], {
      cwd: repoRoot,
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .map((l) => l.replace(/\r$/, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

const CLIENT_PATHSPECS = [
  'app',
  'lib',
  'hooks',
  'components',
  ':!app/api',
  ':!lib/integrations/sta-lucia',
];

/**
 * Call sites that MUST stay plain `fetch`: they run before any token exists.
 * authFetch redirects to /login on a 401, and a failed login IS a 401 — so
 * migrating these would turn "invalid credentials" into a redirect loop and
 * break the activation screen before any user exists. Every one targets a
 * route on the public allowlist (lib/auth/public-routes.ts).
 */
const PRE_TOKEN_PLAIN_FETCH: { file: string; needle: string }[] = [
  { file: 'app/(app)/pos/admin-auth/use-admin-auth.ts', needle: "fetch(getApiUrl('/auth/login')" },
  { file: 'app/(app)/pos/login-form/use-login-form.ts', needle: "fetch(getApiUrl('/auth/login')" },
  { file: 'app/(app)/use-app-layout.ts', needle: "fetch(getApiUrl('/auth/login')" },
  { file: 'app/(app)/use-license-heartbeat.ts', needle: "fetch('/api/license/heartbeat'" },
  { file: 'app/activate/page.tsx', needle: "fetch('/api/license/status')" },
  { file: 'app/activate/page.tsx', needle: "fetch('/api/license/activate-online'" },
  { file: 'app/activate/page.tsx', needle: "fetch('/api/license/activate'" },
  { file: 'app/login/page.tsx', needle: "fetch('/api/license/status')" },
  { file: 'app/login/page.tsx', needle: "fetch(getApiUrl('/auth/login')" },
  { file: 'components/license-gate.tsx', needle: "fetch('/api/license/status'" },
  { file: 'components/license-gate.tsx', needle: "fetch('/api/license/heartbeat'" },
  { file: 'components/license-gate.tsx', needle: "fetch('/api/license/activate'" },
  { file: 'components/license-gate.tsx', needle: "fetch('/api/license/activate-online'" },
];

/**
 * Variable-URL plain `fetch` sites that are legitimately NOT our API. Every
 * other bare `fetch(` in client/lib code is a bug: it ships no token and, worse,
 * bypasses authFetch's central 401 handling (silent failure inside a form).
 */
const LEGIT_INDIRECT_PLAIN_FETCH: { file: string; needle: string }[] = [
  // authFetch's own call
  { file: 'lib/api-config.ts', needle: 'fetch(input, { ...init, headers })' },
  // third-party accounting API (apiConfig.apiEndpoint)
  { file: 'lib/scheduler.ts', needle: 'fetch(url)' },
  { file: 'lib/services/external-accounting-api.ts', needle: 'fetch(endpoint,' },
  // probes a user-typed host; our token must not be sent there
  {
    file: 'app/(app)/pos/connection-settings/use-connection-settings.ts',
    needle: "fetch(formatApiUrl(serverIp.trim(), '/pos-settings')",
  },
];

const ALLOWED_PLAIN_FETCH = [...PRE_TOKEN_PLAIN_FETCH, ...LEGIT_INDIRECT_PLAIN_FETCH];

// ANY bare fetch( — mechanical shapes AND variable-URL ones (fetch(url, ...)).
// Comment lines are ignored; `authFetch(` / `refetch(` never match.
const remaining = gitGrep('(^|[^A-Za-z_])fetch\\(', CLIENT_PATHSPECS).filter((hit) => {
  const content = hit.replace(/^.+?:\d+:/, '').trimStart();
  return !content.startsWith('//') && !content.startsWith('*');
});

const unexpected: string[] = [];
const matchedCount = new Map<number, number>();
for (const hit of remaining) {
  // "path:line:content" — paths contain no ':' on the platforms we run on
  const m = /^(.+?):(\d+):(.*)$/.exec(hit);
  assert.ok(m, `unparseable git grep line: ${hit}`);
  const [, file, , content] = m;
  const idx = ALLOWED_PLAIN_FETCH.findIndex((e) => e.file === file && content.includes(e.needle));
  if (idx === -1) unexpected.push(hit);
  else matchedCount.set(idx, (matchedCount.get(idx) ?? 0) + 1);
}

assert.deepEqual(
  unexpected,
  [],
  'no client call site may still use bare fetch — migrate it to authFetch (or, if it ' +
    'is genuinely third-party / pre-token, add it to the allowlists above). ' +
    `Unexpected:\n${unexpected.slice(0, 20).join('\n')}`
);

ALLOWED_PLAIN_FETCH.forEach((entry, idx) => {
  assert.equal(
    matchedCount.get(idx),
    1,
    `${entry.file} must still call ${entry.needle} with plain fetch — exactly once. ` +
      'If this fails, someone migrated it to authFetch or the call moved; for pre-token ' +
      'sites check lib/auth/public-routes.ts before changing the list.'
  );
});
assert.equal(
  remaining.length,
  ALLOWED_PLAIN_FETCH.length,
  '13 pre-token + 4 legitimate indirect plain-fetch sites remain, and nothing else'
);

// A public-route call site must never also be wrapped in authFetch.
for (const entry of PRE_TOKEN_PLAIN_FETCH) {
  const needle = entry.needle.replace(/^fetch/, 'authFetch');
  assert.equal(
    read(entry.file).includes(needle),
    false,
    `${entry.file} wraps a pre-token route in authFetch: ${needle}`
  );
}

// --- the outbound third-party calls must NOT have been touched ---

const staLuciaDir = path.join(repoRoot, 'lib/integrations/sta-lucia');
for (const name of fs.readdirSync(staLuciaDir)) {
  const full = path.join(staLuciaDir, name);
  if (!fs.statSync(full).isFile()) continue;
  const src = fs.readFileSync(full, 'utf-8');
  assert.equal(
    src.includes('authFetch'),
    false,
    `lib/integrations/sta-lucia/${name} uses plain fetch: it calls a THIRD ` +
      "PARTY's /api/login and /api/get-sales, and attaching our session token " +
      'would leak a credential to the mall'
  );
}

assert.equal(
  read('app/api/license/heartbeat/route.ts').includes('authFetch'),
  false,
  'the license heartbeat route still uses plain fetch: it calls the license ' +
    'server, not our own API'
);

// Other outbound calls through a variable URL (third-party endpoints).
for (const file of ['lib/services/external-accounting-api.ts', 'lib/scheduler.ts']) {
  const src = read(file);
  assert.equal(
    /authFetch\((endpoint|url)\b/.test(src),
    false,
    `${file}: the external accounting API / sync endpoint is third-party; it must not get our token`
  );
}

// The connection-settings test pings a user-typed server address; sending our
// token to an unverified host would leak it, so it stays plain fetch.
assert.equal(
  /authFetch\(\s*formatApiUrl\(/.test(
    read('app/(app)/pos/connection-settings/use-connection-settings.ts')
  ),
  false,
  'connection test targets an arbitrary user-typed host and must not carry our token'
);

console.log('✓ auth-fetch-migration');
