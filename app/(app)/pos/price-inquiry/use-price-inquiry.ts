'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Product } from '@/lib/types';
import { useProducts } from '@/hooks/use-api';
import { useLiveRefresh } from '@/hooks/use-live-refresh';

type Options = {
  isOpen: boolean;
  activeLevelId?: string;
  warehouseId?: string | null;
  enabled?: boolean;
};

export function usePriceInquiry({ isOpen, activeLevelId, warehouseId, enabled = true }: Options) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { products, loading, error, refetch: refetchPriceProducts } = useProducts(searchTerm, undefined, undefined, warehouseId, undefined, enabled);

  // Handle auto-refresh when stock is updated (e.g., after a sale)
  const stableRefresh = useCallback(() => { refetchPriceProducts(); }, [refetchPriceProducts]);
  useLiveRefresh(stableRefresh);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedProduct(null);
    }
  }, [isOpen, activeLevelId]);

  const handleSelect = useCallback((productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setSelectedProduct(product);
    }
  }, [products]);

  return {
    searchTerm,
    setSearchTerm,
    selectedProduct,
    products,
    loading,
    error,
    handleSelect,
  };
}
