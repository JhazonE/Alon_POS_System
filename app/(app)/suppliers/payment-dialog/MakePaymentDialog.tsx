'use client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Info } from 'lucide-react';
import { usePaymentMethods } from '@/hooks/use-api';
import { SupplierWithBalance } from '../actions';
import { PoAllocationPanel } from './PoAllocationPanel';
import { useMakePayment } from './use-make-payment';
import { Spinner } from '@/components/ui/spinner';

type Props = {
  supplier: SupplierWithBalance;
  onPaymentComplete?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function MakePaymentDialog({ supplier, onPaymentComplete, trigger, open: controlledOpen, onOpenChange }: Props) {
  const { paymentMethods } = usePaymentMethods();
  const {
    open, setOpen, form, isSubmitting, onSubmit,
    loadingPOs, filteredPOs, selectedPOs,
    poSearchTerm, setPoSearchTerm,
    handleAutoAllocate, handlePOToggle, handlePOAmountChange,
    totalAllocated, advanceCredit,
    showPrintResult, setShowPrintResult, handlePrintVoucher,
  } = useMakePayment({ supplier, onPaymentComplete, open: controlledOpen, onOpenChange });

  const amountValue = form.watch('amount') ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment to {supplier.name}. Current Balance: ₱{supplier.balance.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        {advanceCredit > 0 && (
          <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-300 -mt-1">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              <strong>Advance credit available: ₱{advanceCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              {' '}— this supplier has unallocated payments already on file. The net balance due is ₱{Math.max(0, supplier.balance - advanceCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })}.
            </span>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
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
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentMethods?.map(method => (
                        <SelectItem key={method.id} value={method.name}>{method.name}</SelectItem>
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
                  <FormLabel>Reference (Optional)</FormLabel>
                  <FormControl><Input placeholder="Check no., Transaction ID, etc." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl><Input placeholder="Additional remarks" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PoAllocationPanel
              loadingPOs={loadingPOs}
              filteredPOs={filteredPOs}
              selectedPOs={selectedPOs}
              poSearchTerm={poSearchTerm}
              setPoSearchTerm={setPoSearchTerm}
              handleAutoAllocate={handleAutoAllocate}
              handlePOToggle={handlePOToggle}
              handlePOAmountChange={handlePOAmountChange}
              amountValue={amountValue}
              totalAllocated={totalAllocated}
            />

            <DialogFooter>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
                {isSubmitting && <Spinner className="mr-2 h-4 w-4" />}
                Record Payment
              </button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      <AlertDialog open={showPrintResult} onOpenChange={setShowPrintResult}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Payment Recorded Successfully</AlertDialogTitle>
            <AlertDialogDescription>Would you like to print the payment voucher for this transaction?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Done</AlertDialogCancel>
            <AlertDialogAction onClick={handlePrintVoucher}>Print Voucher</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
