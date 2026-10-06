'use client';

import { useEffect, useState } from 'react';

import { dispatchStockUpdate } from '@/hooks/use-live-refresh';
import { logActivity } from '@/lib/client-activity-logger';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { formatQuantity } from '@/lib/utils';
import type { Product, Warehouse } from '@/lib/types';

export interface UseStockTransferProps {
  product: Product;
  onSuccess?: () => void;
  requireConfirmation?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function useStockTransfer({
  product,
  onSuccess,
  requireConfirmation,
  open,
  onOpenChange,
}: UseStockTransferProps) {
  const { toast } = useToast();

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange !== undefined ? onOpenChange : setInternalOpen;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchWarehouses();
      setQuantity(0);
      setTargetWarehouseId('');
      setNotes('');
    }
  }, [isOpen]);

  const fetchWarehouses = async () => {
    setIsLoadingWarehouses(true);
    try {
      const response = await authFetch(getApiUrl('/warehouses?activeOnly=true'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        const currentWhId = product.warehouseId || (product as any).warehouse;
        setWarehouses(result.data.filter((w: Warehouse) => w.id !== currentWhId));
      }
    } catch (error) {
      console.error('Failed to fetch warehouses:', error);
    } finally {
      setIsLoadingWarehouses(false);
    }
  };

  const processTransfer = async () => {
    if (!targetWarehouseId || quantity <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Input',
        description: 'Please select a target warehouse and enter a valid quantity.',
      });
      return;
    }

    if (quantity > product.stock) {
      toast({
        variant: 'destructive',
        title: 'Insufficient Stock',
        description: `You only have ${formatQuantity(product.stock)} units available.`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const userSession = localStorage.getItem('mock-user-session');
      const userId = userSession ? JSON.parse(userSession).uid : 'system';

      const response = await authFetch(getApiUrl('/inventory/transfer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          sourceProductId: product.id,
          fromWarehouseId: product.warehouseId || (product as any).warehouse,
          targetWarehouseId,
          quantity,
          notes,
          userId,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const targetWh = warehouses.find(w => w.id === targetWarehouseId);
        await logActivity({
          action: 'TRANSFER',
          module: 'INVENTORY',
          description: `Transferred ${quantity} ${product.unitOfMeasure} of "${product.name}" to ${targetWh?.name || targetWarehouseId}${result.pendingApproval ? ' (pending approval)' : ''}`,
          referenceId: String(product.id),
        });
        if (result.pendingApproval) {
          toast({
            title: 'Transfer Pending Approval',
            description: `Stock transfer for ${product.name} has been submitted for multi-level approval.`,
          });
        } else {
          toast({
            title: 'Transfer Successful',
            description: `${quantity} ${product.unitOfMeasure} of ${product.name} transferred successfully.`,
          });
        }
        setIsOpen(false);
        onSuccess?.();
        dispatchStockUpdate();
      } else {
        throw new Error(result.error || 'Transfer failed');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Transfer Failed',
        description: error.message || 'An error occurred during transfer.',
      });
    } finally {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
    }
  };

  const handleTransferClick = () => {
    if (!targetWarehouseId || quantity <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Input',
        description: 'Please select a target warehouse and enter a valid quantity.',
      });
      return;
    }

    if (quantity > product.stock) {
      toast({
        variant: 'destructive',
        title: 'Insufficient Stock',
        description: `You only have ${formatQuantity(product.stock)} units available.`,
      });
      return;
    }

    if (requireConfirmation) {
      setIsConfirmOpen(true);
    } else {
      processTransfer();
    }
  };

  const handleQuantityChange = (value: string) => {
    setQuantity(Math.min(product.stock, Number(value)));
  };

  const targetWhName = warehouses.find(w => w.id === targetWarehouseId)?.name;

  return {
    isOpen,
    setIsOpen,
    isSubmitting,
    warehouses,
    isLoadingWarehouses,
    targetWarehouseId,
    setTargetWarehouseId,
    quantity,
    handleQuantityChange,
    notes,
    setNotes,
    isConfirmOpen,
    setIsConfirmOpen,
    handleTransferClick,
    processTransfer,
    targetWhName,
  };
}
