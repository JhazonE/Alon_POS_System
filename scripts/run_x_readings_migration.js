const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'alon_pos',
    password: process.env.DB_PASSWORD || 'alon123',
    database: process.env.DB_NAME || 'alon_pos',
    multipleStatements: true,
  });

  try {
    console.log('Connected to database');

    const sqlFile = path.join(__dirname, 'create_x_readings_table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('Running X-readings table migration...');
    await connection.query(sql);

    console.log('✓ X-readings table created successfully');
    console.log('✓ Sample data inserted');
  } catch (error) {
    console.error('Error running migration:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigration()
  .then(() => {
    console.log('\nMigration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });