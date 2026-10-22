import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '@/lib/mysql';
import { assertHeadOffice, branchErrorResponse } from '@/lib/branch-context';

/**
 * Branch CRUD. Listing is intentionally unfiltered: the branch switcher and
 * the branch management page both need the full list, and a branch's name
 * and code are not sensitive. Per-branch *data* is what branch-context
 * guards; this endpoint only exposes store identity.
 */
export async function GET() {
  try {
    const rows = await query(
      `SELECT id, code, name, business_name AS businessName, address, tin,
              contact_number AS contactNumber, permit_no AS permitNo,
              min_number AS minNumber, serial_number AS serialNumber,
              operated_by AS operatedBy,
              is_main AS isMain, is_active AS isActive
       FROM branches
       ORDER BY is_main DESC, name ASC`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('Error fetching branches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch branches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Creating a branch is head-office administration. Authorise before any
    // validation or write, so a refused caller creates nothing.
    await assertHeadOffice(body?.uid);

    const { code, name } = body;

    if (!code || !name) {
      return NextResponse.json(
        { success: false, error: 'code and name are required' },
        { status: 400 }
      );
    }

    const id = uuidv4();

    // Per-branch numbering is in place (branch_number_series), so a new
    // branch no longer shares the main branch's BIR series and can be
    // created active. Its series row is created in the same transaction:
    // a branch without one cannot issue invoices at all, because
    // getNextSINumber fails closed on a missing row.
    await withTransaction(async (connection) => {
      await connection.query(
        `INSERT INTO branches
           (id, code, name, business_name, address, tin, contact_number,
            permit_no, min_number, serial_number, operated_by, is_main, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [
          id,
          code,
          name,
          body.businessName ?? null,
          body.address ?? null,
          body.tin ?? null,
          body.contactNumber ?? null,
          body.permitNo ?? null,
          body.minNumber ?? null,
          body.serialNumber ?? null,
          body.operatedBy ?? null,
        ]
      );
      await connection.query(
        `INSERT INTO branch_number_series (branch_id) VALUES (?)`,
        [id]
      );
    });

    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (error: any) {
    const mapped = branchErrorResponse(error);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return NextResponse.json(
        { success: false, error: 'A branch with that code already exists' },
        { status: 409 }
      );
    }
    console.error('Error creating branch:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create branch' },
      { status: 500 }
    );
  }
}
