import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, query } from '../../../../../lib/mysql';
import {
  resolveScopeFromBody,
  resolveScopeFromRequest,
  assertWarehouseInBranch,
  branchErrorResponse,
  type BranchScope,
} from '@/lib/branch-context';
import { addFamilyStock, findUltimateRoot } from '../../../../../lib/family-sync';
import { isService } from '@/lib/product-type';

// Statuses for which inventory has already been deducted (deduction happens at delivery).
const STOCK_DEDUCTED_STATUSES = ['Delivered', 'Invoiced', 'Returned'];

/**
 * Refuse an order that belongs to another branch. An order reaches its branch
 * through its warehouse; one with no warehouse (the field is optional) belongs
 * to no branch, so there is no other branch to protect and it is left alone.
 * An order id that does not exist is also left to the handler's own 404/no-op.
 */
async function assertOrderInBranch(orderId: string, scope: BranchScope): Promise<void> {
    const rows = (await query(
        'SELECT warehouse_id FROM sales_orders WHERE id = ?',
        [orderId]
    )) as any[];
    const warehouseId = rows[0]?.warehouse_id;
    if (warehouseId) await assertWarehouseInBranch(warehouseId, scope);
}

// Helper function to format ISO date strings to MySQL format
function formatDateForMySQL(dateValue: string | null | undefined): string | null {
    if (!dateValue) return null;
    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return null;
        // Format as YYYY-MM-DD HH:MM:SS
        return date.toISOString().slice(0, 19).replace('T', ' ');
    } catch {
        return null;
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } | Promise<{ id: string }> }
) {
    const resolvedParams = params instanceof Promise ? await params : params;
    const orderId = resolvedParams.id;

    // Branch isolation. Requires `uid` (spec D4). DELETE carries no body, so
    // the uid and optional viewBranchId come from the query string. A valid
    // order id in another branch is still refused — existence is not
    // authorisation.
    try {
        const scope = await resolveScopeFromRequest(new URL(request.url).searchParams);
        await assertOrderInBranch(orderId, scope);
    } catch (error) {
        const mapped = branchErrorResponse(error);
        if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
        throw error;
    }

    try {
        return await withTransaction(async (connection) => {
            // Only reverse stock if it was actually deducted (i.e. the order was delivered).
            // Pending orders never touched inventory, so there is nothing to restore.
            const [orderRows]: any = await connection.query('SELECT status FROM sales_orders WHERE id = ?', [orderId]);
            const orderStatus = orderRows[0]?.status;
            const wasStockDeducted = STOCK_DEDUCTED_STATUSES.includes(orderStatus);

            if (wasStockDeducted) {
                // Services are excluded: no stock left on delivery, so there is
                // nothing to give back. Restoring them would invent inventory
                // for something that has none.
                const [items]: any = await connection.query(
                    `SELECT soi.product_id, soi.quantity, p.type
                     FROM sales_order_items soi
                     LEFT JOIN products p ON p.id = soi.product_id
                     WHERE soi.sales_order_id = ?`,
                    [orderId]
                );
                for (const item of items.filter((i: any) => !isService(i))) {
                    const { rootId, factorToRoot } = await findUltimateRoot(item.product_id, connection as any);
                    const quantityToAddInRootUnits = item.quantity / factorToRoot;
                    await addFamilyStock(
                        rootId,
                        quantityToAddInRootUnits,
                        orderId,
                        'adjustment',
                        `Reversal of Sales Order: ${orderId}`,
                        connection as any
                    );
                }
            }

            // Delete items then order
            await connection.query('DELETE FROM sales_order_items WHERE sales_order_id = ?', [orderId]);
            await connection.query('DELETE FROM sales_orders WHERE id = ?', [orderId]);

            return NextResponse.json({
                success: true,
                message: wasStockDeducted
                    ? 'Sales order deleted and stock reversed successfully'
                    : 'Sales order deleted successfully'
            });
        });
    } catch (error) {
        console.error('Error deleting sales order:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete sales order' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } | Promise<{ id: string }> }
) {
    const resolvedParams = params instanceof Promise ? await params : params;
    const orderId = resolvedParams.id;

    try {
        const body = await request.json();
        const {
            customer,
            orderDate,
            deliveryDate,
            reference,
            deliveryAddress,
            paymentMethod,
            paymentReference,
            status,
            shipping,
            warehouse,
            salesPerson,
            note,
            items
        } = body;

        // Branch isolation. Requires `uid` (spec D4). Both the order being
        // edited AND the warehouse it is being moved to must be the caller's:
        // otherwise an edit could hand an order to another branch.
        try {
            const scope = await resolveScopeFromBody(body);
            await assertOrderInBranch(orderId, scope);
            if (warehouse) await assertWarehouseInBranch(warehouse, scope);
        } catch (error) {
            const mapped = branchErrorResponse(error);
            if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
            throw error;
        }

        return await withTransaction(async (connection) => {
            // Editing is only permitted on Pending orders, which have NOT deducted
            // stock yet — so updating one never touches inventory.
            const [orderRows]: any = await connection.query('SELECT status FROM sales_orders WHERE id = ?', [orderId]);
            const orderStatus = orderRows[0]?.status;
            if (orderStatus && orderStatus !== 'Pending') {
                return NextResponse.json(
                    { success: false, error: `Only a Pending order can be edited (current status: ${orderStatus}).` },
                    { status: 400 }
                );
            }

            // Replace items
            await connection.query('DELETE FROM sales_order_items WHERE sales_order_id = ?', [orderId]);

            const total = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

            const updateOrderQuery = `
                UPDATE sales_orders SET
                    customer_id = ?, order_date = ?, delivery_date = ?, reference = ?,
                    delivery_address = ?, total = ?, payment_method = ?, payment_reference = ?, status = ?,
                    shipping = ?, warehouse_id = ?, sales_person_id = ?, note = ?, updated_at = NOW()
                WHERE id = ?
            `;
            await connection.query(updateOrderQuery, [
                customer.id, formatDateForMySQL(orderDate), formatDateForMySQL(deliveryDate), reference || null,
                deliveryAddress || null, total, paymentMethod, paymentReference || null, status || 'Pending',
                shipping || 0, warehouse || null, salesPerson || null, note || null,
                orderId
            ]);

            const insertItemQuery = `
                INSERT INTO sales_order_items (
                  id, sales_order_id, product_id, product_name, quantity, price
                ) VALUES (?, ?, ?, ?, ?, ?)
              `;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemId = `SOI-${Date.now()}-${i + 1}-${Math.random().toString(36).substr(2, 5)}`;
                await connection.query(insertItemQuery, [itemId, orderId, item.product.id, item.product.name, item.quantity, item.price]);
            }

            return NextResponse.json({
                success: true,
                message: 'Sales order updated successfully',
                data: { id: orderId }
            });
        });
    } catch (error) {
        console.error('Error updating sales order:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update sales order' },
            { status: 500 }
        );
    }
}
