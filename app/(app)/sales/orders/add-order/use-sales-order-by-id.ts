'use client';

import { useEffect, useState } from 'react';
import type { Sale } from '@/lib/types';
import { getApiUrl } from '@/lib/api-config';

/** Loads one sales order (with items) by id for the Edit page. */
export function useSalesOrderById(id?: string | null) {
  const [order, setOrder] = useState<Sale | null>(null);
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
    fetch(getApiUrl(`/sales/orders?id=${encodeURIComponent(id)}&limit=1`))
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        const found = result?.success ? result.data?.[0] : undefined;
        if (found) setOrder(found);
        else setError('Sales order not found.');
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load the sales order.');
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
