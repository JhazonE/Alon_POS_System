import { query } from './mysql';

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
): Promise<BranchScope> {
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
