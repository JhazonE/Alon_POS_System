const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alon_pos',
    port: process.env.DB_PORT || 3306,
};

async function addEnableNegativeInventoryColumn() {
    let connection;
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        // Check if column exists
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pos_settings' AND COLUMN_NAME = 'enable_negative_inventory'
        `, [dbConfig.database]);

        if (columns.length > 0) {
            console.log('Column enable_negative_inventory already exists.');
        } else {
            console.log('Adding column enable_negative_inventory...');
            await connection.execute(`
                ALTER TABLE pos_settings 
                ADD COLUMN enable_negative_inventory BOOLEAN DEFAULT FALSE
            `);
            console.log('Column enable_negative_inventory added successfully.');
        }

    } catch (error) {
        console.error('Error updating database:', error);
    } finally {
        if (connection) {
            await connection.end();
            console.log('Connection closed.');
        }
    }
}

addEnableNegativeInventoryColumn();
