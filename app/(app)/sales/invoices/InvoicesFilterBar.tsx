'use client';

import { Table } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, SlidersHorizontal, Columns } from 'lucide-react';
import { AddSalesInvoiceDialog } from './add-invoice/add-sales-invoice-dialog';

type Props = {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  statusFilter: string;
  dateRangeFilter: any;
  salesPersonFilter: string;
  customerFilter: string;
  transactionSourceFilter: string;
  referenceTypeFilter: string;
  referenceNumberFilter: string;
  receiptNumberFilter: string;
  hasActiveFilters: boolean;
  resetFilters: () => void;
  onOpenStatus: () => void;
  onOpenDateRange: () => void;
  onOpenSalesPerson: () => void;
  onOpenCustomer: () => void;
  onOpenTransactionSource: () => void;
  onOpenReferenceType: () => void;
  onOpenReferenceNumber: () => void;
  onOpenReceiptNumber: () => void;
  onAddSuccess: () => void;
  table: Table<any>;
};

export function InvoicesFilterBar({
  searchQuery, setSearchQuery,
  statusFilter, dateRangeFilter, salesPersonFilter, customerFilter,
  transactionSourceFilter, referenceTypeFilter, referenceNumberFilter, receiptNumberFilter,
  hasActiveFilters, resetFilters,
  onOpenStatus, onOpenDateRange, onOpenSalesPerson, onOpenCustomer,
  onOpenTransactionSource, onOpenReferenceType, onOpenReferenceNumber, onOpenReceiptNumber,
  onAddSuccess, table,
}: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative w-64">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search invoices..." className="pl-8" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <Columns className="h-4 w-4 mr-2" />
            Columns
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
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
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && <Badge variant="secondary" className="ml-2 h-5 px-1.5">!</Badge>}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onOpenStatus}>
            Status {statusFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{statusFilter}</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenDateRange}>
            Date Range {dateRangeFilter && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenSalesPerson}>
            Sales Person {salesPersonFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenCustomer}>
            Customer {customerFilter && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenTransactionSource}>
            Transaction From {transactionSourceFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">{transactionSourceFilter}</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenReferenceType}>
            Reference Type {referenceTypeFilter !== 'all' && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenReferenceNumber}>
            Reference # {referenceNumberFilter && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenReceiptNumber}>
            Receipt # {receiptNumberFilter && <Badge variant="secondary" className="ml-auto text-xs">Set</Badge>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={resetFilters} className="text-destructive">
            Clear All Filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddSalesInvoiceDialog onSuccess={onAddSuccess} />
    </div>
  );
}
