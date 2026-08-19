const mysql = require('mysql2/promise');

async function updateSuppliersTable() {
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

    // Check and add columns individually
    const columns = [
      { name: 'address', type: 'TEXT' },
      { name: 'payment_terms', type: 'VARCHAR(100)' },
      { name: 'markup_percentage', type: 'DECIMAL(5,2)' }
    ];

    for (const column of columns) {
      try {
        // Check if column exists
        const [rows] = await connection.execute(
          'SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          ['alon_pos', 'suppliers', column.name]
        );

        if (rows.length === 0) {
          // Column doesn't exist, add it
          const alterQuery = `ALTER TABLE suppliers ADD COLUMN ${column.name} ${column.type}`;
          await connection.execute(alterQuery);
          console.log(`✅ Added ${column.name} column to suppliers table`);
        } else {
          console.log(`ℹ️  ${column.name} column already exists`);
        }
      } catch (error) {
        console.error(`❌ Error checking/adding ${column.name}:`, error.message);
      }
    }

    await connection.end();
    console.log('✅ Suppliers table update completed successfully');
  } catch (error) {
    console.error('❌ Update failed:', error);
    if (connection) {
      await connection.end();
    }
  }
}

updateSuppliersTable();
