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
