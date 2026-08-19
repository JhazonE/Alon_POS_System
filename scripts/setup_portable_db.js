const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  console.log('Starting Portable MySQL Database Setup...');

  let connection;
  
  // Try connecting with blank password (fresh installation)
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      port: 3307
    });
    console.log('Connected to MySQL with blank password.');
    
    // Set password to match .env
    await connection.query("ALTER USER 'root'@'localhost' IDENTIFIED BY 'rootpassword';");
    console.log('✅ Root password set to "rootpassword"');
    
    await connection.query("FLUSH PRIVILEGES;");
    
  } catch (err) {
    console.log('Could not connect with blank password. Trying with "rootpassword"...');
    try {
      connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'rootpassword',
        port: 3307
      });
      console.log('Connected to MySQL with "rootpassword".');
    } catch (err2) {
      console.error('❌ Failed to connect to MySQL:', err2.message);
      throw err2;
    }
  }

  try {
    // Create database
    await connection.query("CREATE DATABASE IF NOT EXISTS alon_pos;");
    console.log('✅ Database "alon_pos" created or already exists.');
    
    await connection.end();
    
    // Now run the existing migration script to create tables
    console.log('Running table creation script...');
    
    // We can run create_pos_tables.js by spawning it or requiring it if it doesn't self-execute with hardcoded env.
    // create_pos_tables.js self-executes and uses src/lib/mysql which reads .env.
    // Since we verified .env has DB_PASSWORD=rootpassword and DB_NAME=alon_pos, it should work.
    
    const { exec } = require('child_process');
    exec('node create_pos_tables.js', (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error running table creation: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`stderr: ${stderr}`);
      }
      console.log(`stdout: ${stdout}`);
      console.log('🎉 Database setup complete!');
    });

  } catch (error) {
    console.error('❌ Error during setup:', error);
  }
}

module.exports = setupDatabase;
