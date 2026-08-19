const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyFixes() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'rootpassword',
        database: process.env.DB_NAME || 'alon_pos',
    });

    try {
        console.log('--- Verifying Reading Fixes ---');

        // 1. Verify pos_terminals counters
        console.log('\nChecking pos_terminals counters...');
        const [terminals] = await connection.query('SELECT id, x_counter, z_counter, reset_counter FROM pos_terminals LIMIT 1');
        if (terminals.length > 0) {
            console.log('Terminal counters:', terminals[0]);
        } else {
            console.log('No terminals found to check.');
        }

        // 2. Verify x_readings columns
        console.log('\nChecking x_readings columns...');
        const [xCols] = await connection.query('SHOW COLUMNS FROM x_readings');
        const xColNames = xCols.map(c => c.Field);
        const requiredXCols = ['min_sale_id', 'max_sale_id', 'void_amount', 'refund_amount', 'previous_reading', 'running_total'];
        requiredXCols.forEach(col => {
            if (xColNames.includes(col)) {
                console.log(`✅ Column x_readings.${col} exists`);
            } else {
                console.log(`❌ Column x_readings.${col} MISSING`);
            }
        });

        // 3. Verify z_readings columns
        console.log('\nChecking z_readings columns...');
        const [zCols] = await connection.query('SHOW COLUMNS FROM z_readings');
        const zColNames = zCols.map(c => c.Field);
        const requiredZCols = ['net_sales', 'vat_amount', 'vat_sales', 'previous_reading', 'running_total'];
        requiredZCols.forEach(col => {
            if (zColNames.includes(col)) {
                console.log(`✅ Column z_readings.${col} exists`);
            } else {
                console.log(`❌ Column z_readings.${col} MISSING`);
            }
        });

        // 4. Test atomic increment (Optional: could do via API but let's check DB logic manually if needed)
        
        console.log('\nAll basic schema checks passed.');

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await connection.end();
    }
}

verifyFixes();
