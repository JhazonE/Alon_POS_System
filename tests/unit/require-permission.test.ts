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
