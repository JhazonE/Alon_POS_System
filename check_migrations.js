const mysql = require('mysql2/promise');

async function checkMigrations() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'rootpassword',
      database: 'alon_pos'
    });

    console.log('Connected to MySQL');

    // Check executed migrations
    const [migrations] = await connection.execute('SELECT * FROM migrations ORDER BY executed_at DESC');
    console.log('Executed migrations:');
    migrations.forEach(m => {
      console.log(`- ${m.name} (${m.timestamp}) - ${m.executed_at}`);
    });

    await connection.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkMigrations();
