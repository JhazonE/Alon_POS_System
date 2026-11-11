
import { query } from '../lib/mysql';
import dotenv from 'dotenv';
dotenv.config();

const CATEGORIES = [
  { id: 'cat_001', name: 'Smartphones' },
  { id: 'cat_002', name: 'Laptops' },
  { id: 'cat_003', name: 'Peripherals' },
  { id: 'cat_004', name: 'IT Services' },
];

const BRANDS = [
  { id: 'brd_001', name: 'Apple' },
  { id: 'brd_002', name: 'Samsung' },
  { id: 'brd_003', name: 'Logitech' },
  { id: 'brd_004', name: 'Microsoft' },
  { id: 'brd_005', name: 'Generic Services' },
];

const UNITS = [
  { id: 'uom_pc', name: 'Piece', abbreviation: 'pc' },
  { id: 'uom_hr', name: 'Hour', abbreviation: 'hr' },
  { id: 'uom_srv', name: 'Service', abbreviation: 'srv' },
];

const ACTUAL_DATA = [
  // Products
  {
    id: 'prod_iphone15pro',
    name: 'iPhone 15 Pro 256GB',
    description: 'Apple iPhone 15 Pro with 256GB Storage, Titanium Black',
    category: 'Smartphones',
    brand: 'Apple',
    stock: 15,
    reorder_point: 5,
    price: 70990.00,
    cost: 58000.00,
    barcode: '194253701234',
    unit_of_measure: 'Piece',
    is_serialized: true
  },
  {
    id: 'prod_s23ultra',
    name: 'Samsung Galaxy S23 Ultra',
    description: 'Samsung Galaxy S23 Ultra, 12GB RAM, 512GB Storage, Phantom Black',
    category: 'Smartphones',
    brand: 'Samsung',
    stock: 10,
    reorder_point: 3,
    price: 68990.00,
    cost: 52000.00,
    barcode: '8806094761234',
    unit_of_measure: 'Piece',
    is_serialized: true
  },
  {
    id: 'prod_macbookairm2',
    name: 'MacBook Air M2 13"',
    description: 'Apple MacBook Air with M2 Chip, 8GB RAM, 256GB SSD, Space Gray',
    category: 'Laptops',
    brand: 'Apple',
    stock: 8,
    reorder_point: 2,
    price: 59990.00,
    cost: 49000.00,
    barcode: '194253012345',
    unit_of_measure: 'Piece',
    is_serialized: true
  },
  {
    id: 'prod_mxmaster3s',
    name: 'Logitech MX Master 3S',
    description: 'Logitech MX Master 3S Wireless Performance Mouse',
    category: 'Peripherals',
    brand: 'Logitech',
    stock: 25,
    reorder_point: 10,
    price: 6590.00,
    cost: 4200.00,
    barcode: '097855171234',
    unit_of_measure: 'Piece',
    is_serialized: false
  },
  // Services
  {
    id: 'srv_nw_setup',
    name: 'Network Setup Service',
    description: 'Comprehensive network installation and configuration for home or office',
    category: 'IT Services',
    brand: 'Generic Services',
    stock: 0,
    reorder_point: 0,
    price: 5000.00,
    cost: 0.00,
    barcode: '',
    unit_of_measure: 'Service',
    is_serialized: false
  },
  {
    id: 'srv_pc_clean',
    name: 'PC Maintenance & Cleaning',
    description: 'Internal cleaning, thermal paste replacement, and software optimization',
    category: 'IT Services',
    brand: 'Generic Services',
    stock: 0,
    reorder_point: 0,
    price: 1500.00,
    cost: 150.00,
    barcode: '',
    unit_of_measure: 'Service',
    is_serialized: false
  },
  {
    id: 'srv_data_recovery',
    name: 'Data Recovery Service',
    description: 'Professional data recovery from damaged drives or accidental deletion',
    category: 'IT Services',
    brand: 'Generic Services',
    stock: 0,
    reorder_point: 0,
    price: 12000.00,
    cost: 0.00,
    barcode: '',
    unit_of_measure: 'Service',
    is_serialized: false
  },
];

async function seed() {
  try {
    console.log('🌱 Seeding categories...');
    for (const cat of CATEGORIES) {
      await query('INSERT IGNORE INTO categories (id, name, created_at) VALUES (?, ?, NOW())', [cat.id, cat.name]);
    }

    console.log('🌱 Seeding brands...');
    for (const brand of BRANDS) {
      await query('INSERT IGNORE INTO brands (id, name, created_at) VALUES (?, ?, NOW())', [brand.id, brand.name]);
    }

    console.log('🌱 Seeding units of measure...');
    for (const unit of UNITS) {
      await query('INSERT IGNORE INTO units_of_measure (id, name, abbreviation, created_at) VALUES (?, ?, ?, NOW())', [unit.id, unit.name, unit.abbreviation]);
    }

    // Get default accounts
    const incomeAccounts = await query("SELECT id FROM accounts WHERE name LIKE '%REVENUE%' OR type = 'income' LIMIT 1");
    const expenseAccounts = await query("SELECT id FROM accounts WHERE name LIKE '%EXPENSE%' OR type = 'expense' LIMIT 1");
    const serviceRevenue = await query("SELECT id FROM accounts WHERE name LIKE '%SERVICE%' AND type = 'income' LIMIT 1");
    
    const defaultIncomeId = incomeAccounts[0]?.id || null;
    const defaultExpenseId = expenseAccounts[0]?.id || null;
    const serviceIncomeId = serviceRevenue[0]?.id || defaultIncomeId;

    const warehouse = await query("SELECT id FROM warehouses LIMIT 1");
    const defaultWarehouseId = warehouse[0]?.id || null;

    console.log('🌱 Seeding actual products and services...');
    for (const item of ACTUAL_DATA) {
      const isService = item.category === 'IT Services';
      const incomeAccId = isService ? serviceIncomeId : defaultIncomeId;

      await query(`
        INSERT INTO products (
          id, name, description, category, brand, stock, reorder_point, 
          price, cost, barcode, unit_of_measure, 
          income_account, expense_account, warehouse_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        description = VALUES(description),
        category = VALUES(category),
        brand = VALUES(brand),
        stock = VALUES(stock),
        reorder_point = VALUES(reorder_point),
        price = VALUES(price),
        cost = VALUES(cost),
        barcode = VALUES(barcode),
        unit_of_measure = VALUES(unit_of_measure),
        income_account = VALUES(income_account),
        expense_account = VALUES(expense_account),
        warehouse_id = VALUES(warehouse_id),
        updated_at = NOW()
      `, [
        item.id, item.name, item.description, item.category, item.brand, 
        item.stock, item.reorder_point, item.price, item.cost, 
        item.barcode, item.unit_of_measure,
        incomeAccId, defaultExpenseId, defaultWarehouseId
      ]);
    }

    console.log('✅ Seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seed();
