import assert from 'node:assert/strict';
import { signSession, verifySession } from '../../lib/session-cookie';

const t = signSession('user-abc', 'secret-1');
assert.equal(verifySession(t, 'secret-1'), 'user-abc', 'round-trips the uid');
assert.equal(verifySession(t, 'secret-2'), null, 'wrong secret returns null');

const forged = Buffer.from('{"uid":"attacker"}').toString('base64url') + '.' + t.split('.')[1];
assert.equal(verifySession(forged, 'secret-1'), null, 'tampered payload returns null');

for (const bad of ['', 'x', 'a.b.c', 'not-base64.sig']) {
  assert.equal(verifySession(bad, 'secret-1'), null, `malformed input returns null: ${bad}`);
}

console.log('session-cookie: all assertions passed');
