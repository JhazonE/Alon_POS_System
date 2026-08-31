'use client';

import { Table } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SlidersHorizontal, Columns, Download, FileText, FileSpreadsheet, Search, X } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import type { Sale } from './sales-types';

interface Props {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  table: Table<Sale>;
  // active filter values (for badge display)
  paymentTypeFilter: string;
  terminalId: string;
  dateRange: DateRange | undefined;
  salesStatusFilter: string;
  customerFilter: string;
  cashierFilter: string;
  referenceNumberFilter: string;
  // dialog openers
  onOpenPaymentType: () => void;
  onOpenTerminal: () => void;
  onOpenDateRange: () => void;
  onOpenSalesStatus: () => void;
  onOpenCustomer: () => void;
  onOpenCashier: () => void;
  onOpenReferenceNumber: () => void;
  onClearFilterValues: () => void;
  // export
  onExportCSV: () => void;
  onExportPDF: () => void;
  // clear all
  hasActiveFilters: boolean;
  onResetFilters: () => void;
}

export function SalesFilterToolbar({
  searchTerm, onSearchChange, table,
  paymentTypeFilter, terminalId, dateRange, salesStatusFilter,
  customerFilter, cashierFilter, referenceNumberFilter,
  onOpenPaymentType, onOpenTerminal, onOpenDateRange, onOpenSalesStatus,
  onOpenCustomer, onOpenCashier, onOpenReferenceNumber,
  onClearFilterValues, onExportCSV, onExportPDF, hasActiveFilters, onResetFilters,
}: Props) {
  const activeFilterCount = [
    paymentTypeFilter !== 'all', terminalId !== 'all', !!dateRange,
    salesStatusFilter !== 'all', !!customerFilter, (cashierFilter && cashierFilter !== 'all'),
    !!referenceNumberFilter,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input type="search" placeholder="Search by ID or customer..." className="pl-8 w-full" value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && <Badge variant="secondary" className="ml-2 h-5 px-1.5">{activeFilterCount}</Badge>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onOpenPaymentType}>Payment Type{paymentTypeFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{paymentTypeFilter}</Badge>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenTerminal}>Terminal{terminalId !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenDateRange}>Date Range{dateRange && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenSalesStatus}>Sales Status{salesStatusFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{salesStatusFilter}</Badge>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenCustomer}>Customer{customerFilter && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenCashier}>Cashier{cashierFilter && cashierFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenReferenceNumber}>Reference Number{referenceNumberFilter && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClearFilterValues} className="text-destructive">Clear All Filters</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              <Columns className="h-4 w-4 mr-2" />
              Columns
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllColumns().filter(col => col.getCanHide()).map(col => (
              <DropdownMenuCheckboxItem key={col.id} className="capitalize" checked={col.getIsVisible()} onCheckedChange={val => col.toggleVisibility(!!val)}>
                {col.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onExportCSV}><FileSpreadsheet className="h-4 w-4 mr-2" />Export as CSV</DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportPDF}><FileText className="h-4 w-4 mr-2" />Export as PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasActiveFilters && (
          <button onClick={onResetFilters} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <X className="h-4 w-4 mr-1" />Clear
          </button>
        )}
      </div>
    </div>
  );
}
