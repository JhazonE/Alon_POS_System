import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { assertHeadOffice, branchErrorResponse } from '@/lib/branch-context';
import { ensureActivityLogTable, writeActivityLog } from '@/lib/activity-log';

/**
 * Editable branch columns. `code` is deliberately absent (immutable after
 * creation) and so are `is_main` / `is_active` / the number series: those are
 * not an "edit", and activation has its own endpoint.
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

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No editable fields supplied' },
        { status: 400 }
      );
    }

    const changedFields = Object.keys(updates).filter(
      (f) => (current[f] ?? null) !== updates[f]
    );
    if (changedFields.length === 0) {
      return NextResponse.json({ success: true, data: { id, changed: [] } });
    }

    const auditedFields = changedFields.filter((f) => BIR_IDENTITY_FIELDS.has(f));
    let userName = 'Unknown';
    if (auditedFields.length > 0) {
      const users = (await query(
        'SELECT display_name, username FROM users WHERE uid = ?',
        [uid]
      )) as any[];
      userName = users[0]?.display_name || users[0]?.username || 'Unknown';
      await ensureActivityLogTable(); // DDL: must run outside the transaction
    }

    // The update and its audit rows commit together: an edit to a BIR field
    // can never land without its audit record, or the reverse.
    await withTransaction(async (connection) => {
      // Column names come from the fixed EDITABLE_FIELDS list, never from input.
      const setClause = changedFields.map((f) => `${f} = ?`).join(', ');
      await connection.query(
        `UPDATE branches SET ${setClause} WHERE id = ?`,
        [...changedFields.map((f) => updates[f]), id]
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
    });

    return NextResponse.json({ success: true, data: { id, changed: changedFields } });
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
