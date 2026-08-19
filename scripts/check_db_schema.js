const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alon_pos',
  });

  try {
    console.log('--- Products Table Indices ---');
    const [indices] = await connection.query('SHOW INDEX FROM products');
    console.log(JSON.stringify(indices, null, 2));

    console.log('\n--- Products Table Structure ---');
    const [columns] = await connection.query('DESCRIBE products');
    console.log(JSON.stringify(columns, null, 2));

  } catch (error) {
    console.error(error);
  } finally {
    await connection.end();
  }
}

main();
