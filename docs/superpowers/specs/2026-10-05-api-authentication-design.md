# API Authentication — Phase 1 (deny-by-default)

**Date:** 2026-10-05
**Status:** Design approved, pending spec review

## Problem

The Next.js app has no server-side authentication. There is no
`middleware.ts`, no auth guard helper, and no session verification in any of
the 165 API route handlers. Of those, 8 mention "permission" at all, and those
8 only read or write permissions as data — none enforce them.

The client session is unsigned JSON in `localStorage` under
`mock-user-session`. Routes that need the acting user read `uid` from the
request body, so any caller can claim any identity.

Two endpoints make this concretely dangerous to an operator, with no
credentials required:

- `POST /api/users` — creates a user, including permissions. Privilege
  escalation.
- `POST /api/data-management/reset` — truncates all sales tables and resets
  `transaction_references.si_number` plus per-terminal X/Z counters. In BIR
  terms, an unauthenticated "erase my tax records" button.

A third was found while writing this design:

- `POST /api/auth/signup` — creates a user. Its only guard is "is this
  username taken", **not** "is this the first user", so it is a second
  unauthenticated user-creation path rather than a first-run bootstrap.

### Why the deployment model makes this urgent

The system ships in all three modes:

1. **Standalone** — one machine, API on localhost. Lowest exposure.
2. **LAN** — one server hosts Next.js + MySQL; other terminals point at it via
   the `server_ip` value in `localStorage` (`lib/api-config.ts`). The API is
   reachable by every host on the local network.
3. **Railway / internet-exposed** — `RAILWAY_DEPLOYMENT.md` and `CLOUD_DB_*`
   confirm cloud deployment. The endpoints above are then publicly reachable.

Mode 3 governs the design: assume a hostile network.

## Scope

Phase 1 is **authentication, deny-by-default**, plus permission checks on the
routes where a forged request causes irreversible damage. Mapping all 165
routes to the 13 existing permissions is deliberately deferred to Phase 2 —
it requires reading each route and judging its permission, and a wrong mapping
silently breaks a feature.

Phase 1 establishes that identity is trustworthy. That is the precondition for
everything else, and it closes the critical holes without a 165-route audit.

### Out of scope (deliberately)

- Per-route permission mapping for the ~150 non-destructive routes (Phase 2).
- Normalizing `userType` casing. `'ADMIN'`, `'Admin'`, `'MANAGER'`, `'Super
  Admin'`, `'Cashier'`, `'Employee'` all appear in existing comparisons.
  Authorization here keys on `permissions[]`, never `userType`, so the
  inconsistency cannot cause a bypass. Fixing it is a separate change with its
  own blast radius.
- The dead-looking `/api/auth/signup` query against a non-existent `email`
  column (`users` has `username`; see `app/api/auth/login/route.ts`). Flagged,
  not fixed.
- Token revocation before expiry (see Limitations).

## Design

### 1. Token format

```
token   = base64url(payloadJson) + "." + base64url(hmacSha256(payloadJson, secret))
payload = { uid, username, userType, roleId, permissions[], iat, exp }
```

New module `lib/auth/session.ts` exports `signSession(payload)` and
`verifySession(token)`. Verification splits on `.`, recomputes the HMAC over
the payload bytes, compares with `crypto.timingSafeEqual`, then checks `exp`.
Malformed, mis-signed, and expired tokens all return `null` — one failure path,
no partial trust.

Node's built-in `crypto` only. No new dependency.

**Chosen over the alternatives:**

- *DB-backed opaque sessions* (a `sessions` table, looked up per request) are
  instantly revocable, but cost a DB round-trip on every API call. On a LAN
  server with several POS terminals on the checkout hot path that is a real
  cost, and it needs a 137th migration plus a cleanup job.
- *Encrypting the payload* with the existing `lib/crypto/aes-gcm.ts` is the
  wrong primitive: the requirement is integrity, not secrecy — the client
  already knows its own permissions. It would also surface tampering as generic
  decrypt failures.

HMAC also mirrors the signed-token contract already used in `lib/licensing/`.

### 2. The secret

Read from `SERVER_SESSION_SECRET`:

- **Production, unset** → the module throws on first use. The server fails
  loudly rather than silently accepting forged tokens.
- **Development, unset** → derive a random per-boot secret and warn. Dev keeps
  working; tokens simply do not survive a restart.
- **No committed default literal, ever.** A hardcoded fallback is precisely how
  this class of fix gets quietly defeated.

### 3. TTL

12 hours — long enough for one retail shift. On expiry the client receives 401,
clears its session, and routes to `/login`.

### 4. Middleware (deny-by-default)

A single root `middleware.ts` matching `/api/:path*`. Every request must carry
a valid `Authorization: Bearer <token>`, except an explicit public allowlist:

| Public route | Reason |
|---|---|
| `POST /api/auth/login` | Issues the token; cannot require one |
| `POST /api/license/activate` | Runs before any user exists (offline key entry) |
| `POST /api/license/activate-online` | Same, online activation |
| `GET /api/license/status` | The activation screen reads it pre-login |
| `POST /api/license/heartbeat` | Unattended liveness ping |
| `/api/dev/mock-sta-lucia/*` | Local test mock, development only |

The allowlist is **per route, not a `/api/license/*` wildcard**. An earlier
draft of this design allowlisted the whole prefix, which would have left
`POST /api/license/deactivate` — a no-argument endpoint that removes the
installed license and drops the POS to the activation screen — reachable by
anyone. That is an unauthenticated denial of service against a paying store.
It therefore requires auth plus `manage_settings` (see §5).

All other routes return 401 without a valid token. **Deny-by-default is the
core of this design:** a route added later is protected because nobody did
anything, which inverts today's situation.

`/api/auth/signup` is **not** public — see Problem.

On success the middleware forwards the verified identity as request headers
(`x-auth-uid`, `x-auth-user-type`, `x-auth-permissions`), **after stripping
those header names from the inbound request**, so a client cannot inject them.
Route handlers then read trusted identity from headers instead of a
body-supplied `uid`.

Bearer token rather than a cookie, because terminals may call a remote server
over the LAN via `server_ip`, and Electron production runs on `file://` where
cookie scoping does not apply.

### 5. Authorization on destructive routes

`lib/auth/require-permission.ts` exports
`requirePermission(request, permission)`, which reads the trusted
`x-auth-permissions` header and returns either a 403 `NextResponse` or `null`.
Guarded routes gain four lines; no route is rewritten.

| Route | Permission | Risk |
|---|---|---|
| `POST/PUT/DELETE /api/users/*` | `manage_users` | Privilege escalation |
| `POST /api/auth/signup` | `manage_users` | Same, second door |
| `/api/user-types/*` (writes) | `manage_users` | Rewrites the permission model |
| `POST /api/data-management/reset` | `manage_settings` | Wipes sales; resets BIR SI numbering |
| `POST /api/sales/z-reading` | `view_sales` | Legally locked BIR report |
| `POST /api/license/deactivate` | `manage_settings` | Removes the license; halts the store |

Permissions come from the 13 already seeded in `user_type_permissions`
(migration 070). No new permission strings are invented.

**`super_admin` is not a bypass in `requirePermission`.** The UI grants
everything on it (`app/(app)/use-app-layout.ts:89`) while
`app/(app)/developer/options/page.tsx:22` states no such permission exists in
the system. Honouring it server-side would hand the dev-preview session a
master key. The `Super Admin` *role* already carries all 13 permissions
explicitly, so nothing is lost.

### 6. Dev preview

`app/(app)/use-app-layout.ts:43` fabricates a client session with
`permissions: ['super_admin']` so the back office can be reviewed without
credentials. Once the server stops trusting client JSON, that session yields no
valid token.

Replacement: in development only, `POST /api/auth/login` accepts a
`devPreview` flag and issues a **real signed token** for that identity. Dev
convenience is preserved, it travels the same signing path as any other
session, and it is compiled out of production builds.

### 7. Client migration

Login stores the token in `localStorage` beside the existing session object.
The object's shape is left intact so the 18 files that read `mock-user-session`
keep working untouched.

Measured surface: **403 `fetch(` call sites across 171 files** (excluding
`app/api/`). Of these, **336 (83%) already use `fetch(getApiUrl(...))`** — a
uniform, mechanically rewritable pattern. The remaining 67 split into:

- hardcoded `/api/...` string literals — mechanical;
- `fetch(url, ...)` / `fetch(fullUrl)` indirection — must be read individually;
- **outbound third-party calls that must NOT receive our header.**

A second outbound call lives in `app/api/license/heartbeat/route.ts`, which
POSTs to the license server's `/api/validate`. Like the Sta. Lucia calls it
must not receive our session header. It is server-side (inside a route
handler), so it falls outside the client-side migration surface, but it is
listed here so a future sweep does not catch it.

The outbound hazard is the Sta. Lucia mall Sale Consolidator
(`lib/integrations/sta-lucia/client.ts`: `url(cfg, '/api/login')`,
`/api/get-sales`, `/api/get-transactions`, `/api/logout`). These are a
different system's endpoints that happen to share `/api/` paths. Attaching our
session header would leak a credential to a third party. They are confined to
that one directory, which is excluded wholesale from the migration.

A new `authFetch()` in `lib/api-config.ts` attaches the header and centralizes
401 handling. All call sites migrate to it **in the same branch as the
middleware**, so `main` is never in a state where the server requires a token
the client does not send.

### 8. Error handling

- **401** — clear the stored session and token, redirect to `/login`.
- **403** — surface a toast; stay on the page. The user is authenticated but
  lacks the permission, so a redirect would be misleading.
- Verification failures are never distinguished to the caller (a tampered
  token and an expired one both yield 401), avoiding an oracle.

## Testing

Following the project's existing `node:assert` + source-assertion convention
(`tests/unit/`, registered in `tests/unit/run.ts`), TDD throughout.

**`session.test.ts`** — real crypto, no mocks:
- sign → verify round-trip preserves the payload
- tampered payload rejected
- tampered signature rejected
- expired token rejected
- malformed input (no dot, empty, non-base64, wrong segment count) rejected
- a token signed with a different secret is rejected

**`middleware-allowlist.test.ts`** — asserts the public allowlist is exactly
the intended set, so a future edit that widens it fails the suite. This is the
regression guard for deny-by-default.

**`destructive-route-guards.test.ts`** — asserts each route in the §5 table
calls `requirePermission` with the expected permission.

**`session-secret.test.ts`** — asserts production-unset throws and that no
default secret literal appears in the source.

**E2E** (`tests/e2e/`, port 3100): login → authenticated request succeeds;
request without a token returns 401; request with a valid token but
insufficient permission returns 403.

## Limitations (accepted)

**Stale permissions.** The token carries `permissions[]`, so a permission
change takes effect only at next login (≤12h), and a user disabled mid-shift
retains access until their token expires. This is the cost of avoiding a
per-request DB hit. If unacceptable, the mitigation is a revocation check on
the destructive routes only — a small addition to `requirePermission`, not a
redesign.

**`GET /api/license/status` discloses `machineId` and `customer` to
unauthenticated callers.** It must stay public because the activation screen
reads it before any login exists. The disclosure is narrow (hardware
fingerprint and customer label, no key material), and the alternative — a
pre-auth token just for activation — adds a second credential path for little
gain. Recorded as an accepted trade-off rather than an oversight.

**No single-token revocation.** Rotating `SERVER_SESSION_SECRET` invalidates
all sessions at once; there is no per-token revoke. Acceptable at this scale.

**Phase 1 leaves ~150 routes authenticated but not permission-checked.** Any
logged-in user can reach them. This is a deliberate, large improvement over
"any anonymous caller can reach them" — not a finished authorization model.

## Migration

Clean break, per operator decision: existing `localStorage` sessions carry no
token, so everyone re-logs in once. No grace-period bypass flag is introduced —
such a flag is itself a bypass, and a forgotten one means nothing changed.
