const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alon_pos'
  });

  try {
    console.log('🔄 Updating sales_orders status ENUM...');
    
    // Update the status ENUM to include new status values
    const alterQuery = `
      ALTER TABLE sales_orders 
      MODIFY COLUMN status ENUM('Pending', 'Paid', 'Shipped', 'Delivered', 'Failed', 'Returned', 'To Deliver', 'Fully Delivered') DEFAULT 'Pending'
    `;

    await connection.execute(alterQuery);
    console.log('✅ Sales orders status ENUM updated to include To Deliver and Fully Delivered');
    
    // Record in migrations table
    try {
      await connection.execute(
        'INSERT INTO migrations (name, timestamp) VALUES (?, ?)',
        ['016_update_sales_orders_status_enum', '2026-01-30_17-05-00']
      );
      console.log('✅ Migration recorded in migrations table');
    } catch (e) {
      console.log('ℹ️  Migration may have already been recorded');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await connection.end();
    process.exit(0);
  }
}

runMigration();
