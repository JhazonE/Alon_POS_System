'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { Search, MoreHorizontal, Eye, CreditCard, X, ReceiptText, CreditCard as BulkPayIcon } from 'lucide-react';
import { format } from 'date-fns';
import { SupplierWithBalance, SupplierFilters, AgingBucket } from '../actions';
import { BalanceFilterDialog } from './balance-filter/BalanceFilterDialog';

const AGING_STYLES: Record<AgingBucket, string> = {
  'current': 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30',
  '1-30':    'border-yellow-300  text-yellow-700  bg-yellow-50  dark:bg-yellow-950/30',
  '31-60':   'border-orange-300  text-orange-700  bg-orange-50  dark:bg-orange-950/30',
  '61-90':   'border-red-300     text-red-700     bg-red-50     dark:bg-red-950/30',
  '90+':     'border-red-500     text-red-900     bg-red-100    dark:bg-red-950/50',
};

function dueDateLabel(daysOverdue: number): string {
  if (daysOverdue < 0) return `Due in ${Math.abs(daysOverdue)}d`;
  if (daysOverdue === 0) return 'Due today';
  return `${daysOverdue}d overdue`;
}

function dueDateColor(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'text-emerald-600';
  if (daysOverdue <= 30) return 'text-yellow-600';
  if (daysOverdue <= 60) return 'text-orange-600';
  return 'text-red-600 font-bold';
}

type Props = {
  suppliers: SupplierWithBalance[];
  paginatedSuppliers: SupplierWithBalance[];
  loading: boolean;
  searchTerm: string;
  filters: SupplierFilters;
  currentPage: number;
  pageSize: number;
  onSearchChange: (v: string) => void;
  onFilterChange: (f: SupplierFilters) => void;
  onResetFilters: () => void;
  setCurrentPage: (p: number) => void;
  setPageSize: (s: number) => void;
  onViewTransactions: (supplier: SupplierWithBalance) => void;
  onMakePayment: (supplier: SupplierWithBalance) => void;
  onRecordReturn: (supplier: SupplierWithBalance) => void;
  // Bulk selection
  selectedIds: Set<string>;
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleSelect: (id: string) => void;
  onSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
  onBulkPayment: () => void;
};

export function SupplierBalanceTable({
  suppliers, paginatedSuppliers, loading,
  searchTerm, filters,
  currentPage, pageSize,
  onSearchChange, onFilterChange, onResetFilters,
  setCurrentPage, setPageSize,
  onViewTransactions, onMakePayment, onRecordReturn,
  selectedIds, allPageSelected, somePageSelected,
  onToggleSelect, onSelectAll, onClearSelection, onBulkPayment,
}: Props) {
  const selectedCount = selectedIds.size;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>Balances</CardTitle>
            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {selectedCount} selected
                </Badge>
                <button
                  className="inline-flex items-center justify-center rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[13px] rounded-lg h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                  onClick={onBulkPayment}
                >
                  <BulkPayIcon className="h-3 w-3" />
                  Pay Selected ({selectedCount})
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-7 text-xs text-muted-foreground"
                  onClick={onClearSelection}
                >
                  <X className="h-3 w-3 mr-1" />Clear
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search suppliers..."
                className="pl-8"
                value={searchTerm}
                onChange={e => onSearchChange(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <BalanceFilterDialog filters={filters} onFilterChange={onFilterChange} onReset={onResetFilters} />
              {Object.keys(filters).length > 0 && (
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring text-xs rounded-lg gap-1.5 h-9 px-2 text-muted-foreground" onClick={onResetFilters}>
                  Clear <X className="ml-1 h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table wrapperClassName="max-h-[calc(100vh-350px)] overflow-auto relative">
          <TableHeader className="sticky top-0 z-30 bg-background shadow-sm">
            <TableRow className="hover:bg-transparent bg-muted/50">
              <TableHead className="w-10">
                <Checkbox
                  checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
                  onCheckedChange={checked => onSelectAll(!!checked)}
                  aria-label="Select all on this page"
                />
              </TableHead>
              <TableHead className="font-semibold text-foreground">Supplier</TableHead>
              <TableHead className="font-semibold text-foreground">Due Date</TableHead>
              <TableHead className="font-semibold text-foreground">Total Purchases</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Current Balance</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">Loading...</TableCell>
              </TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No suppliers found.</TableCell>
              </TableRow>
            ) : paginatedSuppliers.map(supplier => {
              const isSelected = selectedIds.has(supplier.id);
              const canSelect = supplier.balance > 0;
              return (
                <TableRow
                  key={supplier.id}
                  className={`group hover:bg-muted/50 ${isSelected ? 'bg-blue-50/50 dark:bg-blue-950/10' : ''}`}
                >
                  <TableCell>
                    {canSelect ? (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleSelect(supplier.id)}
                        aria-label={`Select ${supplier.name}`}
                      />
                    ) : (
                      <Checkbox disabled checked={false} aria-label="No balance" />
                    )}
                  </TableCell>

                  <TableCell className="font-medium">{supplier.name}</TableCell>

                  <TableCell>
                    {supplier.earliestDueDate ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs">{format(new Date(supplier.earliestDueDate + 'T00:00:00'), 'MMM dd, yyyy')}</span>
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] ${dueDateColor(supplier.daysOverdue ?? 0)}`}>
                            {dueDateLabel(supplier.daysOverdue ?? 0)}
                          </span>
                          {supplier.agingBucket && supplier.agingBucket !== 'current' && (
                            <Badge variant="outline" className={`h-4 text-[9px] px-1 ${AGING_STYLES[supplier.agingBucket]}`}>
                              {supplier.agingBucket}d
                            </Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>₱{supplier.totalPurchases.toLocaleString()}</TableCell>

                  <TableCell className={`text-right font-bold ${supplier.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    ₱{supplier.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>

                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[200px]">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onViewTransactions(supplier)}>
                          <Eye className="mr-2 h-4 w-4" />View Transactions
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onMakePayment(supplier)}>
                          <CreditCard className="mr-2 h-4 w-4" />Make Payment
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onRecordReturn(supplier)}
                          className="text-purple-700 dark:text-purple-400"
                        >
                          <ReceiptText className="mr-2 h-4 w-4" />Record Return / Credit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {suppliers.length > 0 && (
          <div className="py-2 border-t px-4">
            <DataTablePagination
              currentPage={currentPage}
              totalPages={Math.ceil(suppliers.length / pageSize)}
              pageSize={pageSize}
              totalItems={suppliers.length}
              setPage={setCurrentPage}
              setPageSize={setPageSize}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
