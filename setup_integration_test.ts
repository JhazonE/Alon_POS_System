import { query } from './lib/mysql';

async function setupIntegrationTest() {
    try {
        console.log("--- SETTING UP INTEGRATION TEST ---");
        
        // 1. Ensure Wholesale level exists
        const levels = await query("SELECT id FROM price_levels WHERE name = 'Wholesale' LIMIT 1");
        if (levels.length === 0) {
            console.error("Wholesale level not found. Please create it first.");
            process.exit(1);
        }
        const wholesaleId = levels[0].id;
        
        // 2. Ensure Retail level exists
        const retailLevels = await query("SELECT id FROM price_levels WHERE is_default = 1 LIMIT 1");
        const retailId = retailLevels.length > 0 ? retailLevels[0].id : 'retail-level';

        // 3. Create Test Product
        const productId = "TEST-PROD-" + Date.now();
        await query(`
            INSERT INTO products (id, name, description, category, brand, stock, price, cost, barcode, unit_of_measure)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [productId, "ANTIGRAVITY TEST PRODUCT", "Test description", "Test Category", "Test Brand", 100, 100.00, 50.00, "TEST-BARCODE-" + Date.now(), "Piece"]);

        // 4. Create Price Level Overrides
        await query(`INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, ?, ?)`, [productId, retailId, 100.00, 0]);
        await query(`INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, ?, ?)`, [productId, wholesaleId, 80.00, 0]);

        // 5. Create Test Customer
        const customerId = "TEST-CUST-" + Date.now();
        await query(`
            INSERT INTO customers (id, name, contact_number, price_level_id)
            VALUES (?, ?, ?, ?)
        `, [customerId, "ANTIGRAVITY TEST CUSTOMER", "09123456789", wholesaleId]);

        console.log("\n--- TEST DATA CREATED ---");
        console.log(`Product Name: ANTIGRAVITY TEST PRODUCT (ID: ${productId})`);
        console.log(`Customer Name: ANTIGRAVITY TEST CUSTOMER (ID: ${customerId})`);
        console.log(`Wholesale Level ID: ${wholesaleId}`);
        console.log(`Expected Wholesale Price: 80.00`);
        console.log(`Expected Retail Price: 100.00`);

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

setupIntegrationTest();
