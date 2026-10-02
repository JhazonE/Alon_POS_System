'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { PurchaseOrderPage } from '../add-purchase-order/purchase-order-page';

function NewPurchaseOrder() {
  const params = useSearchParams();
  return (
    <PurchaseOrderPage
      supplierId={params.get('supplierId') || undefined}
      productId={params.get('productId') || undefined}
      reorderFromId={params.get('reorderFrom') || undefined}
    />
  );
}

export default function NewPurchaseOrderPageRoute() {
  return (
    <Suspense fallback={null}>
      <NewPurchaseOrder />
    </Suspense>
  );
}
