'use client';

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/client-activity-logger';
import { getApiUrl, authFetch } from '@/lib/api-config';
import type { Warehouse } from '@/lib/types';

import type { StagedTransferItem, WarehouseStockItem } from './transfer-board-types';

export function useTransferBoard() {
  const { toast } = useToast();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [sourceSearch, setSourceSearch] = useState('');
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set());
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>('');
  const [stagedItems, setStagedItems] = useState<StagedTransferItem[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [user, setUser] = useState<{ uid: string; [key: string]: any } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('source');

  useEffect(() => {
    setMounted(true);
    fetchData();
    const userSession = localStorage.getItem('mock-user-session');
    if (userSession) setUser(JSON.parse(userSession));
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [whRes, prodRes] = await Promise.all([
        authFetch(getApiUrl('/warehouses?activeOnly=true')),
        authFetch(getApiUrl('/products?limit=1000')),
      ]);
      const whData = await whRes.json();
      const prodData = await prodRes.json();
      if (whData.success) setWarehouses(whData.data);
      if (prodData.success) setProducts(prodData.data);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load board data.' });
    } finally {
      setIsLoading(false);
    }
  };

  const allStockItems = useMemo<WarehouseStockItem[]>(() => {
    return products.map(p => {
      const whId = p.warehouseId || p.warehouse || 'unassigned';
      const whName = warehouses.find(w => w.id === whId)?.name || (whId === 'unassigned' ? 'Unassigned' : 'Unknown');
      return {
        uniqueId: `${whId}|${p.id}`,
        product: p,
        warehouseId: whId,
        warehouseName: whName,
        quantity: p.stock || 0,
      };
    });
  }, [products, warehouses]);

  const filteredSourceItems = useMemo(() => {
    return allStockItems
      .filter(i => {
        const term = sourceSearch.toLowerCase();
        return (
          (i.product.name?.toLowerCase().includes(term) || i.product.sku?.toLowerCase().includes(term)) &&
          i.quantity > 0
        );
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [allStockItems, sourceSearch]);

  const toggleSelectItem = (uniqueId: string) => {
    const s = new Set(selectedSourceIds);
    if (s.has(uniqueId)) s.delete(uniqueId);
    else s.add(uniqueId);
    setSelectedSourceIds(s);
  };

  const toggleSelectAll = () => {
    if (selectedSourceIds.size === filteredSourceItems.length) {
      setSelectedSourceIds(new Set());
    } else {
      setSelectedSourceIds(new Set(filteredSourceItems.map(i => i.uniqueId)));
    }
  };

  const stageItems = (ids: Set<string> | string) => {
    const list = typeof ids === 'string' ? [ids] : Array.from(ids);
    const newStaged = [...stagedItems];
    let addedCount = 0;

    list.forEach(id => {
      const item = allStockItems.find(i => i.uniqueId === id);
      if (!item || newStaged.some(s => s.sourceUniqueId === item.uniqueId)) return;
      newStaged.push({
        stagedId: uuidv4(),
        sourceUniqueId: item.uniqueId,
        product: item.product,
        sourceWarehouseId: item.warehouseId,
        sourceWarehouseName: item.warehouseName,
        maxQuantity: Math.ceil(item.quantity),
        transferQuantity: Math.ceil(item.quantity),
      });
      addedCount++;
    });

    if (addedCount > 0) {
      setStagedItems(newStaged);
      if (typeof ids !== 'string') setSelectedSourceIds(new Set());
      toast({ title: 'Items Staged', description: `Added ${addedCount} item(s) to transfer list.` });
      setActiveTab('staging');
    }
  };

  const removeStagedItem = (stagedId: string) => {
    setStagedItems(prev => prev.filter(i => i.stagedId !== stagedId));
  };

  const updateStagedQuantity = (stagedId: string, value: string) => {
    const v = parseInt(value) || 1;
    setStagedItems(prev =>
      prev.map(i =>
        i.stagedId === stagedId
          ? { ...i, transferQuantity: Math.min(i.maxQuantity, Math.max(1, v)) }
          : i
      )
    );
  };

  const clearStaged = () => setStagedItems([]);

  const executeTransfer = async () => {
    if (!targetWarehouseId || stagedItems.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a destination warehouse.' });
      return;
    }

    if (stagedItems.some(i => i.sourceWarehouseId === targetWarehouseId)) {
      toast({ variant: 'destructive', title: 'Invalid Transfer', description: 'Some items are already in the target warehouse.' });
      return;
    }

    setIsTransferring(true);
    try {
      const transfers = stagedItems.map(i => ({
        sourceProductId: i.product.id,
        targetWarehouseId: targetWarehouseId === 'unassigned' ? null : targetWarehouseId,
        quantity: i.transferQuantity,
        notes: 'Warehouse Board Transfer',
      }));

      const response = await authFetch(getApiUrl('/inventory/transfer/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transfers, userId: user?.uid || 'system' }),
      });

      const result = await response.json();

      if (result.success) {
        await logActivity({
          action: 'TRANSFER',
          module: 'INVENTORY',
          description: `Warehouse board transfer: ${stagedItems.length} item(s) transferred${result.pendingApproval ? ' (pending approval)' : ''}`,
        });
        if (result.pendingApproval) {
          toast({ title: 'Approval Required', description: 'The transaction is sent to the approvals.' });
        } else {
          toast({ title: 'Success', description: 'Warehouse transfer completed successfully.' });
        }
        setTargetWarehouseId('');
        setActiveTab('source');
        setStagedItems([]);
        fetchData();
      } else {
        throw new Error(result.error || 'Transfer failed');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to execute transfer.' });
    } finally {
      setIsTransferring(false);
    }
  };

  return {
    mounted,
    isLoading,
    warehouses,
    fetchData,
    sourceSearch,
    setSourceSearch,
    selectedSourceIds,
    toggleSelectItem,
    toggleSelectAll,
    filteredSourceItems,
    stageItems,
    targetWarehouseId,
    setTargetWarehouseId,
    stagedItems,
    removeStagedItem,
    updateStagedQuantity,
    clearStaged,
    isTransferring,
    executeTransfer,
    activeTab,
    setActiveTab,
  };
}
