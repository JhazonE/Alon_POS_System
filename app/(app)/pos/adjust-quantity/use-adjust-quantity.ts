'use client';

import { useState, useEffect } from 'react';
import type { SaleItem } from '../pos-content/pos-types';

type Options = {
  isOpen: boolean;
  item: SaleItem | null;
  onUpdate: (itemId: string, newQuantity: number) => void;
  onOpenChange: (open: boolean) => void;
};

export function useAdjustQuantity({ isOpen, item, onUpdate, onOpenChange }: Options) {
  const [adjustment, setAdjustment] = useState('');

  useEffect(() => {
    if (isOpen) setAdjustment('');
  }, [isOpen]);

  const adj = parseFloat(adjustment) || 0;
  const resultingQty = item ? Math.max(0, item.quantity + adj) : 0;

  const handleConfirm = () => {
    if (item) {
      onUpdate(item.lineId, resultingQty);
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
  };

  return { adjustment, setAdjustment, resultingQty, handleConfirm, handleKeyDown };
}
