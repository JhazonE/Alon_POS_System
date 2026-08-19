const { createConnection } = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Extract DB config from environment or fallback to defaults
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alon_pos',
  multipleStatements: true
};

async function runMigration() {
  console.log('Starting External API tables migration...');
  
  let connection;
  try {
    connection = await createConnection(dbConfig);
    console.log('Connected to database.');

    const sqlPath = path.join(__dirname, 'create_external_api_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing migration script...');
    await connection.query(sql);
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
