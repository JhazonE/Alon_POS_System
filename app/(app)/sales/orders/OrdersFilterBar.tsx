'use client';

import { Table as ReactTable } from '@tanstack/react-table';
import { Search, Filter, X, Columns } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AddSalesOrderDialog } from './add-order/add-sales-order-dialog';
import type { Sale, SalesPerson, Customer } from '@/lib/types';
import type { OrderFilters, OrderFilterDialogOpen } from './use-orders-filters';

type Props = {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  filters: OrderFilters;
  activeFilterCount: number;
  setDialogOpen: React.Dispatch<React.SetStateAction<OrderFilterDialogOpen>>;
  handleFilterChange: (key: keyof OrderFilters, value: string) => void;
  clearFilters: () => void;
  table: ReactTable<Sale>;
  salesPersons: SalesPerson[];
  customers: Customer[];
};

export function OrdersFilterBar({
  searchTerm, onSearchChange, filters, activeFilterCount,
  setDialogOpen, handleFilterChange, clearFilters, table,
  salesPersons, customers,
}: Props) {
  return (
    <>
      {/* Toolbar */}
      <div className="flex gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search orders..."
            className="pl-8 w-[200px]"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] gap-2 relative">
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex justify-center items-center rounded-full text-[10px]">
                  {activeFilterCount}
                </Badge>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            <DropdownMenuLabel>Filter By</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDialogOpen(p => ({ ...p, status: true }))}>Status {filters.status && '✓'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogOpen(p => ({ ...p, date: true }))}>Date Range {filters.startDate && '✓'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogOpen(p => ({ ...p, salesPerson: true }))}>Sales Person {filters.salesPersonId && '✓'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogOpen(p => ({ ...p, salesArea: true }))}>Sales Area {filters.salesArea && '✓'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogOpen(p => ({ ...p, customer: true }))}>Customer {filters.customerId && '✓'}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogOpen(p => ({ ...p, reference: true }))}>Reference # {filters.reference && '✓'}</DropdownMenuItem>
            {activeFilterCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={clearFilters}>
                  <X className="mr-2 h-4 w-4" /> Clear All Filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-2">
              <Columns className="h-4 w-4" />
              Columns
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table.getAllColumns().filter(col => col.getCanHide()).map(col => (
              <DropdownMenuCheckboxItem
                key={col.id}
                className="capitalize"
                checked={col.getIsVisible()}
                onCheckedChange={val => col.toggleVisibility(!!val)}
              >
                {col.id}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <AddSalesOrderDialog />
      </div>

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && (
        <div className="px-6 pb-2 flex flex-wrap gap-2 non-printable">
          {filters.status && <Badge variant="outline" className="gap-1">Status: {filters.status} <X className="h-3 w-3 cursor-pointer" onClick={() => handleFilterChange('status', '')} /></Badge>}
          {filters.startDate && <Badge variant="outline" className="gap-1">From: {filters.startDate} <X className="h-3 w-3 cursor-pointer" onClick={() => handleFilterChange('startDate', '')} /></Badge>}
          {filters.endDate && <Badge variant="outline" className="gap-1">To: {filters.endDate} <X className="h-3 w-3 cursor-pointer" onClick={() => handleFilterChange('endDate', '')} /></Badge>}
          {filters.salesPersonId && <Badge variant="outline" className="gap-1">Person: {salesPersons.find(s => s.id.toString() === filters.salesPersonId)?.name || filters.salesPersonId} <X className="h-3 w-3 cursor-pointer" onClick={() => handleFilterChange('salesPersonId', '')} /></Badge>}
          {filters.salesArea && <Badge variant="outline" className="gap-1">Area: {filters.salesArea} <X className="h-3 w-3 cursor-pointer" onClick={() => handleFilterChange('salesArea', '')} /></Badge>}
          {filters.customerId && <Badge variant="outline" className="gap-1">Customer: {customers.find(c => c.id === filters.customerId)?.name || 'Selected'} <X className="h-3 w-3 cursor-pointer" onClick={() => handleFilterChange('customerId', '')} /></Badge>}
          {filters.reference && <Badge variant="outline" className="gap-1">Ref: {filters.reference} <X className="h-3 w-3 cursor-pointer" onClick={() => handleFilterChange('reference', '')} /></Badge>}
          <button className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-6 text-xs text-muted-foreground" onClick={clearFilters}>Clear all</button>
        </div>
      )}
    </>
  );
}
