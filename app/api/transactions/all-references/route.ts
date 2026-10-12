import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../lib/mysql';
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  saleBranchFilter,
  terminalBranchFilter,
  branchErrorResponse,
} from '../../../../lib/branch-context';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // Optional filter by transaction type
    const search = searchParams.get('search'); // Optional search by reference
    const limit = parseInt(searchParams.get('limit') || '100');

    // Branch isolation. The scope comes from the database via uid, never
    // from a branch the caller claims. A warehouseId that belongs to
    // another branch is refused outright rather than quietly ignored.
    let branchWarehouseIds: string[] | null;
    let branchSaleFilter: ReturnType<typeof saleBranchFilter>;
    let branchPosFilter: ReturnType<typeof terminalBranchFilter>;
    try {
      const scope = await resolveScopeFromRequest(searchParams);
      const requestedWarehouseId =
        searchParams.get('warehouseId') || searchParams.get('warehouse_id');
      if (requestedWarehouseId) {
        await assertWarehouseInBranch(requestedWarehouseId, scope);
      }
      branchWarehouseIds = await warehouseIdsForBranch(scope);
      branchSaleFilter = saleBranchFilter(scope, 'sales_transactions.id');
      branchPosFilter = terminalBranchFilter(scope, 'terminal_id');
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }

    // Each list below is scoped by whatever ties it to a branch: documents
    // with a warehouse_id by warehouse, invoices through the warehouses of
    // the products sold, POS sales through the terminal that rang them.
    // null means head office — apply no filter. An empty warehouse array
    // means a branch with no warehouses, whose warehouse-scoped lists must
    // be empty rather than unfiltered.
    const noWarehouses = branchWarehouseIds !== null && branchWarehouseIds.length === 0;
    const whPlaceholders = (branchWarehouseIds ?? []).map(() => '?').join(',');
    const whClause = (column: string) =>
      branchWarehouseIds !== null ? `AND ${column} IN (${whPlaceholders})` : '';
    const whParams: any[] = branchWarehouseIds ?? [];
    // Invoices carry no warehouse column; they belong to a branch through the
    // products they sold.
    const invoiceBranchClause = (invoiceIdColumn: string) =>
      branchWarehouseIds !== null
        ? `AND EXISTS (
            SELECT 1 FROM sales_invoice_items bii
            JOIN products bp ON bp.id = bii.product_id
            WHERE bii.sales_invoice_id = ${invoiceIdColumn}
              AND bp.warehouse_id IN (${whPlaceholders})
          )`
        : '';

    // Fetch Sales Orders
    const salesOrdersQuery = `
      SELECT 
        'Sales Order' as transaction_type,
        reference as reference_number,
        id,
        order_date as transaction_date,
        total as amount,
        status,
        customer_id
      FROM sales_orders
      WHERE reference IS NOT NULL AND reference != ''
      ${search ? `AND reference LIKE ?` : ''}
      ${whClause('warehouse_id')}
      ORDER BY order_date DESC
      LIMIT ?
    `;
    const salesOrdersParams = [...(search ? [`%${search}%`] : []), ...whParams, limit];
    const salesOrders = noWarehouses || (type && type !== 'sales_order') ? [] : await query(salesOrdersQuery, salesOrdersParams);

    // Fetch Sales Invoices
    const salesInvoicesQuery = `
      SELECT 
        'Sales Invoice' as transaction_type,
        reference as reference_number,
        id,
        invoice_date as transaction_date,
        total as amount,
        status,
        customer_id
      FROM sales_invoices
      WHERE reference IS NOT NULL AND reference != ''
      ${search ? `AND reference LIKE ?` : ''}
      ${invoiceBranchClause('sales_invoices.id')}
      ORDER BY invoice_date DESC
      LIMIT ?
    `;
    const salesInvoicesParams = [...(search ? [`%${search}%`] : []), ...whParams, limit];
    const salesInvoices = noWarehouses || (type && type !== 'sales_invoice') ? [] : await query(salesInvoicesQuery, salesInvoicesParams);

    // Fetch Purchase Orders
    const purchaseOrdersQuery = `
      SELECT 
        'Purchase Order' as transaction_type,
        reference as reference_number,
        id,
        order_date as transaction_date,
        total as amount,
        status,
        supplier_id
      FROM purchase_orders
      WHERE reference IS NOT NULL AND reference != ''
      ${search ? `AND reference LIKE ?` : ''}
      ${whClause('warehouse_id')}
      ORDER BY order_date DESC
      LIMIT ?
    `;
    const purchaseOrdersParams = [...(search ? [`%${search}%`] : []), ...whParams, limit];
    const purchaseOrders = noWarehouses || (type && type !== 'purchase_order') ? [] : await query(purchaseOrdersQuery, purchaseOrdersParams);

    // Fetch Customer Payments
    const customerPaymentsQuery = `
      SELECT 
        'Customer Payment' as transaction_type,
        reference as reference_number,
        id,
        payment_date as transaction_date,
        amount,
        'Completed' as status,
        customer_id
      FROM customer_payments
      WHERE reference IS NOT NULL AND reference != ''
      ${search ? `AND reference LIKE ?` : ''}
      ${
        // A payment carries no branch of its own. It belongs to a branch only
        // through the invoices it was allocated to, so a payment with no
        // allocation is visible to head office alone (fail closed).
        branchWarehouseIds !== null
          ? `AND EXISTS (
              SELECT 1 FROM payment_allocations bpa
              JOIN sales_invoices bsi ON bsi.id = bpa.invoice_id
              WHERE bpa.payment_id = customer_payments.id
              ${invoiceBranchClause('bsi.id')}
            )`
          : ''
      }
      ORDER BY payment_date DESC
      LIMIT ?
    `;
    const customerPaymentsParams = [...(search ? [`%${search}%`] : []), ...whParams, limit];
    const customerPayments = noWarehouses || (type && type !== 'customer_payment') ? [] : await query(customerPaymentsQuery, customerPaymentsParams);

    // Fetch Stock Adjustments
    const stockAdjustmentsQuery = `
      SELECT 
        'Stock Adjustment' as transaction_type,
        reference as reference_number,
        id,
        adjustment_date as transaction_date,
        0 as amount,
        'Completed' as status,
        NULL as customer_id
      FROM stock_adjustments
      WHERE reference IS NOT NULL AND reference != ''
      ${search ? `AND reference LIKE ?` : ''}
      ${whClause('warehouse_id')}
      ORDER BY adjustment_date DESC
      LIMIT ?
    `;
    const stockAdjustmentsParams = [...(search ? [`%${search}%`] : []), ...whParams, limit];
    const stockAdjustments = noWarehouses || (type && type !== 'stock_adjustment') ? [] : await query(stockAdjustmentsQuery, stockAdjustmentsParams);

    // Fetch Sales Transactions (POS)
    const salesTransactionsQuery = `
      SELECT 
        'Sales Transaction' as transaction_type,
        id as reference_number,
        id,
        date as transaction_date,
        total as amount,
        status,
        customer_id
      FROM sales_transactions
      WHERE 1 = 1
      ${search ? `AND id LIKE ?` : ''}
      ${branchSaleFilter ? `AND ${branchSaleFilter.sql}` : ''}
      ORDER BY date DESC
      LIMIT ?
    `;
    const salesTransactionsParams = [
      ...(search ? [`%${search}%`] : []),
      ...(branchSaleFilter ? branchSaleFilter.params : []),
      limit,
    ];
    const salesTransactions = type && type !== 'sales_transaction' ? [] : await query(salesTransactionsQuery, salesTransactionsParams);

    // Fetch POS Transactions
    const posTransactionsQuery = `
      SELECT 
        'POS Transaction' as transaction_type,
        id as reference_number,
        id,
        transaction_time as transaction_date,
        total_amount as amount,
        transaction_type as status,
        NULL as customer_id
      FROM pos_transactions
      WHERE 1 = 1
      ${search ? `AND id LIKE ?` : ''}
      ${branchPosFilter ? `AND ${branchPosFilter.sql}` : ''}
      ORDER BY transaction_time DESC
      LIMIT ?
    `;
    const posTransactionsParams = [
      ...(search ? [`%${search}%`] : []),
      ...(branchPosFilter ? branchPosFilter.params : []),
      limit,
    ];
    const posTransactions = type && type !== 'pos_transaction' ? [] : await query(posTransactionsQuery, posTransactionsParams);

    // Combine all transactions
    const allTransactions = [
      ...salesOrders,
      ...salesInvoices,
      ...purchaseOrders,
      ...customerPayments,
      ...stockAdjustments,
      ...salesTransactions,
      ...posTransactions
    ];

    // Sort by date (most recent first)
    allTransactions.sort((a: any, b: any) => {
      const dateA = new Date(a.transaction_date || 0).getTime();
      const dateB = new Date(b.transaction_date || 0).getTime();
      return dateB - dateA;
    });

    // Format the data
    const formattedTransactions = allTransactions.slice(0, limit).map((txn: any) => ({
      transactionType: txn.transaction_type,
      referenceNumber: txn.reference_number,
      id: txn.id,
      date: txn.transaction_date,
      amount: parseFloat(txn.amount || 0),
      formattedAmount: `₱${parseFloat(txn.amount || 0).toLocaleString('en-PH', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`,
      status: txn.status,
      customerId: txn.customer_id || txn.supplier_id
    }));

    // Get transaction counts by type
    const counts = {
      salesOrder: salesOrders.length,
      salesInvoice: salesInvoices.length,
      purchaseOrder: purchaseOrders.length,
      customerPayment: customerPayments.length,
      stockAdjustment: stockAdjustments.length,
      salesTransaction: salesTransactions.length,
      posTransaction: posTransactions.length,
      total: formattedTransactions.length
    };

    return NextResponse.json({
      success: true,
      data: formattedTransactions,
      counts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching transaction references:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch transaction references',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
