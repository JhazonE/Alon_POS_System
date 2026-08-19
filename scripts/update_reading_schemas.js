const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateSchemas() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'rootpassword',
        database: process.env.DB_NAME || 'alon_pos',
    });

    try {
        console.log('--- Updating Reading Schemas (JS) ---');

        // 1. pos_terminals
        console.log('Updating pos_terminals...');
        const [terminalColumns] = await connection.query(`SHOW COLUMNS FROM pos_terminals`);
        const terminalColNames = terminalColumns.map(c => c.Field);

        if (!terminalColNames.includes('x_counter')) {
            await connection.query(`ALTER TABLE pos_terminals ADD COLUMN x_counter INT DEFAULT 0 AFTER updated_at`);
            console.log('Added x_counter to pos_terminals');
        }
        if (!terminalColNames.includes('z_counter')) {
            await connection.query(`ALTER TABLE pos_terminals ADD COLUMN z_counter INT DEFAULT 0 AFTER x_counter`);
            console.log('Added z_counter to pos_terminals');
        }
        if (!terminalColNames.includes('reset_counter')) {
            await connection.query(`ALTER TABLE pos_terminals ADD COLUMN reset_counter INT DEFAULT 0 AFTER z_counter`);
            console.log('Added reset_counter to pos_terminals');
        }

        // 2. z_readings
        console.log('Updating z_readings...');
        const [zReadingColumns] = await connection.query(`SHOW COLUMNS FROM z_readings`);
        const zReadingColNames = zReadingColumns.map(c => c.Field);

        const zColsToAdd = [
            { name: 'net_sales', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'vat_amount', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'vat_sales', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'vat_exempt', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'zero_rated', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'non_vat', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'starting_cash', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'cash_sales', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'cash_in_drawer', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'min_sale_id', type: 'VARCHAR(50)' },
            { name: 'max_sale_id', type: 'VARCHAR(50)' },
            { name: 'min_void_id', type: 'VARCHAR(50)' },
            { name: 'max_void_id', type: 'VARCHAR(50)' },
            { name: 'min_return_id', type: 'VARCHAR(50)' },
            { name: 'max_return_id', type: 'VARCHAR(50)' },
            { name: 'previous_reading', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'running_total', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'z_counter', type: 'INT DEFAULT 0' },
            { name: 'reset_counter', type: 'INT DEFAULT 0' }
        ];

        for (const col of zColsToAdd) {
            if (!zReadingColNames.includes(col.name)) {
                await connection.query(`ALTER TABLE z_readings ADD COLUMN ${col.name} ${col.type}`);
                console.log(`Added ${col.name} to z_readings`);
            }
        }

        // 3. x_readings
        console.log('Updating x_readings...');
        const [xReadingColumns] = await connection.query(`SHOW COLUMNS FROM x_readings`);
        const xReadingColNames = xReadingColumns.map(c => c.Field);

        const xColsToAdd = [
            { name: 'min_sale_id', type: 'VARCHAR(50)' },
            { name: 'max_sale_id', type: 'VARCHAR(50)' },
            { name: 'void_amount', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'refund_amount', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'previous_reading', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' },
            { name: 'running_total', type: 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00' }
        ];

        for (const col of xColsToAdd) {
            if (!xReadingColNames.includes(col.name)) {
                await connection.query(`ALTER TABLE x_readings ADD COLUMN ${col.name} ${col.type}`);
                console.log(`Added ${col.name} to x_readings`);
            }
        }

        console.log('✅ Reading schemas updated successfully');

    } catch (error) {
        console.error('Error updating reading schemas:', error);
    } finally {
        await connection.end();
    }
}

updateSchemas();
