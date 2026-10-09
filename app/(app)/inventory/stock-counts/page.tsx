import { Suspense } from 'react';
import { StockCountsClient } from './StockCountsClient';
import { Skeleton } from '@/components/ui/skeleton';

export default function StockCountsPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory Count</h2>
          <p className="text-muted-foreground">
            Take an inventory snapshot, record your counts, and reconcile variances.
          </p>
        </div>
      </div>
      <Suspense fallback={<StockCountsSkeleton />}>
        <StockCountsClient />
      </Suspense>
    </div>
  );
}

function StockCountsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="rounded-md border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-b p-4 flex justify-between">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
