import { query } from './lib/mysql';

async function verifySync() {
    const PARENT_ID = 'test-parent-case';
    const CHILD_ID = 'test-child-pcs';

    try {
        console.log('--- Sync Verification Started ---');

        // 1. Setup Parent (Case)
        await query(`
      INSERT INTO products (id, name, description, category, brand, stock, price, barcode, unit_of_measure, conversion_factor)
      VALUES (?, 'Test Case', 'Desc', 'Cat', 'Brand', 10, 1200, 'CASE123', 'CASE', 1.0)
      ON DUPLICATE KEY UPDATE stock = 10
    `, [PARENT_ID]);

        await query(`DELETE FROM conversion_factors WHERE product_id = ?`, [PARENT_ID]);
        await query(`INSERT INTO conversion_factors (id, product_id, unit, factor) VALUES (?, ?, 'Piece', 12.0)`, ['cf-p-1', PARENT_ID]);
        await query(`INSERT INTO conversion_factors (id, product_id, unit, factor) VALUES (?, ?, 'CASE', 1.0)`, ['cf-p-2', PARENT_ID]);

        // 2. Setup Child (Piece)
        await query(`
      INSERT INTO products (id, name, description, category, brand, stock, price, barcode, unit_of_measure, parent_id, conversion_factor)
      VALUES (?, 'Test Piece', 'Desc', 'Cat', 'Brand', 120, 100, 'PCS123', 'Piece', ?, 1.0)
      ON DUPLICATE KEY UPDATE stock = 120
    `, [CHILD_ID, PARENT_ID]);

        await query(`DELETE FROM conversion_factors WHERE product_id = ?`, [CHILD_ID]);
        await query(`INSERT INTO conversion_factors (id, product_id, unit, factor) VALUES (?, ?, 'CASE', 0.0833)`, ['cf-c-1', CHILD_ID]);
        await query(`INSERT INTO conversion_factors (id, product_id, unit, factor) VALUES (?, ?, 'Piece', 1.0)`, ['cf-c-2', CHILD_ID]);

        console.log('Setup complete. Stocks: Case=10, Piece=120');

        // 3. Simulate Sale of 1 Piece via the sync logic
        // (We'll run a mini version of the route.ts logic)

        console.log('Simulating sale of 1 Piece...');
        const soldQty = 1;

        // Fetch sold prod
        const soldProd = (await query('SELECT id, parent_id, unit_of_measure, name, stock FROM products WHERE id = ?', [CHILD_ID]))[0];
        const rootId = soldProd.parent_id || soldProd.id;

        const familyMembers = await query(`SELECT id, unit_of_measure, name, stock FROM products WHERE id = ? OR parent_id = ?`, [rootId, rootId]);
        const convFactors = await query('SELECT unit, factor FROM conversion_factors WHERE product_id = ?', [CHILD_ID]);
        const factorMap = new Map();
        convFactors.forEach((cf: any) => factorMap.set(cf.unit, parseFloat(cf.factor)));
        factorMap.set(soldProd.unit_of_measure, 1);

        for (const member of familyMembers) {
            const factor = factorMap.get(member.unit_of_measure);
            if (factor !== undefined) {
                const deduction = soldQty * factor;
                const newStock = Math.floor(member.stock - deduction);
                await query('UPDATE products SET stock = ? WHERE id = ?', [newStock, member.id]);
                console.log(`Updated ${member.name} (${member.unit_of_measure}): ${member.stock} -> ${newStock} (Deduction: ${deduction})`);
            }
        }

        // 4. Verify
        const finalParent = (await query('SELECT stock FROM products WHERE id = ?', [PARENT_ID]))[0];
        const finalChild = (await query('SELECT stock FROM products WHERE id = ?', [CHILD_ID]))[0];

        // Case: 10 - 0.0833 = 9.9167 -> floor = 9.
        // Piece: 120 - 1 = 119.

        if (finalParent.stock === 9 && finalChild.stock === 119) {
            console.log('--- SYNC VERIFICATION SUCCESSFUL (Piece -> Case) ---');
        } else {
            console.log(`--- SYNC VERIFICATION FAILED --- Parent:${finalParent.stock}, Child:${finalChild.stock}`);
        }

        // 5. Cleanup
        await query('DELETE FROM conversion_factors WHERE product_id IN (?, ?)', [PARENT_ID, CHILD_ID]);
        await query('DELETE FROM products WHERE id IN (?, ?)', [PARENT_ID, CHILD_ID]);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

verifySync();
