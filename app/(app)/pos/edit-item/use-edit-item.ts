'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { calculateEffectivePrice } from '@/lib/pricing';
import type { Product } from '@/lib/types';
import type { SaleItem } from '../pos-content/pos-types';

type Options = {
  isOpen: boolean;
  item: SaleItem | null;
  onUpdate: (itemId: string, newName: string, newQuantity: number, newPrice: number, newDiscount: number) => void;
  onOpenChange: (isOpen: boolean) => void;
  activeLevelId?: string;
  defaultLevelId?: string;
  product?: Product | null;
};

export function useEditItem({ isOpen, item, onUpdate, onOpenChange, activeLevelId, defaultLevelId = 'retail-level', product }: Options) {
  const [name, setName] = useState(item?.name || '');
  const [quantity, setQuantity] = useState(item?.quantity || 1);
  const [price, setPrice] = useState(item?.price || 0);
  const [discount, setDiscount] = useState(item?.discount || 0);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && item) {
      setName(item.name);
      setQuantity(item.quantity);
      setPrice(item.price);
      setDiscount(item.discount);
    }
  }, [isOpen, item]);

  // Recalculate price when quantity changes, using pricing tiers
  const handleQuantityChange = (newQty: number) => {
    setQuantity(newQty);
    if (product || item) {
      const newPrice = calculateEffectivePrice((product || item) as unknown as Product, newQty, activeLevelId, defaultLevelId);
      setPrice(newPrice);
    }
  };

  const save = () => {
    if (!item) return;
    const validQuantity = Math.max(1, Number(quantity) || 1);
    const validPrice = Math.max(0, Number(price) || 0);
    const validDiscount = Math.max(0, Number(discount) || 0);
    try {
      onUpdate(item.lineId, name, validQuantity, validPrice, validDiscount);
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to update item details.', variant: 'destructive' });
    }
  };

  return {
    name, setName,
    quantity, setQuantity,
    price, setPrice,
    discount, setDiscount,
    handleQuantityChange,
    save,
  };
}
