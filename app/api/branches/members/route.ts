import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import { assertHeadOffice, branchErrorResponse } from '@/lib/branch-context';

/**
 * Read-only: every warehouse, user and terminal with the branch it belongs to.
 *
 * GET /api/branches lists branches only, and none of the existing warehouse /
 * user / terminal list endpoints expose branch_id. The branch administration
 * page needs both the per-branch counts and the pick-list for a reassignment,
 * so this is the one place that joins them. It writes nothing.
 *
 * Head office only (uid in the query string, grant re-read by assertHeadOffice):
 * unlike a branch's name and code, a user roster across every branch is not
 * something a branch-scoped login should be able to enumerate.
 */
export async function GET(request: NextRequest) {
  try {
    const uid = new URL(request.url).searchParams.get('uid') ?? '';
    await assertHeadOffice(uid);

    const warehouses = await query(
      `SELECT id, name, branch_id AS branchId,
              (is_active IS NULL OR is_active <> 0) AS isActive
         FROM warehouses ORDER BY name ASC`
    );
    const users = await query(
      `SELECT uid, username, display_name AS displayName, branch_id AS branchId,
              (disabled IS NULL OR disabled = 0) AS isActive
         FROM users ORDER BY username ASC`
    );
    const terminals = await query(
      `SELECT id, name, branch_id AS branchId,
              (is_active IS NULL OR is_active <> 0) AS isActive
         FROM pos_terminals ORDER BY name ASC`
    );

    // "Active" mirrors the deactivation guard in PATCH /api/branches/[id], so
    // a count on the page is the same count its 409 message would report.
    const flag = (rows: any[]) =>
      (rows || []).map((r) => ({ ...r, isActive: Number(r.isActive) === 1 }));

    return NextResponse.json({
      success: true,
      data: {
        warehouses: flag(warehouses),
        users: flag(users),
        terminals: flag(terminals),
      },
    });
  } catch (error: any) {
    const mapped = branchErrorResponse(error);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    console.error('Error fetching branch members:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch branch members' },
      { status: 500 }
    );
  }
}
