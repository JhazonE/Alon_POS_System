require('dotenv').config();
const { query } = require('./lib/mysql');

const MOCK_CUSTOMERS = [
  {
    id: '1',
    name: 'Juan Dela Cruz',
    contactNumber: '09171234567',
    paymentTerms: 'Net 30',
  },
  {
    id: '2',
    name: 'Maria Santos',
    contactNumber: '09189876543',
    paymentTerms: 'Cash',
  },
  {
    id: '3',
    name: 'Pedro Reyes',
    contactNumber: '09111222333',
    paymentTerms: 'Net 15',
  }
];

const MOCK_PRODUCTS = [
  {
    id: '1',
    name: 'Coca-Cola 1.5L',
    sku: 'CC150',
    barcode: '4800016945486',
    price: 75.0,
    stock: 150,
  },
  {
    id: '2',
    name: 'Nike Shoes Air Max',
    sku: 'NSAM001',
    barcode: '0888375260387',
    price: 5500.0,
    stock: 0,
  },
  {
    id: '3',
    name: 'Rice Premium 1kg',
    sku: 'PR1KG',
    barcode: '123456789012',
    price: 45.0,
    stock: 200,
  },
  {
    id: '4',
    name: 'Chicken Breast 500g',
    sku: 'CB500',
    barcode: '987654321098',
    price: 180.0,
    stock: 80,
  },
  {
    id: '5',
    name: 'Dell Inspiron Laptop',
    sku: 'DI15-001',
    barcode: '0888375260388',
    price: 45000.0,
    stock: 0,
  }
];

const MOCK_SALES = [
  {
    id: 'sale_001',
    customer: MOCK_CUSTOMERS[0],
    date: '2024-11-15',
    invoiceDate: '2024-11-15',
    total: 150.00,
    paymentMethod: 'Credit Card',
    status: 'Paid',
    items: [
      {
        product: {
          id: '1',
          name: 'Coca-Cola 1.5L',
          sku: 'CC150',
          barcode: '4800016945486',
          price: 75.0,
        },
        quantity: 2,
        price: 75.0,
      }
    ]
  },
  {
    id: 'sale_002',
    customer: MOCK_CUSTOMERS[1],
    date: '2024-11-14',
    invoiceDate: '2024-11-14',
    total: 45.00,
    paymentMethod: 'Cash',
    status: 'Paid',
    items: [
      {
        product: {
          id: '3',
          name: 'Rice Premium 1kg',
          sku: 'PR1KG',
          barcode: '123456789012',
          price: 45.0,
        },
        quantity: 1,
        price: 45.0,
      }
    ]
  }
];

async function seedSalesData() {
  try {
    console.log('🌱 Seeding sales data...');

    // Insert customers
    for (const customer of MOCK_CUSTOMERS) {
      await query(`
        INSERT INTO customers (id, name, contact_number, payment_terms)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        contact_number = VALUES(contact_number),
        payment_terms = VALUES(payment_terms)
      `, [customer.id, customer.name, customer.contactNumber, customer.paymentTerms]);
    }
    console.log('✅ Customers seeded');

    // Insert products (assuming products table exists)
    for (const product of MOCK_PRODUCTS) {
      try {
        await query(`
          INSERT INTO products (id, name, sku, barcode, price, stock)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          sku = VALUES(sku),
          barcode = VALUES(barcode),
          price = VALUES(price),
          stock = VALUES(stock)
        `, [product.id, product.name, product.sku, product.barcode, product.price, product.stock]);
      } catch (error) {
        console.log(`⚠️  Could not insert product ${product.id}, might already exist or table structure different`);
      }
    }
    console.log('✅ Products seeded (where possible)');

    // Insert sales transactions and items
    for (const sale of MOCK_SALES) {
      // Insert sale transaction
      await query(`
        INSERT INTO sales_transactions (id, customer_id, invoice_date, date, total, payment_method, status, branch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT id FROM branches WHERE is_main = 1 LIMIT 1))
        ON DUPLICATE KEY UPDATE
        customer_id = VALUES(customer_id),
        invoice_date = VALUES(invoice_date),
        date = VALUES(date),
        total = VALUES(total),
        payment_method = VALUES(payment_method),
        status = VALUES(status)
      `, [sale.id, sale.customer.id, sale.invoiceDate, sale.date, sale.total, sale.paymentMethod, sale.status]);

      // Insert sale items
      for (const item of sale.items) {
        const itemId = `${sale.id}_${item.product.id}`;
        await query(`
          INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, price)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          product_name = VALUES(product_name),
          quantity = VALUES(quantity),
          price = VALUES(price)
        `, [itemId, sale.id, item.product.id, item.product.name, item.quantity, item.price]);
      }
    }
    console.log('✅ Sales transactions and items seeded');

    console.log('🎉 Sales data seeding completed successfully!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedSalesData();
