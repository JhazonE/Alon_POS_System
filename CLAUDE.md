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

---

## Architecture

### Next.js App (port 3000)

**Two route groups under `app/`:**
- `(app)/` — All authenticated pages (dashboard, inventory, sales, purchases, suppliers, customers, reports, POS, settings, approvals, user management)
- `api/` — 150+ REST route handlers. All database logic lives here, not in Server Components.

**Auth pattern** — `POST /api/auth/login` returns `{ uid, displayName, userType, permissions[] }` stored in `localStorage` as `mock-user-session`. Every API route reads it from the request body or headers. POS-type users are hard-redirected to `/pos`.

**No ORM** — raw `mysql2/promise` queries everywhere via `lib/mysql.ts`. Two pools: local (`query()`) and cloud (`cloudQuery()`). The cloud pool is lazily initialized and never blocks the app if Railway is unreachable.

### Database (MySQL 8)

Migrations in `scripts/migrations/` — numbered TypeScript files (001–088+), each with `up()` and `down()`. Run by `npm run migrate`; executed migrations tracked in a `migrations` table.

### Key Domain Patterns

**Stock / Inventory:**
- `lib/batch-deduction.ts` — FIFO cost depletion on every sale. Each product has `inventory_batches` rows; sales pull from oldest batch first.
- `lib/family-sync.ts` — Products can belong to a family (e.g., 1kg bag → 250g sachets). Any stock change recursively syncs all family members.
- `lib/stock-movements.ts` — Every stock change writes a movement record for audit/history.

**Branches** — `branches` is the store identity above `warehouses`. `warehouses`, `pos_terminals` and `users` all carry `branch_id` (`users.branch_id` NULL = head office, paired with the `all_branches` permission). `lib/branch-context.ts` is the only place a branch is resolved, and it resolves from server-side state — `pos_terminals.branch_id` for POS, a per-request `users.branch_id` lookup for back-office — so a tampered `localStorage` session cannot change which branch an identity belongs to. Product-level routes filter by `warehouseIdsForBranch()`, while `inventory_batches` has no warehouse column of its own and scopes through its product's `warehouse_id` the same way, while sales-level routes (`sales_transactions`, `sale_items`, `sales_invoices` have no warehouse column) scope through `pos_terminals.branch_id` via `terminalBranchFilter`, `saleBranchFilter` and `assertTerminalInBranch`. For both, `null` means head office and no filter, and an empty array means a branch with no warehouses and must return nothing. A cross-branch `warehouse_id` is a 403, not a silent ignore. Migration 134 assigns existing users (admins stay head office with the `all_branches` grant, everyone else joins the main branch); a user with no branch and no `all_branches` gets 403 from the branch-filtered routes.
**Phase 2a landed per-branch BIR numbering (branch migrations span 130-141; 135-141 are 2a).** Each branch has a `branch_number_series` row holding its own `si_number` / `mc_number` / `bir_or_number`; `getNextSINumber(branchId, connection)` and its MC/OR siblings take a required `branchId` and fail closed if the branch has no series row, so `POST /api/branches` creates the branch (now ACTIVE) and its series row in one transaction. The main branch continued its original sequence (migration 137 re-syncs it at cutover, taking the GREATER of the branch series and the old global counter so a counter that advanced mid-deploy is never lost); new branches start at 000001. Migration 141 swaps the five BIR unique keys to composite `(branch_id, si_number)` etc., so two branches may each issue 000001. `branch_id` is stored directly on `sales_transactions` and `pos_transactions` (migrations 138-140), so a terminal later reassigned to another branch cannot retroactively move its past sales to a different BIR establishment. **All three data-reset actions (`clear_sales`, `reset_references`, `factory_reset`) must zero `branch_number_series`** — resetting only `transaction_references` would re-issue invoice numbers already on filed documents. The nine internal document series and `receipt_number` remain company-wide via `getNextReference()`.

**Reads are filtered and the stock and BIR/sale-document writes are isolated (Phase 2b).** Writes name their own target, so they are *refused* with 403, not filtered: `resolveScopeFromBody` (`uid` required) plus `assertWarehouseInBranch` / `assertTerminalInBranch` / an owning-document check cover `products/[id]`, `stock-adjustments`, `inventory/adjust/bulk`, `sales` (create), `sales/orders` (+`[id]`, `deliver`), `sales/invoices` (+`void`), `sales/z-reading`, `pos/void-transaction` and `data-management/import/products` (lands in the importer's branch warehouse); `pos-transactions` stamps the referenced sale's branch. Every client of these must send the session uid via `lib/session-uid.ts` (`appendSessionUid` / `getSessionUid`); `branch-write-isolation.spec.ts` has page-level tests that fail if a client drops it. **Still open:** the 9 master-data routes (suppliers, customers, categories, brands, accounts, lookups) are shared by design (Phase 1 D8); ~6 admin/dev utility writes (warehouses, send-products, others) are unisolated; `app/api/approvals/queue` and `app/api/reports/soa` still read across branches (reasons are commented in those files). Server actions (`'use server'`, e.g. `adjustStock` in `inventory/history/actions.ts`) bypass the API guards and are not branch-checked.

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
