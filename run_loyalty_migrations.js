const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'rootpassword',
  database: 'alon_pos'
};

async function runMigrations() {
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Connected to database');

    // Check if point_history table already exists
    const [existingTables] = await connection.execute("SHOW TABLES LIKE 'point_history'");
    if (existingTables.length > 0) {
      console.log('✅ Point history table already exists');
      return;
    }

    // Migration 019: Create point history table
    console.log('Running migration 019: Create point history table');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS point_history (
        id VARCHAR(50) PRIMARY KEY,
        customer_loyalty_id VARCHAR(50) NOT NULL,
        transaction_type ENUM('add', 'remove', 'purchase', 'redemption', 'expiration', 'adjustment') NOT NULL,
        points INT NOT NULL,
        reason VARCHAR(255),
        transaction_reference VARCHAR(100),
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_loyalty_id) REFERENCES customer_loyalty(id) ON DELETE CASCADE,
        INDEX idx_customer_loyalty_id (customer_loyalty_id),
        INDEX idx_transaction_type (transaction_type),
        INDEX idx_created_at (created_at)
      )
    `);
    console.log('✅ Point history table created');

    console.log('Point history migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

runMigrations();
