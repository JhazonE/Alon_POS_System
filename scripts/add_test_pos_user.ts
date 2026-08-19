
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

async function addTestUser() {
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

    const username = 'testpos';
    const passwordPlain = 'password';
    const hashedPassword = await bcrypt.hash(passwordPlain, 10);

    // Check if exists
    const [rows]: any = await connection.execute('SELECT * FROM users WHERE username = ?', [username]);
    
    let userUid;

    if (rows.length > 0) {
        console.log('User testpos already exists, updating password...');
        await connection.execute('UPDATE users SET password = ?, disabled = 0 WHERE username = ?', [hashedPassword, username]);
        userUid = rows[0].uid;
    } else {
        console.log('Creating user testpos...');
        userUid = uuidv4();
        await connection.execute(
          'INSERT INTO users (uid, username, password, user_type, display_name, disabled, creation_time) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userUid, username, hashedPassword, 'cashier', 'Test POS User', false, new Date()]
        );
    }

    // Add permissions
    const permissions = ['access_pos', 'view_dashboard'];
    
    for (const perm of permissions) {
        // Check if perm exists
        const [permRows]: any = await connection.execute('SELECT * FROM user_permissions WHERE user_uid = ? AND permission = ?', [userUid, perm]);
        if (permRows.length === 0) {
             const permId = uuidv4();
             await connection.execute('INSERT INTO user_permissions (id, user_uid, permission) VALUES (?, ?, ?)', [permId, userUid, perm]);
             console.log(`Added permission: ${perm}`);
        }
    }

    console.log('✅ Test user `testpos` / `password` ready.');

  } catch (error) {
    console.error('❌ Failed to add test user:', error);
  } finally {
    if (connection) await connection.end();
  }
}

addTestUser();
