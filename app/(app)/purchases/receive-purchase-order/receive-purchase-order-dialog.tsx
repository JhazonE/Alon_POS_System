'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertCircle } from 'lucide-react';
import { toSafeNumber } from '@/lib/utils';

import { type ReceivePurchaseOrderDialogProps } from './receive-purchase-order-types';
import { useReceivePurchaseOrder } from './use-receive-purchase-order';
import { ReceiveItemsTable } from './receive-items-table';

export function ReceivePurchaseOrderDialog(props: ReceivePurchaseOrderDialogProps) {
  const { order, open, onOpenChange } = props;
  const controller = useReceivePurchaseOrder(props);
  const {
    isSubmitting,
    isConfirmOpen, setIsConfirmOpen,
    allocationStrategy, setAllocationStrategy,
    hasBadItems,
    handleConfirm,
  } = controller;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-none max-w-full w-full h-screen max-h-screen flex flex-col p-0 gap-0 bg-background border-none rounded-none m-0 shadow-none">
        <DialogHeader className="px-6 py-4 border-b bg-background shrink-0">
          <DialogTitle>
            Receive Purchase Order #{order.referenceNumber || order.id.substring(0, 8).toUpperCase()}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Verify and confirm the quantities received. If there are damaged or defective items,
                record them as bad items.
              </span>
              {toSafeNumber(order.shippingFee) > 0 && (
                <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md border">
                  <span className="text-xs font-semibold">Allocation Strategy:</span>
                  <Select
                    value={allocationStrategy}
                    onValueChange={(val: any) => setAllocationStrategy(val)}
                  >
                    <SelectTrigger className="h-7 text-[10px] w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equal" className="text-[10px]">Equal Per Line</SelectItem>
                      <SelectItem value="proportional" className="text-[10px]">Proportional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6">
          <div className="py-2">
            <ReceiveItemsTable order={order} controller={controller} />
          </div>

          {hasBadItems && (
            <div className="my-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="text-xs font-medium">
                You have marked items as bad. A &quot;Bad Order&quot; record will be automatically
                created for these items.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 shrink-0">
          <button onClick={() => onOpenChange(false)} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Receipt
          </button>
        </DialogFooter>

        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Receipt</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to confirm receipt for{' '}
                <strong>
                  PO #{order.referenceNumber || order.id.substring(0, 8).toUpperCase()}
                </strong>
                ? Inventory levels will be updated immediately.
                {hasBadItems && (
                  <span className="block mt-2 font-bold text-destructive">
                    Warning: You are also recording bad/damaged items.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm & Update Stock
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
