/**
 * HMAC-SHA256 signed session tokens. Zero external deps.
 *
 * Layout: base64url(payloadJson) "." base64url(hmac)
 *
 * Verification never throws — it returns null for malformed, mis-signed, and
 * expired tokens alike, so callers have one failure path and no partial
 * trust. The uniform null also avoids giving a caller an oracle that
 * distinguishes "tampered" from "expired".
 */
import crypto from 'crypto';

export const SESSION_TTL_SECONDS = 12 * 60 * 60; // one retail shift

export type SessionPayload = {
  uid: string;
  username: string;
  userType: string;
  roleId: string | null;
  permissions: string[];
  iat: number;
  exp: number;
};

let cachedSecret: string | null = null;

/**
 * The signing secret.
 *
 * Production with SERVER_SESSION_SECRET unset throws: failing loudly at the
 * first signing/verifying call is correct, because the alternative is a server
 * that silently accepts forged tokens. Development falls back to a random
 * per-boot secret (tokens simply do not survive a restart).
 *
 * There is deliberately no default literal — a committed fallback is how this
 * kind of guard gets quietly defeated.
 */
function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.SERVER_SESSION_SECRET;
  if (fromEnv && fromEnv.length > 0) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SERVER_SESSION_SECRET is not set. Refusing to sign or verify sessions ' +
        'in production without it — an unset secret means forged tokens would ' +
        'be accepted. Set it in .env and restart.'
    );
  }

  cachedSecret = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[auth] SERVER_SESSION_SECRET is unset; using a random per-boot secret. ' +
      'Sessions will not survive a restart. Set it in .env for stable dev sessions.'
  );
  return cachedSecret;
}

function hmac(payloadJson: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payloadJson).digest('base64url');
}

export function signSession(input: Omit<SessionPayload, 'iat' | 'exp'>): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { ...input, iat, exp: iat + SESSION_TTL_SECONDS };
  const payloadJson = JSON.stringify(payload);
  return `${Buffer.from(payloadJson).toString('base64url')}.${hmac(payloadJson)}`;
}

export function verifySession(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
  if (!payloadJson) return null;

  // Constant-time comparison. timingSafeEqual throws on length mismatch, so
  // compare lengths first.
  const expected = Buffer.from(hmac(payloadJson));
  const actual = Buffer.from(sigB64);
  if (expected.length !== actual.length) return null;
  if (!crypto.timingSafeEqual(expected, actual)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  if (typeof payload?.exp !== 'number') return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  if (!Array.isArray(payload.permissions)) return null;

  return payload;
}
