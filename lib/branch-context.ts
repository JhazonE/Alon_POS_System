import { cookies } from 'next/headers';
import { query } from './mysql';
import { SESSION_COOKIE_NAME, verifySession, sessionSecret } from './session-cookie';

/**
 * Server-side branch resolution.
 *
 * The client never asserts its own branch. A POS request names a terminal;
 * the branch comes from that terminal's row. A back-office request names a
 * user; the branch is re-read from users.branch_id on every request.
 *
 * LIMITATION — terminal identity is not yet unforgeable. clientIpFrom()
 * reads x-forwarded-for / x-real-ip, which a LAN client can set freely, and
 * the POS also keeps a `pos_terminal_id` value in localStorage. So a caller
 * can choose *which registered terminal* it claims to be. What it cannot do
 * is invent a branch or reach an unregistered one, because the branch is
 * looked up from the terminal row rather than taken from the request.
 * Making identity unforgeable is the API authentication phase's job; see
 * docs/superpowers/specs/2026-10-05-api-authentication-design.md.
 *
 * Every failure here is fail-closed and surfaces as 403, never a silent
 * fallback to the main branch.
 */

export type BranchScope =
  | { branchId: string; scope: 'single' }
  | { branchId: null; scope: 'all' };

export class BranchResolutionError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = 'BranchResolutionError';
    this.status = status;
  }
}

/**
 * Best-effort client IP. Kept separate from branch resolution on purpose:
 * it informs terminal auto-matching in the UI but is never the source of
 * truth for a branch.
 */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

export async function resolveTerminalBranch(
  terminalId: string
): Promise<Extract<BranchScope, { scope: 'single' }>> {
  if (!terminalId) {
    throw new BranchResolutionError('Unknown terminal: no terminal id supplied');
  }

  const rows = (await query(
    `SELECT t.branch_id AS branchId, b.is_active AS branchActive
     FROM pos_terminals t
     LEFT JOIN branches b ON b.id = t.branch_id
     WHERE t.id = ?`,
    [terminalId]
  )) as any[];

  if (rows.length === 0) {
    throw new BranchResolutionError(`Unknown terminal: ${terminalId}`);
  }

  const { branchId, branchActive } = rows[0];

  if (!branchId) {
    throw new BranchResolutionError(
      `Terminal ${terminalId} is not assigned to a branch`
    );
  }
  if (!branchActive) {
    throw new BranchResolutionError(
      `Terminal ${terminalId} belongs to an inactive branch`
    );
  }

  return { branchId, scope: 'single' };
}

export const ALL_BRANCHES_PERMISSION = 'all_branches';

/**
 * Resolve a back-office request's branch from the database, keyed by uid.
 *
 * users.branch_id is re-read on every call rather than trusted from the
 * session, so a tampered localStorage session cannot change which branch an
 * identity belongs to.
 *
 * A viewBranchId from a user without all_branches is rejected outright. It
 * is deliberately not downgraded to the user's own branch: a silent
 * downgrade hides a privilege probe that an operator should see.
 */
export async function resolveUserBranch(
  uid: string,
  viewBranchId?: string | null
): Promise<BranchScope> {
  if (!uid) {
    throw new BranchResolutionError('Unknown user: no uid supplied');
  }

  const rows = (await query(
    `SELECT u.branch_id AS branchId,
            b.is_active AS branchActive,
            EXISTS (
              SELECT 1 FROM user_permissions p
              WHERE p.user_uid = u.uid AND p.permission = ?
            ) AS allBranches
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.uid = ?`,
    [ALL_BRANCHES_PERMISSION, uid]
  )) as any[];

  if (rows.length === 0) {
    throw new BranchResolutionError(`Unknown user: ${uid}`);
  }

  const { branchId, branchActive } = rows[0];
  const allBranches = Number(rows[0].allBranches) === 1;

  if (viewBranchId) {
    if (!allBranches) {
      throw new BranchResolutionError(
        `User ${uid} is not permitted to view other branches`
      );
    }
    const target = (await query(
      `SELECT is_active AS isActive FROM branches WHERE id = ?`,
      [viewBranchId]
    )) as any[];
    if (target.length === 0) {
      throw new BranchResolutionError(`Unknown branch: ${viewBranchId}`);
    }
    if (!target[0].isActive) {
      throw new BranchResolutionError(`Branch ${viewBranchId} is inactive`);
    }
    return { branchId: viewBranchId, scope: 'single' };
  }

  if (!branchId) {
    if (allBranches) {
      return { branchId: null, scope: 'all' };
    }
    throw new BranchResolutionError(`User ${uid} is not assigned to a branch`);
  }

  if (!branchActive) {
    throw new BranchResolutionError(
      `User ${uid} belongs to an inactive branch`
    );
  }

  return { branchId, scope: 'single' };
}

/**
 * Reject a warehouse that does not belong to the resolved branch.
 *
 * Existence is not enough: a valid, active warehouse in another branch must
 * be refused. This is the check that stops a crafted request carrying
 * someone else's warehouse_id from reaching their stock.
 */
export async function assertWarehouseInBranch(
  warehouseId: string,
  scope: BranchScope
): Promise<void> {
  if (scope.scope === 'all') return;

  const rows = (await query(
    `SELECT branch_id AS branchId FROM warehouses WHERE id = ?`,
    [warehouseId]
  )) as any[];

  if (rows.length === 0) {
    throw new BranchResolutionError(`Unknown warehouse: ${warehouseId}`);
  }
  if (rows[0].branchId !== scope.branchId) {
    throw new BranchResolutionError(
      `Warehouse ${warehouseId} does not belong to branch ${scope.branchId}`
    );
  }
}

/**
 * The warehouse ids a scope may read.
 *
 * Returns null for head office, meaning "apply no warehouse filter". Callers
 * must treat null as no-filter rather than as an empty set — an empty array
 * would silently hide every row.
 *
 * An empty array means the opposite: a branch that owns no warehouses, which
 * must match NOTHING. Callers return an empty result rather than running an
 * unfiltered query. Collapsing the two cases either hides every row (null
 * read as empty) or exposes every branch (empty read as null).
 */
export async function warehouseIdsForBranch(
  scope: BranchScope
): Promise<string[] | null> {
  if (scope.scope === 'all') return null;

  const rows = (await query(
    `SELECT id FROM warehouses WHERE branch_id = ?`,
    [scope.branchId]
  )) as any[];

  return rows.map((r) => r.id);
}

/**
 * The id of the main branch (`branches.is_main = 1`).
 *
 * This is the DEFAULT for rows created before Phase 5's branch picker exists:
 * a new warehouse or terminal with no caller-supplied branch lands in the main
 * branch, which reproduces the pre-multi-branch single-store behaviour.
 *
 * It is NOT an authorization decision. A caller that has a resolved
 * BranchScope must pass that branch instead of calling this.
 *
 * Throws BranchResolutionError when no main branch exists, so callers can
 * never insert a NULL or '' branch_id.
 */
export async function mainBranchId(): Promise<string> {
  const rows = (await query(
    'SELECT id FROM branches WHERE is_main = 1 LIMIT 1'
  )) as any[];
  if (rows.length === 0 || !rows[0].id) {
    throw new BranchResolutionError('No main branch is configured', 500);
  }
  return rows[0].id as string;
}

/**
 * Resolve a back-office request's scope from its query string or body.
 *
 * Centralised so every route reads the same two parameters the same way,
 * and so the uid-from-request weakness has exactly one place to be fixed
 * when API authentication lands.
 */
export async function resolveScopeFromRequest(
  params: URLSearchParams,
  bodyUid?: string
): Promise<BranchScope> {
  const uid = params.get('uid') || bodyUid || '';
  const viewBranchId = params.get('viewBranchId');
  return resolveUserBranch(uid, viewBranchId);
}

/** Map a BranchResolutionError to its JSON response shape. */
export function branchErrorResponse(error: unknown): {
  body: { success: false; error: string };
  status: number;
} | null {
  if (error instanceof BranchResolutionError) {
    return { body: { success: false, error: error.message }, status: error.status };
  }
  return null;
}

/**
 * A SQL predicate limiting a terminal column to the resolved branch.
 *
 * sales_transactions / pos_transactions carry no warehouse column, so a sale
 * belongs to a branch through the terminal that rang it
 * (pos_terminals.branch_id). Returns null for head office, meaning "apply no
 * filter" (same convention as warehouseIdsForBranch).
 *
 * Unlike a warehouse id list this needs no empty-array special case: a branch
 * with no terminals makes the subquery empty, so the predicate matches
 * nothing. A NULL terminal_id is never IN the subquery, so a sale with no
 * terminal belongs to no branch and is visible to head office only.
 *
 * `terminalColumn` must be a fixed column expression written in route code
 * (e.g. 'pt.terminal_id'), never request input.
 */
export function terminalBranchFilter(
  scope: BranchScope,
  terminalColumn: string
): { sql: string; params: string[] } | null {
  if (scope.scope === 'all') return null;
  return {
    sql: `${terminalColumn} IN (SELECT id FROM pos_terminals WHERE branch_id = ?)`,
    params: [scope.branchId],
  };
}

/**
 * Like terminalBranchFilter, for queries over sales_transactions that do not
 * already join pos_transactions: matches a sale when the terminal that rang
 * it belongs to the resolved branch. `saleIdColumn` is a fixed column
 * expression (e.g. 'st.id').
 */
export function saleBranchFilter(
  scope: BranchScope,
  saleIdColumn: string
): { sql: string; params: string[] } | null {
  const terminal = terminalBranchFilter(scope, 'bpt.terminal_id');
  if (!terminal) return null;
  return {
    sql: `EXISTS (SELECT 1 FROM pos_transactions bpt WHERE bpt.sale_id = ${saleIdColumn} AND ${terminal.sql})`,
    params: terminal.params,
  };
}

/**
 * Reject a terminal that does not belong to the resolved branch.
 *
 * The terminal counterpart of assertWarehouseInBranch: a valid terminal in
 * another branch must be refused, not just an unknown one, so a crafted
 * terminalId cannot read another establishment's readings.
 */
export async function assertTerminalInBranch(
  terminalId: string,
  scope: BranchScope
): Promise<void> {
  if (scope.scope === 'all') return;

  const rows = (await query(
    `SELECT branch_id AS branchId FROM pos_terminals WHERE id = ?`,
    [terminalId]
  )) as any[];

  if (rows.length === 0) {
    throw new BranchResolutionError(`Unknown terminal: ${terminalId}`);
  }
  if (rows[0].branchId !== scope.branchId) {
    throw new BranchResolutionError(
      `Terminal ${terminalId} does not belong to branch ${scope.branchId}`
    );
  }
}

/**
 * Resolve a write request's scope from its JSON body.
 *
 * The body-oriented sibling of resolveScopeFromRequest: writes POST JSON, so
 * the uid arrives in the body rather than the query string. Same guarantees —
 * the branch is re-read from users.branch_id by uid and never taken from a
 * branch the caller claims, and a viewBranchId without the all_branches
 * permission is refused rather than silently downgraded.
 *
 * A missing, empty or non-string uid is refused ("no uid supplied"). JSON
 * bodies can carry a number or array here, and MySQL would coerce a numeric
 * uid into a match against a uid that merely starts with that digit, so a
 * non-string uid must never reach the query.
 *
 * viewBranchId follows one rule: absent means absent, and a non-string is
 * refused. undefined and null are genuine absence. Any other non-string
 * (number, boolean, array, object) throws rather than being treated as
 * absent, because treating it as absent would widen a head-office caller's
 * request to scope 'all' instead of refusing it.
 */
export async function resolveScopeFromBody(
  body: { uid?: string; viewBranchId?: string | null }
): Promise<BranchScope> {
  const uid = typeof body?.uid === 'string' ? body.uid : '';
  let viewBranchId: string | null = null;
  if (body?.viewBranchId !== undefined && body?.viewBranchId !== null) {
    if (typeof body.viewBranchId !== 'string') {
      throw new BranchResolutionError('Invalid viewBranchId: expected a string');
    }
    viewBranchId = body.viewBranchId;
  }
  return resolveUserBranch(uid, viewBranchId);
}

/**
 * Resolve the scope of a write made on behalf of a known uid.
 *
 * A thin wrapper over resolveUserBranch with no viewBranchId: a write path
 * takes no view switch, so the branch is always the user's own (or 'all' for a
 * branchless head-office user).
 *
 * THROWS BranchResolutionError for an unknown or branchless uid. Throw means
 * REFUSE the write. Contrast resolveScopeFromSession, where null means "no
 * trustworthy identity, fall back".
 */
export async function resolveScopeForUid(uid: string): Promise<BranchScope> {
  return resolveUserBranch(uid);
}

/**
 * Resolve the scope of the signed session cookie on the current request.
 *
 * Returns null when there is no trustworthy identity: the cookie is absent,
 * invalid (tampered, expired, wrong secret), or there is no request scope at
 * all. null means FALL BACK to today's unguarded behaviour. It is NOT "refuse"
 * and it is NOT head office; widening an absent cookie to { scope: 'all' }
 * would turn every anonymous caller into a head-office writer. Failing closed
 * instead would lock out sessions created before the cookie existed, so
 * isolation is real only for sessions that carry the cookie.
 *
 * A valid cookie whose uid is unknown or branchless THROWS
 * BranchResolutionError (identity known, target out of bounds: refuse).
 *
 * cookies() throws outside a request scope (server-to-server calls such as the
 * approval processor); that is treated as "no session", not a crash.
 */
export async function resolveScopeFromSession(): Promise<BranchScope | null> {
  let token: string | undefined;
  try {
    const store = await cookies();
    token = store.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    return null;
  }
  if (!token) return null;

  const uid = verifySession(token, sessionSecret());
  if (!uid) return null;

  return resolveScopeForUid(uid);
}

/**
 * Reject a product that does not belong to the resolved branch.
 *
 * A product has no branch column of its own: it belongs to a branch through its
 * warehouse (products.warehouse_id -> warehouses.branch_id). The product's own
 * warehouse is resolved here and handed to assertWarehouseInBranch, so a valid
 * productId in another branch is refused (existence is not authorisation).
 *
 * A product with a NULL warehouse_id belongs to no branch, so a branch-scoped
 * caller cannot assert it is theirs and is refused. Head office (scope 'all')
 * may touch it. An unknown product is refused for a branch-scoped caller too:
 * absence is not ownership.
 */
export async function assertProductInScope(
  productId: string,
  scope: BranchScope
): Promise<void> {
  if (scope.scope === 'all') return;

  const rows = (await query(
    'SELECT warehouse_id AS warehouseId FROM products WHERE id = ?',
    [productId]
  )) as any[];

  if (rows.length === 0) {
    throw new BranchResolutionError(`Unknown product: ${productId}`);
  }
  const warehouseId = rows[0].warehouseId;
  if (!warehouseId) {
    throw new BranchResolutionError(
      `Product ${productId} has no warehouse, so it belongs to no branch`
    );
  }
  await assertWarehouseInBranch(warehouseId, scope);
}
