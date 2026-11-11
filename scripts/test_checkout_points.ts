
import { query } from '../lib/mysql';
import fetch from 'node-fetch'; // Standard node-fetch or global fetch if avail

const BASE_URL = 'http://localhost:3000';

async function main() {
  try {
    console.log('--- Setting up Test Data ---');
    
    // 1. Setup Customer
    const customerId = `TEST-CUST-${Date.now()}`;
    await query(`INSERT INTO customers (id, name, contact_number, loyalty_points) VALUES (?, 'Test Point Customer', '09999999999', 0)`, [customerId]);
    console.log(`Created Customer: ${customerId}`);

    // 2. Setup Categories (Normal and 5% Markup)
    const normalCat = `Normal-Cat-${Date.now()}`;
    const fivePercentCat = `FivePercent-Cat-${Date.now()}`;
    await query(`INSERT INTO categories (id, name, markup_percentage) VALUES (?, ?, 0)`, [normalCat, normalCat]);
    await query(`INSERT INTO categories (id, name, markup_percentage) VALUES (?, ?, 5)`, [fivePercentCat, fivePercentCat]);
    console.log(`Created Categories: ${normalCat} (0%), ${fivePercentCat} (5%)`);

    // 3. Setup Products
    const prodNormal = `PROD-NORM-${Date.now()}`;
    const prodFive = `PROD-FIVE-${Date.now()}`;
    await query(`
      INSERT INTO products (id, name, category, price, stock, barcode, unit_of_measure) 
      VALUES (?, 'Normal Item', ?, 100, 100, ?, 'Piece')
    `, [prodNormal, normalCat, prodNormal]);
    
    await query(`
      INSERT INTO products (id, name, category, price, stock, barcode, unit_of_measure) 
      VALUES (?, '5% Item', ?, 100, 100, ?, 'Piece')
    `, [prodFive, fivePercentCat, prodFive]);
    console.log('Created Products');

    // 4. Ensure Loyalty Settings
    // Assuming 1 point per 100 pesos for easier calculation, or use existing
    // Let's check existing first
    const settings: any = await query('SELECT * FROM loyalty_points_settings LIMIT 1');
    let pointsPerPeso = 0;
    if (settings.length > 0) {
        console.log('Using existing loyalty settings:', settings[0]);
        // amount / equivalent? No, equivalent / amount.
        // If amount=500, equivalent=1. Points = Floor(Amount/500)*1
    } else {
        console.log('No loyalty settings found! Creating default...');
        await query(`INSERT INTO loyalty_points_settings (id, description, base, amount, equivalent) VALUES ('test-set', 'Test', 'amount', 100, 1)`);
    }

    // 5. Perform Checkout via API
    console.log('\n--- Performing Checkout ---');
    const checkoutPayload = {
        userId: 'admin', // assuming admin exists or logic doesn't strictly check user existence for simple inserts
        items: [
            { id: prodNormal, name: 'Normal Item', quantity: 2, price: 100 }, // 200 Eligible
            { id: prodFive, name: '5% Item', quantity: 2, price: 100 }   // 200 Excluded
        ],
        customer: { id: customerId, name: 'Test Point Customer' },
        paymentMethod: 'CASH',
        totalDue: 400,
        amountTendered: 400,
        change: 0
    };

    const response = await fetch(`${BASE_URL}/api/pos/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutPayload)
    });

    const result: any = await response.json();
    console.log('Checkout Response:', result);

    if (result.success) {
        // 6. Verify Points
        console.log('\n--- Verifying Points ---');
        const [loyalty]: any = await query(`SELECT current_points FROM customer_loyalty WHERE customer_id = ?`, [customerId]);
        
        console.log('Loyalty Record:', loyalty);
        
        if (loyalty) {
            console.log(`Current Points: ${loyalty.current_points}`);
            // Expected: 
            // Eligible: 200 (Normal Item)
            // Excluded: 200 (5% Item)
            // If settings is 500 for 1 point, points = 0.
            // If settings is 100 for 1 point, points = 2.
            
            // Let's check settings again to print expected
             const s = settings.length > 0 ? settings[0] : { amount: 100, equivalent: 1 };
             const expectedPoints = Math.floor(200 / s.amount) * s.equivalent;
             console.log(`Expected Points: ${expectedPoints}`);
             
             if (loyalty.current_points == expectedPoints) {
                 console.log('✅ TEST PASSED');
             } else {
                 console.log('❌ TEST FAILED - Points mismatch');
             }
        } else {
            console.log('❌ TEST FAILED - No loyalty record found');
        }
    } else {
        console.log('❌ TEST FAILED - Checkout API failed');
    }

    // Cleanup
    console.log('\n--- Cleanup ---');
    await query('DELETE FROM customers WHERE id = ?', [customerId]);
    await query('DELETE FROM customer_loyalty WHERE customer_id = ?', [customerId]);
    await query('DELETE FROM products WHERE id IN (?, ?)', [prodNormal, prodFive]);
    await query('DELETE FROM categories WHERE id IN (?, ?)', [normalCat, fivePercentCat]);

  } catch (error) {
    console.error('Test Error:', error);
  } finally {
    process.exit();
  }
}

main();
