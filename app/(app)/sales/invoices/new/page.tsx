'use client';

import { useLeavePage } from '@/components/form-page/use-leave-page';
import { SalesInvoiceForm } from '../add-invoice/sales-invoice-form';

export default function NewSalesInvoicePageRoute() {
  const leave = useLeavePage('/sales/invoices');
  return <SalesInvoiceForm onLeave={leave} />;
}
