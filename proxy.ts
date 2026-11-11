/**
 * Rate limiting for every /api route.
 *
 * This is the ONLY job of this proxy. It does not authenticate and never
 * rejects a request for lack of a session: identity on this codebase is still
 * the uid each route reads from its own request (see lib/branch-context.ts).
 * It reads the signed `alon-session` cookie solely to pick a fair key.
 *
 * It is proxy.ts rather than middleware.ts because Next 16 deprecates the
 * middleware convention, and a proxy file runs on the Node.js runtime, where
 * the cookie's HMAC check (node:crypto) is available. A proxy file must NOT
 * export a `config` object, so there is no `matcher` and non-/api paths are
 * filtered below.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, sessionSecret, verifySession } from '@/lib/session-cookie';
import {
  checkAnonymousApiRateLimit,
  checkAuthenticatedRateLimit,
  checkPublicRateLimit,
  isPublicEntryRoute,
  rateLimitedResponse,
} from '@/lib/rate-limit-policy';

/** The verified uid from the signed session cookie, or null. Never throws. */
function verifiedUid(request: NextRequest): string | null {
  try {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    return token ? verifySession(token, sessionSecret()) : null;
  } catch {
    return null;
  }
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const { method } = request;
  let limited;
  if (isPublicEntryRoute(method, pathname)) {
    limited = checkPublicRateLimit(method, pathname, request.headers);
  } else {
    const uid = verifiedUid(request);
    limited = uid
      ? checkAuthenticatedRateLimit(method, pathname, uid)
      : checkAnonymousApiRateLimit(method, pathname, request.headers);
  }

  if (limited && !limited.allowed) {
    return rateLimitedResponse(limited, undefined, `${method} ${pathname}`);
  }
  return NextResponse.next();
}
