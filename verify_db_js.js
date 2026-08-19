const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function verify() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alon_pos'
  });

  try {
    const [rows] = await connection.execute('SELECT status, count(*) as count FROM approval_queue GROUP BY status');
    console.log('Database Status Counts:');
    console.table(rows);
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

verify();
