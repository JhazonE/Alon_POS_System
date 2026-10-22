import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { assertHeadOffice, branchErrorResponse } from '@/lib/branch-context';
import { ensureActivityLogTable, writeActivityLog } from '@/lib/activity-log';

/**
 * Editable branch columns. `code` is deliberately absent (immutable after
 * creation) and so are `is_main` and the number series: those are not an
 * "edit". `is_active` is absent too, on purpose: it is not a plain field
 * because every change to it must pass the deactivation guard, so it is
 * handled as its own explicit step in the handler (never via this loop, which
 * would let a generic write path skip the guard).
 */
const EDITABLE_FIELDS = [
  'name',
  'business_name',
  'address',
  'tin',
  'contact_number',
  'permit_no',
  'min_number',
  'serial_number',
  'operated_by',
] as const;

/**
 * Fields that print on filed BIR documents. A silent change would make an
 * already-filed document unexplainable, so every actual change is audited.
 */
const BIR_IDENTITY_FIELDS = new Set<string>([
  'permit_no',
  'min_number',
  'serial_number',
  'tin',
  'business_name',
]);

function describeValue(value: unknown): string {
  return value === null || value === undefined ? '(empty)' : `"${String(value)}"`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** A refusal decided inside the transaction, before anything was written. */
type Refusal = { status: number; error: string };

/**
 * Why this branch may not be deactivated, or null when it may. Runs on the
 * transaction's connection, after the branch row is locked.
 *
 * "Attached" means active: a warehouse / terminal that is not inactive, and a
 * user that is not disabled. A NULL flag counts as active, so a row of
 * unknown state blocks rather than slips through. Inactive rows are not
 * blockers: they cannot sell, log in or hold stock, so they lock nobody out,
 * and reactivating the branch restores nothing by itself.
 */
async function deactivationRefusal(
  connection: { query: (sql: string, params: any[]) => Promise<any> },
  branch: { id: string; code: string; is_main: unknown }
): Promise<Refusal | null> {
  // is_main first and unconditionally: mainBranchId() is the default for
  // several inserts across the app and migration 137 re-synced its BIR series.
  if (Number(branch.is_main) === 1) {
    return { status: 409, error: 'The main branch cannot be deactivated' };
  }

  const [rows] = await connection.query(
    `SELECT
       (SELECT COUNT(*) FROM warehouses
         WHERE branch_id = ? AND (is_active IS NULL OR is_active <> 0)) AS warehouses,
       (SELECT COUNT(*) FROM users
         WHERE branch_id = ? AND (disabled IS NULL OR disabled = 0)) AS users,
       (SELECT COUNT(*) FROM pos_terminals
         WHERE branch_id = ? AND (is_active IS NULL OR is_active <> 0)) AS terminals`,
    [branch.id, branch.id, branch.id]
  );
  const counts = {
    warehouse: Number(rows[0].warehouses),
    user: Number(rows[0].users),
    terminal: Number(rows[0].terminals),
  };
  const attached = (Object.keys(counts) as Array<keyof typeof counts>)
    .filter((k) => counts[k] > 0)
    .map((k) => plural(counts[k], k));
  if (attached.length === 0) return null;

  // A warehouse or user orphaned on an inactive branch gets 403 from every
  // branch-filtered route: a silent lockout. Name what to move first.
  return {
    status: 409,
    error: `Cannot deactivate branch ${branch.code}: it still has active rows attached (${attached.join(', ')}). Move or disable them first.`,
  };
}

/**
 * Edit a branch. Head office only (the all_branches grant).
 *
 * The uid comes from the body, the established convention for a request that
 * has one; the grant is re-read from user_permissions by assertHeadOffice, so
 * a tampered session cannot widen anything. Edits are NOT blocked once the
 * branch has issued invoices: a typo in a permit number must be fixable, so
 * the change is audited instead of refused.
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Authorise before anything else: a refused caller learns nothing about
    // the branch (not even whether it exists) and nothing is written.
    const uid = body.uid;
    await assertHeadOffice(uid);

    const existing = (await query('SELECT * FROM branches WHERE id = ?', [id])) as any[];
    if (existing.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Branch not found' },
        { status: 404 }
      );
    }
    const current = existing[0];

    // code is immutable. Echoing the current value back is tolerated (a form
    // that submits the whole object); a different one is refused outright.
    if (body.code !== undefined && body.code !== current.code) {
      return NextResponse.json(
        { success: false, error: 'A branch code cannot be changed' },
        { status: 400 }
      );
    }

    const updates: Record<string, string | null> = {};
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field];
      if (raw !== null && typeof raw !== 'string') {
        return NextResponse.json(
          { success: false, error: `${field} must be a string` },
          { status: 400 }
        );
      }
      const value = raw === null ? null : raw.trim() || null;
      if (field === 'name' && value === null) {
        return NextResponse.json(
          { success: false, error: 'name cannot be empty' },
          { status: 400 }
        );
      }
      updates[field] = value;
    }

    // is_active is not an editable field: it is read explicitly, strictly
    // typed (a string "0" or an object is refused, not coerced), and every
    // change to it goes through deactivationRefusal() below, inside the
    // transaction that writes it.
    let desiredActive: 0 | 1 | undefined;
    if ('is_active' in body) {
      const raw = body.is_active;
      if (raw === 1 || raw === true) desiredActive = 1;
      else if (raw === 0 || raw === false) desiredActive = 0;
      else {
        return NextResponse.json(
          { success: false, error: 'is_active must be 0, 1, true or false' },
          { status: 400 }
        );
      }
    }

    if (Object.keys(updates).length === 0 && desiredActive === undefined) {
      return NextResponse.json(
        { success: false, error: 'No editable fields supplied' },
        { status: 400 }
      );
    }

    // The main branch refusal is unconditional, so it is decided before the
    // "nothing changed" shortcut: even a no-op deactivation of it is refused.
    if (desiredActive === 0 && Number(current.is_main) === 1) {
      return NextResponse.json(
        { success: false, error: 'The main branch cannot be deactivated' },
        { status: 409 }
      );
    }

    const changedFields = Object.keys(updates).filter(
      (f) => (current[f] ?? null) !== updates[f]
    );
    const activeChanged =
      desiredActive !== undefined && desiredActive !== Number(current.is_active);
    if (changedFields.length === 0 && !activeChanged) {
      return NextResponse.json({ success: true, data: { id, changed: [] } });
    }

    const auditedFields = changedFields.filter((f) => BIR_IDENTITY_FIELDS.has(f));
    let userName = 'Unknown';
    if (auditedFields.length > 0 || activeChanged) {
      const users = (await query(
        'SELECT display_name, username FROM users WHERE uid = ?',
        [uid]
      )) as any[];
      userName = users[0]?.display_name || users[0]?.username || 'Unknown';
      await ensureActivityLogTable(); // DDL: must run outside the transaction
    }

    // The update and its audit rows commit together: an edit to a BIR field
    // can never land without its audit record, or the reverse.
    const refusal = await withTransaction(async (connection): Promise<Refusal | null> => {
      if (activeChanged && desiredActive === 0) {
        // Lock the branch row and re-check against it, not the earlier
        // unlocked read, so the decision and the write see the same row. The
        // guard runs before ANY write, so a refusal leaves the whole request
        // (including any field edits sent alongside) unapplied.
        const [locked] = (await connection.query(
          'SELECT id, code, is_main FROM branches WHERE id = ? FOR UPDATE',
          [id]
        )) as any[];
        if (locked.length === 0) return { status: 404, error: 'Branch not found' };
        const refused = await deactivationRefusal(connection, locked[0]);
        if (refused) return refused;
      }

      // Column names come from the fixed EDITABLE_FIELDS list, never from
      // input; is_active is appended here as a literal, from the validated flag.
      const assignments = changedFields.map((f) => `${f} = ?`);
      const values: Array<string | number | null> = changedFields.map((f) => updates[f]);
      if (activeChanged) {
        assignments.push('is_active = ?');
        values.push(desiredActive as number);
      }
      await connection.query(
        `UPDATE branches SET ${assignments.join(', ')} WHERE id = ?`,
        [...values, id]
      );
      for (const field of auditedFields) {
        await writeActivityLog(connection, {
          userUid: uid,
          userName,
          action: 'UPDATE',
          module: 'BRANCHES',
          description: `Changed ${field} of branch ${current.code} (${current.name}) from ${describeValue(current[field])} to ${describeValue(updates[field])}`,
          referenceId: id,
        });
      }
      if (activeChanged) {
        // branch_number_series is deliberately not touched: reactivating must
        // never re-issue an invoice number already on a filed BIR document.
        await writeActivityLog(connection, {
          userUid: uid,
          userName,
          action: 'UPDATE',
          module: 'BRANCHES',
          description: `${desiredActive === 1 ? 'Reactivated' : 'Deactivated'} branch ${current.code} (${current.name})`,
          referenceId: id,
        });
      }
      return null;
    });

    if (refusal) {
      return NextResponse.json(
        { success: false, error: refusal.error },
        { status: refusal.status }
      );
    }

    const changed = activeChanged ? [...changedFields, 'is_active'] : changedFields;
    return NextResponse.json({ success: true, data: { id, changed } });
  } catch (error: any) {
    const mapped = branchErrorResponse(error);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    console.error('Error updating branch:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update branch' },
      { status: 500 }
    );
  }
}
