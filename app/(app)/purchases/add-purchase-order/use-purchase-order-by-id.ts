'use client';

import { useEffect, useState } from 'react';
import { PurchaseOrder } from '@/lib/types';
import { getApiUrl } from '@/lib/api-config';

/**
 * Loads one purchase order (with items) by id, for the Edit / Reorder pages.
 * Pass a falsy id to skip the fetch. `loading` is only true until the first
 * result for the current id, so a later re-render never unmounts the form.
 */
export function usePurchaseOrderById(id?: string | null) {
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setOrder(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(getApiUrl(`/purchase-orders?id=${encodeURIComponent(id)}&limit=1`))
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        const found = result?.success ? result.data?.[0] : undefined;
        if (found) setOrder(found);
        else setError('Purchase order not found.');
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load the purchase order.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { order, loading, error };
}
