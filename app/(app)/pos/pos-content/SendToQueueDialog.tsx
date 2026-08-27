'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SendToBack, CheckCircle2, User, FileText, Loader2 } from 'lucide-react';
import type { SaleItem } from './pos-types';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: SaleItem[];
  defaultCustomerName: string;
  totalDue: number;
  currencySymbol?: string;
  onConfirm: (customerName: string, notes: string) => Promise<{ queueNumber: number; dailyQueueNumber: number } | null>;
};

export function SendToQueueDialog({
  open, onOpenChange, items, defaultCustomerName, totalDue,
  currencySymbol = '₱', onConfirm,
}: Props) {
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ queueNumber: number; dailyQueueNumber: number } | null>(null);

  useEffect(() => {
    if (open) {
      setCustomerName(defaultCustomerName === 'Walk-in Customer' || defaultCustomerName === 'Walk-in' ? '' : defaultCustomerName);
      setNotes('');
      setResult(null);
    }
  }, [open, defaultCustomerName]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const res = await onConfirm(customerName.trim() || 'Walk-in', notes.trim());
    setIsSubmitting(false);
    if (res) setResult(res);
  };

  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={result ? undefined : onOpenChange}>
      <DialogContent className="max-w-sm w-full" onInteractOutside={result ? (e) => e.preventDefault() : undefined}>
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SendToBack className="h-5 w-5 text-violet-600" />
                Send Order to Queue
              </DialogTitle>
            </DialogHeader>

            {/* Items summary */}
            <div className="rounded-xl border bg-muted/30 p-3 space-y-1.5 max-h-36 overflow-y-auto">
              {items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[180px]">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="font-medium shrink-0 ml-2">
                    {currencySymbol}{(item.price * item.quantity * (1 - item.discount / 100)).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-sm border-t pt-1.5 mt-1">
                <span>Total</span>
                <span>{currencySymbol}{totalDue.toFixed(2)}</span>
              </div>
            </div>

            {/* Customer name */}
            <div className="space-y-1.5">
              <Label htmlFor="q-customer" className="flex items-center gap-1.5 text-sm font-semibold">
                <User className="h-3.5 w-3.5" />
                Customer Name
              </Label>
              <Input
                id="q-customer"
                placeholder="Walk-in (leave blank)"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="q-notes" className="flex items-center gap-1.5 text-sm font-semibold">
                <FileText className="h-3.5 w-3.5" />
                Notes / Remarks
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="q-notes"
                placeholder="e.g. Prescription, special instructions..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="resize-none h-20"
              />
            </div>

            <DialogFooter className="gap-2">
              <button onClick={() => onOpenChange(false)} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] bg-violet-600 hover:bg-violet-700 text-white flex-1"
                onClick={handleSubmit}
                disabled={isSubmitting || items.length === 0}
              >
                {isSubmitting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                  : <><SendToBack className="h-4 w-4 mr-2" />Send to Queue</>
                }
              </button>
            </DialogFooter>
          </>
        ) : (
          /* Success — Queue Number Ticket */
          <div className="flex flex-col items-center gap-5 py-4">
            <CheckCircle2 className="h-12 w-12 text-violet-600" />
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Queue Number</p>
              <div className="flex items-center justify-center">
                <span className="text-9xl font-black tabular-nums leading-none text-violet-600">
                  {String(result.dailyQueueNumber).padStart(3, '0')}
                </span>
              </div>
              {customerName.trim() && (
                <p className="text-lg font-bold text-foreground mt-2">{customerName.trim()}</p>
              )}
              <p className="text-sm text-muted-foreground">
                Order sent — cashier will process your payment.
              </p>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] w-full bg-violet-600 hover:bg-violet-700 text-white h-12 text-base font-bold" onClick={handleClose}>
              Done — Next Customer
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
