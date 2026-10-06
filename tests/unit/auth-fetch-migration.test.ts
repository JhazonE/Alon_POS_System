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
assert.ok(
  apiConfig.includes("'alon-session-token'"),
  'the token storage key lives in api-config.ts'
);

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

const remaining = [
  ...gitGrep('fetch\\(getApiUrl\\(', CLIENT_PATHSPECS),
  ...gitGrep('fetch\\([\'"`]/api/', CLIENT_PATHSPECS),
];

const unexpected: string[] = [];
const matchedCount = new Map<number, number>();
for (const hit of remaining) {
  // "path:line:content" — paths contain no ':' on the platforms we run on
  const m = /^(.+?):(\d+):(.*)$/.exec(hit);
  assert.ok(m, `unparseable git grep line: ${hit}`);
  const [, file, , content] = m;
  const idx = PRE_TOKEN_PLAIN_FETCH.findIndex(
    (e) => e.file === file && content.includes(e.needle)
  );
  if (idx === -1) unexpected.push(hit);
  else matchedCount.set(idx, (matchedCount.get(idx) ?? 0) + 1);
}

assert.deepEqual(
  unexpected,
  [],
  'no client call site may still use bare fetch for our API — migrate it to ' +
    `authFetch. Unexpected:\n${unexpected.slice(0, 20).join('\n')}`
);

PRE_TOKEN_PLAIN_FETCH.forEach((entry, idx) => {
  assert.equal(
    matchedCount.get(idx),
    1,
    `${entry.file} must still call ${entry.needle} with plain fetch (a pre-token ` +
      'public route) — exactly once. If this fails, someone migrated it to authFetch ' +
      'or the call moved; check lib/auth/public-routes.ts before changing this list.'
  );
});
assert.equal(remaining.length, PRE_TOKEN_PLAIN_FETCH.length, 'exactly 13 pre-token sites remain');

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
