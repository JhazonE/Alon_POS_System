'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Trash2, XCircle, Minus, Plus } from 'lucide-react';
import { useCancelSale } from './use-cancel-sale';
import type { CancelSaleDialogProps } from './cancel-sale-types';

export function CancelSaleDialog({ isOpen, onOpenChange, onCancelSelected, onCancelAll, selectedItem }: CancelSaleDialogProps) {
  const { quantity, setQuantity, handleIncrement, handleDecrement, handleQuantityChange } =
    useCancelSale({ isOpen, selectedItem });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[400px] p-6 flex flex-col">
        <DialogHeader className="pb-4 text-center sm:text-center">
          <DialogTitle className="text-xl text-destructive font-bold flex items-center justify-center gap-2">
            <XCircle className="w-5 h-5" />
            Cancel Transaction
          </DialogTitle>
          <DialogDescription className="text-sm mt-1">
            What would you like to remove from the current sale?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-2">
          <div className={`border rounded-lg p-4 transition-all ${selectedItem ? 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/50 opacity-60'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-md">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="font-bold text-base">Void Selected Item</div>
                  <div className="text-xs text-slate-500">
                    {selectedItem ? `Selected: ${selectedItem.name}` : 'No item selected'}
                  </div>
                </div>
              </div>
            </div>

            {selectedItem && (
              <div className="flex items-center justify-between gap-4 pl-12">
                <div className="text-sm font-medium text-slate-600">Quantity to Void:</div>
                <div className="flex items-center gap-2">
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8" onClick={handleDecrement} disabled={quantity <= 1}>
                    <Minus className="h-4 w-4" />
                  </button>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 0)}
                    className="w-16 h-8 text-center"
                  />
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8" onClick={handleIncrement} disabled={selectedItem && quantity >= selectedItem.quantity}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] w-full mt-4 bg-red-600 hover:bg-red-700 text-white"
              disabled={!selectedItem}
              onClick={() => { onCancelSelected(quantity); onOpenChange(false); }}
            >
              Confirm Void ({quantity})
            </button>
          </div>

          <button
            className="inline-flex items-center rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[18px] h-16 justify-start gap-4 text-sm border-slate-200 hover:border-destructive hover:text-destructive hover:bg-destructive/5 transition-all group"
            onClick={() => { onCancelAll(); onOpenChange(false); }}
          >
            <div className="p-2 bg-slate-100 rounded-md group-hover:bg-destructive/10">
              <XCircle className="w-5 h-5 text-slate-500 group-hover:text-destructive" />
            </div>
            <div className="text-left">
              <div className="font-bold text-base">Clear Entire Sale</div>
              <div className="text-xs text-slate-500">Reset cart and clear all items</div>
            </div>
          </button>
        </div>

        <DialogFooter className="sm:justify-end mt-4">
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 px-[18px] text-sm">Keep Items</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
