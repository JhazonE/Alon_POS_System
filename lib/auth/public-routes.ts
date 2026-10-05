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
