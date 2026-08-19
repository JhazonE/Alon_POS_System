const mysql = require('mysql2/promise');

async function checkTable() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '1234',
      database: 'alon_pos'
    });

    const [rows] = await connection.execute("SHOW TABLES LIKE 'customer_payments'");
    console.log('Table exists:', rows.length > 0);

    if (rows.length > 0) {
      const [columns] = await connection.execute("DESCRIBE customer_payments");
      console.log('Table structure:', columns);
    }

    await connection.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkTable();
