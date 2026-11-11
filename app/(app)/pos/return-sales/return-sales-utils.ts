import type { Sale } from '@/lib/types';
import { subMinutes } from 'date-fns';

export const peso = (n: number) =>
  `₱${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const MOCK_RETURNABLE_SALES: Sale[] = [
  {
    id: 'sale_rc_1',
    customer: { id: 'cust_1', name: 'Alice Johnson', contactNumber: '09171112233', paymentTerms: 'Net 30' },
    date: subMinutes(new Date(), 5).toISOString(),
    items: [
      { product: { id: 'prod_1', name: 'Wireless Keyboard', description: 'Mock Description', price: 75.0, stock: 100, category: 'Elec', brand: 'Logi', reorderPoint: 10, avgDailySales: 5, imageUrl: '', imageHint: '', unitOfMeasure: 'pc' }, quantity: 1, price: 75.0 },
      { product: { id: 'prod_2', name: 'Ergonomic Mouse', description: 'Mock Description', price: 45.0, stock: 100, category: 'Elec', brand: 'MS', reorderPoint: 10, avgDailySales: 5, imageUrl: '', imageHint: '', unitOfMeasure: 'pc' }, quantity: 1, price: 45.0 },
    ],
    total: 120.00,
    paymentMethod: 'Cash',
    status: 'Paid'
  },
  {
    id: 'sale_rc_2',
    customer: { id: 'cust_2', name: 'Bob Smith', contactNumber: '09182223344', paymentTerms: 'COD' },
    date: subMinutes(new Date(), 15).toISOString(),
    items: [
      { product: { id: 'prod_3', name: '4K UHD Monitor', description: 'Mock Description', price: 350.0, stock: 100, category: 'Elec', brand: 'Dell', reorderPoint: 10, avgDailySales: 5, imageUrl: '', imageHint: '', unitOfMeasure: 'pc' }, quantity: 2, price: 350.0 },
    ],
    total: 700.00,
    paymentMethod: 'Credit Card',
    status: 'Paid'
  },
];
