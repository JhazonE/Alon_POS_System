'use client';
import { Printer } from 'lucide-react';

type Props = {
  onPrint: () => void;
  onPrintPOSInvoice: () => void;
  onClose: () => void;
};

export function OrderDetailsActions({ onPrint, onPrintPOSInvoice, onClose }: Props) {
  return (
    // These are controls around the paper, not the paper itself, so they
    // follow the theme. The removed `bg-white` overrides forced a white face
    // under `variant="outline"`'s theme-aware text, leaving white-on-white
    // labels in dark mode.
    <div className="flex justify-center gap-3 p-4 border-t non-printable bg-muted/30 shrink-0">
      <button onClick={onPrint} className="inline-flex items-center justify-center gap-2 rounded-xl whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-6 font-bold text-xs uppercase tracking-tight shadow-sm">
        <Printer className="mr-2 h-4 w-4" /> Print
      </button>
      <button onClick={onPrintPOSInvoice} className="inline-flex items-center justify-center gap-2 rounded-xl whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-6 font-bold text-xs uppercase tracking-tight shadow-sm">
        <Printer className="mr-2 h-4 w-4" /> Print POS Invoice
      </button>
      <button onClick={onPrint} className="inline-flex items-center justify-center gap-2 rounded-xl whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-6 font-bold text-xs uppercase tracking-tight shadow-sm">
        <Printer className="mr-2 h-4 w-4" /> Print to template
      </button>
      <button onClick={onClose} className="inline-flex items-center justify-center gap-2 rounded-xl whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-6 font-bold text-xs uppercase tracking-tight">
        Close
      </button>
    </div>
  );
}
