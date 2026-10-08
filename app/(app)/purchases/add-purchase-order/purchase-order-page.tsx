'use client';

import { useRouter } from 'next/navigation';

import { useProducts } from '@/hooks/use-api';
import { useInvalidatePurchaseOrders } from '@/hooks/use-purchase-order-mutations';

import { useLeavePage } from '@/components/form-page/use-leave-page';

import { PurchaseOrderForm } from './purchase-order-form';
import { usePurchaseOrderById } from './use-purchase-order-by-id';
import { Spinner } from '@/components/ui/spinner';

interface PurchaseOrderPageProps {
  /** Edit this existing order. */
  editOrderId?: string;
  /** Start a new order pre-filled from this order's items (Reorder). */
  reorderFromId?: string;
  /** Start a new order with this product already on it (Restock). */
  productId?: string;
  /** Start a new order for this supplier (scheduled orders, dashboard card). */
  supplierId?: string;
}

/**
 * Page body for /purchases/new and /purchases/[id]/edit. Loads whatever the
 * form needs to initialise (an order or a product) before mounting it, since
 * the form initialises once from those inputs.
 */
export function PurchaseOrderPage({
  editOrderId,
  reorderFromId,
  productId,
  supplierId,
}: PurchaseOrderPageProps) {
  const router = useRouter();
  const invalidatePurchaseOrders = useInvalidatePurchaseOrders();
  const sourceOrderId = editOrderId ?? reorderFromId;
  const { order, loading: orderLoading, error } = usePurchaseOrderById(sourceOrderId);
  const { products, loading: productsLoading } = useProducts();
  const prefillProduct = productId ? products.find((p) => p.id === productId) : undefined;

  const leave = useLeavePage('/purchases');

  if (sourceOrderId && error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => router.push('/purchases')}
          className="inline-flex h-9 items-center rounded-lg border border-input bg-background px-4 text-sm font-semibold hover:bg-accent"
        >
          Back to purchase orders
        </button>
      </div>
    );
  }

  const waiting = (sourceOrderId && (orderLoading || !order)) || (productId && !prefillProduct && productsLoading);
  if (waiting) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Loading purchase order...
      </div>
    );
  }

  return (
    <PurchaseOrderForm
      open
      onAddOrder={() => invalidatePurchaseOrders()}
      onOpenChange={(open) => {
        if (!open) leave();
      }}
      editOrder={editOrderId ? order : undefined}
      reorderData={reorderFromId ? order : undefined}
      prefillProduct={prefillProduct}
      prefillSupplierId={supplierId}
    />
  );
}
