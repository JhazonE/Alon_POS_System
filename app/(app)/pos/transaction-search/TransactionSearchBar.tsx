'use client';

import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

export interface TransactionSearchBarProps {
  searchText: string;
  onSearchTextChange: (v: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function TransactionSearchBar({
  searchText, onSearchTextChange,
  dateFrom, dateTo, onDateFromChange, onDateToChange,
  onClear, placeholder = 'Search SI #, SO #, or customer name', autoFocus,
}: TransactionSearchBarProps) {
  const hasAny = !!(searchText || dateFrom || dateTo);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder={placeholder}
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            autoFocus={autoFocus}
          />
        </div>
        {hasAny && onClear && (
          <button className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring rounded-lg gap-1.5 h-9 shrink-0 px-2 text-xs text-muted-foreground" onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">From</label>
          <Input type="date" className="h-9 w-full min-w-0 text-xs" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">To</label>
          <Input type="date" className="h-9 w-full min-w-0 text-xs" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
