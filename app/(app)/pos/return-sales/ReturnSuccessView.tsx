'use client';
import { SheetFooter } from '@/components/ui/sheet';
import { Printer, CheckCircle2 } from 'lucide-react';
import { peso } from './return-sales-utils';

interface ReturnSuccessViewProps {
  returnedTotal: number;
  saleId: string;
  onClose: () => void;
  onPrint?: () => void;
}

export function ReturnSuccessView({
  returnedTotal,
  saleId,
  onClose,
  onPrint
}: ReturnSuccessViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircle2 className="h-9 w-9 text-green-600" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Return Successful</h2>
        <p className="mt-1 text-sm text-muted-foreground">Items have been returned to inventory.</p>

        <div className="mt-6 w-full max-w-xs rounded-2xl border bg-gradient-to-br from-amber-500/10 to-transparent p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Merchandise Credit Issued
          </p>
          <p className="mt-1 font-mono text-4xl font-black tabular-nums text-amber-600">
            {peso(returnedTotal)}
          </p>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Reference: <span className="font-mono font-medium text-foreground">{saleId}</span>
        </p>
      </div>

      <SheetFooter className="shrink-0 flex-col gap-2 sm:flex-row">
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] w-full sm:w-auto" onClick={onPrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print Credit Slip
        </button>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] w-full sm:w-auto" onClick={onClose}>
          Close
        </button>
      </SheetFooter>
    </div>
  );
}
