import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/mysql';
import { addFamilyStock, findUltimateRoot } from '@/lib/family-sync';
import { restoreBaseQty } from '@/lib/selling-unit-restore';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: invoiceId } = await params;

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
