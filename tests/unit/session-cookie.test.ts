import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signSession, verifySession, SESSION_MAX_AGE_MS } from '../../lib/session-cookie';

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

console.log('session-cookie: all assertions passed');
