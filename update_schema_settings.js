
const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchema() {
    let connection;
    try {
        console.log('Updating pos_settings schema for System Preferences...');

        const config = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'alon_pos'
        };

        connection = await mysql.createConnection(config);

        const alterQueries = [
            `ALTER TABLE pos_settings ADD COLUMN currency_symbol VARCHAR(10) DEFAULT '$'`,
            `ALTER TABLE pos_settings ADD COLUMN currency_code VARCHAR(10) DEFAULT 'USD'`,
            `ALTER TABLE pos_settings ADD COLUMN timezone VARCHAR(100) DEFAULT 'UTC'`,
            `ALTER TABLE pos_settings ADD COLUMN date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY'`
        ];

        for (const sql of alterQueries) {
            try {
                await connection.query(sql);
                console.log(`Executed: ${sql}`);
            } catch (error) {
                if (error.code === 'ER_DUP_FIELDNAME') {
                    console.log(`Column already exists, skipping: ${sql}`);
                } else {
                    console.error(`Error executing ${sql}:`, error);
                }
            }
        }

        console.log('Schema update completed.');
    } catch (error) {
        console.error('Fatal error updating schema:', error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

updateSchema();
