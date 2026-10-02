'use client';

import { ProductAutocomplete } from '@/components/form-page/product-autocomplete';
import { useProducts } from '@/hooks/use-api';
import { Product } from '@/lib/types';

export function ProductSelector({
  onSelectProduct,
  supplierId,
}: {
  onSelectProduct: (product: Product) => void;
  supplierId?: string | null;
}) {
  // When a supplier is selected, only that supplier's products are searchable.
  // Otherwise, all products are shown.
  const filterSupplierId = supplierId && supplierId !== 'none' ? supplierId : undefined;
  const { products: allProducts, loading, error } = useProducts(undefined, undefined, filterSupplierId);
  // Services are excluded: they have no stock, so they can't be reported as a
  // bad order. useProducts() is shared with POS/sales, so filter here rather
  // than in the hook or API route.
  const products = allProducts.filter((p) => p.type !== 'service');

  return (
    <ProductAutocomplete
      products={products}
      loading={loading}
      error={error}
      onSelectProduct={onSelectProduct}
    />
  );
}
