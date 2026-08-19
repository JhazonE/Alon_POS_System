
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alon_pos',
  });

  try {
    console.log('Checking if earns_points column exists in products table...');
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products' AND COLUMN_NAME = 'earns_points'
    `, [process.env.DB_NAME || 'alon_pos']);

    if (columns.length === 0) {
      console.log('Adding earns_points column...');
      await connection.execute(`
        ALTER TABLE products 
        ADD COLUMN earns_points BOOLEAN DEFAULT TRUE
      `);
      console.log('✅ earns_points column added successfully.');
    } else {
      console.log('ℹ️ earns_points column already exists.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await connection.end();
  }
}

migrate();
