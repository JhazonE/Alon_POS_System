
import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../../lib/mysql';
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '../../../../../lib/branch-context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Invoice ID is required' },
        { status: 400 }
      );
    }

    // Unescape the ID just in case
    const invoiceId = decodeURIComponent(id);

    const { searchParams } = new URL(request.url);

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

    // sales_invoices has no warehouse column; an invoice belongs to a branch
    // through the warehouses of the products it sold. null means head
    // office — apply no filter. An empty array means a branch with no
    // warehouses, which must find nothing. An invoice of another branch is
    // reported as not found, the same as a missing one.
    const invoiceParams: any[] = [invoiceId];
    let branchCondition = '';
    if (branchWarehouseIds !== null) {
      if (branchWarehouseIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Invoice not found' },
          { status: 404 }
        );
      }
      branchCondition = `AND EXISTS (
        SELECT 1 FROM sales_invoice_items bii
        JOIN products bp ON bp.id = bii.product_id
        WHERE bii.sales_invoice_id = si.id
          AND bp.warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})
      )`;
      invoiceParams.push(...branchWarehouseIds);
    }

    // 1. Fetch Invoice Details
    const invoiceSql = `
      SELECT
        si.id,
        si.customer_id,
        c.name as customer_name,
        c.contact_number as customer_contact,
        c.address as customer_address,
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
      WHERE si.id = ?
      ${branchCondition}
    `;

    const invoices = await query(invoiceSql, invoiceParams);

    if (invoices.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    const invoice = invoices[0];

    // 2. Fetch Invoice Items
    const itemsSql = `
      SELECT
        sii.id,
        sii.product_id,
        sii.product_name,
        sii.quantity,
        sii.price,
        p.unit_of_measure as uom,
        p.sku
      FROM sales_invoice_items sii
      LEFT JOIN products p ON sii.product_id = p.id
      WHERE sii.sales_invoice_id = ?
    `;

    const items = await query(itemsSql, [invoiceId]);

    const formattedInvoice = {
      id: invoice.id,
      customer: {
        id: invoice.customer_id,
        name: invoice.customer_name || 'Walk-in Customer',
        contactNumber: invoice.customer_contact,
        address: invoice.customer_address,
      },
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      total: parseFloat(invoice.total),
      amountPaid: parseFloat(invoice.amount_paid || 0),
      balance: parseFloat(invoice.total) - parseFloat(invoice.amount_paid || 0),
      paymentMethod: invoice.payment_method,
      status: invoice.status,
      notes: invoice.notes,
      items: items.map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        sku: item.sku || '',
        quantity: parseFloat(item.quantity),
        price: parseFloat(item.price),
        uom: item.uom || 'units',
        total: parseFloat(item.quantity) * parseFloat(item.price)
      })),
    };

    return NextResponse.json({
      success: true,
      data: formattedInvoice,
    });
  } catch (error) {
    console.error('Error fetching invoice details:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoice details' },
      { status: 500 }
    );
  }
}
