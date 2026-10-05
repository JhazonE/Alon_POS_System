/**
 * Deny-by-default authentication for every /api route.
 *
 * A route added later is protected because nobody did anything, which is the
 * inverse of the previous situation (no middleware at all, identity read from
 * request bodies).
 *
 * This is proxy.ts rather than middleware.ts for two reasons: Next 16
 * deprecates the middleware convention, and middleware runs on the Edge
 * Runtime where Node's `crypto` (which verifySession needs) is unavailable.
 * A proxy file always runs on the Node.js runtime. It must NOT export a
 * `config` object — that is a build error here — so there is no `matcher`
 * and non-/api paths are filtered below.
 *
 * On success the verified identity is forwarded as x-auth-* request headers,
 * which are DELETED from the inbound request first — otherwise a client could
 * set them itself and choose its own identity.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import type { SessionPayload } from '@/lib/auth/session';
import { AUTH_HEADERS, isPublicApiRoute } from '@/lib/auth/public-routes';

function unauthorized(reason: string) {
  // The reason is deliberately coarse: a tampered token and an expired one
  // both read as "unauthenticated", so a caller gets no oracle.
  return NextResponse.json({ success: false, error: reason }, { status: 401 });
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // No matcher is available in a proxy file, so scope to the API here. Page
  // routes keep their existing client-side auth redirect.
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Strip any client-supplied identity headers up front, on every API path,
  // so they can never reach a route handler from the outside.
  const headers = new Headers(request.headers);
  for (const name of Object.values(AUTH_HEADERS)) headers.delete(name);

  if (isPublicApiRoute(request.method, pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null;

  let session: SessionPayload | null;
  try {
    session = verifySession(token);
  } catch (error) {
    // verifySession only throws when the signing secret is unusable
    // (SERVER_SESSION_SECRET unset in production). That is a misconfigured
    // server, not an unauthenticated caller, so it must NOT become a 401 —
    // that would hide the misconfiguration behind "please log in".
    console.error(
      '[auth] session verification failed - is SERVER_SESSION_SECRET set? ' +
        'It must be set when NODE_ENV=production.',
      error
    );
    return NextResponse.json(
      {
        success: false,
        // Deliberately generic: naming the env var here would let any
        // anonymous caller probe whether the server is missing its secret.
        // The actionable detail (SERVER_SESSION_SECRET) is in the log above.
        error: 'Server configuration error',
      },
      { status: 500 }
    );
  }
  if (!session) {
    return unauthorized('Authentication required');
  }

  headers.set(AUTH_HEADERS.uid, session.uid);
  headers.set(AUTH_HEADERS.userType, session.userType);
  headers.set(AUTH_HEADERS.permissions, JSON.stringify(session.permissions));

  return NextResponse.next({ request: { headers } });
}
