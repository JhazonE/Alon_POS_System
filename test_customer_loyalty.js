const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'alon_pos',
    });

    console.log('Connected to database');

    // Check if customer_loyalty table exists
    const [rows] = await connection.execute("SHOW TABLES LIKE 'customer_loyalty'");
    if (rows.length > 0) {
      console.log('✅ customer_loyalty table exists');
    } else {
      console.log('❌ customer_loyalty table does not exist');
    }

    // Check if customers table exists and has data
    try {
      const [customerResults] = await connection.execute("SELECT COUNT(*) as count FROM customers");
      console.log('Customers table has', customerResults[0].count, 'records');
    } catch (customerError) {
      console.error('Customers table query failed:', customerError.message);
    }

    // Try to query the table
    try {
      const [results] = await connection.execute(`
        SELECT cl.id, cl.customer_id, c.name, c.contact_number
        FROM customer_loyalty cl
        LEFT JOIN customers c ON cl.customer_id = c.id
        LIMIT 5
      `);
      console.log('Query successful, results:', results);
    } catch (queryError) {
      console.error('Query failed:', queryError.message);
    }

    await connection.end();
  } catch (error) {
    console.error('Database connection failed:', error);
  }
}

testConnection();
