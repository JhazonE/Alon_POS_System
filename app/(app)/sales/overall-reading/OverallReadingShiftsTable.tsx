'use client';

import { useMemo, useState } from 'react';
import { ColumnDef, SortingState, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Shift } from './use-overall-reading-page';

interface Props {
  shifts: Shift[];
  isLoading: boolean;
  selectedShift: Shift | null;
  setSelectedShift: (shift: Shift) => void;
}

export function OverallReadingShiftsTable({ shifts, isLoading, selectedShift, setSelectedShift }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<Shift>[]>(() => [
    {
      accessorKey: 'cashier_name',
      header: ({ column }) => (
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Cashier
          {column.getIsSorted() === 'asc' ? <ArrowUp className="ml-2 h-3 w-3" /> : column.getIsSorted() === 'desc' ? <ArrowDown className="ml-2 h-3 w-3" /> : <ArrowUpDown className="ml-2 h-3 w-3" />}
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground text-sm">{row.getValue('cashier_name') || 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">{row.original.terminal_id}</span>
          <span className="text-[10px] text-muted-foreground/70">{format(new Date(row.original.end_time), 'PPp')}</span>
        </div>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => <div className="text-right text-xs">Action</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 h-8 text-primary hover:text-primary hover:bg-primary/10"
            onClick={(e) => { e.stopPropagation(); setSelectedShift(row.original); }}
          >
            <span className="text-xs">View</span>
          </button>
        </div>
      ),
    },
  ], [setSelectedShift]);

  const table = useReactTable({
    data: shifts,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Card className="shadow-sm border-border h-full">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-lg font-semibold text-foreground">Completed Shifts</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">Select a shift to view reading</p>
      </CardHeader>
      <CardContent className="p-0 max-h-[600px] overflow-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id}>
                {hg.headers.map(header => (
                  <TableHead key={header.id} className="text-xs">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-8 text-muted-foreground text-sm">Loading shifts...</TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  className={cn(
                    'cursor-pointer hover:bg-muted/50 transition-colors',
                    selectedShift?.id === row.original.id && 'bg-primary/10 hover:bg-primary/10'
                  )}
                  onClick={() => setSelectedShift(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-8 text-muted-foreground text-sm">No shifts found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
