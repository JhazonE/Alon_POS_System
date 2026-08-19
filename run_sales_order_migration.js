const mysql = require('mysql2/promise');

async function runSalesOrderMigration() {
  let connection;

  try {
    // Create connection using the same config as in lib/mysql.ts
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'rootpassword',
      database: 'alon_pos'
    });

    console.log('Connected to database');

    // Add new columns to sales_orders table
    const alterTableSQL = `
      ALTER TABLE sales_orders
      ADD COLUMN shipping DECIMAL(10,2) DEFAULT 0.00 AFTER total,
      ADD COLUMN warehouse_id VARCHAR(50) AFTER shipping,
      ADD COLUMN sales_person_id VARCHAR(50) AFTER warehouse_id,
      ADD COLUMN note TEXT AFTER sales_person_id,
      ADD INDEX idx_warehouse_id (warehouse_id),
      ADD INDEX idx_sales_person_id (sales_person_id)
    `;

    await connection.execute(alterTableSQL);
    console.log('✅ Sales orders table altered with new fields: shipping, warehouse_id, sales_person_id, note');

  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('✅ Fields already exist in sales_orders table');
    } else {
      console.error('❌ Error adding fields to sales_orders table:', error);
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

runSalesOrderMigration();
