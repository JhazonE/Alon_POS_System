
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function migrate() {
    console.log('Starting migration for price_levels...');
    
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'alon_pos',
    });

    try {
        console.log('Connected to database.');

        console.log('Adding percentage_adjustment to price_levels...');
        try {
            await connection.query(`ALTER TABLE price_levels ADD COLUMN percentage_adjustment DECIMAL(10,2) DEFAULT 100;`);
            console.log('Done.');
        } catch (e: any) {
            if (e.code === 'ER_DUP_FIELDNAME') console.log('Column already exists.');
            else console.error('Error:', e);
        }

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
        console.log('Connection closed.');
    }
}

migrate();
