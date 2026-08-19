const mysql = require('mysql2/promise');
require('dotenv').config();

async function debugReturns() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'alon_pos',
    password: process.env.DB_PASSWORD || 'alon123',
    database: process.env.DB_NAME || 'alon_pos',
  });

  try {
    console.log('Connected to database');

    const [rows] = await connection.query(`
        SELECT pt.order_number, pt.transaction_type, st.status 
        FROM pos_transactions pt 
        LEFT JOIN sales_transactions st ON pt.sale_id = st.id 
        WHERE pt.transaction_type = 'return'
    `);
    console.log('All Return Transactions:', rows);
    
    const [rows2] = await connection.query(`
         SELECT pt.order_number, pt.transaction_type, st.status 
        FROM sales_transactions st 
        JOIN pos_transactions pt ON st.id = pt.sale_id
        WHERE st.status = 'Returned'
    `);
    console.log('Sales with status "Returned":', rows2);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

debugReturns();
