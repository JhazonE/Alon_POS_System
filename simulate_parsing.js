const mysql = require('mysql2/promise');
require('dotenv').config();

async function simulateParsing() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'alon_pos',
        password: process.env.DB_PASSWORD || 'alon123',
        database: process.env.DB_NAME || 'alon_pos',
    });

    try {
        const [rows] = await connection.query('SELECT id, payment_methods FROM z_readings ORDER BY report_date DESC LIMIT 10');
        
        console.log(`Found ${rows.length} records.`);
        
        let allValid = true;
        
        rows.forEach(row => {
            let paymentMethods = [];
             try {
                //LOGIC START
                const parsed = typeof row.payment_methods === 'string' 
                    ? JSON.parse(row.payment_methods) 
                    : row.payment_methods;
                
                if (Array.isArray(parsed)) {
                    paymentMethods = parsed;
                } else if (typeof parsed === 'object' && parsed !== null) {
                    // Handle case where it was saved as an object with numeric keys + void_amount
                    // Filter out non-numeric keys and map to array
                     paymentMethods = Object.keys(parsed)
                        .filter(key => !isNaN(Number(key)))
                        .map(key => parsed[key]);
                }
                //LOGIC END
             } catch (e) {
                console.error('Error parsing payment methods for Z-Reading ' + row.id, e);
                paymentMethods = [];
             }
             
             const isArray = Array.isArray(paymentMethods);
             console.log(`Record ID: ${row.id} -> Is Array: ${isArray}. Items: ${paymentMethods.length}`);
             if (!isArray) allValid = false;
        });
        
        if (allValid) {
            console.log('SUCCESS: Logic correctly parses all records into arrays.');
        } else {
             console.error('FAILURE: Logic failed to produce arrays for some records.');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await connection.end();
    }
}

simulateParsing();
