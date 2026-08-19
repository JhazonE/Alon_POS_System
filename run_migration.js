const mysql = require('mysql2/promise');

async function runMigration() {
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

    // Create conversion_factors table manually
    const createConversionFactorsTable = `
      CREATE TABLE IF NOT EXISTS conversion_factors (
        id VARCHAR(50) PRIMARY KEY,
        product_id VARCHAR(50) NOT NULL,
        unit VARCHAR(100) NOT NULL,
        factor DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `;

    await connection.execute(createConversionFactorsTable);
    console.log('✅ Conversion factors table created/verified');

    // Verify the table exists
    const [rows] = await connection.execute('SHOW TABLES LIKE "conversion_factors"');
    if (rows.length > 0) {
      console.log('✅ conversion_factors table exists in database');
    } else {
      console.log('❌ conversion_factors table still does not exist');
    }

    await connection.end();
  } catch (error) {
    console.error('Error:', error);
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
