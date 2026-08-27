'use client';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, RefreshCw, Eraser } from 'lucide-react';
import { usePaymentMethods } from '@/hooks/use-api';
import { SupplierWithBalance } from '../actions';
import { useBulkPayment } from './use-bulk-payment';

type Props = {
  suppliers: SupplierWithBalance[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
};

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BulkPaymentDialog({ suppliers, open, onOpenChange, onComplete }: Props) {
  const { paymentMethods } = usePaymentMethods();
  const {
    rows, date, setDate,
    paymentMethod, setPaymentMethod,
    reference, setReference,
    isSubmitting, progress, isDone,
    total, activeRows,
    handleAmountChange, handleFillAll, handleClearAll, handleSubmit,
  } = useBulkPayment({ suppliers, open, onOpenChange, onComplete });

  return (
    <Dialog open={open} onOpenChange={v => { if (!isSubmitting) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Payment — {suppliers.filter(s => s.balance > 0).length} Suppliers</DialogTitle>
          <DialogDescription>
            Review and adjust amounts, then record payments for all selected suppliers at once.
          </DialogDescription>
        </DialogHeader>

        {/* Shared payment fields */}
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={isSubmitting}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Payment Method <span className="text-red-500">*</span></label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={isSubmitting}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods?.map(m => (
                  <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Reference (Optional)</label>
            <Input
              placeholder="Check no., batch ref..."
              value={reference}
              onChange={e => setReference(e.target.value)}
              disabled={isSubmitting}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Amount controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex-1">
            {activeRows.length} of {rows.length} suppliers will receive payment
          </span>
          <button className="inline-flex items-center justify-center rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[13px] rounded-lg h-7 text-xs gap-1" onClick={handleFillAll} disabled={isSubmitting}>
            <RefreshCw className="h-3 w-3" /> Fill All
          </button>
          <button className="inline-flex items-center justify-center rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] rounded-lg h-7 text-xs gap-1 text-muted-foreground" onClick={handleClearAll} disabled={isSubmitting}>
            <Eraser className="h-3 w-3" /> Clear All
          </button>
        </div>

        {/* Supplier rows */}
        <div className="overflow-y-auto flex-1 border rounded-md divide-y">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No suppliers with outstanding balance selected.</div>
          ) : rows.map(row => (
            <div
              key={row.supplierId}
              className={`flex items-center gap-3 px-3 py-2.5 ${
                row.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/20' :
                row.status === 'error'   ? 'bg-red-50 dark:bg-red-950/20' : ''
              }`}
            >
              {/* Status icon */}
              <div className="w-5 shrink-0">
                {row.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {row.status === 'error'   && <XCircle className="h-4 w-4 text-red-600" />}
                {row.status === 'pending' && isSubmitting && row.amount > 0 && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Supplier info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{row.supplierName}</p>
                <p className="text-[10px] text-muted-foreground">Balance: ₱{fmt(row.balance)}</p>
              </div>

              {/* Amount input */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">₱</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={row.balance}
                  value={row.amount || ''}
                  onChange={e => handleAmountChange(row.supplierId, parseFloat(e.target.value) || 0)}
                  disabled={isSubmitting}
                  className="h-7 w-32 text-sm text-right"
                />
              </div>

              {/* Badge */}
              {row.amount > 0 && row.amount < row.balance && row.status === 'pending' && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 border-yellow-300 text-yellow-700 bg-yellow-50 shrink-0">
                  Partial
                </Badge>
              )}
              {row.amount <= 0 && row.status === 'pending' && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 text-muted-foreground">
                  Skip
                </Badge>
              )}
              {row.status === 'error' && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 border-red-300 text-red-700 bg-red-50 shrink-0">
                  Failed
                </Badge>
              )}
            </div>
          ))}
        </div>

        {/* Progress */}
        {isSubmitting && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground text-center">{progress}% complete</p>
          </div>
        )}

        <DialogFooter className="flex items-center gap-2 pt-1 border-t">
          <div className="flex-1 text-left">
            <span className="text-xs text-muted-foreground">Total to pay: </span>
            <span className="text-sm font-bold text-red-600">₱{fmt(total)}</span>
          </div>
          <button onClick={() => onOpenChange(false)} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || activeRows.length === 0 || isDone}
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing…</>
              : `Pay ${activeRows.length} Supplier${activeRows.length !== 1 ? 's' : ''}`
            }
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
