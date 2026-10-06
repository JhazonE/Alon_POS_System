'use client';
import { authFetch } from '@/lib/api-config';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useLiveRefresh } from '@/hooks/use-live-refresh';

/**
 * Controller for the stock counts list: loads counts (with live refresh) and
 * derives the search-filtered, paginated view.
 */
export function useStockCounts() {
  const [counts, setCounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const router = useRouter();

  const fetchCounts = async () => {
    try {
      setIsLoading(true);
      const res = await authFetch('/api/inventory/stock-counts');
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) setCounts(data.data);
    } catch (error) {
      console.error('Failed to fetch stock counts', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchCounts(); }, []);

  const stableFetch = useCallback(fetchCounts, []);
  useLiveRefresh(stableFetch);

  // Reset page on search / pageSize change
  useEffect(() => { setPage(1); }, [search, pageSize]);

  const filtered = counts.filter((c) =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleOpen = (id: string) => router.push(`/inventory/stock-counts/${id}`);

  return {
    isLoading,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    fetchCounts,
    filtered,
    safePage,
    paginated,
    handleOpen,
  };
}
