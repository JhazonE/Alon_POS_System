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

**Reads are filtered, and the stock and BIR/sale-document writes are isolated *at the API layer* (Phase 2b).** Writes name their own target, so they are *refused* with 403, not filtered: `resolveScopeFromBody` (`uid` required) plus `assertWarehouseInBranch` / `assertTerminalInBranch` / an owning-document check cover `products/[id]`, `stock-adjustments`, `inventory/adjust/bulk`, `sales` (create), `sales/orders` (+`[id]`, `deliver`), `sales/invoices` (+`void`), `sales/z-reading`, `pos/void-transaction` and `data-management/import/products` (lands in the importer's branch warehouse); `pos-transactions` stamps the referenced sale's branch. Every client of these must send the session uid via `lib/session-uid.ts` (`appendSessionUid` / `getSessionUid`); `branch-write-isolation.spec.ts` has page-level tests that fail if a client drops it. **Still open:** the 9 master-data routes (suppliers, customers, categories, brands, accounts, lookups) are shared by design (Phase 1 D8); ~6 admin/dev utility writes (warehouses, send-products, others) are unisolated; `app/api/approvals/queue` and `app/api/reports/soa` still read across branches (reasons are commented in those files).

**Phase 2c branch-guards the server-action write path.** A server action has no request object, so it cannot use `resolveScopeFromBody`; instead a signed, HTTP-only session cookie (`lib/session-cookie.ts`, 12-hour max age) carries the `uid`, and `resolveScopeFromSession()` in `lib/branch-context.ts` looks up `users.branch_id` on every call — **the cookie establishes *who*, never *which branch***, so the Phase 1 property still holds. `POST /api/auth/login` sets it; `handleSignOut` clears it. A caller that only *verifies* a password rather than logging in sends `verifyOnly: true` so it does not adopt the verified user's identity — the POS supervisor override does this, and without it a cashier would silently inherit the approving manager's branch.

**Never give a `'use server'` export a `scope` parameter.** Every parameter of a server action is attacker-controlled, so a `scope` argument lets anyone POST `{branchId: null, scope: 'all'}` and skip every check. The scope-accepting implementations therefore live in modules with **no** `'use server'` directive — `lib/stock-adjust.ts`, `lib/price-update-batch.ts`, `lib/product-shelf-locations.ts`, `lib/product-create.ts` — which are imported server-to-server and must never be re-exported from a `'use server'` file. The public actions keep their original signatures and resolve the session themselves.

Guarded: `addProduct`, `updateProduct`, `deleteProduct`, `setPrimarySupplier`, `updateProductShelfLocations` (`app/(app)/products/actions.ts`), `adjustStock` (`app/(app)/inventory/history/actions.ts`) and `submitPriceUpdateBatch` (`app/(app)/inventory/pricing/actions.ts`). `assertProductInScope` scopes a product through its own `warehouse_id`. `updateProduct` asserts **both** the existing and the incoming warehouse, so a branch user cannot move a product out of its branch or NULL its warehouse to detach it. Batch writers are **all-or-nothing**: every target is validated before any transaction opens, so one out-of-branch row refuses the whole batch and writes nothing — not even a `stock_movements` audit row. A product with a NULL `warehouse_id` belongs to no branch, so only head office may edit or delete it. `updateProductPrice`, `updateProductStock` and `createStockAdjustment` were **deleted** rather than guarded: they had no callers, and a `'use server'` export is a live endpoint whether the UI calls it or not.

Approval finalization (`app/api/approvals/process/route.ts`) scopes to the **requesting** branch, not the approver's: it passes `resolveScopeForUid(item.created_by)`, and `created_by` is read from the queue row in the database at finalization, so a request cannot alter it *then*. It is DB-sourced, **not session-proven**: `submitToApprovalQueue` stores the caller-supplied `userId` argument (`lib/approvals.ts`), so it is only as trustworthy as whoever queued the item. No cross-branch write results **when a cookie is present**, because the target is asserted against the *session* scope before the item is queued and finalization re-asserts it under the stored creator (with no cookie, the queueing write falls back like any other). `isInternalFinalization` is a **caller-settable** parameter on the public `adjustStock`, `addProduct`, `submitPriceUpdateBatch` and `updateProductShelfLocations`, and it **does** bypass the approval-queue check (e.g. `!isInternalFinalization && await checkApprovalRequired('STOCK_ADJUSTMENT')` in `lib/stock-adjust.ts`): any caller can pass `true` and skip the approval workflow. That predates Phase 2c and is still open. It is **not** a *branch* bypass — in all four cores the branch assert runs before the flag is read, regardless of its value. Because the scope comes from the creator, a head-office or other-branch approver finalizes into the creator's branch; if the creator cannot be resolved (deleted, branchless, or `'system'`) the item is refused and stays Pending rather than falling back to unguarded.

**Still open, deliberately:** when the cookie is absent or invalid, `resolveScopeFromSession()` returns `null` and the write proceeds **exactly as before the guard existed**. That is why the "at the API layer" qualifier above still stands. Be precise about how narrow the covered window is: the cookie is issued **only** at login (`app/api/auth/login/route.ts` is the single `signSession` call site — there is no refresh or sliding renewal), it expires after 12 hours, and `localStorage`'s `mock-user-session` **never** expires. So a terminal left signed in past 12 hours keeps a fully working UI while its cookie dies, and from that point every server-action write falls back to unguarded, with no error and no visible signal. The only signal is a **warn-once** `[branch-guard] <action> ran WITHOUT a branch guard` line in the server log (`resolveScopeForAction`, once per action per process, so a busy terminal is not flooded). The guard's real coverage is therefore *the first 12 hours after each interactive login*, which for a POS terminal that stays signed in for days is the exception rather than the rule. Giving the cookie a renewal is the first item of the 2d follow-up. **Put plainly: a hostile caller on the LAN can simply omit the cookie, so today the cookie protects the legitimate UI path rather than keeping an attacker out.** Failing closed would lock out every session predating the upgrade and break the E2E suite, so the fallback is intentional; removing it is a follow-up (2d) once deployed sessions have rotated and `tests/e2e/helpers/auth.ts` issues cookies everywhere. Also note the secret is persisted to `appRoot/.env` (the Electron `userData` branch is dead in a packaged build, because `main.js` spawns the Next server as a plain `node` child), so an install under Program Files may be unable to persist it and sessions would not survive a restart — degrading to the fallback, never crashing. `createProductsFromExcel` (`app/(app)/inventory/pricing/actions.ts`) has no guard of its own, but it creates products by calling the guarded `addProduct`, so it **is** guarded transitively whenever the cookie is present.

**Also still open (unguarded server-action writers, listed so they are not mistaken for covered):** `addSupplierMapping`, `updateSupplierMapping` and `deleteSupplierMapping` (`app/(app)/products/actions.ts`) are keyed by product or mapping id with no branch check. In particular `updateSupplierMapping(id, …, isPrimary = true)` can flip *another branch's* primary supplier — the same hole `setPrimarySupplier` closed. `migrateAdjustmentsToMovements` (`app/(app)/inventory/history/actions.ts`) is an unguarded `stock_movements` backfill; it takes no target, so its impact is low.

**Phase 3 made branch administration operable, and fixed a BIR blocker that predated the branch work.**

*Per-terminal reading numbers (migration 142).* `z_readings` and `x_readings` each carried a **global** `UNIQUE (reading_number)`, while `getNextZReadingNumber(terminalId)` / `getNextXReadingNumber(terminalId)` increment a **per-terminal** counter (`pos_terminals.z_counter` / `x_counter`) and the format `Z-YYYYMMDD-NNN` carries no terminal id. So two registers both reached counter 1 on the same day and the second terminal's Z-reading **failed on a duplicate key** — it could not close its day, which a BIR filing requires. This broke two-register single-branch stores, not just multi-branch ones. Migration 142 swaps both keys to `(terminal_id, reading_number)`, ADD-before-DROP (DDL implicitly commits, so ordering is the only guarantee), resolving the old index name from `INFORMATION_SCHEMA`. **No existing `reading_number` changes** — the fix is the constraint, never the format, because the number is on filed documents and has eight consumers including `lib/ejournal/*` and printed receipts. `down()` deliberately **throws** if cross-terminal duplicates exist by then; restoring a global unique key over duplicate data is not possible and must not be forced. `terminal_id` is nullable, and NULLs do not collide in a MySQL unique index, so legacy terminal-less rows stay unconstrained — but `app/api/sales/z-reading/route.ts` requires a specific `terminalId`, so no new row can be one.

*The Sta. Lucia claim had to move with it (migration 143).* `sta_lucia_submissions.z_reading_id` was the table's PRIMARY KEY holding the **bare** `reading_number`, and `send-z-reading.ts` also looked up `WHERE reading_number = ? LIMIT 1`. Once two terminals may legitimately share `Z-20261021-001`, terminal 2's claim INSERT collided and the sender read that as *"already submitted"* — so that register's sales were **silently never reported to the mall**, and mall rent is commonly a percentage of reported sales. Migration 142 alone would have converted a loud duplicate-key error into a silent revenue under-report. The claim is now keyed `(terminal_id, z_reading_id)`, and a `<terminalId>|<readingNumber>` ref carries that identity through `external_api_logs.transaction_id` for log keys, retries and the lookup — **because the claim table was not the only bare-number gate**: an `external_api_logs` fast path (`transaction_id` + `status <> 'success'`) would have reported "already submitted" before the claim was ever reached. A bare number shared by several terminals now returns a non-permanent "specify the terminal" error rather than guessing. `lib/integrations/sta-lucia/claims-schema.ts` holds one heal routine called by **both** the sender and migration 143 so they cannot drift; it is idempotent, safe under concurrent terminals (verified with 8 simultaneous heals), and a *failed* heal is not cached as done. If a claim or heal still throws, the sender writes a `failed` `external_api_logs` row — one the retry sweep's query (`transaction_type = 'STA_LUCIA_SALES' AND status IN ('pending','failed')`) actually matches, so the loss is recoverable rather than merely logged. **Still open and documented rather than engineered around:** the payload `id` remains the bare reading number, so if the mall's API dedupes on it, two terminals' same-numbered Z-readings may still collide on *their* side. We cannot see their semantics.

*Branch administration (`/settings/branches`).* `assertHeadOffice(uid)` in `lib/branch-context.ts` gates every branch-admin endpoint on the **`all_branches` grant alone** — deliberately not also requiring `users.branch_id IS NULL`, since a branch-assigned user holding the grant is a legitimate branch manager who also administers. `PATCH /api/branches/[id]` edits nine whitelisted fields (`code` is immutable) and toggles `is_active`; the previously **unauthenticated** `POST /api/branches` is now gated too. The editable list is a fixed constant and the loop iterates *that*, testing `field in body` — it never iterates body keys, so `is_main`, `id`, `created_at` and `__proto__` cannot be written by a crafted body. Edits to the BIR identity fields (`permit_no`, `min_number`, `serial_number`, `tin`, `business_name`) write a `user_activity_logs` row with the old and new values, and are **not** blocked once invoices exist — a typo in a permit number must be fixable, so it is audited rather than refused. **Deactivation is refused (409) while a branch has active warehouses, users or terminals**, naming the counts, because a row orphaned onto an inactive branch gets 403 from every branch-filtered route — the lockout migration 134 exists to prevent. The main branch can never be deactivated, and deactivation never touches `branch_number_series`, so reactivation cannot re-issue filed invoice numbers. `POST /api/branches/reassign` moves a warehouse, user or terminal; a user reassignment may never set `branch_id = NULL` nor touch grants, a move into a non-existent or inactive branch is refused, and a warehouse is refused while it has pending approvals, open shifts or open orders (the main branch's last warehouse may not leave at all). `POST /api/pos-terminals` now accepts a `branchId` — previously it hard-coded `mainBranchId()`, so a new branch could never have a terminal and therefore could never ring a sale or take a Z-reading. Omitting `branchId` keeps the old unauthenticated behaviour for existing callers; supplying one requires head office. **Note the asymmetry, which the reassign dialog states in copy:** a moved warehouse takes its stock and history, while past sales keep the branch that issued them (`sales_transactions.branch_id`, migrations 138-140), so a reassignment cannot retroactively move filed sales to another BIR establishment.

**Still open after Phase 3:** `POST /api/pos-terminals` without a `branchId` remains unauthenticated (it already was). Warehouse busy-detection is best-effort — `approval_queue` has no warehouse column, so the guard `JSON_SEARCH`es the payload, and two narrow payload shapes (a zero-variance stock count, which carries only the warehouse *name*, and an unapproved product-create) can under-count in the permissive direction. The branch reassign guard locks the branch and target rows but not the attached rows, so a concurrent assignment can land just after a count. The settings hub is not permission-gated, so a user without the grant can open the branches page — they see a 403 notice and every write, including the read used for counts, is refused server-side.

**Runtime id validation.** `assertProductInScope`, `assertWarehouseInBranch` and `assertTerminalInBranch` throw `BranchResolutionError` for any non-string or empty id, *before* the head-office early return. TypeScript types are erased and server-action arguments arrive off the wire; `lib/mysql.ts` uses `pool.query`, which escapes an **object** parameter as `` `key` = value ``, so `WHERE id = ?` with `{supplier_id: 0}` becomes a match-many predicate and a write keyed by that id would hit every row, in every branch, while the assert (which reads only `rows[0]`) passed. Do not weaken that check, and do not move to `pool.execute` without treating it as a repo-wide change. The three wrappers that resolve the session outside a `try` (`adjustStock`, `updateProductShelfLocations`, `submitPriceUpdateBatch`) now convert a `BranchResolutionError` into their own failure shape instead of throwing.

**Approvals workflow** — A multi-level queue pattern used for purchase orders, stock counts, stock transfers, bad orders, and bulk adjustments. Items are inserted with `status='pending'`, moved through approval levels, then finalized to update actual stock/accounts.

**POS (Point of Sale) — `/pos` route** — Fullscreen checkout UI. The Electron window is the primary deployment target. POS uses its own terminal/shift/cash-drawer management separate from the back-office UI. Checkout hits `POST /api/pos/checkout`.

**Cloud Sync** — Railway direct-MySQL sync. Not event-based: API routes call `cloudQuery()` in parallel after local write. Sync status tracked in `cloud_sync_log`. The `POST /api/cloud-sync/push` and `/pull` endpoints do full-table reconciliation.

**Printing** — ESC/POS via Windows Spooler. `lib/receipt-generator.ts` builds byte buffers using `@point-of-sale/receipt-printer-encoder`. Electron exposes `window.printerBridge` (from `main.js`/`preload.js`) to call the native Windows spooler DLL at `lib/sdk/`. Web builds fall back to `window.navigator.serial` (Web Serial API).

**Sta. Lucia Tenant System** — Z-reading sales are pushed to the mall's Sale Consolidator API from `lib/integrations/sta-lucia/`. Configured as a `provider = 'sta_lucia'` row in `external_apis`; reuses the external-API sync logs and retry queue, but `processSyncQueue` in `lib/scheduler.ts` gives `STA_LUCIA_SALES` its own query and `LIMIT` in the sweep (the legacy query excludes it), so a backlog of other sync rows can't starve its retries — only rows with `onErrorAction === 'retry'` are swept automatically (`'queue'` waits for a human via the Sync Logs tab, `'log_only'` never retries). The send fires detached after the Z-reading commits and can never fail it. Idempotency is enforced by an atomic claim row in `sta_lucia_submissions`, keyed **per terminal** `(terminal_id, z_reading_id)` since migration 143 (insert to claim, delete on failure, a claim left unfinished for 15 minutes is taken over) rather than just a log check — Philippine mall rent is commonly a percentage of reported sales, so a double submission double-reports revenue. **Delivery is nevertheless at-least-once, not exactly-once:** a crash after the send but before `succeeded = 1` is written, or a timeout on a request the mall actually processed, both leave a claim that the 15-minute stale takeover will re-send — closing those needs a MediaOne-side idempotency key we do not have, so the behaviour is documented (see the spec's Error handling section) rather than engineered around. `lib/integrations/sta-lucia/payload.ts` is a pure mapper and is where the credit/debit and discount-percentage decisions live. Local mocks at `/api/dev/mock-sta-lucia` make it testable without credentials. An hourly variant (`sale_type: true`, store-wide across all terminals, `lib/integrations/sta-lucia/send-hourly-sales.ts`) runs on a `:05`-past-the-hour cron and mirrors this same claim/retry/at-least-once pattern via its own `sta_lucia_hourly_submissions` table — **but is single-terminal-only**: `initScheduler()` runs once per process and this project runs one local server per physical terminal against a shared DB, so a multi-terminal store would run N racing hourly schedulers. Do not enable hourly submission on a multi-terminal store without adding a single-writer guard first (see `docs/superpowers/specs/2026-08-12-sta-lucia-hourly-sales-design.md`).

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
