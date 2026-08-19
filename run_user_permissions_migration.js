const mysql = require('mysql2/promise');

async function runUserPermissionsMigration() {
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

    // Create user_permissions table
    const createUserPermissionsTable = `
      CREATE TABLE IF NOT EXISTS user_permissions (
        id VARCHAR(50) PRIMARY KEY,
        user_uid VARCHAR(255) NOT NULL,
        permission VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_permission (user_uid, permission),
        INDEX idx_user_uid (user_uid),
        INDEX idx_permission (permission)
      )
    `;

    await connection.execute(createUserPermissionsTable);
    console.log('✅ User permissions table created/verified');

    // Verify the table exists
    const [rows] = await connection.execute('SHOW TABLES LIKE "user_permissions"');
    if (rows.length > 0) {
      console.log('✅ user_permissions table exists in database');
    } else {
      console.log('❌ user_permissions table still does not exist');
    }

    await connection.end();
  } catch (error) {
    console.error('Error:', error);
    if (connection) {
      await connection.end();
    }
  }
}

runUserPermissionsMigration();
