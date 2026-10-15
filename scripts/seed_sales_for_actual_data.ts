
import { query } from '../lib/mysql';
import dotenv from 'dotenv';
dotenv.config();

async function seedSalesForNewProducts() {
  try {
    console.log('🌱 Seeding sales for new products and services...');

    // Get the products we just added
    const products: any = await query('SELECT id, name, price FROM products WHERE id LIKE "prod_%" OR id LIKE "srv_%"');
    
    if (products.length === 0) {
      console.log('❌ No new products found to seed sales for.');
      return;
    }

    // Get a customer
    const customers: any = await query('SELECT id FROM customers LIMIT 1');
    const customerId = customers[0]?.id || '1'; // Fallback to '1' if no customers

    // Create a few sales transactions
    const sales = [
      {
        id: 'sale_actual_001',
        date: '2026-01-08',
        items: [
          { product: products.find((p: any) => p.id === 'prod_iphone15pro'), qty: 1 },
          { product: products.find((p: any) => p.id === 'prod_mxmaster3s'), qty: 2 }
        ]
      },
      {
        id: 'sale_actual_002',
        date: '2026-01-09',
        items: [
          { product: products.find((p: any) => p.id === 'prod_macbookairm2'), qty: 1 },
          { product: products.find((p: any) => p.id === 'srv_nw_setup'), qty: 1 }
        ]
      },
      {
        id: 'sale_actual_003',
        date: '2026-01-09',
        items: [
          { product: products.find((p: any) => p.id === 'srv_pc_clean'), qty: 3 },
          { product: products.find((p: any) => p.id === 'prod_s23ultra'), qty: 1 }
        ]
      }
    ];

    for (const sale of sales) {
      // Filter out null products just in case
      const validItems = sale.items.filter(item => item.product);
      if (validItems.length === 0) continue;

      const total = validItems.reduce((sum, item) => sum + (item.product.price * item.qty), 0);

      // Insert transaction
      await query(`
        INSERT INTO sales_transactions (id, customer_id, invoice_date, date, total, payment_method, status, branch_id)
        VALUES (?, ?, ?, ?, ?, ?, 'Paid', (SELECT id FROM branches WHERE is_main = 1 LIMIT 1))
        ON DUPLICATE KEY UPDATE
        total = VALUES(total),
        status = VALUES(status)
      `, [sale.id, customerId, sale.date, sale.date, total, 'Cash']);

      // Insert items
      for (const item of validItems) {
        const itemId = `${sale.id}_${item.product.id}`;
        await query(`
          INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, price)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          quantity = VALUES(quantity),
          price = VALUES(price)
        `, [itemId, sale.id, item.product.id, item.product.name, item.qty, item.product.price]);
      }
    }

    console.log('✅ Sales seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to seed sales:', error);
    process.exit(1);
  }
}

seedSalesForNewProducts();
