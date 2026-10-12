
import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../../lib/mysql';
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '../../../../../lib/branch-context';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const customerId = searchParams.get('customerId');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const offset = (page - 1) * limit;

    // Branch isolation. The scope comes from the database via uid, never
    // from a branch the caller claims. A warehouseId that belongs to
    // another branch is refused outright rather than quietly ignored.
    let branchWarehouseIds: string[] | null;
    try {
      const scope = await resolveScopeFromRequest(searchParams);
      const requestedWarehouseId =
        searchParams.get('warehouseId') || searchParams.get('warehouse_id');
      if (requestedWarehouseId) {
        await assertWarehouseInBranch(requestedWarehouseId, scope);
      }
      branchWarehouseIds = await warehouseIdsForBranch(scope);
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }

    // null means head office — apply no warehouse filter. An empty array
    // means a branch with no warehouses, which must return nothing rather
    // than everything.
    if (branchWarehouseIds !== null && branchWarehouseIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: { total: 0, limit, page, totalPages: 0 },
        timestamp: new Date().toISOString()
      });
    }

    // Fetch invoices that are NOT paid (Pending, Failed, Shipped, Delivered, Returned, Partially Paid if applicable)
    // Assuming 'Pending' is the main status for unpaid, but we should include others if they imply unpaid.
    // Based on page logic: status === 'Paid' is paid.
    // So we fetch everything NOT 'Paid'.
    
    let sql = `
      SELECT
        si.id,
        si.reference,
        si.customer_id,
        c.name as customer_name,
        c.contact_number as customer_contact,
        si.invoice_date,
        si.due_date,
        si.total,
        si.payment_method,
        si.status,
        si.notes,
        si.amount_paid,
        si.created_at
      FROM sales_invoices si
      LEFT JOIN customers c ON si.customer_id = c.id
      WHERE si.status != 'Paid' AND si.amount_paid < si.total
    `;

    const params: any[] = [];

    // sales_invoices has no warehouse column; an invoice belongs to a branch
    // through the warehouses of the products it sold.
    if (branchWarehouseIds !== null) {
      sql += ` AND EXISTS (
        SELECT 1 FROM sales_invoice_items bii
        JOIN products bp ON bp.id = bii.product_id
        WHERE bii.sales_invoice_id = si.id
          AND bp.warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})
      )`;
      params.push(...branchWarehouseIds);
    }

    if (search) {
      sql += ' AND (c.name LIKE ? OR si.reference LIKE ? OR si.id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (customerId) {
        sql += ' AND si.customer_id = ?';
        params.push(customerId);
    }

    if (fromDate) {
        sql += ' AND DATE(si.invoice_date) >= DATE(?)';
        params.push(fromDate);
    }

    if (toDate) {
        sql += ' AND DATE(si.invoice_date) <= DATE(?)';
        params.push(toDate);
    }

    // Get total count for pagination
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) as sub`;
    const countResult = await query(countSql, params);
    const total = countResult[0]?.total || 0;

    sql += ' ORDER BY si.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const invoices = await query(sql, params);

    // Format for frontend
    const formattedInvoices = invoices.map((row: any) => ({
      id: row.id,
      reference: row.reference,
      customer: {
        id: row.customer_id,
        name: row.customer_name || 'Walk-in Customer',
        contactNumber: row.customer_contact,
      },
      invoiceDate: row.invoice_date,
      date: row.invoice_date, // backward compatibility
      dueDate: row.due_date,
      total: parseFloat(row.total),
      amountPaid: parseFloat(row.amount_paid || 0),
      balance: parseFloat(row.total) - parseFloat(row.amount_paid || 0),
      paymentMethod: row.payment_method,
      status: row.status,
      items: [], // we don't need items list for the table view
    }));

    return NextResponse.json({
      success: true,
      data: formattedInvoices,
      pagination: {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching outstanding invoices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch outstanding invoices' },
      { status: 500 }
    );
  }
}
