/**
 * Which limits apply to which API traffic. The mechanism lives in
 * lib/rate-limit.ts; this file is the policy, so tuning a number never touches
 * the algorithm.
 *
 * Every limit can be overridden with an environment variable, and the whole
 * feature can be switched off with RATE_LIMIT_DISABLED=true.
 *
 * Design rules, in order of importance:
 *  1. A cashier mid-sale must never be throttled by a neighbour. Authenticated
 *     traffic is keyed by the VERIFIED uid, so one user's burst cannot spend
 *     another user's allowance, and the defaults are far above what a human
 *     (or a page that fires a dozen parallel fetches) can produce.
 *  2. POST /api/pos/checkout is exempt. It is a human-paced action behind
 *     authentication, and refusing a sale is worse than the abuse it prevents.
 *  3. Anonymous traffic is keyed by address and limited much harder, because
 *     the anonymous surface is login and licence activation.
 */
import { NextResponse } from 'next/server';
import { clientAddress, getRateLimiter, type RateLimitResult } from '@/lib/rate-limit';

const MINUTE = 60_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function rateLimitingDisabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === 'true';
}

// Limits are read per call (not at import) so tests and operators can change
// the environment without a rebuild. getRateLimiter keeps the first options it
// saw for a name, so a changed env var takes effect on the next process start.
const limits = () => ({
  api: envInt('RATE_LIMIT_API_MAX', 1200), // per uid per minute
  reports: envInt('RATE_LIMIT_REPORTS_MAX', 90), // per uid per minute
  bulk: envInt('RATE_LIMIT_BULK_MAX', 30), // per uid per minute
  public: envInt('RATE_LIMIT_PUBLIC_MAX', 120), // per address per minute
  login: envInt('RATE_LIMIT_LOGIN_MAX', 20), // per address per minute
  loginFailures: envInt('RATE_LIMIT_LOGIN_FAILURES', 5), // per address+username
  loginFailuresPerUser: envInt('RATE_LIMIT_LOGIN_FAILURES_PER_USER', 25), // per username
  loginLockMs: envInt('RATE_LIMIT_LOGIN_LOCK_MINUTES', 15) * MINUTE,
});

function limiter(name: string, max: number, windowMs = MINUTE) {
  return getRateLimiter(name, { max, windowMs });
}

/** Label a result with the bucket and key that produced it, for the log. */
function tag(result: RateLimitResult, bucket: string, key: string): RateLimitResult {
  return { ...result, bucket, key };
}

/** Normalise the path the same way the allowlist does (no trailing slash). */
function normalize(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

/** First blocked result wins; otherwise the tightest remaining allowance. */
function firstBlockedOrTightest(results: RateLimitResult[]): RateLimitResult {
  const blocked = results.find((r) => !r.allowed);
  if (blocked) return blocked;
  return results.reduce((a, b) => (b.remaining < a.remaining ? b : a));
}

/**
 * Limit an UNAUTHENTICATED request to a public route (login, licence
 * activation/status/heartbeat). Returns null when limiting does not apply.
 */
export function checkPublicRateLimit(
  method: string,
  pathname: string,
  headers: Headers
): RateLimitResult | null {
  if (rateLimitingDisabled()) return null;
  const l = limits();
  const ip = clientAddress(headers);
  const results = [tag(limiter('public', l.public).consume(`public:${ip}`), 'public', `public:${ip}`)];
  if (method.toUpperCase() === 'POST' && normalize(pathname) === '/api/auth/login') {
    results.push(tag(limiter('login', l.login).consume(`login:${ip}`), 'login', `login:${ip}`));
  }
  return firstBlockedOrTightest(results);
}

/**
 * Limit an AUTHENTICATED request, keyed by the verified uid. Returns null when
 * the route is exempt or limiting is off.
 */
export function checkAuthenticatedRateLimit(
  method: string,
  pathname: string,
  uid: string
): RateLimitResult | null {
  if (rateLimitingDisabled()) return null;
  const path = normalize(pathname);

  // Rule 2: never refuse a sale.
  if (method.toUpperCase() === 'POST' && path === '/api/pos/checkout') return null;

  const l = limits();
  const results = [tag(limiter('api', l.api).consume(`uid:${uid}`), 'api', `uid:${uid}`)];

  if (path.startsWith('/api/reports/') || path === '/api/reports') {
    results.push(tag(limiter('reports', l.reports).consume(`uid:${uid}`), 'reports', `uid:${uid}`));
  } else if (path.startsWith('/api/data-management/') || path === '/api/data-management') {
    results.push(tag(limiter('bulk', l.bulk).consume(`uid:${uid}`), 'bulk', `uid:${uid}`));
  }
  return firstBlockedOrTightest(results);
}

// ---- login failure lockout --------------------------------------------------

function normalizeUsername(username: unknown): string {
  return typeof username === 'string' ? username.trim().toLowerCase().slice(0, 128) : '';
}

function loginLimiters() {
  const l = limits();
  return {
    pair: limiter('login-failures', l.loginFailures, l.loginLockMs),
    user: limiter('login-failures-user', l.loginFailuresPerUser, l.loginLockMs),
  };
}

const pairKey = (headers: Headers, username: unknown) =>
  `${clientAddress(headers)}|${normalizeUsername(username)}`;

/**
 * Is this address+username currently locked out of logging in? Does NOT count
 * an attempt. Returns the blocking result, or null when the attempt may go
 * ahead.
 *
 * Two ceilings, because the address comes from a client-controlled header (see
 * clientAddress): the pair limit stops ordinary guessing without letting a
 * stranger lock a real user out, and the higher per-username limit still stops
 * an attacker who rotates the header to dodge the pair limit.
 */
export function checkLoginLock(headers: Headers, username: unknown): RateLimitResult | null {
  if (rateLimitingDisabled()) return null;
  const { pair, user } = loginLimiters();
  const name = normalizeUsername(username);
  const a = pair.peek(pairKey(headers, username));
  if (a.remaining === 0) return { ...tag(a, 'login-failures', pairKey(headers, username)), allowed: false };
  const b = user.peek(`user:${name}`);
  if (b.remaining === 0) return { ...tag(b, 'login-failures-user', `user:${name}`), allowed: false };
  return null;
}

/** Count a failed attempt (wrong password OR unknown user, so the two are
 *  indistinguishable and the lockout cannot be used to enumerate accounts). */
export function recordLoginFailure(headers: Headers, username: unknown): void {
  if (rateLimitingDisabled()) return;
  const { pair, user } = loginLimiters();
  pair.consume(pairKey(headers, username));
  user.consume(`user:${normalizeUsername(username)}`);
}

/** A successful login clears the address+username counter only. The
 *  per-username ceiling is deliberately left to expire: it is the defence
 *  against a header-rotating attacker, who would otherwise reset it by
 *  guessing right once. */
export function clearLoginFailures(headers: Headers, username: unknown): void {
  if (rateLimitingDisabled()) return;
  loginLimiters().pair.reset(pairKey(headers, username));
}

// ---- logging ----------------------------------------------------------------

// A refusal is only useful for tuning if it is visible, but a flood must not
// become a log flood: one line per bucket+key per minute, and the table of
// "last logged" times is itself bounded.
const LOG_EVERY_MS = MINUTE;
const LOG_TABLE_MAX = 1000;
const lastLogged = new Map<string, number>();

function logThrottled(result: RateLimitResult, route?: string): void {
  if (!result.bucket || !result.key) return;
  const id = `${result.bucket}|${result.key}`;
  const t = Date.now();
  const prev = lastLogged.get(id);
  if (prev !== undefined && t - prev < LOG_EVERY_MS) return;
  if (lastLogged.size >= LOG_TABLE_MAX) lastLogged.clear();
  lastLogged.set(id, t);
  console.warn(
    `[rate-limit] 429 bucket=${result.bucket} key=${result.key}` +
      (route ? ` route=${route}` : '') +
      ` limit=${result.limit} retryAfter=${result.retryAfterSeconds}s ` +
      '(logged at most once a minute per bucket+key)'
  );
}

// ---- response ---------------------------------------------------------------

/** The 429 every limited caller gets. Body keeps the `{ success, error }` shape
 *  the rest of the API uses; `error` also satisfies the login route's
 *  `{ error }` readers. */
export function rateLimitedResponse(
  result: RateLimitResult,
  message?: string,
  route?: string
): NextResponse {
  logThrottled(result, route);
  return NextResponse.json(
    {
      success: false,
      error: message ?? 'Too many requests. Please slow down and try again shortly.',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}
