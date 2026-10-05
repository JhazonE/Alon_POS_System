import assert from 'node:assert/strict';

// Set a deterministic secret BEFORE importing the module under test: the
// module reads it at load time.
process.env.SERVER_SESSION_SECRET = 'test-secret-do-not-use-in-production';

import { signSession, verifySession, SESSION_TTL_SECONDS } from '../../lib/auth/session';

assert.equal(SESSION_TTL_SECONDS, 43200, 'the TTL is 12 hours in seconds');

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
  123,
  {},
  [],
  true,
]) {
  assert.equal(
    verifySession(bad as any),
    null,
    `malformed token ${JSON.stringify(bad)} returns null instead of throwing`
  );
}

console.log('✓ session');
