const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'alon_pos',
    password: process.env.DB_PASSWORD || 'alon123',
    database: process.env.DB_NAME || 'alon_pos',
  });

  try {
    console.log('Connected to database');

    // Add min_sale_id column if it doesn't exist
    try {
        await connection.query("ALTER TABLE z_readings ADD COLUMN min_sale_id VARCHAR(50) AFTER transaction_count");
        console.log('Added min_sale_id column');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('min_sale_id column already exists');
        } else {
            console.error('Error adding min_sale_id:', e);
        }
    }

    // Add max_sale_id column if it doesn't exist
    try {
        await connection.query("ALTER TABLE z_readings ADD COLUMN max_sale_id VARCHAR(50) AFTER min_sale_id");
        console.log('Added max_sale_id column');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('max_sale_id column already exists');
        } else {
            console.error('Error adding max_sale_id:', e);
        }
    }

    console.log('Migration complete');
  } catch (error) {
    console.error('Database connection error:', error);
  } finally {
    await connection.end();
  }
}

migrate();
