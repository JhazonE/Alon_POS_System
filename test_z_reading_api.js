const mysql = require('mysql2/promise');
require('dotenv').config();

async function testZReadingAPI() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'alon_pos',
    password: process.env.DB_PASSWORD || 'alon123',
    database: process.env.DB_NAME || 'alon_pos',
  });

  try {
    console.log('Connected to database');
    
    // Check if table exists
    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'z_readings'"
    );
    console.log('Table exists:', tables.length > 0);
    
    if (tables.length > 0) {
      // Get table structure
      const [columns] = await connection.query(
        "DESCRIBE z_readings"
      );
      console.log('\nTable structure:');
      console.log(columns);
      
      // Get data
      const [rows] = await connection.query(
        'SELECT * FROM z_readings ORDER BY report_date DESC LIMIT 3'
      );
      console.log('\nSample data:');
      console.log(JSON.stringify(rows, null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

testZReadingAPI();
