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

const superAdminDenial: any = requirePermission(superAdmin, 'manage_users');
assert.ok(
  superAdminDenial,
  "the 'super_admin' string is not a server-side bypass: it is not one of the " +
    '13 seeded permissions, and honouring it would hand the dev-preview ' +
    'session a master key. The Super Admin ROLE already carries all 13 ' +
    'permissions explicitly.'
);
assert.equal(superAdminDenial.status, 403, "super_admin is authenticated but unauthorized: 403");

// --- missing or malformed headers deny ---

assert.equal(getAuthContext(requestWith({})), null, 'no headers means no context');
const noHeaders: any = requirePermission(requestWith({}), 'manage_users');
assert.ok(noHeaders, 'a request with no identity headers is denied');
assert.equal(noHeaders.status, 401, 'a request with no identity headers is 401, not 403');

const malformed = requestWith({
  [AUTH_HEADERS.uid]: 'u-4',
  [AUTH_HEADERS.userType]: 'Admin',
  [AUTH_HEADERS.permissions]: 'not-json',
});
assert.equal(getAuthContext(malformed), null, 'unparseable permissions deny rather than throw');
const malformedDenial: any = requirePermission(malformed, 'manage_users');
assert.ok(malformedDenial, 'unparseable permissions are denied');
assert.equal(malformedDenial.status, 401, 'unparseable permissions is 401');

// --- a uid is required, not just permissions ---
const noUid = requestWith({
  [AUTH_HEADERS.userType]: 'Admin',
  [AUTH_HEADERS.permissions]: JSON.stringify(['manage_users']),
});
assert.equal(getAuthContext(noUid), null, 'permissions without a uid is not a valid context');
assert.ok(requirePermission(noUid, 'manage_users'), 'a request with permissions but no uid is denied');

// --- permission matching is exact, not substring ---
const nearMiss = requestWith({
  [AUTH_HEADERS.uid]: 'u-near',
  [AUTH_HEADERS.userType]: 'Admin',
  [AUTH_HEADERS.permissions]: JSON.stringify(['manage_users_extra']),
});
assert.ok(
  requirePermission(nearMiss, 'manage_users'),
  "'manage_users_extra' must not satisfy 'manage_users' — matching is exact, not substring"
);

// --- non-strings in the array are filtered, the real permission still honoured ---
const mixed = requestWith({
  [AUTH_HEADERS.uid]: 'u-mixed',
  [AUTH_HEADERS.userType]: 'Admin',
  [AUTH_HEADERS.permissions]: JSON.stringify([1, {}, 'manage_users']),
});
assert.deepEqual(
  getAuthContext(mixed)!.permissions,
  ['manage_users'],
  'non-string entries are filtered out of permissions'
);

// --- non-array permission values are rejected, not coerced to an empty list ---
for (const raw of ['[]', 'null', '"manage_users"', '{"0":"manage_users"}']) {
  const r = requestWith({
    [AUTH_HEADERS.uid]: 'u-odd',
    [AUTH_HEADERS.userType]: 'Admin',
    [AUTH_HEADERS.permissions]: raw,
  });
  assert.ok(requirePermission(r, 'manage_users'), `permissions header ${raw} is denied`);
}

console.log('✓ require-permission');
