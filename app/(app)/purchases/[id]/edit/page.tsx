'use client';

import { useParams } from 'next/navigation';

import { PurchaseOrderPage } from '../../add-purchase-order/purchase-order-page';

export default function EditPurchaseOrderPageRoute() {
  const { id } = useParams<{ id: string }>();
  return <PurchaseOrderPage editOrderId={id} />;
}
