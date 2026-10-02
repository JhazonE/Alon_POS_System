'use client';

import { PlusCircle } from 'lucide-react';
import { ADD_NEW_PRODUCT_BUTTON_CLASS, ProductAutocomplete } from '@/components/form-page/product-autocomplete';
import { useProducts } from '@/hooks/use-api';
import { Product } from '@/lib/types';

export function ProductSelector({
  onSelectProduct,
  onAddNewProduct,
  supplierId,
}: {
  onSelectProduct: (product: Product) => void;
  /** Opens the host's Add Product dialog; `name` is the text typed in the search. */
  onAddNewProduct?: (name?: string) => void;
  supplierId?: string;
}) {
  const { products: allProducts, loading, error } = useProducts(undefined, undefined, supplierId);
  // Services are excluded: they have no stock, so they can't be ordered from a
  // supplier. useProducts() is shared with POS/sales, so filter here rather
  // than in the hook or API route.
  const products = allProducts.filter((p) => p.type !== 'service');

  // The new product is auto-linked to the PO's supplier (that is how this list
  // finds it again), so there must be one before the dialog can open.
  const addNewProductTitle = supplierId ? undefined : 'Select a supplier first';

  return (
    <div className="flex items-start gap-2">
      <ProductAutocomplete
        products={products}
        loading={loading}
        error={error}
        onSelectProduct={onSelectProduct}
        addNew={
          onAddNewProduct
            ? {
                onClick: (name) => onAddNewProduct(name),
                disabled: !supplierId,
                title: addNewProductTitle,
              }
            : undefined
        }
      />
      {onAddNewProduct && (
        // The span carries the hint: a disabled button swallows hover.
        <span title={addNewProductTitle}>
          <button
            type="button"
            disabled={!supplierId}
            onClick={() => onAddNewProduct()}
            className={ADD_NEW_PRODUCT_BUTTON_CLASS}
          >
            <PlusCircle className="h-4 w-4" />
            Add New Product
          </button>
        </span>
      )}
    </div>
  );
}
