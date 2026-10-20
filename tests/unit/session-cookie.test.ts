import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveScopeFromSession } from '../../lib/branch-context';
import { signSession, verifySession, sessionSecret, SESSION_MAX_AGE_MS } from '../../lib/session-cookie';

// Signs an arbitrary payload object, so a test can control iat directly.
function signRaw(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

const t = signSession('user-abc', 'secret-1');
assert.equal(verifySession(t, 'secret-1'), 'user-abc', 'round-trips the uid');
assert.equal(verifySession(t, 'secret-2'), null, 'wrong secret returns null');

const forged = Buffer.from('{"uid":"attacker"}').toString('base64url') + '.' + t.split('.')[1];
assert.equal(verifySession(forged, 'secret-1'), null, 'tampered payload returns null');

for (const bad of ['', 'x', 'a.b.c', 'not-base64.sig']) {
  assert.equal(verifySession(bad, 'secret-1'), null, `malformed input returns null: ${bad}`);
}

// Expiry: an iat older than the max age is rejected (signed, so only expiry can cause it).
const aged = signRaw({ uid: 'user-abc', iat: Date.now() - SESSION_MAX_AGE_MS - 1000 }, 'secret-1');
assert.equal(verifySession(aged, 'secret-1'), null, 'expired iat returns null');

// A session just inside the window still verifies.
const fresh = signRaw({ uid: 'user-abc', iat: Date.now() - SESSION_MAX_AGE_MS + 60_000 }, 'secret-1');
assert.equal(verifySession(fresh, 'secret-1'), 'user-abc', 'session inside max age verifies');

// No iat is never "never expires".
assert.equal(verifySession(signRaw({ uid: 'user-abc' }, 'secret-1'), 'secret-1'), null, 'missing iat returns null');
assert.equal(verifySession(signRaw({ uid: 'user-abc', iat: 'soon' }, 'secret-1'), 'secret-1'), null, 'non-numeric iat returns null');

// Future-dated iat is invalid.
assert.equal(
  verifySession(signRaw({ uid: 'user-abc', iat: Date.now() + 3_600_000 }, 'secret-1'), 'secret-1'),
  null,
  'future-dated iat returns null',
);

// Non-canonical signature: same HMAC bytes with trailing junk must be rejected.
const [p1, s1] = t.split('.');
assert.equal(verifySession(`${p1}.${s1}=`, 'secret-1'), null, 'non-canonical signature (=) returns null');
assert.equal(verifySession(`${p1}.${s1}!!`, 'secret-1'), null, 'non-canonical signature (!!) returns null');

// sessionSecret is total: with SESSION_SECRET unset it returns a usable,
// non-empty secret and does not throw. It runs in a temp cwd so the real .env
// is never written. The EISDIR/unreadable-.env case is covered by the
// try/catch in readEnvSecret, not by a test here.
const savedEnv = process.env.SESSION_SECRET;
const savedCwd = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'session-cookie-test-'));
try {
  delete process.env.SESSION_SECRET;
  process.chdir(scratch);
  const secret = sessionSecret();
  assert.equal(typeof secret, 'string', 'sessionSecret returns a string');
  assert.ok(secret.length > 0, 'sessionSecret returns a non-empty secret');
} finally {
  process.chdir(savedCwd);
  if (savedEnv === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = savedEnv;
  fs.rmSync(scratch, { recursive: true, force: true });
}

// A cookie signed with a different secret yields no uid, so callers fall back.
assert.equal(
  verifySession(signSession('u1', 'other-secret'), sessionSecret()),
  null,
  'a cookie signed with the wrong secret yields no uid, so callers fall back'
);

// Outside a request scope next/headers cookies() throws. That must read as "no
// session" (null = fall back), never a thrown error and never head office.
// Top-level await is unavailable under tsx's CJS output, so assert via a promise;
// a rejection becomes an unhandled rejection and fails the run loudly.
resolveScopeFromSession().then((scope) => {
  assert.equal(scope, null, 'no request scope means no session, so null (fall back)');
});

console.log('session-cookie: all assertions passed');
