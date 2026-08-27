'use client';

import { ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { formatSINumber } from '@/lib/si-number';
import type { Sale } from '@/lib/types';
import { peso } from './return-sales-utils';

interface TransactionPickRowProps {
  sale: Sale;
  onPick: (s: Sale) => void;
  isHighlighted?: boolean;
}

export function TransactionPickRow({ sale, onPick, isHighlighted = false }: TransactionPickRowProps) {
  return (
    <button
      onClick={() => onPick(sale)}
      className={`group flex w-full items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-primary/5 ${
        isHighlighted ? 'bg-primary/20 ring-2 ring-primary' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm font-semibold">{sale.siNumber ? formatSINumber(sale.siNumber) : (sale.orderNumber ? sale.orderNumber : sale.id?.substring(0, 7))}</span>
          <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{sale.paymentMethod || '-'}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{sale.customer?.name || 'Walk-in'}</span>
          <span>·</span>
          <span className="shrink-0">{format(new Date(sale.date || new Date()), 'MMM d, p')}</span>
        </div>
      </div>
      <span className="shrink-0 font-mono text-sm font-bold">{peso(sale.total)}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
