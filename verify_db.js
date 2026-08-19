const mysql = require('mysql2/promise');
require('dotenv').config();

async function verify() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'alon_pos',
    password: process.env.DB_PASSWORD || 'alon123',
    database: process.env.DB_NAME || 'alon_pos',
  });

  try {
    console.log('Checking pos_terminals columns...');
    const [columns] = await connection.query('SHOW COLUMNS FROM pos_terminals');
    const columnNames = columns.map(c => c.Field);
    
    const hasZCounter = columnNames.includes('z_counter');
    const hasResetCounter = columnNames.includes('reset_counter');
    
    console.log(`z_counter exists: ${hasZCounter}`);
    console.log(`reset_counter exists: ${hasResetCounter}`);

    if (hasZCounter && hasResetCounter) {
      console.log('✅ DB Schema verified.');
    } else {
      console.error('❌ DB Schema missing columns!');
    }

    const terminalId = 'terminal_default_01';
    await connection.query('UPDATE pos_terminals SET z_counter = z_counter + 1 WHERE id = ?', [terminalId]);
    console.log('✅ Increment simulation successful.');

  } catch (err) {
    console.error('Migration/Verification error:', err);
  } finally {
    await connection.end();
  }
}

verify();
