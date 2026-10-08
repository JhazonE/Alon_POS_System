'use client';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ReceiptText } from 'lucide-react';
import { format } from 'date-fns';
import { useCreditMemo, CREDIT_MEMO_REASONS } from './use-credit-memo';
import { Spinner } from '@/components/ui/spinner';

type Props = {
  supplierId: string;
  supplierName: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onComplete?: () => void;
};

export function CreditMemoDialog({
  supplierId, supplierName, trigger,
  open: controlledOpen, onOpenChange, onComplete,
}: Props) {
  const { open, setOpen, form, isSubmitting, onSubmit, supplierPOs, loadingPOs } =
    useCreditMemo({ supplierId, open: controlledOpen, onOpenChange, onComplete });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30">
              <ReceiptText className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <DialogTitle>Record Credit Memo / Return</DialogTitle>
              <DialogDescription className="text-xs">
                Record a supplier credit for {supplierName}. This reduces the outstanding balance.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CREDIT_MEMO_REASONS.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purchaseOrderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Linked Purchase Order <span className="text-muted-foreground text-xs font-normal">(Optional)</span></FormLabel>
                  <Select
                    onValueChange={v => field.onChange(v === '__none__' ? undefined : v)}
                    value={field.value ?? '__none__'}
                  >
                    <FormControl>
                      <SelectTrigger disabled={loadingPOs}>
                        <SelectValue placeholder={loadingPOs ? 'Loading POs…' : 'No PO linked'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">No PO linked</SelectItem>
                      {supplierPOs.map(po => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.referenceNumber || po.id} — ₱{po.total.toLocaleString()} ({po.status}) — {format(new Date(po.date), 'MM/dd/yy')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference <span className="text-muted-foreground text-xs font-normal">(Optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Debit note #, return slip #, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes <span className="text-muted-foreground text-xs font-normal">(Optional)</span></FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Details about the return or credit…"
                      className="resize-none h-20 text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-md bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-800 dark:text-purple-300">
              This credit memo will immediately reduce the supplier&apos;s outstanding balance. It will appear in the transaction history as a credit entry.
            </div>

            <DialogFooter>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] bg-purple-600 hover:bg-purple-700">
                {isSubmitting && <Spinner className="mr-2 h-4 w-4" />}
                Record Credit Memo
              </button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
