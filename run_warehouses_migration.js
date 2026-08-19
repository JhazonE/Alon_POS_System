// Direct migration script for warehouses table
const mysql = require('mysql2/promise');

async function createWarehousesTable() {
  let connection;

  try {
    console.log('Connecting to database...');

    // Create connection using the same config as the app
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'alon_pos',
      port: process.env.DB_PORT || 3307,
    });

    console.log('✅ Connected to database');

    // Create warehouses table
    console.log('Creating warehouses table...');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS warehouses (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        location VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    await connection.execute(createTableSQL);
    console.log('✅ Warehouses table created successfully');

    // Insert default warehouses
    console.log('Inserting default warehouses...');

    const insertDataSQL = `
      INSERT IGNORE INTO warehouses (id, name, location, is_active) VALUES
      ('wh_main', 'Main Warehouse', 'Building A, Floor 1', TRUE),
      ('wh_secondary', 'Secondary Warehouse', 'Building B, Floor 2', TRUE),
      ('wh_distribution', 'Distribution Center', 'Building C, Ground Floor', TRUE)
    `;

    await connection.execute(insertDataSQL);
    console.log('✅ Default warehouses inserted successfully');

    // Verify the table was created
    console.log('Verifying table creation...');
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM warehouses');
    console.log(`✅ Table created with ${rows[0].count} default warehouses`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ Database connection closed');
    }
  }
}

// Run the migration
createWarehousesTable()
  .then(() => {
    console.log('🎉 Warehouse migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
