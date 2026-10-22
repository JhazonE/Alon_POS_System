import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { assertHeadOffice, branchErrorResponse } from '@/lib/branch-context';
import { ensureActivityLogTable, writeActivityLog } from '@/lib/activity-log';

const KINDS = ['warehouse', 'user', 'terminal'] as const;
type Kind = (typeof KINDS)[number];

type Connection = { query: (sql: string, params?: any[]) => Promise<any> };

/** A refusal decided inside the transaction, before anything was written. */
type Refusal = { status: number; error: string };

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** ER_NO_SUCH_TABLE: an optional table that was never created holds no rows. */
function isMissingTable(error: any): boolean {
  return error?.errno === 1146 || error?.code === 'ER_NO_SUCH_TABLE';
}

async function countOrZero(
  connection: Connection,
  sql: string,
  params: any[]
): Promise<number> {
  try {
    const [rows] = await connection.query(sql, params);
    return Number(rows[0].n);
  } catch (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
}

/** Escape LIKE metacharacters: JSON_SEARCH treats its search string as a LIKE pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Why this warehouse may not be moved, or null when it may.
 *
 * Moving a warehouse moves its products, batches and stock history into
 * another branch's view, so it is refused (never warned) while work is in
 * flight against it. Counts come from the rows themselves:
 *
 *  - pending approvals: approval_queue has no warehouse column, only a JSON
 *    payload whose shape differs per transaction type. A queued item names the
 *    warehouse directly (transfers, POs, counts) or only a product in it
 *    (STOCK_ADJUSTMENT), so both are searched. Best effort by necessity; it
 *    errs towards refusing (a LIKE wildcard in a product id can only add
 *    matches, never lose one).
 *  - open shifts: shifts hang off terminals, not warehouses, and a terminal
 *    sells from its branch. An active shift on any terminal of the branch the
 *    warehouse is leaving is therefore treated as in flight against it.
 *  - open orders: sales orders still Pending, and purchase orders whose goods
 *    have not yet been received (or cancelled / failed).
 */
async function warehouseBusyRefusal(
  connection: Connection,
  warehouse: { id: string; name: string; branch_id: string }
): Promise<Refusal | null> {
  const approvals = await countOrZero(
    connection,
    `SELECT COUNT(*) AS n
       FROM approval_queue aq
      WHERE aq.status = 'Pending'
        AND (JSON_SEARCH(aq.transaction_data, 'one', ?) IS NOT NULL
             OR EXISTS (SELECT 1 FROM products p
                         WHERE p.warehouse_id = ?
                           AND JSON_SEARCH(aq.transaction_data, 'one', p.id) IS NOT NULL))`,
    [escapeLike(warehouse.id), warehouse.id]
  );
  const shifts = await countOrZero(
    connection,
    `SELECT COUNT(*) AS n
       FROM shifts s
       JOIN pos_terminals t ON t.id = s.terminal_id
      WHERE t.branch_id = ? AND s.status = 'active' AND s.end_time IS NULL`,
    [warehouse.branch_id]
  );
  const salesOrders = await countOrZero(
    connection,
    `SELECT COUNT(*) AS n FROM sales_orders WHERE warehouse_id = ? AND status = 'Pending'`,
    [warehouse.id]
  );
  const purchaseOrders = await countOrZero(
    connection,
    `SELECT COUNT(*) AS n FROM purchase_orders
      WHERE warehouse_id = ? AND status NOT IN ('Received', 'Cancelled', 'Failed')`,
    [warehouse.id]
  );

  const busy: string[] = [];
  if (approvals > 0) busy.push(plural(approvals, 'pending approval'));
  if (shifts > 0) busy.push(plural(shifts, 'open shift'));
  if (salesOrders + purchaseOrders > 0) {
    busy.push(plural(salesOrders + purchaseOrders, 'open order'));
  }
  if (busy.length === 0) return null;

  return {
    status: 409,
    error: `Cannot move warehouse "${warehouse.name}": it still has ${busy.join(', ')}. Resolve them first.`,
  };
}

/**
 * Reassign a warehouse, user or terminal to another branch. Head office only
 * (the all_branches grant, re-read from user_permissions on every call).
 *
 * Body: { uid, kind: 'warehouse' | 'user' | 'terminal', id, branchId }.
 *
 * Status split follows PATCH /api/branches/[id]: 403 authorisation, 400 a
 * malformed request, 404 a row that does not exist, 409 a refusal because of
 * the current state.
 *
 * Deliberate asymmetry: past sales keep their stamped sales_transactions.branch_id
 * (migrations 138-140), so moving a terminal or warehouse moves what happens
 * NEXT, never what was already filed.
 *
 * Last-administrator guard: none is needed and none is implemented. This route
 * writes users.branch_id only and never touches user_permissions, and
 * assertHeadOffice reads the all_branches grant alone, not the branch. A
 * reassignment therefore cannot change how many users hold all_branches, so a
 * guard for "would leave zero holders" could never fire.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Authorise first: a refused caller learns nothing about the target and
    // nothing is written. assertHeadOffice rejects a non-string uid itself.
    const uid: string = body.uid;
    await assertHeadOffice(uid);

    // Runtime type checks. TS types are erased and these arrive off the wire;
    // pool.query escapes an OBJECT as `key` = value, so `WHERE id = ?` with
    // {branch_id: 0} would become a match-many predicate and an UPDATE keyed
    // by it would hit every row. Reject before any query.
    const { kind, id, branchId } = body;
    if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) {
      return NextResponse.json(
        { success: false, error: "kind must be 'warehouse', 'user' or 'terminal'" },
        { status: 400 }
      );
    }
    if (typeof id !== 'string' || !id) {
      return NextResponse.json(
        { success: false, error: 'id must be a non-empty string' },
        { status: 400 }
      );
    }
    // A user may not be left without a branch, so null/empty is refused here
    // for every kind: reassignment always targets a real branch.
    if (typeof branchId !== 'string' || !branchId) {
      return NextResponse.json(
        { success: false, error: 'branchId must be a non-empty string naming a real branch' },
        { status: 400 }
      );
    }

    const userRows = (await query(
      'SELECT display_name, username FROM users WHERE uid = ?',
      [uid]
    )) as any[];
    const userName = userRows[0]?.display_name || userRows[0]?.username || 'Unknown';
    await ensureActivityLogTable(); // DDL: must run outside the transaction

    // Table and id column come from the fixed KINDS whitelist above, never
    // from input.
    const table = kind === 'warehouse' ? 'warehouses' : kind === 'user' ? 'users' : 'pos_terminals';
    const idColumn = kind === 'user' ? 'uid' : 'id';

    const result = await withTransaction(
      async (
        connection
      ): Promise<{ refusal: Refusal } | { changed: boolean; from: string | null }> => {
        const refuse = (status: number, error: string) => ({ refusal: { status, error } });

        // Peek at the entity's current branch (unlocked) only to know which
        // branch rows to lock. Branch rows are then locked together in id
        // order (no lock-order deadlock between two concurrent moves), and the
        // entity is re-read under its own lock below.
        const [peek] = (await connection.query(
          `SELECT branch_id FROM ${table} WHERE ${idColumn} = ?`,
          [id]
        )) as [any[], unknown];
        if (peek.length === 0) return refuse(404, `${kind} not found`);
        const lockIds = Array.from(
          new Set([branchId, peek[0].branch_id].filter((b) => typeof b === 'string' && b))
        ).sort();

        // Locking the target branch row serialises this move against
        // deactivating that branch (Task 5 locks the same row), so the target
        // cannot go inactive between this check and the write.
        const [branches] = (await connection.query(
          `SELECT id, code, is_main, is_active FROM branches
            WHERE id IN (${lockIds.map(() => '?').join(', ')}) ORDER BY id FOR UPDATE`,
          lockIds
        )) as [any[], unknown];
        const target = branches.find((b: any) => b.id === branchId);
        if (!target) return refuse(404, 'Target branch not found');
        if (target.is_active !== null && Number(target.is_active) === 0) {
          return refuse(
            409,
            `Branch ${target.code} is inactive. Reactivate it first: a ${kind} moved into an inactive branch is locked out of every branch-filtered route.`
          );
        }

        const [rows] = (await connection.query(
          `SELECT * FROM ${table} WHERE ${idColumn} = ? FOR UPDATE`,
          [id]
        )) as [any[], unknown];
        if (rows.length === 0) return refuse(404, `${kind} not found`);
        const row = rows[0];
        if (row.branch_id === branchId) return { changed: false, from: row.branch_id };

        if (kind === 'warehouse') {
          const source = branches.find((b: any) => b.id === row.branch_id);
          const busy = await warehouseBusyRefusal(connection, {
            id: row.id,
            name: row.name,
            branch_id: row.branch_id,
          });
          if (busy) return { refusal: busy };

          // The main branch is the default for several inserts across the app
          // and the source of the original BIR sequence; it must keep at least
          // one usable warehouse. Counted under lock so two concurrent moves
          // cannot each see "another one remains".
          if (source && Number(source.is_main) === 1) {
            const isActive = row.is_active === null || Number(row.is_active) !== 0;
            if (isActive) {
              const [active] = (await connection.query(
                `SELECT id FROM warehouses
                  WHERE branch_id = ? AND (is_active IS NULL OR is_active <> 0) FOR UPDATE`,
                [row.branch_id]
              )) as [any[], unknown];
              if (active.length <= 1) {
                return refuse(
                  409,
                  `Cannot move warehouse "${row.name}": it is the last warehouse of the main branch (${source.code}), which must keep at least one.`
                );
              }
            }
          }
        }

        await connection.query(
          `UPDATE ${table} SET branch_id = ? WHERE ${idColumn} = ?`,
          [branchId, id]
        );
        const label = row.name || row.display_name || row.username || id;
        await writeActivityLog(connection, {
          userUid: uid,
          userName,
          action: 'UPDATE',
          module: 'BRANCHES',
          description: `Reassigned ${kind} "${label}" (${id}) from branch ${row.branch_id ?? '(none)'} to ${target.code}`,
          referenceId: branchId,
        });
        return { changed: true, from: row.branch_id };
      }
    );

    if ('refusal' in result) {
      return NextResponse.json(
        { success: false, error: result.refusal.error },
        { status: result.refusal.status }
      );
    }
    return NextResponse.json({
      success: true,
      data: { kind: kind as Kind, id, branchId, changed: result.changed, from: result.from },
    });
  } catch (error: any) {
    const mapped = branchErrorResponse(error);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    console.error('Error reassigning branch:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reassign' },
      { status: 500 }
    );
  }
}
