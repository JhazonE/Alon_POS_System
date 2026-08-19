
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: '../../.env' });

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'rootpassword',
  database: 'alon_pos',
};

async function migrate() {
  let connection;
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected.');

    console.log('Adding cash_denominations column to shifts table...');
    
    // Check if column exists first
    const [columns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'shifts' AND COLUMN_NAME = 'cash_denominations'
    `, [dbConfig.database]);

    if ((columns as any[]).length === 0) {
        await connection.query(`
            ALTER TABLE shifts
            ADD COLUMN cash_denominations JSON NULL AFTER cash_difference
        `);
        console.log('Column cash_denominations added successfully.');
    } else {
        console.log('Column cash_denominations already exists.');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

migrate();
