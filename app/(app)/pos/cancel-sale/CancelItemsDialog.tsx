'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Trash2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCancelItems } from './use-cancel-items';
import type { CancelItemsDialogProps } from './cancel-sale-types';

const toggleBase = 'flex-1 h-10 text-xs uppercase font-bold tracking-wider rounded-lg transition-all duration-200 disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const toggleOn = 'bg-white dark:bg-slate-700 shadow-sm text-rose-600 dark:text-rose-400 ring-1 ring-slate-200 dark:ring-slate-600';
const toggleOff = 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50';

export function CancelItemsDialog({
  isOpen, onOpenChange, onCancelSelected, onCancelAll, selectedItem, itemCount,
}: CancelItemsDialogProps) {
  const { scope, setScope } = useCancelItems({ isOpen, selectedItem });

  const canConfirm = scope === 'all' ? itemCount > 0 : !!selectedItem;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onOpenChange(false);
    if (scope === 'all') onCancelAll();
    else onCancelSelected();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] p-6 flex flex-col">
        <DialogHeader className="pb-2 text-center sm:text-center">
          <div className="flex justify-center mb-2">
            <div className="bg-rose-50 dark:bg-rose-950/50 p-3 rounded-2xl">
              <Trash2 className="w-7 h-7 text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <DialogTitle className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
            Cancel Items
          </DialogTitle>
          <DialogDescription className="text-sm mt-1 text-slate-500 dark:text-slate-400">
            Choose what to remove from the current sale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Scope Toggle */}
          <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
            <button
              type="button"
              className={cn(toggleBase, scope === 'selected' ? toggleOn : toggleOff)}
              onClick={() => setScope('selected')}
              disabled={!selectedItem}
            >
              Selected
            </button>
            <button
              type="button"
              className={cn(toggleBase, scope === 'all' ? toggleOn : toggleOff)}
              onClick={() => setScope('all')}
            >
              All Items
            </button>
          </div>

          {/* What the confirm button will actually do */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-center">
            {scope === 'all' ? (
              <>
                <div className="font-bold text-base text-slate-800 dark:text-slate-100">
                  Clear entire sale
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {itemCount > 0
                    ? `Removes all ${itemCount} line${itemCount === 1 ? '' : 's'} from the cart`
                    : 'The cart is already empty'}
                </div>
              </>
            ) : (
              <>
                <div className="font-bold text-base text-slate-800 dark:text-slate-100 truncate">
                  {selectedItem?.name || 'No item selected'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedItem
                    ? `Removes the whole line (${selectedItem.quantity} pc${selectedItem.quantity === 1 ? '' : 's'})`
                    : 'Select a line in the cart first'}
                </div>
              </>
            )}
          </div>

          {scope === 'all' && itemCount > 0 && (
            <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 px-1">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              <span>This cannot be undone. The cart will be emptied.</span>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between gap-2 mt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-ring hover:bg-accent h-11 px-[18px] text-sm"
          >
            Keep Items
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-rose-500 h-11 px-[18px] text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
          >
            <XCircle className="w-4 h-4" />
            {scope === 'all' ? 'Cancel All Items' : 'Cancel Item'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
