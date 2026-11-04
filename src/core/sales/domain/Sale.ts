export interface SaleEntity {
  id: string;
  customerId: string;
  reference?: string;
  receiptNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  total: number;
  paymentMethod: string;
  paymentReference?: string;
  status: 'Paid' | 'Pending' | 'Failed' | 'Shipped' | 'Delivered' | 'Returned' | 'Voided' | 'To Deliver' | 'Fully Delivered';
  transactionSource: 'POS' | 'Backoffice';
  notes?: string;
  orderNumber?: number;
  items: SaleItemEntity[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SaleItemEntity {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  barcode?: string;
  createdAt?: string;
}
