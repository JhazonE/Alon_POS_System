const mysql = require('mysql2/promise');

async function checkUsersTable() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'rootpassword',
      database: 'alon_pos'
    });

    console.log('Connected to database');

    // Check table structure
    const [rows] = await connection.execute('DESCRIBE users');
    console.log('Users table structure:');
    console.log(rows);

    // Add password column if it doesn't exist
    try {
      await connection.execute('ALTER TABLE users ADD COLUMN password VARCHAR(255) NOT NULL');
      console.log('✅ Password column added to users table');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Password column already exists');
      } else {
        console.error('Error adding password column:', error);
      }
    }

    // Check if there are any existing users
    const [userRows] = await connection.execute('SELECT COUNT(*) as count FROM users');
    console.log(`Total users in table: ${userRows[0].count}`);

    // Try to insert a test user
    console.log('Trying to insert test user...');
    const uid = 'test-' + Date.now();
    const username = 'testuser';
    const password = 'testpass';
    const creationTime = new Date().toISOString();

    await connection.execute(
      'INSERT INTO users (uid, username, display_name, photo_url, disabled, creation_time, password) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid, username, username, '', false, creationTime, password]
    );

    console.log('Test user inserted successfully');

    // Clean up
    await connection.execute('DELETE FROM users WHERE uid = ?', [uid]);
    console.log('Test user cleaned up');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkUsersTable();
