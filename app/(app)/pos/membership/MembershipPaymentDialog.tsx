'use client';

import { useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Loader2, Coins, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { usePrinter } from '@/lib/use-printer';
import { useMembershipPayment } from './use-membership-payment';
import { cn } from '@/lib/utils';
import type { MembershipPaymentDialogProps, MembershipResult } from './membership-types';

/**
 * Payment-method button classes: the shared default-size button recipe plus
 * this control's auto height, with the selected/unselected halves split out.
 */
const METHOD_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-[18px] h-auto py-2';
const METHOD_SELECTED =
  'bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55';
const METHOD_UNSELECTED =
  'border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring';

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function MembershipPaymentDialog({
  isOpen, onOpenChange, initialCustomer, shiftId, terminalId, userId,
  printMode = 'native', settings, cashierName,
}: MembershipPaymentDialogProps) {
  const { toast } = useToast();
  const { isConnected, connect, print } = usePrinter(printMode, settings?.nativePrinterName);
  const {
    customers,
    selectedCustomerId, setSelectedCustomerId,
    existingCard, isCardLoading,
    fee, durationMonths,
    rfidCode, setRfidCode,
    pointSetting, setPointSetting,
    paymentMethod, setPaymentMethod,
    amountTendered, setAmountTendered,
    isSubmitting,
    submit,
  } = useMembershipPayment({ isOpen, initialCustomer, userId, shiftId, terminalId });

  const validUntil = useMemo(() => format(addMonths(new Date(), durationMonths), 'MMM dd, yyyy'), [durationMonths]);

  const isActivation = selectedCustomerId !== '' && !existingCard && !isCardLoading;
  const tendered = parseFloat(amountTendered) || 0;
  const change = paymentMethod === 'cash' ? Math.max(0, tendered - fee) : 0;

  const confirmDisabled =
    isSubmitting ||
    !selectedCustomerId ||
    fee <= 0 ||
    (isActivation && !rfidCode.trim()) ||
    (paymentMethod === 'cash' && tendered < fee);

  const printReceipt = async (result: MembershipResult) => {
    if (printMode === 'browser') return; // Native/ESC-POS is the POS deployment target.
    try {
      if (!isConnected) {
        const connected = await connect();
        if (!connected) {
          toast({ title: 'Printer Not Connected', description: 'Membership recorded, but the receipt could not be printed.', variant: 'destructive' });
          return;
        }
      }
      const { ReceiptGenerator } = await import('@/lib/receipt-generator');
      const generator = new ReceiptGenerator();
      const bytes = generator.generateMembershipReceipt({
        customerName: result.customerName,
        rfidCode: result.rfidCode,
        amount: result.amount,
        paymentMethod,
        amountTendered: paymentMethod === 'cash' ? tendered : undefined,
        change: paymentMethod === 'cash' ? change : undefined,
        newExpiry: format(new Date(result.newExpiry), 'MMM dd, yyyy'),
        previousExpiry: result.previousExpiry,
        isNewCard: result.isNewCard,
        receiptNumber: result.receiptNumber,
        cashierName,
      }, settings);
      await print(bytes);
    } catch {
      toast({ title: 'Print Failed', description: 'Membership recorded, but the receipt could not be printed.', variant: 'destructive' });
    }
  };

  const handleConfirm = async () => {
    const result = await submit();
    if (result) {
      toast({
        title: result.isNewCard
          ? `Membership ACTIVATED — ₱${result.amount.toFixed(2)} (${paymentMethod})`
          : `Membership RENEWED — ₱${result.amount.toFixed(2)} (${paymentMethod})`,
        description: `${result.customerName} — valid until ${format(new Date(result.newExpiry), 'MMM dd, yyyy')}.`,
      });
      await printReceipt(result);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Membership Payment</DialogTitle>
          <DialogDescription>Activate or renew a customer&apos;s loyalty card.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Customer */}
          <div className="grid gap-1.5">
            <Label htmlFor="mbr-customer">Customer</Label>
            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
              <SelectTrigger id="mbr-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCardLoading && selectedCustomerId && (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking loyalty card…</p>
          )}

          {/* Renewal vs Activation */}
          {selectedCustomerId && !isCardLoading && existingCard && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium text-cyan-600">Renewal</p>
              <p className="text-muted-foreground">
                Card {existingCard.rfid_code || '—'} · current expiry{' '}
                {existingCard.expiry_date ? format(new Date(existingCard.expiry_date), 'MMM dd, yyyy') : 'none'}
              </p>
            </div>
          )}

          {isActivation && (
            <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
              <p className="text-sm font-medium text-amber-700">New card — activation</p>
              <div className="grid gap-1.5">
                <Label htmlFor="mbr-rfid">RFID Card Code</Label>
                <Input id="mbr-rfid" placeholder="Scan or type RFID / card number" value={rfidCode} onChange={(e) => setRfidCode(e.target.value)} autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mbr-point">Point Setting (optional)</Label>
                <Input id="mbr-point" placeholder="e.g. default" value={pointSetting} onChange={(e) => setPointSetting(e.target.value)} />
              </div>
            </div>
          )}

          {/* Fee */}
          <div className="rounded-lg border p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Membership Fee</p>
              <p className="text-2xl font-black">₱{fee.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valid Until</p>
              <p className="text-sm font-semibold">{validUntil}</p>
            </div>
          </div>

          {fee <= 0 && (
            <p className="text-xs text-destructive">Membership fee is not configured. Set it in POS Setup → General.</p>
          )}

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={cn(METHOD_CLASSES, paymentMethod === 'cash' ? METHOD_SELECTED : METHOD_UNSELECTED)} onClick={() => setPaymentMethod('cash')}>
              <Coins className="h-4 w-4 mr-1.5" />Cash
            </button>
            <button type="button" className={cn(METHOD_CLASSES, paymentMethod === 'card' ? METHOD_SELECTED : METHOD_UNSELECTED)} onClick={() => setPaymentMethod('card')}>
              <CreditCard className="h-4 w-4 mr-1.5" />Card
            </button>
          </div>

          {paymentMethod === 'cash' && (
            <div className="grid gap-1.5">
              <Label htmlFor="mbr-tendered">Amount Tendered</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₱</span>
                <Input id="mbr-tendered" type="number" min={0} step="0.01" placeholder="0.00" className="pl-8" value={amountTendered} onChange={(e) => setAmountTendered(e.target.value)} />
              </div>
              <div className="flex items-center justify-between text-sm pt-1">
                <span className="text-muted-foreground flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />Change</span>
                <span className="font-bold">₱{change.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={handleConfirm} disabled={confirmDisabled} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] bg-emerald-600 hover:bg-emerald-700">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Payment
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
