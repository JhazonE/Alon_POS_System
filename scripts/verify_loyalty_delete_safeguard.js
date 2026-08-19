const mysql = require('mysql2/promise');
require('dotenv').config();

async function testLoyaltyDeleteSafeguard() {
  console.log('--- Testing Loyalty Delete Safeguard ---');

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'alon_pos',
    });

    // 1. Find or create a test customer
    const [customers] = await connection.execute('SELECT id FROM customers LIMIT 1');
    if (customers.length === 0) {
      console.error('No customers found to test with.');
      return;
    }
    const customerId = customers[0].id;

    // 2. Create a test loyalty record
    const loyaltyId = `TEST-LOY-${Date.now()}`;
    await connection.execute(
      'INSERT INTO customer_loyalty (id, customer_id, current_points) VALUES (?, ?, ?)',
      [loyaltyId, customerId, 100]
    );
    console.log(`Created test loyalty record: ${loyaltyId}`);

    // 3. Add a 'purchase' transaction to point_history
    const historyId = `TEST-PH-${Date.now()}`;
    await connection.execute(
      "INSERT INTO point_history (id, customer_loyalty_id, transaction_type, points, reason) VALUES (?, ?, 'purchase', 10, 'Test Purchase')",
      [historyId, loyaltyId]
    );
    console.log(`Created test purchase history: ${historyId}`);

    // 4. Test the logic
    const transactionCheckSql = `
      SELECT COUNT(*) as count 
      FROM point_history 
      WHERE customer_loyalty_id = ? AND transaction_type IN ('purchase', 'redemption')
    `;
    const [rows] = await connection.execute(transactionCheckSql, [loyaltyId]);
    
    if (rows && rows.length > 0 && rows[0].count > 0) {
      console.log('✅ Safeguard Triggered: Records with transactions are blocked from deletion.');
    } else {
      console.error('❌ Safeguard Failed: Record with transaction was NOT blocked.');
    }

    // 5. Clean up
    await connection.execute('DELETE FROM point_history WHERE id = ?', [historyId]);
    await connection.execute('DELETE FROM customer_loyalty WHERE id = ?', [loyaltyId]);
    console.log('Cleaned up test records.');

    console.log('--- Test Complete ---');
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    if (connection) await connection.end();
  }
}

testLoyaltyDeleteSafeguard();
