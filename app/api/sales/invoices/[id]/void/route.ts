import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, query } from '@/lib/mysql';
import {
  resolveScopeFromBody,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '@/lib/branch-context';
import { addFamilyStock, findUltimateRoot } from '@/lib/family-sync';
import { restoreBaseQty } from '@/lib/selling-unit-restore';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: invoiceId } = await params;

    // The void body is optional for older clients; a missing or malformed body
    // simply carries no uid and is refused below.
    const body = await request.json().catch(() => ({}));

    // Branch isolation. Requires `uid` (spec D4). `sales_invoices` has no
    // branch_id or warehouse_id of its own, so the invoice reaches its branch
    // one of two ways:
    //   - made from a sales order: sales_order_id -> sales_orders.warehouse_id
    //   - made at the POS: its reference is the sale's reference, and
    //     sales_transactions.branch_id is stored
    // A valid invoice id in another branch is still refused — existence is not
    // authorisation. An invoice that resolves to no branch at all is unowned,
    // so there is no other branch to protect and it is left to proceed.
    try {
        const scope = await resolveScopeFromBody(body);
        if (scope.scope === 'single') {
            const invoiceRows = (await query(
                'SELECT sales_order_id, reference FROM sales_invoices WHERE id = ?',
                [invoiceId]
            )) as any[];
            const invoiceRow = invoiceRows[0];
            if (invoiceRow?.sales_order_id) {
                const orderRows = (await query(
                    'SELECT warehouse_id FROM sales_orders WHERE id = ?',
                    [invoiceRow.sales_order_id]
                )) as any[];
                const orderWarehouseId = orderRows[0]?.warehouse_id;
                if (orderWarehouseId) await assertWarehouseInBranch(orderWarehouseId, scope);
            } else if (invoiceRow?.reference) {
                const saleRows = (await query(
                    'SELECT DISTINCT branch_id FROM sales_transactions WHERE reference = ?',
                    [invoiceRow.reference]
                )) as any[];
                // Any matching sale in another branch refuses: a reference that
                // somehow spans branches must not be voidable from either.
                if (saleRows.some((r) => r.branch_id && r.branch_id !== scope.branchId)) {
                    return NextResponse.json(
                        { success: false, error: `Invoice ${invoiceId} does not belong to branch ${scope.branchId}` },
                        { status: 403 }
                    );
                }
            }
        }
    } catch (error) {
        const mapped = branchErrorResponse(error);
        if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
        throw error;
    }

    try {
        return await withTransaction(async (connection: any) => {
            // 1. Fetch invoice to check status
            const [invoice]: any = await connection.query('SELECT status FROM sales_invoices WHERE id = ?', [invoiceId]);

            if (!invoice || invoice.length === 0) {
                return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
            }

            if (invoice[0].status === 'Voided') {
                return NextResponse.json({ success: false, error: 'Invoice is already voided' }, { status: 400 });
            }

            // 2. Fetch items to reverse stock
            const [items]: any = await connection.query('SELECT product_id, quantity, selling_unit_qty_base FROM sales_invoice_items WHERE sales_invoice_id = ?', [invoiceId]);

            if (items && items.length > 0) {
                for (const item of items) {
                    // --- Inventory Addition (Reversal) using recursive family sync ---
                    // sales_invoice_items.quantity is UNITS SOLD; stock is in base
                    // units. Restoring the raw quantity would give back 1 base unit
                    // for a voided Case of 24.
                    const restoreQty = restoreBaseQty(item);
                    const { rootId, factorToRoot } = await findUltimateRoot(item.product_id, connection as any);
                    const quantityToAddInRootUnits = restoreQty / factorToRoot;
                    
                    await addFamilyStock(
                        rootId, 
                        quantityToAddInRootUnits, 
                        invoiceId, 
                        'adjustment', 
                        `Voiding of Sales Invoice: ${invoiceId}`, 
                        connection as any
                    );
                }
            }

            // 3. Update invoice status
            await connection.query('UPDATE sales_invoices SET status = "Voided", updated_at = NOW() WHERE id = ?', [invoiceId]);

            return NextResponse.json({
                success: true,
                message: 'Sales invoice voided and stock reversed successfully'
            });
        });
    } catch (error) {
        console.error('Error voiding sales invoice:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to void sales invoice' },
            { status: 500 }
        );
    }
}
