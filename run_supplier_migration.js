const mysql = require('mysql2/promise');

async function runSupplierMigration() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'rootpassword',
      database: 'alon_pos'
    });

    console.log('Connected to MySQL');

    // Create suppliers table
    const createSuppliersTable = `
      CREATE TABLE IF NOT EXISTS suppliers (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        contact_number VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    await connection.execute(createSuppliersTable);
    console.log('✅ Suppliers table created');

    // Add supplier_id column to products table
    const alterProductsTable = `
      ALTER TABLE products
      ADD COLUMN supplier_id VARCHAR(50),
      ADD FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    `;

    try {
      await connection.execute(alterProductsTable);
      console.log('✅ Added supplier_id column to products table');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️  supplier_id column already exists');
      } else {
        throw error;
      }
    }

    await connection.end();
    console.log('✅ Supplier migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    if (connection) {
      await connection.end();
    }
  }
}

runSupplierMigration();
