/* eslint-disable @typescript-eslint/no-require-imports */
const { query } = require('../lib/mysql');

async function insertSalesTransaction() {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 7);
    
    // Generate IDs following the existing pattern in the database
    const saleId = `SALE-${timestamp}-${randomStr}`;
    const posTransId = `PT-${timestamp}-${randomStr}`;
    const paymentDetailsId = `PD-${timestamp}-${randomStr}`;
    
    // Data from the uploaded image:
    // Receipt No: 7308
    // Date: January 28, 2026 04:12 PM 
    // Terminal: Counter 1 (terminal_default_01)
    // Cashier: admin (user_id: ac83337e-c14b-4094-8361-1b2e32bfe975)
    // Customer: Walk-in (null customer_id)
    // Discount: 0.00
    // Sales Amount: 15.00
    // Amount Paid: 15.00
    // Balance: 0.00
    // Cost: 0.00
    // Profit: 0.00
    // Vatable Sales: 13.39
    // VAT Amount: 1.61
    // Non-Vat Sales: 0.00
    // Payment Type: Cash
    // Payment Status: Paid
    
    const transactionDate = '2026-01-28 08:12:00'; // UTC time (04:12 PM PHT = 08:12 AM UTC)
    const userId = 'ac83337e-c14b-4094-8361-1b2e32bfe975'; // admin
    const terminalId = 'terminal_default_01'; // Counter 1
    
    const vatAmount = 1.61;
    const total = 15.00;
    const discount = 0.00;
    
    try {
        // 1. Insert into sales_transactions
        await query(
            `INSERT INTO sales_transactions 
             (id, customer_id, invoice_date, date, due_date, total, payment_method, status, notes, branch_id)
             VALUES (?, NULL, ?, ?, NULL, ?, 'CASH', 'Paid', 'POS Sale - Receipt #7308',
                     (SELECT id FROM branches WHERE is_main = 1 LIMIT 1))`,
            [saleId, '2026-01-28', '2026-01-28', total]
        );
        console.log('✅ Inserted into sales_transactions: ' + saleId);
        
        // 2. Insert into pos_transactions
        await query(
            `INSERT INTO pos_transactions 
             (id, sale_id, shift_id, user_id, terminal_id, transaction_type, subtotal, tax_amount, 
              discount_amount, total_amount, payment_method, payment_reference, customer_count, 
              transaction_time, void_reason, notes, payment_status, payment_details_id, payment_validated_at, branch_id)
             VALUES (?, ?, NULL, ?, ?, 'sale', ?, ?, ?, ?, 'CASH', NULL, 1,
                     ?, NULL, 'Receipt #7308, Tendered: ₱15.00, Change: ₱0.00', 'completed', ?, ?,
                     (SELECT id FROM branches WHERE is_main = 1 LIMIT 1))`,
            [posTransId, saleId, userId, terminalId, total, vatAmount, discount, total, 
             transactionDate, paymentDetailsId, transactionDate]
        );
        console.log('✅ Inserted into pos_transactions: ' + posTransId);
        
        // 3. Insert into payment_details (if table exists)
        try {
            await query(
                `INSERT INTO payment_details 
                 (id, transaction_id, payment_method, amount_tendered, change_given, validation_status, 
                  validated_at, validated_by)
                 VALUES (?, ?, 'CASH', ?, 0.00, 'validated', ?, ?)`,
                [paymentDetailsId, posTransId, total, transactionDate, userId]
            );
            console.log('✅ Inserted into payment_details: ' + paymentDetailsId);
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : 'Unknown error';
            console.log('⚠️  Skipped payment_details insertion:', errorMsg);
        }
        
        // 4. Verify the order_number was assigned
        const result = await query('SELECT order_number FROM pos_transactions WHERE id = ?', [posTransId]) as any[];
        console.log('✅ Assigned order_number:', result[0]?.order_number);
        
        console.log('\n🎉 Successfully inserted sales transaction from image!');
        console.log('Sale ID:', saleId);
        console.log('POS Transaction ID:', posTransId);
        
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Error:', errorMsg);
    }
    
    process.exit(0);
}

insertSalesTransaction();
