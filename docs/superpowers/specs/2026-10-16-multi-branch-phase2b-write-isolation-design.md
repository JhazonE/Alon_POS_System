# Multi-Branch Phase 2b — Write-Path Branch Isolation

**Date:** 2026-10-16
**Status:** Awaiting review
**Builds on:** [Phase 2a — per-branch BIR numbering](2026-10-14-multi-branch-phase2a-numbering-design.md)
**Parent design:** [2026-10-12-multi-branch-design.md](2026-10-12-multi-branch-design.md)

## Problem

Phase 1 isolated **reads** — 21 GET routes filter by the caller's branch. Phase
2a gave each BIR-registered branch its own invoice series. Neither touched
**writes**, so today a crafted request can still reach another branch's data:
adjust its stock, void its invoice, deliver its sales order, or file its
Z-reading.

That is the headline limitation recorded in `CLAUDE.md` and in Phase 2a's
"Known limitations", and it is why a second branch should not go live with
real staff yet.

## What the audit actually found

My Phase 2a spec said "the 29 write routes". An audit on 2026-10-16 found the
real shape is different and smaller:

| Category | Count | In scope? |
|---|---|---|
| Unisolated write routes touching core tables | 26 | — |
| **Of those, routes that write `products.stock` / `inventory_batches`** | **3** | **Yes — the actual stock hole** |
| Sale / invoice / order / Z-reading document writes | 8 | Yes — BIR and financial documents |
| **Master data** (sales-persons, sales-groups, sales-areas, payment-methods, shelf-locations, customers, customer-payments) | **9** | **No — see D2** |
| Admin / dev utilities (warehouses, send-products, others) | ~6 | No — deferred |

So the gap is real but narrow: **12 routes, 13 write handlers**.

## Decisions

Confirmed with the product owner (2026-10-16):

- **D1 — Scope is stock writes plus BIR/sale-document writes.** Twelve routes.
  Admin and dev utilities are deferred.
- **D2 — The 9 master-data routes are deliberately NOT isolated.** Phase 1's
  D8 made suppliers, customers, categories, brands, accounts and lookups
  company-wide. Isolating them would contradict that decision and break
  shared records, so they stay shared.
- **D3 — Assert ownership; do not re-scope queries.** A write names a
  warehouse, terminal or record, so the server rejects it when it belongs to
  another branch. This reuses Phase 1/2a primitives rather than rewriting SQL.
- **D4 — The five routes with no branch-deriving input start requiring
  `uid`**, resolving the branch from `users.branch_id` exactly as the 21 read
  routes do. This is a breaking contract change, accepted for consistency.
- **D5 — Each route's clients are wired in the same task as the route.**
  Phase 1 filtered an API without wiring its clients and 403'd its own UI;
  that must not recur.
- **D6 — The bulk product importer resolves the importing user's branch
  warehouse** instead of the global default. It accepts no warehouse
  parameter, so there is nothing to assert — correctness comes from deriving
  the destination from the actor.
- **D7 — `app/api/pos-transactions/route.ts` is fixed in this phase.** The
  Phase 2a whole-branch review flagged that it derives the row's branch from
  `terminalId` rather than from the referenced sale.

## Architecture

### 1. The pattern: assert, don't re-scope

Reads needed *filtering* — rewriting queries so only the caller's branch
returns. Writes are the opposite shape: the caller already names the target,
so the server only has to refuse it.

```typescript
const body = await request.json();

let scope;
try {
  // Writes POST a JSON body, so the uid arrives in the body, not the query
  // string — hence resolveScopeFromRequest's second parameter.
  scope = await resolveScopeFromRequest(new URLSearchParams(), body.uid);
  if (body.warehouseId) await assertWarehouseInBranch(body.warehouseId, scope);
  if (body.terminalId)  await assertTerminalInBranch(body.terminalId, scope);
} catch (error) {
  const mapped = branchErrorResponse(error);
  if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
  throw error;
}
```

Every primitive already exists and is already in production use:

| Primitive | Added | Already used at |
|---|---|---|
| `resolveScopeFromRequest` | Phase 1 | the 21 filtered read routes |
| `assertWarehouseInBranch` | Phase 1 | product-level read routes |
| `assertTerminalInBranch` | Phase 1 | `pos/recent-sales`, `sales/ejournal`, `sales/overall-reading` |
| `branchErrorResponse` | Phase 1 | every filtered route |
| `appendSessionUid` | Phase 2a | the report page clients |

Head office (`scope: 'all'`) passes every assertion by design —
`assertWarehouseInBranch` and `assertTerminalInBranch` both return early for
it.

**Rejected alternative — derive the branch from the record being written**
(an invoice's sale, an order's warehouse). It needs no contract change and no
client wiring, but it only validates *consistency*: a caller who can name a
branch-B record still writes to branch B. That is not isolation, so it fails
the phase's purpose.

**Rejected alternative — a shared middleware wrapper.** Tempting for 13
handlers, but each route derives its branch from a different input and
validates a different resource. The wrapper would need so much per-route
configuration that it would read worse than five explicit lines.

### 2. The twelve routes, by derivation group

**Group A — terminal-derived (1 route).** Carries `terminalId` in its body
destructure; needs an ownership assertion only.

| Route | Handler | Note |
|---|---|---|
| `app/api/sales/z-reading` | POST | Threads `terminalId` through 33 references and uses the per-terminal Z counter. A BIR filing, so the highest-stakes route here — but the lightest change, since terminal scoping already exists. |

**Group B — warehouse-derived (2 routes).** The POST handler destructures a
warehouse from its own body, so it needs an ownership assertion only.

| Route | Handler | Evidence (POST handler, verified 2026-10-16) |
|---|---|---|
| `app/api/inventory/adjust/bulk` | POST | `warehouseId` and `targetWarehouseId` in the destructure; also `userId`. A transfer must assert **both** warehouses. |
| `app/api/sales/orders` | POST | field is **`warehouse`**, not `warehouseId` (line 258, written at 327) |

**Group B2 — user-id derived (1 route).** Carries a user id but no
warehouse or terminal.

| Route | Handler | Evidence |
|---|---|---|
| `app/api/pos/void-transaction` | POST | destructures `saleId, voidReason, voidedByUserId, voidedByName` — resolve the branch from `voidedByUserId`, and prefer the voided sale's own `branch_id` where it disagrees |

**Group C — no branch input (6 routes / 7 handlers).** Verified to destructure
no warehouse, terminal or user id. These start requiring `uid` (D4).

| Route | Handler |
|---|---|
| `app/api/products/[id]` | PATCH |
| `app/api/sales/invoices` | POST |
| `app/api/sales/invoices/[id]/void` | POST |
| `app/api/sales/orders/[id]/deliver` | POST |
| `app/api/stock-adjustments` | POST |
| `app/api/sales/orders/[id]` | PUT, DELETE |

**Group E — repository-backed (1 route).** `app/api/sales` POST delegates
entirely to `CreateSaleUseCase` (`src/core/sales/application/CreateSaleUseCase`)
and destructures nothing itself. Like Phase 1's products route, the branch
must be threaded through the use case rather than asserted in the handler, so
it needs its own task and its own judgment — do not paste the five-line
pattern here.

**This table was wrong twice before it was right. Keep that in mind.**

- Draft 1 grouped routes from a plain `grep` for `warehouseId|terminal_id`.
  That put `sales`, `sales/orders/[id]` and `pos/void-transaction` in the
  wrong groups: `sales` matched only in a GET query, `sales/orders/[id]` only
  in an UPDATE's column list, and `pos/void-transaction`'s matches were not
  in its destructure at all.
- Draft 2 read the *first* `const {` in each file — which in a multi-handler
  route is the **GET** handler, not the POST. That misread `z-reading` and
  `sales/orders`.
- The table above comes from reading each **write handler's own** destructure,
  located by its `export async function POST|PUT|DELETE|PATCH` line.

**Implementation must still re-confirm its own route's real input** and report
any disagreement rather than trusting this table. Two concrete traps it
already caught: `sales/orders` uses `warehouse`, not `warehouseId`; and
`z-reading`'s POST already rejects `terminalId === 'all'`, so that validation
exists and must not be duplicated.

**Group D — special case (1 route).** `app/api/data-management/import/products`
POST; see §3.

### 3. The bulk importer (D6)

This route accepts `rows` and resolves its destination **server-side**:

```sql
SELECT id FROM warehouses
WHERE is_active = 1
ORDER BY is_main DESC, (id = 'wh_main') DESC, created_at ASC
LIMIT 1
```

`getDefaultWarehouseId()` is global, so a branch user's import lands in
whatever warehouse sorts first company-wide. There is no caller-supplied
warehouse to assert.

The fix: require `uid`, resolve the user's branch, and scope that query to the
branch — `WHERE is_active = 1 AND branch_id = ?` with the same ordering. Head
office keeps today's global behaviour. This is correct by construction: there
is no cross-branch write to reject, because the destination is derived from
the actor.

The existing "returns null if none exist so the import still succeeds
(products just stay unassigned)" behaviour must be reconsidered — with
`products.warehouse_id` still nullable that is survivable, but a branch user
whose branch has no active warehouse should get a clear error rather than a
silent unassigned import. The implementation decides and documents which.

### 4. The `pos-transactions` attribution fix (D7)

`app/api/pos-transactions/route.ts:182-184` currently reads:

```typescript
const txnBranchId: string = terminalId
  ? (await resolveTerminalBranch(terminalId)).branchId
  : await mainBranchId();
```

A client posting `{ saleId: <branch-A sale>, terminalId: <branch-B terminal> }`
writes a row stamped B against a sale stamped A. No invoice number is issued
on this path, so there is no numbering consequence — it is a reporting
attribution divergence. The fix mirrors `app/api/sales/returns/route.ts`:
prefer the referenced sale's own `branch_id`, falling back to the terminal,
then to the main branch.

### 5. Client wiring (D5)

Seven client files call the Group B/C routes and none is uid-aware yet:

| Route | Client files |
|---|---|
| `sales/invoices` | `sales/invoices/use-invoices-query.ts` |
| `sales/orders` | `sales/manage-warehouses/WarehouseRow.tsx`, `sales/orders/add-order/use-add-order-form.ts`, `sales/orders/add-order/use-sales-order-by-id.ts`, `sales/orders/use-orders-query.ts` |
| `sales/z-reading` | `pos/z-reading-report/ZReadingDialog.tsx`, `sales/z-reading/use-z-reading-page.tsx` |

Each needs the uid in its request — `appendSessionUid(params)` for query
strings, or `uid: getSessionUid()` in a JSON body. Both come from
`lib/session-uid.ts`, added in Phase 2a.

`products/[id]`, `stock-adjustments`, `inventory/adjust/bulk` and
`pos/void-transaction` showed no matching client file in the audit. Each task
re-runs the search for its own route and reports what it finds; a route whose
clients cannot be found must be reported, never silently left to 403.

## Testing

E2E stays `workers: 1`.

- **Cross-branch write → 403**, once per derivation group (terminal,
  warehouse, uid).
- **Head office writes to any branch** — guards against over-blocking.
- **Same-branch write still succeeds** — the regression that matters most,
  since an over-eager assertion breaks normal operation.
- **A Z-reading for another branch's terminal → 403**, called out separately
  because it is a BIR filing.
- **The importer lands products in the importing user's branch warehouse**,
  and head office keeps its existing behaviour.
- **`pos-transactions` stamps the referenced sale's branch**, not the
  terminal's, when the two differ.
- **A page-level test that the clients actually send the uid.** Phase 2a's
  reviewer correctly observed that a server-contract test would still pass if
  a client lost its `appendSessionUid` call. `tests/e2e/helpers/auth.ts`
  exports `seedSession()`, which sets `mock-user-session` via
  `addInitScript`, so this is cheap.

## Known limitations after 2b

- **`app/api/approvals/queue` and `app/api/reports/soa`** still read across
  branches. `approval_queue` has no branch column (scheduled for Phase 4 with
  the approval write path), and a Statement of Account's running balance is
  only correct over a customer's whole ledger — a branch cut would display
  **wrong balances**, which is worse than the read leak.
- **The 9 master-data routes stay shared**, by D2 and Phase 1's D8.
- **~6 admin/dev utility write routes stay unisolated** (warehouses,
  send-products and similar). Lower risk than stock and documents, and several
  are head-office tools by nature.
- **Identity remains forgeable** until the API authentication phase. This
  phase bounds the damage to "a forged identity writes within *its own*
  branch"; it does not make the identity trustworthy.
- **No offline resilience** — unchanged from the parent design's D1.
