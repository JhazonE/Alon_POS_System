const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  console.log('Starting Portable MySQL Database Setup...');

  let connection;
  
  // Try connecting with blank password (fresh installation) or rootpassword
  let connected = false;
  let retries = 5;
  while (retries > 0 && !connected) {
    try {
      connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        port: 3307,
        multipleStatements: true
      });
      console.log('Connected to MySQL with blank password.');
      connected = true;
      
      // Set password to match .env
      await connection.query("ALTER USER 'root'@'localhost' IDENTIFIED BY 'rootpassword';");
      console.log('✅ Root password set to "rootpassword"');
      await connection.query("FLUSH PRIVILEGES;");
      
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        console.log(`MySQL server not ready (ECONNREFUSED), retrying in 2 seconds... (${retries} retries left)`);
        retries--;
        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        // Likely access denied or other error, try with rootpassword
        console.log('Could not connect with blank password. Trying with "rootpassword"...');
        try {
          connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'rootpassword',
            port: 3307,
            multipleStatements: true
          });
          console.log('Connected to MySQL with "rootpassword".');
          connected = true;
        } catch (err2) {
          if (err2.code === 'ECONNREFUSED') {
            console.log(`MySQL server not ready (ECONNREFUSED) with rootpassword, retrying in 2 seconds... (${retries} retries left)`);
            retries--;
            if (retries > 0) await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.error('❌ Failed to connect to MySQL:', err2.message);
            throw err2;
          }
        }
      }
    }
  }

  try {
    // Create database
    await connection.query("CREATE DATABASE IF NOT EXISTS alon_pos;");
    console.log('✅ Database "alon_pos" created or already exists.');
    
    // Switch to database
    await connection.query("USE alon_pos;");
    
    console.log('Importing database dump from Dump20260122...');
    const dumpDir = path.join(__dirname, 'Dump20260122');
    if (fs.existsSync(dumpDir)) {
      const files = fs.readdirSync(dumpDir);
      // Sort files to ensure tables are created before data or foreign keys (optional but good)
      // They are already named by table, so alphabetical order is usually fine if constraints are deferred or disabled.
      // MySQL dump usually handles this.
      for (const file of files) {
        if (file.endsWith('.sql')) {
          console.log(`Importing ${file}...`);
          const sql = fs.readFileSync(path.join(dumpDir, file), 'utf8');
          try {
            await connection.query(sql);
          } catch (e) {
            console.error(`Error importing ${file}:`, e.message);
          }
        }
      }
      console.log('🎉 Database dump imported successfully!');
    } else {
      console.log('⚠️ Dump directory not found at:', dumpDir);
    }

    await connection.end();
    console.log('🎉 Database setup complete!');

  } catch (error) {
    console.error('❌ Error during setup:', error);
  }
}

module.exports = setupDatabase;
