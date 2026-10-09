'use client';

import { useState, useEffect } from 'react';
import type { SaleItem } from '../pos-content/pos-types';
import type { CancelScope } from './cancel-sale-types';

type Options = {
  isOpen: boolean;
  selectedItem: SaleItem | null;
};

export function useCancelItems({ isOpen, selectedItem }: Options) {
  const [scope, setScope] = useState<CancelScope>('selected');

  useEffect(() => {
    if (!isOpen) return;
    // With no line selected there is nothing for 'selected' to act on, so the
    // dialog opens on the only scope that can actually run.
    setScope(selectedItem ? 'selected' : 'all');
  }, [isOpen, selectedItem]);

  return { scope, setScope };
}
