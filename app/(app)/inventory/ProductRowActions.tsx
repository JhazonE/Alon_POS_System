'use client';

import { useState } from 'react';
import { ClipboardCheck, MoreHorizontal, MoveHorizontal, Pencil } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Product } from '@/lib/types';
import { isService } from '@/lib/product-type';

import { StockAdjustmentDialog } from './stock-adjustment-dialog/StockAdjustmentDialog';
import { StockTransferDialog } from './stock-transfer-dialog/StockTransferDialog';

export function ProductRowActions({ product, onSuccess, requireAdjustmentConfirmation, requireTransferConfirmation }: { product: Product, onSuccess?: () => void, requireAdjustmentConfirmation?: boolean, requireTransferConfirmation?: boolean }) {
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isCountOpen, setIsCountOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  // Services have no stock to adjust, count, or transfer — the API rejects
  // these anyway (defense in depth), but hide the dead-end menu items too.
  const isProductService = isService(product);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {!isProductService && (
            <>
              <DropdownMenuItem onSelect={() => setIsAdjustOpen(true)}>
                <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Adjust Stock</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsCountOpen(true)}>
                <ClipboardCheck className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Physical Count</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsTransferOpen(true)}>
                <MoveHorizontal className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Transfer Stock</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {!isProductService && (
        <>
          <StockAdjustmentDialog
            product={product}
            onSuccess={onSuccess}
            requireConfirmation={requireAdjustmentConfirmation}
            open={isAdjustOpen}
            onOpenChange={setIsAdjustOpen}
          />
          <StockAdjustmentDialog
            product={product}
            defaultReason="Physical Count"
            onSuccess={onSuccess}
            requireConfirmation={requireAdjustmentConfirmation}
            open={isCountOpen}
            onOpenChange={setIsCountOpen}
          />
          <StockTransferDialog
            product={product}
            onSuccess={onSuccess}
            requireConfirmation={requireTransferConfirmation}
            open={isTransferOpen}
            onOpenChange={setIsTransferOpen}
          />
        </>
      )}
    </>
  );
}
