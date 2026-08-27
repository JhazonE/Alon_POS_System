'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Printer, Package2 } from 'lucide-react';

import { type ViewPurchaseOrderDialogProps } from './view-purchase-order-types';
import { useViewPurchaseOrder } from './use-view-purchase-order';
import { PoHeaderInfo } from './po-header-info';
import { PoItemsTable } from './po-items-table';
import { PoSummary } from './po-summary';

export function ViewPurchaseOrderDialog(props: ViewPurchaseOrderDialogProps) {
  const { open, onOpenChange, order } = props;
  const { products, profile, handlePrint } = useViewPurchaseOrder(props);

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-none max-w-full w-full h-screen max-h-screen flex flex-col p-0 gap-0 bg-background border-none rounded-none m-0 shadow-none printable-dialog-content">
        <DialogHeader className="px-6 py-4 border-b bg-white non-printable shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Package2 className="size-6 text-primary" />
              Purchase Order Details
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  order.status === 'Received' || order.status === 'Paid'
                    ? 'default'
                    : order.status === 'Voided'
                    ? 'destructive'
                    : 'secondary'
                }
                className="text-sm uppercase px-3 py-1"
              >
                {order.status}
              </Badge>
            </div>
          </div>
          <DialogDescription className="screen-only">
            Detailed view of purchase order {order.referenceNumber}.
          </DialogDescription>
        </DialogHeader>

        <div
          // Paper preview: white sheet with dark ink in both themes, matching
          // what prints. Without an explicit text colour, inherited theme
          // tokens turn near-white in dark mode and disappear.
          className="p-8 space-y-8 bg-white text-slate-900 text-sm overflow-y-auto flex-1"
          id="printable-order-content"
        >
          <PoHeaderInfo order={order} profile={profile} />
          <PoItemsTable order={order} products={products} />
          <PoSummary order={order} />
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 non-printable flex-row justify-between items-center shrink-0">
          <div className="text-xs text-muted-foreground">
            Use <kbd className="border rounded px-1 bg-white">Ctrl+P</kbd> to print this view.
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
              <Printer className="w-4 h-4 mr-2" />
              Print Purchase Order
            </button>
            <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Done</button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
