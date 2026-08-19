const mysql = require('mysql2/promise');

async function checkSalesOrderTable() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'rootpassword',
      database: 'alon_pos'
    });

    console.log('Connected to database');

    // Check table structure
    const [rows] = await connection.execute('DESCRIBE sales_orders');
    console.log('Sales Orders Table Structure:');
    console.log('----------------------------');
    rows.forEach(row => {
      console.log(`${row.Field}: ${row.Type} ${row.Null === 'YES' ? '(NULL)' : '(NOT NULL)'} ${row.Default !== null ? `DEFAULT ${row.Default}` : ''}`);
    });

  } catch (error) {
    console.error('Error checking table structure:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

checkSalesOrderTable();
