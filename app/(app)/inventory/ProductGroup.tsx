'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { ProductWithChildren } from './product-list-types';
import { ProductCard } from './ProductCard';
import { CondensedProductRow } from './condensed-product-row/CondensedProductRow';

export function ProductGroup({ productGroup, onSuccess, requireAdjustmentConfirmation, requireTransferConfirmation, lowStockThreshold }: { productGroup: ProductWithChildren, onSuccess?: () => void, requireAdjustmentConfirmation?: boolean, requireTransferConfirmation?: boolean, lowStockThreshold?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = productGroup.children && productGroup.children.length > 0;

  return (
    <div className={cn(
      "flex flex-col transition-all duration-300 rounded-2xl h-full",
      isExpanded ? "ring-1 ring-border bg-muted/20 p-1 shadow-sm" : "bg-transparent"
    )}>
      <div className="relative flex-1 flex flex-col">
        <ProductCard
          product={productGroup}
          hasChildren={hasChildren}
          onSuccess={onSuccess}
          requireAdjustmentConfirmation={requireAdjustmentConfirmation}
          requireTransferConfirmation={requireTransferConfirmation}
          lowStockThreshold={lowStockThreshold}
        />
        {hasChildren && (
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring text-xs rounded-lg gap-1.5 absolute right-10 top-4 z-10 h-8 w-8 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-500", isExpanded && "rotate-180")} />
          </button>
        )}
      </div>

      <div className={cn(
        "grid transition-all duration-300 ease-in-out",
        isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden">
          <div className="py-1 mt-1 space-y-0.5">
             {productGroup.children!.map((childProduct, index) => (
                <CondensedProductRow
                  key={childProduct.id}
                  product={childProduct}
                  isLast={index === productGroup.children!.length - 1}
                  onSuccess={onSuccess}
                  requireAdjustmentConfirmation={requireAdjustmentConfirmation}
                  requireTransferConfirmation={requireTransferConfirmation}
                  lowStockThreshold={lowStockThreshold}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
