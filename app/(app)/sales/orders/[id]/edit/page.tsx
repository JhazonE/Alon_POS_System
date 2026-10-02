'use client';

import { useParams } from 'next/navigation';
import { SalesOrderPage } from '../../add-order/sales-order-page';

export default function EditSalesOrderPageRoute() {
  const { id } = useParams<{ id: string }>();
  return <SalesOrderPage editOrderId={id} />;
}
