'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { logActivity } from '@/lib/client-activity-logger';
import { useToast } from '@/hooks/use-toast';
import { toSafeNumber } from '@/lib/utils';

/**
 * Controller for the stock count detail screen: loads the count + its items,
 * owns the per-item count edits, the save/complete/print flows, and the derived
 * progress/variance summaries.
 */
export function useCountDetail({ countId }: { countId: string }) {
  const [count, setCount] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  const router = useRouter();
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchDetails = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/inventory/stock-counts/${countId}`);
      if (!res.ok) {
        const errText = await res.text();
        console.error('Error response body:', errText);
        throw new Error(`Failed to fetch count details (Status ${res.status})`);
      }
      const data = await res.json();
      if (data.success) {
        setCount(data.data);
        setItems(data.data.items || []);
      } else {
        throw new Error(data.error || 'Failed to fetch count details');
      }
    } catch (error) {
      console.error(error);
      toast({ title: 'Error loading count details', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [countId]);

  const handleQuantityChange = (id: string, value: string) => {
    const numValue = value === '' ? null : Number(value);
    setItems(items.map((item) => (item.id === id ? { ...item, counted_quantity: numValue } : item)));
  };

  const handleSaveProgress = async () => {
    try {
      setIsSaving(true);
      const payload = items
        .filter((item) => item.counted_quantity !== null)
        .map((item) => ({ id: item.id, counted_quantity: item.counted_quantity }));

      const res = await fetch(`/api/inventory/stock-counts/${countId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      });

      if (!res.ok) throw new Error('Failed to save progress');

      toast({ title: 'Progress saved successfully' });
      await fetchDetails();
    } catch (error) {
      console.error(error);
      toast({ title: 'Failed to save progress', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    try {
      setIsCompleting(true);
      const payload = items
        .filter((item) => item.counted_quantity !== null)
        .map((item) => ({ id: item.id, counted_quantity: item.counted_quantity }));

      if (payload.length > 0) {
        await fetch(`/api/inventory/stock-counts/${countId}/items`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: payload }),
        });
      }

      const res = await fetch(`/api/inventory/stock-counts/${countId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedBy: 'Admin' }),
      });

      const result = await res.json();

      await logActivity({
        action: 'UPDATE',
        module: 'INVENTORY',
        description: `Completed inventory count${result.pendingApproval ? ' (submitted for approval)' : ' — Inventory updated'}`,
        referenceId: countId,
      });
      if (result.pendingApproval) {
        toast({
          title: 'Inventory count submitted for approval.',
          description: 'Inventory will be updated once approved.',
        });
      } else {
        toast({ title: 'Inventory count completed! Inventory has been updated.' });
      }

      setShowReviewDialog(false);
      router.push('/inventory/stock-counts');
    } catch (error: any) {
      console.error(error);
      toast({ title: error.message || 'Error completing count', variant: 'destructive' });
    } finally {
      setIsCompleting(false);
    }
  };

  const handlePrint = () => window.print();

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const lowerSearch = search.toLowerCase();
    return items.filter(
      (item) =>
        item.product_name?.toLowerCase().includes(lowerSearch) ||
        item.product_sku?.toLowerCase().includes(lowerSearch) ||
        item.product_barcode?.toLowerCase().includes(lowerSearch)
    );
  }, [items, search]);

  const itemsWithVariances = useMemo(
    () =>
      items.filter(
        (item) => item.counted_quantity !== null && item.counted_quantity !== item.snapshot_quantity
      ),
    [items]
  );

  const uncountedItems = useMemo(
    () => items.filter((item) => item.counted_quantity === null),
    [items]
  );

  const countedCount = items.length - uncountedItems.length;
  const progressPct = items.length ? Math.round((countedCount / items.length) * 100) : 0;

  // Grand totals across counted items only (uncounted lines have no variance yet).
  // totalVariance = net qty over/short; totalVarianceAmount = net peso (variance × cost).
  const { totalVariance, totalVarianceAmount } = useMemo(() => {
    let qty = 0;
    let amount = 0;
    for (const item of items) {
      if (item.counted_quantity === null) continue;
      const v = item.counted_quantity - item.snapshot_quantity;
      qty += v;
      amount += v * toSafeNumber(item.product_cost);
    }
    return { totalVariance: qty, totalVarianceAmount: amount };
  }, [items]);

  return {
    count,
    items,
    search,
    setSearch,
    isLoading,
    isSaving,
    isCompleting,
    showReviewDialog,
    setShowReviewDialog,
    router,
    searchInputRef,
    handleQuantityChange,
    handleSaveProgress,
    handleComplete,
    handlePrint,
    filteredItems,
    itemsWithVariances,
    uncountedItems,
    countedCount,
    progressPct,
    totalVariance,
    totalVarianceAmount,
  };
}
