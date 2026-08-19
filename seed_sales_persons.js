const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'alon_pos',
  multipleStatements: true
};

async function seedSalesPersons() {
  let connection;

  try {
    console.log('🔄 Connecting to database...');
    connection = await mysql.createConnection(dbConfig);

    console.log('📋 Creating sales_persons table if it doesn\'t exist...');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS sales_persons (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        contact_number VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

    await connection.execute(createTableSQL);
    console.log('✅ Sales persons table ensured');

    // Check if table is empty
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM sales_persons');
    const count = rows[0].count;

    if (count === 0) {
      console.log('📝 Inserting default sales persons...');

      const insertDataSQL = `
        INSERT INTO sales_persons (id, name, contact_number, is_active) VALUES
        ('sp_1', 'John Doe', '+1-555-0101', TRUE),
        ('sp_2', 'Jane Smith', '+1-555-0102', TRUE),
        ('sp_3', 'Mike Johnson', '+1-555-0103', TRUE),
        ('sp_4', 'Sarah Wilson', '+1-555-0104', TRUE),
        ('sp_5', 'David Brown', '+1-555-0105', TRUE),
        ('sp_6', 'Lisa Davis', '+1-555-0106', TRUE),
        ('sp_7', 'Robert Miller', '+1-555-0107', TRUE),
        ('sp_8', 'Emily Garcia', '+1-555-0108', TRUE)
      `;

      await connection.execute(insertDataSQL);
      console.log('✅ Default sales persons inserted successfully');
    } else {
      console.log(`ℹ️  Sales persons table already has ${count} records`);
    }

    // Display current sales persons
    console.log('\n📊 Current sales persons in database:');
    const [salesPersons] = await connection.execute(
      'SELECT id, name, contact_number, is_active FROM sales_persons ORDER BY name'
    );

    salesPersons.forEach(person => {
      console.log(`   - ${person.name} (${person.contact_number || 'No contact'}) - ${person.is_active ? 'Active' : 'Inactive'}`);
    });

  } catch (error) {
    console.error('❌ Error seeding sales persons:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the seeding function
seedSalesPersons()
  .then(() => {
    console.log('\n🎉 Sales persons seeding completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Seeding failed:', error);
    process.exit(1);
  });
