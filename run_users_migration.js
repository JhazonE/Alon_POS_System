const mysql = require('mysql2/promise');

async function runUsersMigration() {
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

    // Create users table
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        uid VARCHAR(255) PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        display_name VARCHAR(255),
        photo_url VARCHAR(500),
        disabled BOOLEAN DEFAULT FALSE,
        creation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_disabled (disabled)
      )
    `;

    await connection.execute(createUsersTable);
    console.log('✅ Users table created/verified');

    // Verify the table exists
    const [rows] = await connection.execute('SHOW TABLES LIKE "users"');
    if (rows.length > 0) {
      console.log('✅ users table exists in database');
    } else {
      console.log('❌ users table still does not exist');
    }

    await connection.end();
  } catch (error) {
    console.error('Error:', error);
    if (connection) {
      await connection.end();
    }
  }
}

runUsersMigration();
