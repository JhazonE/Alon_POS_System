const mysql = require('mysql2/promise');

async function checkTable() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'rootpassword',
      database: 'alon_pos'
    });

    console.log('Connected to MySQL');

    // Check if conversion_factors table exists
    const [rows] = await connection.execute('SHOW TABLES LIKE "conversion_factors"');
    if (rows.length > 0) {
      console.log('✅ conversion_factors table exists');

      // Also check the structure
      const [columns] = await connection.execute('DESCRIBE conversion_factors');
      console.log('Table structure:', columns.map(col => col.Field).join(', '));
    } else {
      console.log('❌ conversion_factors table does not exist');

      // List all tables to see what's available
      const [tables] = await connection.execute('SHOW TABLES');
      console.log('Available tables:', tables.map(t => Object.values(t)[0]).join(', '));
    }

    await connection.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkTable();
