'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tag } from 'lucide-react';
import { usePriceEdit } from './use-price-edit';
import type { PriceEditDialogProps } from './price-edit-types';

export function PriceEditDialog({
  isOpen,
  onOpenChange,
  item,
  onUpdate,
}: PriceEditDialogProps) {
  const { price, setPrice, save } = usePriceEdit({
    isOpen,
    item,
    onOpenChange,
    onUpdate,
  });

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden border-none shadow-2xl sm:max-w-[400px]">
        <div className="bg-white dark:bg-slate-900 p-6 space-y-6">
          <DialogHeader className="space-y-3">
            <div className="flex justify-center">
              <div className="bg-purple-50 p-3 rounded-2xl">
                <Tag className="w-8 h-8 text-purple-600" />
              </div>
            </div>
            <DialogTitle className="text-2xl font-extrabold text-center text-slate-800 dark:text-slate-100">
              Edit Unit Price
            </DialogTitle>
            <DialogDescription className="sr-only">Enter a temporary price override for the selected item</DialogDescription>
            <p className="text-sm text-slate-500 text-center px-4">
              Enter a temporary price for <span className="font-bold text-slate-700">{item.name}</span>
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-purple-300">₱</span>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      save();
                    }
                  }}
                  className="font-black focus-visible:ring-purple-500 !text-[60px] h-20 px-4 text-center leading-none bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-100 rounded-2xl focus:bg-white dark:focus:bg-slate-800 transition-colors"
                  autoFocus
                />
              </div>
              
              <div className="flex justify-between items-center text-xs px-2">
                <span className="font-bold text-slate-500 uppercase tracking-tight">Original Price</span>
                <span className="font-mono font-bold text-slate-700">₱{item.price.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              className="inline-flex items-center justify-center gap-2 text-sm tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[18px] flex-1 h-12 rounded-xl font-bold text-slate-600 border-slate-200 hover:bg-slate-50 transition-colors"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button 
              className="inline-flex items-center justify-center gap-2 text-sm tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] flex-1 h-12 rounded-xl font-bold text-white shadow-lg transition-all active:scale-[0.98] bg-purple-600 hover:bg-purple-700 shadow-purple-200/50"
              onClick={save}
            >
              Update Price
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


