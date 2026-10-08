'use client';

import { useMemo, useRef, useState } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { PlusCircle, Search } from 'lucide-react';
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Command } from '@/components/ui/command';
import type { Product } from '@/lib/types';
import { formatQuantity } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

export const ADD_NEW_PRODUCT_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]';

/** Cap on rendered suggestions; the full catalog can be thousands of products. */
const MAX_SUGGESTIONS = 50;

interface ProductAutocompleteProps {
  products: Product[];
  loading?: boolean;
  error?: string | null;
  onSelectProduct: (product: Product) => void;
  placeholder?: string;
  /** How a stock number is shown in the suggestion rows. */
  formatStock?: (value: unknown) => string;
  /** When set, the "No products found." state offers an Add New Product button. */
  addNew?: {
    /** Called with the text typed in the search box. */
    onClick: (typedName: string) => void;
    disabled?: boolean;
    title?: string;
  };
}

/**
 * Type-ahead product search for the New / Edit order pages. Suggestions open
 * under the input as you type; Enter on an exact barcode or SKU adds that
 * product straight away (scanner flow), otherwise on the highlighted row.
 */
export function ProductAutocomplete({
  products,
  loading,
  error,
  onSelectProduct,
  placeholder = 'Scan barcode, enter SKU, or type product name',
  formatStock = formatQuantity,
  addNew,
}: ProductAutocompleteProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = search.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!term) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.sku?.toLowerCase().includes(term) ||
          p.barcode?.toLowerCase().includes(term),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [products, term]);

  const select = (product: Product) => {
    onSelectProduct(product);
    setSearch('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key !== 'Enter' || !term) return;
    const exact = products.find(
      (p) => p.barcode?.toLowerCase() === term || p.sku?.toLowerCase() === term,
    );
    if (exact) {
      e.preventDefault(); // keep cmdk from also selecting the highlighted row
      select(exact);
    }
  };

  return (
    <div
      className="relative flex-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Command shouldFilter={false} className="overflow-visible bg-transparent">
        <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <CommandPrimitive.Input
            ref={inputRef}
            placeholder={placeholder}
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              setOpen(value.trim().length > 0);
            }}
            onFocus={() => search.trim() && setOpen(true)}
            onKeyDown={handleKeyDown}
            className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>
        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-lg">
            {loading && !products.length ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                Loading products...
              </div>
            ) : error ? (
              <div className="py-4 px-3 text-sm text-destructive">Error loading products: {error}</div>
            ) : (
              <CommandList className="max-h-[360px]">
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-3">
                    <span>No products found.</span>
                    {addNew && (
                      // The span carries the hint: a disabled button swallows hover.
                      <span title={addNew.title}>
                        <button
                          type="button"
                          disabled={addNew.disabled}
                          onClick={() => {
                            setOpen(false);
                            addNew.onClick(search.trim());
                          }}
                          className={ADD_NEW_PRODUCT_BUTTON_CLASS}
                        >
                          <PlusCircle className="h-4 w-4" />
                          Add New Product
                        </button>
                      </span>
                    )}
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {suggestions.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={product.id}
                      onSelect={() => select(product)}
                      // Keep focus in the input so the blur handler doesn't close the list mid-click.
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground">{product.name}</span>
                        <span className="text-sm text-muted-foreground font-medium">
                          SKU: {product.sku || 'N/A'} | Barcode: {product.barcode || 'N/A'} | Stock:{' '}
                          {formatStock(product.stock)}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            )}
          </div>
        )}
      </Command>
    </div>
  );
}
