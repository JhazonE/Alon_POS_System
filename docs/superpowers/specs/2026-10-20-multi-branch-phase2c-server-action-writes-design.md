# Phase 2c — Server-action write isolation

**Status:** design, awaiting approval
**Date:** 2026-10-20
**Predecessors:** Phase 1 (branch identity + read isolation), Phase 2a (per-branch BIR
numbering), Phase 2b (API write isolation)

---

## Intent and the why

Phase 2b isolated 12 API write routes so a branch-A user is *refused* (403) when a write
names a branch-B target. The headline claim in `CLAUDE.md` is deliberately scoped: writes
are isolated **at the API layer**.

There is a second write path that the guards never see. Next.js server actions
(`'use server'`) are invoked as RPC, not through `app/api/`, so none of
`resolveScopeFromBody` / `assertWarehouseInBranch` / `assertTerminalInBranch` runs. Ten
exported actions write `products`, `inventory_batches`, `stock_adjustments` or
`stock_movements` with no branch check at all.

For two of the 12 routes Phase 2b hardened — `PATCH /api/products/[id]` and
`POST /api/stock-adjustments` — **the server action, not the isolated route, is the path
the back-office UI actually takes.** So the most reassuring-sounding part of Phase 2b's
result does not describe how the application really writes.

This phase closes that path. It exists because the multi-branch work has collided with a
pre-existing architectural decision about authentication, and that collision has to be
resolved deliberately rather than papered over with a guard that cannot work.

### Why the Phase 2b pattern cannot simply be reused

The API guards are trustworthy because of one property: **the branch is derived
server-side from `users.branch_id`, and the client never asserts its own branch.** The
client supplies only a `uid`; the server decides what that uid means.

A server action has no request object. Its only identity is what the caller passes as an
argument. Today that argument comes from the browser:

```js
// app/(app)/inventory/stock-adjustment-dialog/use-stock-adjustment.ts:193
const userSession = localStorage.getItem('mock-user-session');
const userId = userSession ? JSON.parse(userSession).uid : 'system';
const parentResult = await adjustStock(product.id, adjustment, finalReason, userId, ...);
```

A server action is an ordinary HTTP POST, so `userId` is fully caller-controlled. Deriving
a branch from it would reproduce precisely the client-asserted-branch property that
Phases 1–2b were built to prevent: the guard would read like the API guards, pass the same
shape of test, and prove nothing. Four of the ten writers
(`updateProduct`, `updateProductPrice`, `updateProductStock`, `deleteProduct`) accept no
identity parameter whatsoever.

**Verified:** `next/headers` appears nowhere in this repository. There are no cookies and
no server-side session. `app/auth-actions.ts` exports only `handleSignOut`. The auth model
is `localStorage` + an explicit `uid` per API call, as `CLAUDE.md` describes.

Therefore a real fix requires a server-trusted identity, which does not exist yet. That is
the substance of this phase, and it is why it is not a small change.

### Exposure

Each terminal runs its own local Next server (per `CLAUDE.md`). `package.json` starts it
with `next dev --turbopack -p 3000` / `next start -p 3000` and **no `-H` flag**, so Next
binds `0.0.0.0` by default. Every terminal's server-action endpoint is therefore reachable
from any machine on the store LAN, not only from that terminal. With one shared central
database, a request to one terminal can write another branch's rows.

`updateProductStock` is the sharpest illustration — the entire function is:

```ts
export async function updateProductStock(id: string, newStock: number) {
  try {
    await query('UPDATE products SET stock = ? WHERE id = ?', [newStock, id]);
    return { success: true };
  } catch (error) { ... }
}
```

No identity, no branch, no warehouse. A product id and a number.

---

## The surface (verified on `main` @ `f061f81`)

Ten exported server actions write products or stock. The caller counts are live callers in
`app/` and `components/`; **a `'use server'` export is a reachable HTTP endpoint whether or
not the UI calls it**, so a zero-caller action is not safe — it is unobserved.

| # | Action | File:line | Writes | Live callers | Identity param |
|---|---|---|---|---|---|
| 1 | `addProduct` | `products/actions.ts:702` | `products`, `inventory_batches` | 4 | `userId = 'system'` |
| 2 | `updateProduct` | `products/actions.ts:905` | `products` | 1 | none |
| 3 | `deleteProduct` | `products/actions.ts:1118` | `products` (DELETE) | 1 | none |
| 4 | `updateProductPrice` | `products/actions.ts:1134` | `products` | 0 | none |
| 5 | `updateProductStock` | `products/actions.ts:1168` | `products.stock` | 0 | none |
| 6 | `updateProductShelfLocations` | `products/actions.ts:1178` | `products`, `stock_movements` | 2 | `userId = 'system'` |
| 7 | `setPrimarySupplier` | `products/actions.ts:1983` | `products.reorder_point` | 1 | none |
| 8 | `createStockAdjustment` | `inventory/history/actions.ts:104` | `stock_adjustments` | 0 | none |
| 9 | `adjustStock` | `inventory/history/actions.ts:217` | `stock_adjustments` (+ family sync) | 2 | `userId = 'system'` |
| 10 | `submitPriceUpdateBatch` | `inventory/pricing/actions.ts:33` | `products.price`, `products.cost` | 3 | n/a (batch) |

**Correction to carry into `CLAUDE.md`:** the current disclosure names nine. It omits
`setPrimarySupplier` (#7). The count is ten.

Read-only or out-of-scope, confirmed: `inventory/movement/actions.ts` (read-only),
`purchases/actions.ts` (read-only), `restock/actions.ts` (mock data, no SQL writes),
`suppliers/actions.ts` (supplier payments / credit memos — shared master data per
Phase 1 D8), `auth-actions.ts` (sign-out only), and the ~40 other `products/actions.ts`
exports (category / brand / warehouse / account / price-level master data).

---

## Goals

1. A write through any of the ten actions is **refused** when its target is outside the
   caller's branch — the same "assert, don't re-scope" rule Phase 2b established.
2. The branch is **derived from server-trusted state.** No branch decision may rest on a
   value the caller supplied.
3. Head office (`users.branch_id` NULL + `all_branches`) keeps writing across branches.
4. The UI's own write path becomes branch-guarded, and whatever hole remains is stated
   explicitly in `CLAUDE.md` rather than implied to be closed. See the fallback decision
   below: because a missing cookie degrades to today's behaviour, this phase does **not**
   earn the right to drop the "at the API layer" qualifier. A follow-up (2d) removes the
   fallback and earns it.

## Non-goals

- Replacing the whole auth model. This phase introduces a server-trusted session only to
  the extent the ten actions need; migrating all 150+ API routes off the explicit-`uid`
  convention is out of scope.
- The master-data actions (suppliers, categories, brands, accounts, price levels), which
  are shared company-wide by design (Phase 1 D8).
- The remaining Phase 2b "still open" set: ~6 admin/dev utility writes,
  `app/api/approvals/queue`, `app/api/reports/soa`.
- Phases 3–5 (scheduler lease, inter-branch transfers, branch management UI).

## Anti-goals

Things that would make this a failure even if it ships and the tests pass:

- **A guard that derives the branch from a caller-supplied `userId`.** This is the central
  trap. It would look like the API guards, pass a server-contract test, and provide no
  isolation. If the chosen approach cannot avoid this, the phase should stop and say so
  rather than ship a guard that only appears to work.
- **Binding the fix to `localStorage`.** Anything the browser can edit is not an identity.
- A `'use server'` export left reachable but unguarded because the UI no longer calls it.
- Breaking the approval workflow, which calls `adjustStock` server-to-server
  (`app/api/approvals/process/route.ts:127`) where no user session exists.

---

## Constraints

- MySQL 8 only; raw parameterised SQL via `query()` / `withTransaction()`. No ORM.
- Reuse `lib/branch-context.ts`. Its contract is settled and must not be re-litigated:
  `null` = head office = no filter; `[]` = branch with no warehouses = match nothing;
  a cross-branch target is a 403, never a silent ignore.
- E2E `workers: 1`. Cebuano test descriptions, English code.
- BIR numbering is legally significant. Nothing here may consume an invoice number on a
  path that then refuses — Phase 2b verified no site does this, and that must hold.
- `npm run lint` is broken repo-wide on Next 16 and is waived.
  `npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"` must stay empty.
- Must not regress the 297-passing suite. The 23 known failures are pre-existing and
  attributed (15 are the `Retail (₱)` product-form family, whose four rendering files this
  work must not touch).
- Commits authored as JhazonE, no Claude attribution trailer.

---

## The approach — decided

Two pieces, in order. The first is a prerequisite for the second; the second is the point.

### Piece 1 — a server-trusted session

Introduce a signed, HTTP-only session cookie set at login, readable by server actions via
`next/headers`, carrying the `uid` only. The branch is still looked up from
`users.branch_id` on each call — the cookie establishes *who*, never *which branch*, so
the Phase 1 property ("server-derived branch, no client assertion") is preserved exactly.

- Signed with an existing server secret so a client cannot mint one.
- HTTP-only, so page JavaScript — and anything injected into it — cannot read or forge it.
- Set alongside the current `localStorage` session rather than replacing it, so the 150+
  API routes reading `uid` from the body keep working unchanged. This phase adds a
  trustworthy path; it does not migrate the existing one.
- Resolution helper lives next to the existing ones in `lib/branch-context.ts`
  (`resolveScopeFromSession()`), so all branch resolution stays in one file.

**This is the piece that carries risk**, because it touches login. It must be additive:
if the cookie is absent, nothing that works today may break.

### Piece 2 — guard the ten actions

With a trustworthy identity available, apply the Phase 2b pattern to each action:
resolve the scope from the session, assert the target is in that branch, refuse otherwise.

- Targets are product ids, so the assertion resolves the product's `warehouse_id` and
  reuses `assertWarehouseInBranch`. `inventory_batches` scopes through its product, as
  Phase 1 established.
- Server actions return values rather than HTTP responses, so they return a
  `{ success: false, error }` shape consistent with each action's existing contract, while
  a `BranchResolutionError` maps to a refusal rather than a thrown 500.
- **The internal (approval-finalization) path — decided.** This is wider than
  `adjustStock`. `app/api/approvals/process/route.ts` finalizes through **four** of the ten
  actions — `adjustStock` (:127), `updateProductShelfLocations` (:135), `addProduct` (:143)
  and `submitPriceUpdateBatch` (:146) — each with `isInternalFinalization = true`.

  That flag cannot be the bypass, because a caller can set it. But the processor already
  passes `item.created_by`, and **`created_by` is read from the queue row in the database,
  not from the request** — so it is server-derived and trustworthy, exactly like a session
  uid.

  Decision: the internal path resolves its branch from the **queued item's `created_by`**,
  not from the session and not from the flag. A guarded action therefore accepts a branch
  scope resolved by its caller (session for UI, `created_by` for finalization) rather than
  resolving one itself. The flag stops being a trust boundary and becomes what its name
  says: a marker that this is a finalization, not a fresh request.

  Consequence, accepted: a head-office approver finalizing a branch-A item writes into
  branch A. That is correct — the write belongs to the branch that requested it, not to the
  approver. It also means the approver's own branch is deliberately *not* asserted here.

  `app/api/approvals/process/route.ts` has no branch guard of its own and stays in the
  Phase 2b "still open" set; this phase does not add one. Guarding the four actions it
  calls is what prevents it from being a write-anywhere bypass. Note the queue-time path:
  items are *queued* through already-guarded API routes, so the branch check happens at
  submission; finalization re-asserts via `created_by`.
- The three dormant actions (#4, #5, #8) get guarded or deleted. Deleting is better where
  nothing calls them: it removes the endpoint instead of defending it. Recommend deleting
  `updateProductStock`, `updateProductPrice`, `createStockAdjustment` and noting it in
  `CLAUDE.md`, subject to confirming nothing outside `app/`/`components/` imports them.

### Rejected alternatives

- **Derive the branch from the passed `userId`.** Rejected: client-asserted, per the
  anti-goal. This is the approach that most resembles Phase 2b and is the one to avoid.
- **Convert all ten actions into API routes.** Rejected for this phase: it rewrites every
  calling component, is a much larger diff, and still needs a trustworthy identity, so it
  does not avoid Piece 1.
- **Bind the Next server to localhost (`-H 127.0.0.1`).** Rejected as the fix — it reduces
  exposure but leaves the terminal's own browser able to write any branch, and the shared
  database means a single compromised terminal still reaches every branch. Worth doing
  anyway as defence in depth; tracked separately, not as this phase's isolation mechanism.

---

## Decisions made after the builder check

These were raised by a reviewer reading the document as the implementer. Recorded as my
calls, not as agreed requirements.

**Missing cookie: fall back, do not fail closed.** The cookie is additive. When it is
absent, a guarded action falls back to the branch scope its caller supplies (the existing
`userId` argument) and behaves exactly as today — unguarded. Rationale: failing closed
would lock out every user already logged in before the upgrade (they hold a `localStorage`
session and no cookie) and would break the E2E suite wholesale, since
`tests/e2e/helpers/auth.ts` mocks `/api/auth/login` and sets only `localStorage`, so no
test ever receives a cookie.

The honest consequence, which must be written into `CLAUDE.md` rather than glossed: **with
the fallback in place, the isolation is real only for sessions that have the cookie.** It
raises the floor (the UI's own path becomes guarded once users re-login) without closing
the path against a caller who simply omits the cookie. Phase 2c therefore does **not** earn
the right to drop the "at the API layer" qualifier from `CLAUDE.md` unless the fallback is
later removed. Goal 4 is restated accordingly: this phase guards the UI path and makes the
remaining hole explicit and small, and a follow-up (2d) removes the fallback once the E2E
helper issues cookies and deployed sessions have rotated. Shipping the fallback silently as
"isolated" would be the anti-goal above.

`handleSignOut` must clear the cookie. Cookie lifetime matches the current session
expectation; the builder picks the value.

**Signing secret: generated and persisted per terminal, fail-closed-to-fallback if
absent.** There is no session secret in `.env` today (`LICENSE_ADMIN_SECRET` belongs to the
separate license-server repo and is not reusable here). The builder generates a secret on
first run and persists it outside the repo (Electron user-data directory, or an `.env`
entry for web/dev). A per-terminal secret means a cookie is valid only on the terminal that
issued it, which is correct for this deployment: each terminal runs its own server. If the
secret is missing, the server must not refuse to start — it degrades to the no-cookie
fallback above and logs once.

**Multi-target actions: all-or-nothing.** If any target of a batch is outside the caller's
branch, the whole batch is refused and nothing is written. Partial application would leave
a half-done price update with no record of what was skipped. Applies to
`submitPriceUpdateBatch` and `updateProductShelfLocations`.

**Family sync: assert the target product only.** `adjustStock` recursively writes family
members via `lib/family-sync.ts`. Requiring every member to be in-branch would refuse
legitimate adjustments, and Phase 2b already investigated and recorded that zero
cross-warehouse family links exist in practice. If one is ever created, the recursive write
can cross a branch; that is a known, recorded limitation, not a silent one.

**NULL `warehouse_id`: refuse for a branch user, allow for head office.** A product with no
warehouse belongs to no branch, so a branch-scoped user cannot assert it is theirs. Note
`updateProduct` can *set* `warehouse_id` to NULL (`products/actions.ts:924`), which is the
one-way-door shape Phase 2b recorded for orders — so the guard asserts **both** the
existing and the incoming `warehouse_id` on update, preventing a branch user from
detaching a product from branch scope.

**Head office in server actions: scope `'all'`, no `viewBranchId`.**
`resolveScopeFromSession()` takes no `viewBranchId`, so a user with `all_branches` always
resolves to scope `'all'` and may write any branch. `viewBranchId` is a read-side
view-switch concern; accepting it on a write path would add a caller-supplied input to a
branch decision for no benefit.

## Left to the builder

- Cookie mechanics: name, signing primitive (an existing helper such as
  `lib/crypto/aes-gcm.ts` or the licensing HMAC may suit), expiry, and the exact login
  touch-point.
- Whether `resolveScopeFromSession()` wraps or composes with `resolveScopeFromBody()`.
- The internal-call mechanism for `adjustStock` that a browser cannot assert.
- Per-action error shapes, matching each action's current return contract.
- Task decomposition and ordering, with red-first verification per task: prove the
  cross-branch write **succeeds** before the guard, and is refused after. A guard added
  without first observing the unguarded write proves nothing.

## Verification that matters

Phase 2b's own history says a server-contract test passes while the real UI path is broken,
so:

- For each guarded action, a test that a branch-A caller writing a branch-B product is
  refused **and the row is verified unchanged in the database** — not status alone. (The
  Phase 2b review flagged exactly this gap; four tests were hardened in `f061f81`.)
- At least one test proving the guard rests on the session and not on a passed `userId`:
  a caller passing another branch's `userId` must still be refused.
- The approval workflow's server-to-server `adjustStock` path must keep working.
- Full suite as the phase gate, with any new failure attributed before merge.
