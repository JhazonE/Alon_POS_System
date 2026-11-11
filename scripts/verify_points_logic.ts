
import { query } from '../lib/mysql';

async function main() {
  try {
    console.log('--- Setting up Test Data ---');
    
    // 1. Setup Categories (Normal and 5% Markup)
    const normalCat = `Normal-Cat-${Date.now()}`;
    const fivePercentCat = `FivePercent-Cat-${Date.now()}`;
    await query(`INSERT INTO categories (id, name, markup_percentage) VALUES (?, ?, 0)`, [normalCat, normalCat]);
    await query(`INSERT INTO categories (id, name, markup_percentage) VALUES (?, ?, 5)`, [fivePercentCat, fivePercentCat]);
    console.log(`Created Categories: ${normalCat} (0%), ${fivePercentCat} (5%)`);

    // 2. Setup Products
    const prodNormal = `PROD-NORM-${Date.now()}`;
    const prodFive = `PROD-FIVE-${Date.now()}`;
    
    const resProdNormal = await query(`
      INSERT INTO products (id, name, category, price, stock, barcode, unit_of_measure) 
      VALUES (?, 'Normal Item', ?, 100, 100, ?, 'Piece')
    `, [prodNormal, normalCat, prodNormal]);
    console.log('Insert Normal Prod Result:', resProdNormal);
    
    await query(`
      INSERT INTO products (id, name, category, price, stock, barcode, unit_of_measure) 
      VALUES (?, '5% Item', ?, 100, 100, ?, 'Piece')
    `, [prodFive, fivePercentCat, prodFive]);
    console.log('Created Products');

    // DEBUG CHECK
    const checkProd = await query('SELECT * FROM products WHERE id = ?', [prodNormal]);
    console.log('Direct Product Check:', checkProd);
    
    const checkCat = await query('SELECT * FROM categories WHERE name = ?', [normalCat]);
    console.log('Direct Category Check:', checkCat);

    // 3. Test the Logic Query
    console.log('\n--- Testing Logic Query ---');
    
    const testItems = [
        { id: prodNormal, name: 'Normal Item', quantity: 2, price: 100 },
        { id: prodFive, name: '5% Item', quantity: 2, price: 100 }
    ];

    let eligiblePointsAmount = 0;

    for (const item of testItems) {
        console.log(`Checking Item: ${item.name} (${item.id})`);
        
        // Exact query from checkout/route.ts
        const rows: any = await query(`
          SELECT 
            p.id, p.parent_id, p.unit_of_measure, p.name, p.stock, 
            c.markup_percentage, p.category 
          FROM products p
          LEFT JOIN categories c ON p.category = c.name
          WHERE p.id = ?
        `, [item.id]);

        if (rows && rows.length > 0) {
            const soldProd = rows[0];
            console.log(`  > Fetched: Category=${soldProd.category}, Markup=${soldProd.markup_percentage}`);
            
            // Logic from checkout/route.ts
            const isExcluded = Math.abs((soldProd.markup_percentage || 0) - 5) < 0.01;
            console.log(`  > isExcluded (Markup == 5%): ${isExcluded}`);
            
            if (!isExcluded) {
                const amount = item.price * item.quantity;
                console.log(`  > Adding to eligible: ${amount}`);
                eligiblePointsAmount += amount;
            } else {
                console.log(`  > Skipping (Excluded)`);
            }
        } else {
            console.log('  > Product not found?');
        }
    }

    console.log(`\nTotal Eligible Amount: ${eligiblePointsAmount}`);
    
    if (eligiblePointsAmount === 200) {
        console.log('✅ TEST PASSED: Only Normal Item was included.');
    } else {
        console.log(`❌ TEST FAILED: Expected 200, got ${eligiblePointsAmount}`);
    }

    // Cleanup
    console.log('\n--- Cleanup ---');
    await query('DELETE FROM products WHERE id IN (?, ?)', [prodNormal, prodFive]);
    await query('DELETE FROM categories WHERE id IN (?, ?)', [normalCat, fivePercentCat]);

  } catch (error) {
    console.error('Test Error:', error);
  } finally {
    process.exit();
  }
}

main();
