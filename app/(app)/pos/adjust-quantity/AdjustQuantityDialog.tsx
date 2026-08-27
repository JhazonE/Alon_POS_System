'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatQuantity } from '@/lib/utils';
import { useAdjustQuantity } from './use-adjust-quantity';
import type { AdjustQuantityDialogProps } from './adjust-quantity-types';

export function AdjustQuantityDialog({ isOpen, onOpenChange, item, onUpdate }: AdjustQuantityDialogProps) {
  const { adjustment, setAdjustment, resultingQty, handleConfirm, handleKeyDown } =
    useAdjustQuantity({ isOpen, item, onUpdate, onOpenChange });

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Quantity</DialogTitle>
          <DialogDescription>For item: {item.name}</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor="adj-product-name">Product Name</Label>
            <Input id="adj-product-name" value={item.name} readOnly className="col-span-1 bg-muted" />
          </div>
          <div className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor="adj-price">Price</Label>
            <Input id="adj-price" value={`₱${item.price.toFixed(2)}`} readOnly className="col-span-1 bg-muted" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="adj-adjustment">Adjustment (+ / -)</Label>
              <Input
                id="adj-adjustment"
                type="number"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-resulting-qty">Resulting Quantity</Label>
              <Input
                id="adj-resulting-qty"
                value={formatQuantity(resultingQty, item.unitOfMeasure)}
                readOnly
                className="bg-muted font-bold"
              />
            </div>
          </div>
          <div className="text-sm text-muted-foreground text-center">
            Current: <span className="font-medium text-foreground">{formatQuantity(item.quantity, item.unitOfMeasure)}</span>
            &nbsp;→&nbsp;
            New: <span className="font-medium text-foreground">{formatQuantity(resultingQty, item.unitOfMeasure)}</span>
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button type="button" onClick={handleConfirm} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Confirm (Enter)</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
