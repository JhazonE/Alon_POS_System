'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Eye, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { printPaymentReceipt } from '@/lib/print-payment-receipt';
import { formatCurrency } from '@/lib/utils';

interface ViewPaymentDialogProps {
  payment: {
    id: string;
    customerName: string;
    paymentDate: string | Date;
    amount: number;
    paymentType: string;
    reference: string;
    note?: string;
  };
  children?: React.ReactNode;
}

export default function ViewPaymentDialog({ payment, children }: ViewPaymentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handlePrint = () => {
    printPaymentReceipt({
      id: payment.id,
      customerName: payment.customerName,
      date: payment.paymentDate,
      amount: Number(payment.amount),
      paymentMethod: payment.paymentType,
      reference: payment.reference,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <button title="View Details" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0">
            <Eye className="h-4 w-4 text-blue-600" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Payment Details</span>
            <button onClick={handlePrint} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              <Printer className="mr-2 h-4 w-4" /> Print Receipt
            </button>
          </DialogTitle>
          <DialogDescription>
            Reference: <span className="font-mono font-medium text-foreground">{payment.reference}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold text-muted-foreground text-xs uppercase">Customer</p>
              <p className="font-medium text-lg">{payment.customerName}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-muted-foreground text-xs uppercase">Amount</p>
              <p className="font-bold text-lg text-green-600">{formatCurrency(payment.amount)}</p>
            </div>
          </div>

          <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
             <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium">{format(new Date(payment.paymentDate), 'PPP p')}</span>
             </div>
             <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment Method:</span>
                <span className="font-medium">{payment.paymentType}</span>
             </div>
             <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ID:</span>
                <span className="font-mono text-xs">{payment.id}</span>
             </div>
          </div>

          {payment.note && (
            <div className="bg-yellow-50 dark:bg-yellow-900/10 p-3 rounded-md text-sm border border-yellow-100 dark:border-yellow-900/20">
               <p className="font-semibold text-xs text-yellow-800 dark:text-yellow-500 mb-1 uppercase">Note</p>
               <p className="text-yellow-700 dark:text-yellow-400/90 italic">{payment.note}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
