'use client';

import { useState, useEffect } from 'react';
import type { SaleItem } from '../pos-content/pos-types';
import type { DiscountType, DiscountDetails } from './discount-types';

type Options = {
  isOpen: boolean;
  item: SaleItem | null;
  onApplyDiscount: (itemId: string | 'ALL', discountPercentage: number, discountType?: string, discountDetails?: DiscountDetails) => void;
  onOpenChange: (isOpen: boolean) => void;
};

export function useDiscount({ isOpen, item, onApplyDiscount, onOpenChange }: Options) {
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [scope, setScope] = useState<'selected' | 'all'>('selected');
  const [value, setValue] = useState<string>('0');
  const [idNumber, setIdNumber] = useState<string>('');
  const [holderName, setHolderName] = useState<string>('');

  const isStatutory = ['pwd', 'senior', 'naac', 'solo_parent'].includes(discountType);
  const statutoryInvalid = isStatutory && (!idNumber.trim() || !holderName.trim());

  useEffect(() => {
    if (isOpen) {
      setDiscountType('percent');
      setScope('selected');
      setValue(item?.discount.toString() || '0');
      setIdNumber('');
      setHolderName('');
    }
  }, [isOpen, item]);

  const handleApply = () => {
    if (statutoryInvalid) return;

    let percentage = 0;

    if (discountType === 'pwd' || discountType === 'senior' || discountType === 'naac') {
      percentage = 20;
    } else if (discountType === 'solo_parent') {
      percentage = 10;
    } else {
      const numValue = parseFloat(value) || 0;
      if (discountType === 'percent') {
        percentage = Math.min(100, Math.max(0, numValue));
      } else if (item) {
        const totalItemPrice = item.price * item.quantity;
        if (totalItemPrice > 0) {
          percentage = Math.min(100, Math.max(0, (numValue / totalItemPrice) * 100));
        }
      }
    }

    const details: DiscountDetails | undefined = isStatutory
      ? { idNumber: idNumber.trim(), holderName: holderName.trim() }
      : undefined;

    if (scope === 'all') {
      onApplyDiscount('ALL', percentage, discountType, details);
    } else if (item) {
      // Cart identity is lineId, not the product id: two selling units of one
      // product are two lines, and an expanded product's base line is
      // "<productId>::<baseUnitId>". Passing item.id would match no line and
      // silently drop the discount, including a statutory PWD/senior one.
      onApplyDiscount(item.lineId, percentage, discountType, details);
    }
    onOpenChange(false);
  };

  return {
    discountType, setDiscountType,
    scope, setScope,
    value, setValue,
    idNumber, setIdNumber,
    holderName, setHolderName,
    isStatutory, statutoryInvalid,
    handleApply,
  };
}
