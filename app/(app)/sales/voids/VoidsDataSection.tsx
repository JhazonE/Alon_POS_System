'use client';

import { Table as ReactTable, ColumnDef, flexRender } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, LayoutGrid, Table as TableIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatCurrency, type VoidRecord } from './voids-types';
import { Spinner } from '@/components/ui/spinner';

const VIEW_TOGGLE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-8 px-[13px] text-xs rounded-lg gap-1.5 h-8 px-3';
const VIEW_TOGGLE_ACTIVE =
  'bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55';
const VIEW_TOGGLE_INACTIVE = 'hover:bg-accent focus-visible:ring-ring';

interface Props {
  table: ReactTable<VoidRecord>;
  columns: ColumnDef<VoidRecord>[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  viewMode: 'table' | 'card';
  setViewMode: (mode: 'table' | 'card') => void;
  globalFilter: string;
  setGlobalFilter: (val: string) => void;
  selectedRow: number | null;
  setSelectedRow: (idx: number) => void;
  selectedIds: Set<string>;
}

export function VoidsDataSection({ table, columns, isLoading, isError, error, viewMode, setViewMode, globalFilter, setGlobalFilter, selectedRow, setSelectedRow, selectedIds }: Props) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const filteredCount = table.getFilteredRowModel().rows.length;

  const emptyMessage = isLoading ? null : isError
    ? `Failed to load: ${error instanceof Error ? error.message : 'Unknown error'}`
    : 'No voided sales found for the selected date range.';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Transaction Details</CardTitle>
            <CardDescription>Detailed list of all voided sales transactions</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="pl-9 w-[250px]"
              />
            </div>

            {viewMode === 'table' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
                    <Eye className="h-4 w-4 mr-2" />
                    Columns
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table.getAllColumns().filter((col) => col.getCanHide()).map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      className="capitalize"
                      checked={col.getIsVisible()}
                      onCheckedChange={(value) => col.toggleVisibility(!!value)}
                    >
                      {col.id.replace(/([A-Z])/g, ' $1').trim()}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button onClick={() => setViewMode('table')} className={cn(VIEW_TOGGLE_CLASSES, viewMode === 'table' ? VIEW_TOGGLE_ACTIVE : VIEW_TOGGLE_INACTIVE)}>
                <TableIcon className="h-4 w-4 mr-1" />
                Table
              </button>
              <button onClick={() => setViewMode('card')} className={cn(VIEW_TOGGLE_CLASSES, viewMode === 'card' ? VIEW_TOGGLE_ACTIVE : VIEW_TOGGLE_INACTIVE)}>
                <LayoutGrid className="h-4 w-4 mr-1" />
                Cards
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className={viewMode === 'table' ? 'p-0 pb-0' : 'pt-0'}>
        {viewMode === 'card' ? (
          table.getRowModel().rows.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 p-4">
              {table.getRowModel().rows.map((row, index) => {
                const record = row.original;
                return (
                  <Card
                    key={row.id}
                    className={cn('cursor-pointer transition-all hover:shadow-md', selectedRow === index && 'ring-2 ring-primary')}
                    onClick={() => setSelectedRow(index)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base text-primary">{record.refNo}</CardTitle>
                          <CardDescription className="text-xs">{record.siNo}</CardDescription>
                        </div>
                        <Badge variant="destructive">Voided</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">Customer</span>
                          <p className="font-medium truncate" title={record.customer}>{record.customer}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Cashier</span>
                          <p className="font-medium">{record.cashier || '-'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">Trans Date</span>
                          <p>{record.transDate ? format(new Date(record.transDate), 'MMM dd, yyyy') : '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Void Date</span>
                          <p>{record.voidDate ? format(new Date(record.voidDate), 'MMM dd, yyyy') : '-'}</p>
                        </div>
                      </div>
                      <div className="pt-2 border-t space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-mono font-semibold">{formatCurrency(record.salesAmount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Cost</span>
                          <span className="font-mono text-muted-foreground">{formatCurrency(record.cost)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Profit</span>
                          <span className={cn('font-mono font-semibold', record.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                            {formatCurrency(record.profit)}
                          </span>
                        </div>
                      </div>
                      {record.note && (
                        <div className="pt-2 border-t">
                          <span className="text-muted-foreground text-xs">Note</span>
                          <p className="text-sm text-muted-foreground">{record.note}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-muted-foreground p-4">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  Loading...
                </div>
              ) : (
                <span className={isError ? 'text-destructive' : ''}>{emptyMessage}</span>
              )}
            </div>
          )
        ) : (
          <div className="relative overflow-auto max-h-[600px] border-b">
            <Table className="w-full text-sm">
              <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="bg-muted/50 border-b hover:bg-muted/50">
                    {hg.headers.map((header) => (
                      <TableHead key={header.id} className="py-2 px-2 whitespace-nowrap">
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row, index) => (
                    <TableRow
                      key={row.id}
                      className={cn('cursor-pointer hover:bg-muted/50 transition-colors text-xs', (selectedRow === index || selectedIds.has(row.original.refNo)) && 'bg-muted')}
                      onClick={() => setSelectedRow(index)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="py-2 px-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center">
                      {isLoading ? (
                        <div className="flex items-center justify-center gap-2">
                          <Spinner className="h-4 w-4" />
                          Loading...
                        </div>
                      ) : (
                        <span className={isError ? 'text-destructive' : 'text-muted-foreground'}>{emptyMessage}</span>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {filteredCount > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <span className="text-sm text-muted-foreground">
              Showing {pageIndex * pageSize + 1} to {Math.min((pageIndex + 1) * pageSize, filteredCount)} of {filteredCount} entries
            </span>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows per page:</span>
                <Select value={pageSize.toString()} onValueChange={(value) => table.setPageSize(Number(value))}>
                  <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 10, 20, 50, 100].map((n) => (
                      <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium px-2">Page {pageIndex + 1} of {table.getPageCount()}</span>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
