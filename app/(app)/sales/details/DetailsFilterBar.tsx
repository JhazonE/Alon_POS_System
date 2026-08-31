'use client';

import { Table } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuCheckboxItem, DropdownMenuTrigger, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Search, Filter, Columns, Download, X, CalendarRange, CreditCard, Terminal } from 'lucide-react';

type Props = {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  dateRange: any;
  paymentTypeFilter: string;
  terminalId: string;
  hasActiveFilters: boolean;
  resetFilters: () => void;
  onOpenPaymentType: () => void;
  onOpenTerminal: () => void;
  onOpenDateRange: () => void;
  exportToCSV: () => void;
  exportToPDF: () => void;
  table: Table<any>;
};

export function DetailsFilterBar({
  searchTerm, setSearchTerm,
  dateRange, paymentTypeFilter, terminalId,
  hasActiveFilters, resetFilters,
  onOpenPaymentType, onOpenTerminal, onOpenDateRange,
  exportToCSV, exportToPDF,
  table,
}: Props) {
  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${dateRange.from.toLocaleDateString()} – ${dateRange.to.toLocaleDateString()}`
      : dateRange.from.toLocaleDateString()
    : null;

  const activeFilterCount =
    (paymentTypeFilter !== 'all' ? 1 : 0) +
    (terminalId !== 'all' ? 1 : 0) +
    (dateRange ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search SI No., customer..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-8"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center">
                {activeFilterCount}
              </Badge>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filter By</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenDateRange} className="gap-2">
            <CalendarRange className="h-4 w-4" />
            Date Range {dateLabel && <Badge variant="secondary" className="ml-auto text-xs">{dateLabel}</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenPaymentType} className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Type {paymentTypeFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{paymentTypeFilter}</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenTerminal} className="gap-2">
            <Terminal className="h-4 w-4" />
            Terminal {terminalId !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{terminalId}</Badge>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-2">
            <Columns className="h-4 w-4" />
            Columns
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {table.getAllColumns()
            .filter(col => col.getCanHide())
            .map(col => (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={col.getIsVisible()}
                onCheckedChange={v => col.toggleVisibility(v)}
                className="capitalize"
              >
                {col.id}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-2">
            <Download className="h-4 w-4" />
            Export
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={exportToCSV}>Export CSV</DropdownMenuItem>
          <DropdownMenuItem onClick={exportToPDF}>Export PDF</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {hasActiveFilters && (
        <button onClick={resetFilters} className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1 text-muted-foreground">
          <X className="h-3 w-3" />
          Clear
        </button>
      )}
    </div>
  );
}
