'use client';
import { Printer, ArrowLeft } from 'lucide-react';
import type { Sale, SystemSettings } from '@/lib/types';
import { ReceiptView } from '../receipt/ReceiptView';
import { mapSaleToReceiptDetails } from './recent-sales-utils';

interface ReceiptPrintViewProps {
  sale: Sale;
  onBack: () => void;
  onPrint: () => void;
  settings?: SystemSettings | null;
  isReprint?: boolean;
}

export function ReceiptPrintView({
  sale,
  onBack,
  onPrint,
  settings,
  isReprint
}: ReceiptPrintViewProps) {
  const saleDetails = { ...mapSaleToReceiptDetails(sale), isReprint };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 non-printable">
        <button onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to List
        </button>
        <button onClick={onPrint} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
          <Printer className="mr-2 h-4 w-4" />
          Print Receipt
        </button>
      </div>

      <div className="printable-area bg-white p-4 shadow-sm mx-auto">
        <ReceiptView saleDetails={saleDetails} settings={settings} />
      </div>
    </div>
  );
}
