'use client';

import { ProductAutocomplete } from '@/components/form-page/product-autocomplete';
import { useProducts } from '@/hooks/use-api';
import { formatStockQuantity } from '@/lib/utils';
import type { Product } from '@/lib/types';

interface Props {
  onSelectProduct: (product: Product) => void;
  warehouseId?: string;
}

export function AddOrderProductSelector({ onSelectProduct, warehouseId }: Props) {
  const { products, loading, error } = useProducts(undefined, undefined, undefined, warehouseId);

  return (
    <ProductAutocomplete
      products={products}
      loading={loading}
      error={error}
      onSelectProduct={onSelectProduct}
      formatStock={formatStockQuantity}
    />
  );
}
