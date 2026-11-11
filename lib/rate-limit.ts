/**
 * In-memory fixed-window rate limiter. Zero dependencies.
 *
 * Scope, stated plainly: this protects ONE Node process. This project runs one
 * server per physical terminal (see CLAUDE.md), each with its own memory, so a
 * limit here is a per-server limit, not a fleet-wide one. That is the right
 * shape for the threat this addresses (a runaway client or a password-guessing
 * loop hitting a server) and it needs no Redis. If the app is ever run as
 * several instances behind one load balancer, move the store behind the same
 * interface rather than raising the numbers.
 *
 * The store lives on `globalThis`: Next can evaluate this module more than once
 * (the proxy and the route handlers are separate module graphs, and dev hot
 * reload re-evaluates it), and a per-module Map would silently reset or split
 * the counters.
 */

export interface RateLimitResult {
  /** false when this call was over the limit. */
  allowed: boolean;
  limit: number;
  /** Requests still available in the current window (never negative). */
  remaining: number;
  /** Whole seconds until the window resets; always >= 1 when blocked. */
  retryAfterSeconds: number;
  /** Set by the policy layer (not the limiter) so a refusal can be logged. */
  bucket?: string;
  key?: string;
}

export interface RateLimiter {
  /** Count one request against `key` and report whether it is allowed. */
  consume(key: string): RateLimitResult;
  /** Report the state for `key` WITHOUT counting a request. */
  peek(key: string): RateLimitResult;
  /** Forget `key` (e.g. after a successful login). */
  reset(key: string): void;
  /** Number of live keys, for tests and diagnostics. */
  size(): number;
}

interface Entry {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  /** Hard cap on tracked keys so an attacker rotating keys cannot grow memory. */
  maxKeys?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { max, windowMs } = options;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();
  let lastSweep = now();

  /** Drop expired entries. Called opportunistically, never on a timer, so a
   *  limiter that is never used costs nothing and keeps no process alive. */
  function sweep(t: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= t) entries.delete(key);
    }
    lastSweep = t;
  }

  function live(key: string, t: number): Entry | undefined {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= t) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  function result(entry: Entry | undefined, t: number): RateLimitResult {
    const count = entry?.count ?? 0;
    const retryAfterSeconds = entry ? Math.max(1, Math.ceil((entry.resetAt - t) / 1000)) : 0;
    return {
      allowed: count <= max,
      limit: max,
      remaining: Math.max(0, max - count),
      retryAfterSeconds,
    };
  }

  return {
    consume(key) {
      const t = now();
      if (t - lastSweep >= windowMs) sweep(t);

      let entry = live(key, t);
      if (!entry) {
        if (entries.size >= maxKeys) {
          sweep(t);
          // Still full of live keys: evict the oldest (Map preserves insertion
          // order) rather than grow without bound or refuse new callers.
          if (entries.size >= maxKeys) {
            const oldest = entries.keys().next().value;
            if (oldest !== undefined) entries.delete(oldest);
          }
        }
        entry = { count: 0, resetAt: t + windowMs };
        entries.set(key, entry);
      }
      entry.count += 1;
      return result(entry, t);
    },
    peek(key) {
      const t = now();
      return result(live(key, t), t);
    },
    reset(key) {
      entries.delete(key);
    },
    size() {
      return entries.size;
    },
  };
}

// ---- shared, process-wide registry ----------------------------------------

const REGISTRY_KEY = '__alonRateLimiters';

function registry(): Map<string, RateLimiter> {
  const g = globalThis as unknown as Record<string, Map<string, RateLimiter> | undefined>;
  return (g[REGISTRY_KEY] ??= new Map());
}

/**
 * The named, process-wide limiter. The first caller's options win; later
 * callers with the same name get the same instance (and therefore the same
 * counters) regardless of which module graph they were bundled into.
 */
export function getRateLimiter(name: string, options: RateLimiterOptions): RateLimiter {
  const reg = registry();
  let limiter = reg.get(name);
  if (!limiter) {
    limiter = createRateLimiter(options);
    reg.set(name, limiter);
  }
  return limiter;
}

/** Test helper: forget every registered limiter. */
export function resetRateLimiters(): void {
  registry().clear();
}

// ---- client identification -------------------------------------------------

/**
 * Best-effort client address for keying UNAUTHENTICATED traffic.
 *
 * Next exposes no socket address to a proxy or route handler, so this reads
 * X-Forwarded-For / X-Real-IP. Those are client-controlled when the server is
 * reached directly (a LAN client can send any value), so an IP key alone can be
 * dodged by rotating the header. That is why the login lockout also keeps a
 * per-username ceiling that ignores the address (see lib/rate-limit-policy.ts),
 * and why authenticated traffic is keyed by the verified uid, never the IP.
 * With no header at all every caller shares the one 'unknown' bucket, which is
 * only a problem if the limits are set low; they are not.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  return 'unknown';
}
