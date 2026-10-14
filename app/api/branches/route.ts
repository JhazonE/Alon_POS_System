import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql';

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
    const { code, name } = body;

    if (!code || !name) {
      return NextResponse.json(
        { success: false, error: 'code and name are required' },
        { status: 400 }
      );
    }

    const id = uuidv4();

    // Phase 2 guard. transaction_references is still a single global row
    // (id = 1), so a second ACTIVE branch would draw SI/MC/OR numbers from
    // the same sequence as the main branch. Two BIR-registered
    // establishments sharing one invoice series is a filing defect, so a new
    // branch is created inactive until per-branch numbering lands.
    const refRows = (await query(
      `SELECT COUNT(*) AS c FROM transaction_references`
    )) as any[];
    const numberingIsPerBranch = refRows[0].c > 1;

    await query(
      `INSERT INTO branches
         (id, code, name, business_name, address, tin, contact_number,
          permit_no, min_number, serial_number, operated_by, is_main, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
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
        numberingIsPerBranch ? 1 : 0,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        data: { id },
        ...(numberingIsPerBranch
          ? {}
          : {
              warning:
                'Branch created inactive: per-branch numbering (Phase 2) is not yet ' +
                'in place, so an active second branch would share the main branch\'s ' +
                'BIR invoice series.',
            }),
      },
      { status: 201 }
    );
  } catch (error: any) {
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
