
const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyPointLogic() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alon_pos',
  });

  try {
    // 1. Create a test category with 5% markup
    const categoryId = `CAT-TEST-${Date.now()}`;
    await connection.execute(
      'INSERT INTO categories (id, name, markup_percentage) VALUES (?, ?, ?)',
      [categoryId, 'Test Category 5%', 5]
    );

    // 2. Create a test category with 10% markup
    const categoryId10 = `CAT-TEST-10-${Date.now()}`;
    await connection.execute(
        'INSERT INTO categories (id, name, markup_percentage) VALUES (?, ?, ?)',
        [categoryId10, 'Test Category 10%', 10]
      );

    // 3. Create products
    const prod1Id = `PROD-NO-POINTS-${Date.now()}`;
    const prod2Id = `PROD-POINTS-${Date.now()}`;
    const prod3Id = `PROD-CAT-5-${Date.now()}`; // 5% markup category, earns_points=true (should be excluded)
    
    // Product 1: Earns Points = FALSE, Category = 10%
    await connection.execute(`
      INSERT INTO products (id, name, category, price, stock, earns_points, unit_of_measure)
      VALUES (?, 'No Points Prod', 'Test Category 10%', 100, 100, 0, 'PC')
    `, [prod1Id]);

    // Product 2: Earns Points = TRUE, Category = 10%
    await connection.execute(`
      INSERT INTO products (id, name, category, price, stock, earns_points, unit_of_measure)
      VALUES (?, 'Points Prod', 'Test Category 10%', 100, 100, 1, 'PC')
    `, [prod2Id]);

     // Product 3: Earns Points = TRUE, Category = 5%
     await connection.execute(`
        INSERT INTO products (id, name, category, price, stock, earns_points, unit_of_measure)
        VALUES (?, 'Category 5% Prod', 'Test Category 5%', 100, 100, 1, 'PC')
      `, [prod3Id]);

    console.log('✅ Test products created.');

    // 4. Simulate logic check (Mirroring route.ts logic)
    const checkProduct = async (id, name) => {
        const [rows] = await connection.execute(`
            SELECT p.id, c.markup_percentage, p.earns_points 
            FROM products p
            LEFT JOIN categories c ON p.category = c.name
            WHERE p.id = ?
        `, [id]);
        
        const soldProd = rows[0];
        const hasFivePercentMarkup = Math.abs((soldProd.markup_percentage || 0) - 5) < 0.01;
        const earnsPointsEnabled = soldProd.earns_points !== 0 && soldProd.earns_points !== false;
        const isExcluded = hasFivePercentMarkup || !earnsPointsEnabled;

        console.log(`Product: ${name}`);
        console.log(`  Earns Points Setting: ${earnsPointsEnabled}`);
        console.log(`  Category Markup: ${soldProd.markup_percentage}%`);
        console.log(`  Is Excluded? ${isExcluded}`);
        
        return isExcluded;
    };

    const isProd1Excluded = await checkProduct(prod1Id, 'No Points Prod');
    if (isProd1Excluded) console.log('  ✅ Correct: Excluded due to toggle.');
    else console.error('  ❌ Failed: Should be excluded.');

    const isProd2Excluded = await checkProduct(prod2Id, 'Points Prod');
    if (!isProd2Excluded) console.log('  ✅ Correct: Included.');
    else console.error('  ❌ Failed: Should be included.');

    const isProd3Excluded = await checkProduct(prod3Id, 'Category 5% Prod');
    if (isProd3Excluded) console.log('  ✅ Correct: Excluded due to category rule.');
    else console.error('  ❌ Failed: Should be excluded.');

    // Cleanup
    await connection.execute('DELETE FROM products WHERE id IN (?, ?, ?)', [prod1Id, prod2Id, prod3Id]);
    await connection.execute('DELETE FROM categories WHERE id IN (?, ?)', [categoryId, categoryId10]);
    console.log('Test data cleaned up.');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await connection.end();
  }
}

verifyPointLogic();
