# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Alon POS System** (formerly Verdix POS) — a Philippine retail point-of-sale system built as a Next.js 16 web app wrapped in Electron 33 for Windows desktop deployment. Its **License Management Server** lives in a separate repository at `../verdix-license-server` and runs independently on port 4100.

---

## Commands

```bash
# Development
npm run dev                  # Next.js + Turbopack on port 3000
npm run build && npm start   # Production build

# Code quality
npm run lint
npm run typecheck

# Database
npm run migrate              # Run all pending migrations
npm run migrate:down         # Roll back last migration
npm run seed                 # Seed reference/lookup data
npm run set-admin            # Promote a user to admin role

# Electron desktop
npm run electron-dev         # Dev: Next.js + Electron together
npm run electron-admin-dev   # Dev: Admin UI variant
npm run dist                 # Build portable .exe
npm run build:installer      # Build Inno Setup installer

# E2E tests (isolated DB on port 3100)
npm run test:e2e             # Run all Playwright tests headless
npm run test:e2e:ui          # Open Playwright UI mode
npm run test:e2e:report      # Show last test report
npm run test:e2e:db          # Re-seed the test database only

# License server — now a SEPARATE REPO at ../verdix-license-server
# (run these from that repo, not here)
#   npm run migrate      # Create verdix_license DB tables
#   npm run seed-admin -- --username admin --password "..."
#   npm run server       # Start dashboard at http://localhost:4100
#   npm run new -- --product-key VRDX-XXXX-XXXX-XXXX --machine "..."
```

---

## Environment

`.env` at the repo root. Key variables:

| Variable | Purpose |
|---|---|
| `DB_HOST/PORT/USER/PASSWORD/DB_NAME` | Local MySQL (default: `alon_pos`) |
| `CLOUD_DB_HOST/PORT/USER/PASSWORD/DB_NAME` | Railway MySQL (optional — enables cloud sync) |
| `NEXT_PUBLIC_API_BASE_URL` | Used by the browser to call API routes |
| `LICENSE_DB_*` | Separate DB for the license server (`verdix_license`) |
| `LICENSE_ADMIN_SECRET` | HMAC secret for license dashboard sessions |
| `LICENSE_UI_PORT` | License server port (default `4100`) |
| `GEMINI_API_KEY` | Optional — AI features |
| `SERVER_SESSION_SECRET` | **Required in production.** HMAC secret for API session tokens; the server refuses to sign or verify sessions without it |

---

## Architecture

### Next.js App (port 3000)

**Two route groups under `app/`:**
- `(app)/` — All authenticated pages (dashboard, inventory, sales, purchases, suppliers, customers, reports, POS, settings, approvals, user management)
- `api/` — 150+ REST route handlers. All database logic lives here, not in Server Components.

**Auth pattern** — `POST /api/auth/login` verifies the password and returns
`{ token, uid, displayName, userType, permissions[] }`. The token is an
HMAC-SHA256-signed bearer token (`lib/auth/session.ts`, 12h TTL, signed with
`SERVER_SESSION_SECRET`); the rest is stored in `localStorage` as
`mock-user-session` for the UI.

Root `proxy.ts` enforces authentication on every `/api` path
**deny-by-default** — every route requires a valid token except the small
per-method allowlist in `lib/auth/public-routes.ts` (login, license
activate/activate-online/status/heartbeat, and the dev mock). It is a per-route
list, never a prefix wildcard: `POST /api/license/deactivate` takes no
arguments and halts the store, so it is guarded.

It is `proxy.ts`, not `middleware.ts`: Next 16 deprecated the `middleware`
convention, and middleware runs on the Edge Runtime where Node's `crypto` —
which session verification needs — is unavailable. A proxy file always runs on
the Node.js runtime, and must not export a `config` object (that is a build
error), so it filters non-`/api` paths in code rather than via a `matcher`.

The proxy forwards the verified identity as `x-auth-uid` / `x-auth-user-type`
/ `x-auth-permissions`, **deleting any inbound copy first** so a client cannot
inject its own identity. Route handlers read identity from those headers via
`getAuthContext()` — never from the request body.

**Rate limiting** (`lib/rate-limit.ts` mechanism, `lib/rate-limit-policy.ts` policy, wired in `proxy.ts` and `app/api/auth/login/route.ts`). In-memory fixed-window limiter, **per Node process**: this project runs one server per terminal, so a limit is per server, not fleet-wide, and there is deliberately no Redis. State lives on `globalThis` because the proxy and the route handlers are separate module graphs. Authenticated traffic is keyed by the **verified uid** (checked *after* `verifySession`, so a 401 flood touches no counter and cannot spend a real user's allowance); anonymous traffic to the public routes is keyed by address. Defaults: 1200/min/uid general, 90/min `/api/reports/*`, 30/min `/api/data-management/*`, 120/min/address public, 20/min/address login. **`POST /api/pos/checkout` is exempt on purpose** — refusing a sale is worse than the abuse it prevents. Login also has a failure lockout: 5 failures per address+username (15 min) and a 25-failure per-username ceiling that ignores the address, because the address comes from `X-Forwarded-For`, which a direct LAN client controls (Next exposes no socket address); unknown-user and wrong-password both count, so the lockout is not an account-enumeration oracle; a success clears only the pair counter. Every refusal logs one `[rate-limit] 429 bucket=… key=… route=…` line (at most once a minute per bucket+key) — grep the server log for it to tune the limits from real traffic rather than guessing. A limited caller gets 429 with `Retry-After` and `{ success: false, error, retryAfterSeconds }`. Every number is an env var (`RATE_LIMIT_API_MAX`, `_REPORTS_MAX`, `_BULK_MAX`, `_PUBLIC_MAX`, `_LOGIN_MAX`, `_LOGIN_FAILURES`, `_LOGIN_FAILURES_PER_USER`, `RATE_LIMIT_LOGIN_LOCK_MINUTES`), `RATE_LIMIT_DISABLED=true` turns it all off, and limiter options are fixed at first use so a changed variable applies from the next process start. **Not covered:** the MySQL pool (`lib/mysql.ts`) still has `queueLimit: 0`, so a saturated pool queues indefinitely instead of failing fast; per-route tuning beyond the three buckets above; and the per-uid limit is only as good as the 12-hour token (a stolen token is limited, not revoked). `tests/unit/rate-limit.test.ts` drives the real proxy; `tests/e2e/rate-limit.spec.ts` covers the lockout over HTTP.

Destructive routes additionally call `requirePermission(request, '<perm>')`
(`lib/auth/require-permission.ts`), which returns 403 (not 401, which would log
a cashier out mid-sale). Permissions are the 13 seeded by migration 070;
`super_admin` is deliberately NOT a server-side bypass.

Client code calls this app's API through `authFetch()` in `lib/api-config.ts`,
which attaches the token and handles 401 centrally. It includes supervisor
elevation support: a 2-minute, separately-keyed token (`alon-elevation-token`)
stored by `setElevatedToken()` and preferred over the cashier's own session.
The POS collects manager credentials to authorize a single destructive action
(Z-reading, void, price edit) without replacing the cashier's session.
`clearStoredSession()` drops both keys.

The elevation is **time-boxed, not cleared after use** — there are 10+
`AdminAuthDialog` call sites and one missed clear would leave a terminal
elevated indefinitely, so expiry is the containment. The cost: for up to 2
minutes *every* request from that browser carries the manager's token, not just
the privileged one. Narrowing that to a single call needs a per-call opt-in
threaded through each override continuation (Phase 2).

`authFetch()` suppresses its 401-redirect on `/pos` and `/pos/*`, because the
POS renders its own login overlay and fires settings/terminal fetches on mount
before a cashier signs in; redirecting would lock the cashier out of the login
screen. Trade-off: a token expiring mid-shift on `/pos` fails quietly rather
than redirecting.

**Do not use `authFetch` for outbound third-party calls** — `lib/integrations/sta-lucia/` (the mall
consolidator) and `app/api/license/heartbeat/route.ts` (the license server) use
plain `fetch`, because sending them our token would leak a credential.

Phase 1 scope: all routes are authenticated; only the destructive ones are
permission-checked. Mapping the remaining ~150 routes to permissions is Phase 2
(see `docs/superpowers/specs/2026-10-05-api-authentication-design.md`).

**No ORM** — raw `mysql2/promise` queries everywhere via `lib/mysql.ts`. Two pools: local (`query()`) and cloud (`cloudQuery()`). The cloud pool is lazily initialized and never blocks the app if Railway is unreachable.

### Database (MySQL 8)

Migrations in `scripts/migrations/` — numbered TypeScript files (001–088+), each with `up()` and `down()`. Run by `npm run migrate`; executed migrations tracked in a `migrations` table.

### Key Domain Patterns

**Stock / Inventory:**
- `lib/batch-deduction.ts` — FIFO cost depletion on every sale. Each product has `inventory_batches` rows; sales pull from oldest batch first.
- `lib/family-sync.ts` — Products can belong to a family (e.g., 1kg bag → 250g sachets). Any stock change recursively syncs all family members.
- `lib/stock-movements.ts` — Every stock change writes a movement record for audit/history.

**Approvals workflow** — A multi-level queue pattern used for purchase orders, stock counts, stock transfers, bad orders, and bulk adjustments. Items are inserted with `status='pending'`, moved through approval levels, then finalized to update actual stock/accounts.

**POS (Point of Sale) — `/pos` route** — Fullscreen checkout UI. The Electron window is the primary deployment target. POS uses its own terminal/shift/cash-drawer management separate from the back-office UI. Checkout hits `POST /api/pos/checkout`.

**Cloud Sync** — Railway direct-MySQL sync. Not event-based: API routes call `cloudQuery()` in parallel after local write. Sync status tracked in `cloud_sync_log`. The `POST /api/cloud-sync/push` and `/pull` endpoints do full-table reconciliation.

**Printing** — ESC/POS via Windows Spooler. `lib/receipt-generator.ts` builds byte buffers using `@point-of-sale/receipt-printer-encoder`. Electron exposes `window.printerBridge` (from `main.js`/`preload.js`) to call the native Windows spooler DLL at `lib/sdk/`. Web builds fall back to `window.navigator.serial` (Web Serial API).

**Sta. Lucia Tenant System** — Z-reading sales are pushed to the mall's Sale Consolidator API from `lib/integrations/sta-lucia/`. Configured as a `provider = 'sta_lucia'` row in `external_apis`; reuses the external-API sync logs and retry queue, but `processSyncQueue` in `lib/scheduler.ts` gives `STA_LUCIA_SALES` its own query and `LIMIT` in the sweep (the legacy query excludes it), so a backlog of other sync rows can't starve its retries — only rows with `onErrorAction === 'retry'` are swept automatically (`'queue'` waits for a human via the Sync Logs tab, `'log_only'` never retries). The send fires detached after the Z-reading commits and can never fail it. Idempotency is enforced by an atomic claim row in `sta_lucia_submissions` (insert to claim, delete on failure, a claim left unfinished for 15 minutes is taken over) rather than just a log check — Philippine mall rent is commonly a percentage of reported sales, so a double submission double-reports revenue. **Delivery is nevertheless at-least-once, not exactly-once:** a crash after the send but before `succeeded = 1` is written, or a timeout on a request the mall actually processed, both leave a claim that the 15-minute stale takeover will re-send — closing those needs a MediaOne-side idempotency key we do not have, so the behaviour is documented (see the spec's Error handling section) rather than engineered around. `lib/integrations/sta-lucia/payload.ts` is a pure mapper and is where the credit/debit and discount-percentage decisions live. Local mocks at `/api/dev/mock-sta-lucia` make it testable without credentials. An hourly variant (`sale_type: true`, store-wide across all terminals, `lib/integrations/sta-lucia/send-hourly-sales.ts`) runs on a `:05`-past-the-hour cron and mirrors this same claim/retry/at-least-once pattern via its own `sta_lucia_hourly_submissions` table — **but is single-terminal-only**: `initScheduler()` runs once per process and this project runs one local server per physical terminal against a shared DB, so a multi-terminal store would run N racing hourly schedulers. Do not enable hourly submission on a multi-terminal store without adding a single-writer guard first (see `docs/superpowers/specs/2026-08-12-sta-lucia-hourly-sales-design.md`).

**BIR Compliance (Philippine Tax)** — Sales invoices use BIR-format SI numbers (sequential, never gapped). Z-readings and X-readings are locked reports required for tax filing. `lib/fiscal-utils.ts` handles VAT calculations. These are legally significant — do not change numbering logic without understanding the impact.

### License System (separate repo: `../verdix-license-server`)

A completely standalone HTTP server (no Next.js), in its own git repository. Manages Ed25519-signed, machine-bound license keys for the POS.

- **Private key** lives only on that server (`keys/` in that repo, gitignored)
- **Public key** embedded in the POS at `lib/licensing/public-key.ts`
- **Shared crypto is duplicated, not shared.** `lib/licensing/core.ts` here and `src/licensing/core.ts` in the license repo are intentional copies of the same Ed25519 contract. If you change the key format or algorithm in one, you MUST make the identical change in the other or previously issued licenses stop verifying.
- This repo keeps `lib/licensing/` + `lib/crypto/aes-gcm.ts` because the POS **verifies** licenses (`app/api/license/*`); only the signing server moved out.
- POS calls `POST /api/license/activate-online` → license server validates product key, checks seat count, signs and returns a machine-bound JWT-like token
- Offline flow: admin generates key from dashboard, gives to customer manually
- `lib/licensing/machine.ts` — Windows hardware fingerprint (registry MachineGuid + WMI serials) used as machine ID in license payloads

### Electron Wrapper

`main.js` is the Electron main process. It spawns the Next.js server as a child process, opens the browser window pointed at `http://localhost:3000`, and exposes the printer bridge via `preload.js`. `printer-sdk.js` and `epson-sdk.js` are Windows-only native bridges using `koffi` FFI.

### E2E Tests

Playwright tests run on port 3100 against a separate `alon_pos_test` database. `tests/e2e/setup/global-setup.ts` creates and seeds this DB before any test runs. Tests are sequential (workers: 1) to avoid concurrent DB mutations. Run `npm run test:e2e:db` to reset the test DB without re-running tests.

---

## Important Constraints

- **Windows-only desktop features** — Printer bridge, hardware fingerprinting, Electron packaging. Web browser builds skip these gracefully.
- **MySQL only** — No abstraction layer. All queries are raw SQL.
- **No parallel E2E tests** — The test DB is shared across the test suite; always `workers: 1`.
- **`CLOUD_DB_*` is optional** — If unset, cloud sync is silently skipped. Never throw or crash when cloud is unreachable.
- **BIR SI numbers are legally significant** — The sequential numbering in `sales_invoice_number` must never have gaps or duplicates.
- **License server is a separate repo and process** — It lives at `../verdix-license-server`, has its own DB (`verdix_license`), its own auth, and runs independently of the Next.js app. Start it from that repo with `npm run server`.
