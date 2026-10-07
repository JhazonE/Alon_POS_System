'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SaleItem } from '../pos-content/pos-types';

type Options = {
  isOpen: boolean;
  item: SaleItem | null;
  onOpenChange: (isOpen: boolean) => void;
  onUpdate: (itemId: string, newName: string, newQuantity: number, newPrice: number, newDiscount: number) => void;
};

export function usePriceEdit({ isOpen, item, onOpenChange, onUpdate }: Options) {
  const [price, setPrice] = useState(item?.price || 0);

  useEffect(() => {
    if (isOpen && item) {
      setPrice(item.price);
    }
  }, [isOpen, item]);

  const save = useCallback(() => {
    if (item) {
      const validPrice = Math.max(0, Number(price) || 0);
      onUpdate(item.lineId, item.name, item.quantity, validPrice, item.discount);
      onOpenChange(false);
    }
  }, [item, price, onUpdate, onOpenChange]);

  return {
    price,
    setPrice,
    save,
  };
}
