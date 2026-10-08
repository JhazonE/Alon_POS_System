'use client';

import { useRouter } from 'next/navigation';
import { useLeavePage } from '@/components/form-page/use-leave-page';
import { SalesOrderForm } from './sales-order-form';
import { useSalesOrderById } from './use-sales-order-by-id';
import { Spinner } from '@/components/ui/spinner';

/** Page body for /sales/orders/new and /sales/orders/[id]/edit. */
export function SalesOrderPage({ editOrderId }: { editOrderId?: string }) {
  const router = useRouter();
  const leave = useLeavePage('/sales/orders');
  const { order, loading, error } = useSalesOrderById(editOrderId);

  if (editOrderId && error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => router.push('/sales/orders')}
          className="inline-flex h-9 items-center rounded-lg border border-input bg-background px-4 text-sm font-semibold hover:bg-accent"
        >
          Back to sales orders
        </button>
      </div>
    );
  }

  // The form initialises once from `initialData`, so wait for it.
  if (editOrderId && (loading || !order)) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        Loading sales order...
      </div>
    );
  }

  return <SalesOrderForm initialData={editOrderId ? order ?? undefined : undefined} onLeave={leave} />;
}
