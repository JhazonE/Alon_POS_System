import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/mysql';
import { resolveTerminalBranch, mainBranchId } from '../../../lib/branch-context';

async function ensurePosTransactionItemsSchema() {
  try {
    const currentColumnsResult = await query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'pos_transaction_items' AND TABLE_SCHEMA = DATABASE()"
    ) as any[];
    const existingColumns = new Set(currentColumnsResult.map((c: any) => c.COLUMN_NAME));

    if (!existingColumns.has('discount_type')) {
      await query("ALTER TABLE pos_transaction_items ADD COLUMN discount_type VARCHAR(50) DEFAULT 'percent'");
      console.log('✅ Added discount_type column to pos_transaction_items');
    }
    if (!existingColumns.has('tax_type')) {
      await query("ALTER TABLE pos_transaction_items ADD COLUMN tax_type VARCHAR(50) DEFAULT 'VAT'");
      console.log('✅ Added tax_type column to pos_transaction_items');
    }
  } catch (error) {
    console.error('Error ensuring pos_transaction_items schema:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensurePosTransactionItemsSchema();

    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('saleId');

    // Base query to fetch POS transactions with related information
    let posTransactionsQuery = `
      SELECT
        pt.id,
        pt.sale_id,
        pt.shift_id,
        pt.user_id,
        pt.terminal_id,
        pt.transaction_type,
        pt.subtotal,
        pt.tax_amount,
        pt.discount_amount,
        pt.total_amount,
        pt.payment_method,
        pt.payment_reference,
        pt.customer_count,
        pt.transaction_time,
        pt.void_reason,
        pt.notes,
        pt.created_at,
        pt.updated_at,

        -- User information
        u.username,
        u.display_name as user_full_name,
        u.user_type as user_role,

        -- Terminal information
        t.name as terminal_name,
        t.location as terminal_location,
        t.ip_address as terminal_ip,

        -- Shift information
        s.start_time as shift_start_time,
        s.end_time as shift_end_time,
        s.status as shift_status,

        -- Sale information
        st.customer_id,
        c.name as customer_name,
        c.contact_number as customer_contact

      FROM pos_transactions pt
      LEFT JOIN users u ON pt.user_id = u.uid
      LEFT JOIN pos_terminals t ON pt.terminal_id = t.id
      LEFT JOIN shifts s ON pt.shift_id = s.id
      LEFT JOIN sales_transactions st ON pt.sale_id = st.id
      LEFT JOIN customers c ON st.customer_id = c.id
    `;

    // Add WHERE clause if saleId is provided
    if (saleId) {
      posTransactionsQuery += ` WHERE pt.sale_id = ?`;
    }

    posTransactionsQuery += ` ORDER BY pt.transaction_time DESC`;

    const posTransactions = await query(posTransactionsQuery, saleId ? [saleId] : []);

    // Transform the data to match the expected format
    const formattedTransactions = posTransactions.map((row: any) => ({
      id: row.id,
      saleId: row.sale_id,
      shiftId: row.shift_id,
      userId: row.user_id,
      terminalId: row.terminal_id,
      transactionType: row.transaction_type,
      subtotal: parseFloat(row.subtotal),
      taxAmount: parseFloat(row.tax_amount),
      discountAmount: parseFloat(row.discount_amount),
      totalAmount: parseFloat(row.total_amount),
      paymentMethod: row.payment_method,
      paymentReference: row.payment_reference,
      customerCount: parseInt(row.customer_count),
      transactionTime: row.transaction_time,
      voidReason: row.void_reason,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: row.user_id ? {
        id: row.user_id,
        username: row.username,
        fullName: row.user_full_name,
        role: row.user_role
      } : undefined,
      terminal: row.terminal_id ? {
        id: row.terminal_id,
        name: row.terminal_name,
        location: row.terminal_location,
        ipAddress: row.terminal_ip
      } : undefined,
      shift: row.shift_id ? {
        id: row.shift_id,
        startTime: row.shift_start_time,
        endTime: row.shift_end_time,
        status: row.shift_status
      } : undefined,
      sale: row.sale_id ? {
        id: row.sale_id,
        customer: {
          id: row.customer_id || '',
          name: row.customer_name || 'Walk-in Customer',
          contactNumber: row.customer_contact || ''
        }
      } : undefined
    }));

    return NextResponse.json({
      success: true,
      data: formattedTransactions,
      count: formattedTransactions.length
    });
  } catch (error) {
    console.error('Error fetching POS transactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch POS transactions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensurePosTransactionItemsSchema();

    const body = await request.json();
    const {
      saleId,
      shiftId,
      userId,
      terminalId,
      transactionType = 'sale',
      subtotal,
      taxAmount = 0,
      discountAmount = 0,
      totalAmount,
      paymentMethod,
      paymentReference,
      customerCount = 1,
      voidReason,
      notes
    } = body;

    // Generate a unique ID for the POS transaction
    const posTransactionId = `PT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // A POS transaction must always belong to an establishment. terminalId is
    // optional here (terminalId || null below), so fall back to the main
    // branch rather than writing a branchless row. Resolved before the INSERT
    // so the helpers' pool use never overlaps another connection.
    const txnBranchId: string = terminalId
      ? (await resolveTerminalBranch(terminalId)).branchId
      : await mainBranchId();

    // Insert POS transaction
    const insertQuery = `
      INSERT INTO pos_transactions (
        id, sale_id, shift_id, user_id, terminal_id, transaction_type,
        subtotal, tax_amount, discount_amount, total_amount,
        payment_method, payment_reference, customer_count,
        void_reason, notes, branch_id, transaction_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    await query(insertQuery, [
      posTransactionId, saleId, shiftId || null, userId, terminalId || null, transactionType,
      subtotal, taxAmount, discountAmount, totalAmount,
      paymentMethod, paymentReference || null, customerCount,
      voidReason || null, notes || null, txnBranchId
    ]);

    return NextResponse.json({
      success: true,
      data: { id: posTransactionId },
      message: 'POS transaction created successfully'
    });
  } catch (error) {
    console.error('Error creating POS transaction:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create POS transaction' },
      { status: 500 }
    );
  }
}
