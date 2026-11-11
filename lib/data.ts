import { Product, Sale, Customer, PurchaseOrder, PaymentMethod, Supplier, Account } from './types';

// Mock Suppliers
export const mockSuppliers: Supplier[] = [
  {
    id: 's1',
    name: 'ABC Suppliers',
    contactNumber: '09123456789',
  },
  {
    id: 's2',
    name: 'Global Foods Inc.',
    contactNumber: '09876543210',
  },
  {
    id: 's3',
    name: 'Fashion Hub',
    contactNumber: '09111222333',
  },
];

// Mock Customers
export const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'Juan Dela Cruz',
    contactNumber: '09123456789',
    paymentTerms: 'Net 30',
  },
  {
    id: '2',
    name: 'Maria Santos',
    contactNumber: '09876543210',
    paymentTerms: 'Cash',
  },
  {
    id: '3',
    name: 'Pedro Reyes',
    contactNumber: '09111222333',
    paymentTerms: 'Net 15',
  },
];

// Mock Products
export const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Coca-Cola 1.5L',
    description: 'Soft drink',
    category: 'Beverages',
    brand: 'Coca-Cola',
    stock: 150,
    reorderPoint: 50,
    avgDailySales: 5,
    price: 75.00,
    cost: 50.00,
    barcode: '4800016945486',
    imageUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300&h=300&fit=crop&crop=center',
    imageHint: 'Coca-Cola bottle',
    unitOfMeasure: 'Piece',
  },
  {
    id: '2',
    name: 'Nike Shoes Air Max',
    description: 'Running shoes',
    category: 'Footwear',
    brand: 'Nike',
    stock: 0,
    reorderPoint: 10,
    avgDailySales: 1,
    price: 5500.00,
    cost: 3000.00,
    barcode: '0888375260387',
    imageUrl: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=300&h=300&fit=crop&crop=center',
    imageHint: 'Nike Air Max shoes',
    
    unitOfMeasure: 'Pair',
  },
  {
    id: '3',
    name: 'Rice Premium 1kg',
    description: 'Premium quality rice',
    category: 'Food',
    brand: 'Premium Rice',
    stock: 200,
    reorderPoint: 30,
    avgDailySales: 8,
    price: 45.00,
    cost: 30.00,
    barcode: '123456789012',
    imageUrl: 'https://images.unsplash.com/photo-1536304993881-ff6e9aefacd0?w=300&h=300&fit=crop&crop=center',
    imageHint: 'Rice sack',
    unitOfMeasure: 'Kilogram',
  },
  {
    id: '4',
    name: 'Chicken Breast 500g',
    description: 'Fresh chicken breast',
    category: 'Meat',
    brand: 'Fresh Meat',
    stock: 80,
    reorderPoint: 20,
    avgDailySales: 3,
    price: 180.00,
    cost: 120.00,
    barcode: '987654321098',
    imageUrl: 'https://images.unsplash.com/photo-1588187338353-7134bd4fa6a7?w=300&h=300&fit=crop&crop=center',
    imageHint: 'Chicken breast meat',
    unitOfMeasure: 'Piece',
  },
  {
    id: '5',
    name: 'Dell Inspiron Laptop',
    description: 'High-performance laptop',
    category: 'Electronics',
    brand: 'Dell',
    stock: 0,
    reorderPoint: 5,
    avgDailySales: 1,
    price: 45000.00,
    cost: 35000.00,
    barcode: '0888375260388',
    imageUrl: 'https://images.unsplash.com/photo-1593642702821-c8da6771f0c6?w=300&h=300&fit=crop&crop=center',
    imageHint: 'Dell laptop',
   
    unitOfMeasure: 'Unit',
  },
];

// Mock Sales
export const mockSales: Sale[] = [
  {
    id: '1',
    customer: mockCustomers[0],
    invoiceDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[0], quantity: 2, price: 75.00 },
      { product: mockProducts[2], quantity: 1, price: 45.00 },
    ],
    total: (2 * 75 + 45), // 195
    paymentMethod: 'Cash',
    status: 'Paid',
  },
  {
    id: '2',
    customer: mockCustomers[1],
    invoiceDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[1], quantity: 1, price: 5500.00 },
    ],
    total: 5500,
    paymentMethod: 'Credit Card',
    status: 'Paid',
  },
  {
    id: '3',
    customer: mockCustomers[2],
    invoiceDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[0], quantity: 3, price: 75.00 },
      { product: mockProducts[3], quantity: 2, price: 180.00 },
    ],
    total: (3 * 75 + 2 * 180), // 375 + 360 = 735
    paymentMethod: 'Cash',
    status: 'Paid',
  },
  {
    id: '4',
    customer: mockCustomers[0],
    invoiceDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[2], quantity: 5, price: 45.00 },
      { product: mockProducts[3], quantity: 1, price: 180.00 },
    ],
    total: (5 * 45 + 180), // 405
    paymentMethod: 'Cash',
    status: 'Paid',
  },
  {
    id: '5',
    customer: mockCustomers[1],
    invoiceDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
    date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[0], quantity: 4, price: 75.00 },
      { product: mockProducts[1], quantity: 1, price: 5500.00 },
    ],
    total: (4 * 75 + 5500), // 5800
    paymentMethod: 'Credit Card',
    status: 'Paid',
  },
  {
    id: '6',
    customer: mockCustomers[0],
    invoiceDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[0], quantity: 1, price: 75.00 },
    ],
    total: 75,
    paymentMethod: 'Cash',
    status: 'Returned',
  },
  {
    id: '7',
    customer: mockCustomers[2],
    invoiceDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
    date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[3], quantity: 1, price: 180.00 },
    ],
    total: 180,
    paymentMethod: 'Cash',
    status: 'Returned',
  },
  {
    id: '8',
    customer: mockCustomers[1],
    invoiceDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
    date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[1], quantity: 1, price: 5500.00 },
    ],
    total: 5500,
    paymentMethod: 'Credit Card',
    status: 'Failed',
  },
  {
    id: '9',
    customer: mockCustomers[0],
    invoiceDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { product: mockProducts[2], quantity: 2, price: 45.00 },
    ],
    total: 90,
    paymentMethod: 'Cash',
    status: 'Failed',
  },
];

// Mock Purchases
export const mockPurchases: PurchaseOrder[] = [
  {
    id: '1',
    supplierId: 's1',
    supplierName: 'ABC Suppliers',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { productId: '1', productName: 'Coca-Cola 1.5L', quantity: 50, cost: 60.00 },
      { productId: '3', productName: 'Rice Premium 1kg', quantity: 100, cost: 35.00 },
    ],
    total: (50 * 60 + 100 * 35),
    paymentMethod: 'Cash',
    status: 'Received',
    paidAmount: (50 * 60 + 100 * 35),
  },
  {
    id: '2',
    supplierId: 's2',
    supplierName: 'Global Foods Inc.',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { productId: '4', productName: 'Chicken Breast 500g', quantity: 40, cost: 150.00 },
    ],
    total: 40 * 150,
    paymentMethod: 'Cash',
    status: 'Received',
    paidAmount: 40 * 150,
  },
  {
    id: '3',
    supplierId: 's3',
    supplierName: 'Fashion Hub',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      { productId: '2', productName: 'Nike Shoes Air Max', quantity: 20, cost: 4000.00 },
    ],
    total: 20 * 4000,
    paymentMethod: 'Invoice',
    status: 'Pending',
    paidAmount: 0,
  },
];

// Mock Payment Methods
export const mockPaymentMethods: PaymentMethod[] = [
  {
    id: '1',
    name: 'Cash',
  },
  {
    id: '2',
    name: 'Credit Card',
  },
  {
    id: '3',
    name: 'Debit Card',
  },
  {
    id: '4',
    name: 'Bank Transfer',
  },
  {
    id: '5',
    name: 'Check',
  },
];

// Mock Accounts
export const mockAccounts: Account[] = [
  // Income Accounts
  {
    id: 'acc-001',
    name: 'Sales Revenue',
    type: 'income',
    code: '4000',
  },
  {
    id: 'acc-002',
    name: 'Service Revenue',
    type: 'income',
    code: '4010',
  },
  {
    id: 'acc-003',
    name: 'Discounts Given',
    type: 'income',
    code: '4020',
  },
  {
    id: 'acc-004',
    name: 'Returns and Allowances',
    type: 'income',
    code: '4030',
  },
  {
    id: 'acc-005',
    name: 'Interest Income',
    type: 'income',
    code: '4040',
  },
  {
    id: 'acc-006',
    name: 'Other Income',
    type: 'income',
    code: '4050',
  },

  // Expense Accounts
  {
    id: 'acc-007',
    name: 'Cost of Goods Sold',
    type: 'expense',
    code: '5000',
  },
  {
    id: 'acc-008',
    name: 'Purchases',
    type: 'expense',
    code: '5010',
  },
  {
    id: 'acc-009',
    name: 'Purchase Returns',
    type: 'expense',
    code: '5020',
  },
  {
    id: 'acc-010',
    name: 'Purchase Discounts',
    type: 'expense',
    code: '5030',
  },
  {
    id: 'acc-011',
    name: 'Freight In',
    type: 'expense',
    code: '5040',
  },
  {
    id: 'acc-012',
    name: 'Rent Expense',
    type: 'expense',
    code: '6000',
  },
  {
    id: 'acc-013',
    name: 'Utilities Expense',
    type: 'expense',
    code: '6010',
  },
  {
    id: 'acc-014',
    name: 'Salaries and Wages',
    type: 'expense',
    code: '6020',
  },
  {
    id: 'acc-015',
    name: 'Office Supplies',
    type: 'expense',
    code: '6030',
  },
  {
    id: 'acc-016',
    name: 'Marketing and Advertising',
    type: 'expense',
    code: '6040',
  },
  {
    id: 'acc-017',
    name: 'Insurance Expense',
    type: 'expense',
    code: '6050',
  },
  {
    id: 'acc-018',
    name: 'Depreciation Expense',
    type: 'expense',
    code: '6060',
  },
  {
    id: 'acc-019',
    name: 'Maintenance and Repairs',
    type: 'expense',
    code: '6070',
  },
  {
    id: 'acc-020',
    name: 'Miscellaneous Expenses',
    type: 'expense',
    code: '6080',
  },
];

export const mockData = {
  suppliers: mockSuppliers,
  products: mockProducts,
  sales: mockSales,
  customers: mockCustomers,
  purchases: mockPurchases,
  paymentMethods: mockPaymentMethods,
  accounts: mockAccounts,
};
