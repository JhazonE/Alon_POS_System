import { query } from '../lib/mysql';

async function verify() {
  try {
    console.log('--- Verification: Stock Transfer ---');

    // 1. Find a source product in wh_main with stock
    const sourceProducts = await query("SELECT id, name, stock, barcode, warehouse_id FROM products WHERE warehouse_id = 'wh_main' AND stock > 10 LIMIT 1");
    if (sourceProducts.length === 0) {
      console.log('No suitable source product found. Creating one...');
      const id = 'test_prod_' + Date.now();
      await query("INSERT INTO products (id, name, barcode, stock, price, warehouse_id) VALUES (?, 'Test Transfer Product', 'TST-TRNSFR', 100, 10, 'wh_main')", [id]);
      sourceProducts.push({ id, name: 'Test Transfer Product', stock: 100, barcode: 'TST-TRNSFR', warehouse_id: 'wh_main' });
    }

    const source = sourceProducts[0];
    const transferQty = 5;
    const targetWhId = 'wh_1769222187820';

    console.log(`Source Product: ${source.name} (ID: ${source.id}, Barcode: ${source.barcode}, Stock: ${source.stock})`);
    console.log(`Transferring ${transferQty} to Warehouse: ${targetWhId}`);

    // 2. Perform transfer (using node-fetch since we are in a script, or just direct DB calls for verification)
    // To properly test the API, we'd need a running server. But since we are verifying the logic, 
    // we can simulate the API call or use the DB directly if we trust the logic we just wrote.
    // However, I'll simulate the logic here to verify the DB state after.
    
    // In a real verification, I'd use the browser or a fetch call if the dev server is up.
    // The dev server IS up on port 3000 according to metadata.
    
    const response = await fetch('http://localhost:3000/api/inventory/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceProductId: source.id,
        targetWarehouseId: targetWhId,
        quantity: transferQty,
        notes: 'Verification Script Transfer'
      })
    });

    const result = await response.json();
    console.log('API Response:', JSON.stringify(result, null, 2));

    if (!result.success) {
      throw new Error('API call failed: ' + result.error);
    }

    // 3. Verify DB state
    const [sourceAfter] = await query("SELECT stock FROM products WHERE id = ?", [source.id]);
    console.log(`Source Stock After: ${sourceAfter.stock} (Expected: ${source.stock - transferQty})`);

    const [targetAfter] = await query("SELECT id, name, stock, warehouse_id FROM products WHERE barcode = ? AND warehouse_id = ?", [source.barcode, targetWhId]);
    console.log(`Target Product: ${targetAfter?.name} in ${targetAfter?.warehouse_id}, Stock: ${targetAfter?.stock} (Expected: >= ${transferQty})`);

    const movements = await query("SELECT * FROM stock_movements WHERE reference_id = ?", [result.data.transferId]);
    console.log(`Movements Recorded: ${movements.length} (Expected: 2)`);
    movements.forEach((m: any) => {
      console.log(`- ${m.movement_type} | ${m.product_name} | Change: ${m.quantity_change} | New: ${m.new_stock}`);
    });

    if (sourceAfter.stock === source.stock - transferQty && targetAfter.stock >= transferQty && movements.length === 2) {
      console.log('\n✅ VERIFICATION SUCCESSFUL');
    } else {
      console.log('\n❌ VERIFICATION FAILED');
    }

    process.exit(0);
  } catch (error) {
    console.error('Verification error:', error);
    process.exit(1);
  }
}

verify();
