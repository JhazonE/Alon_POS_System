'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { v4 as uuidv4 } from 'uuid';
import type { Warehouse } from '@/lib/types';

export function useManageWarehouses(isOpen: boolean, onChange?: () => void) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchWarehouses = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(getApiUrl('/warehouses?activeOnly=false'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setWarehouses(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch warehouses');
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load warehouses.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchWarehouses();
  }, [isOpen]);

  const handleAddWarehouse = async (name: string, location?: string) => {
    const response = await authFetch(getApiUrl('/warehouses'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: `wh_${uuidv4().substring(0, 8)}`, name, location }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to add warehouse');
    await fetchWarehouses();
    onChange?.();
  };

  const handleUpdate = () => { fetchWarehouses(); onChange?.(); };
  const handleDelete = () => { fetchWarehouses(); onChange?.(); };

  return {
    warehouses,
    isLoading,
    handleAddWarehouse,
    handleUpdate,
    handleDelete,
  };
}
