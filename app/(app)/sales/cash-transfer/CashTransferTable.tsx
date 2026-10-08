import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { flexRender, type Table as TanTable } from '@tanstack/react-table';
import type { CashTransfer } from './cash-transfer-types';
import { Spinner } from '@/components/ui/spinner';

type Props = {
  table: TanTable<CashTransfer>;
  isLoading: boolean;
};

export function CashTransferTable({ table, isLoading }: Props) {
  return (
    <Table wrapperClassName="max-h-[500px] overflow-auto border rounded-md">
      <TableHeader className="sticky top-0 z-30 bg-background">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id} className="bg-background">
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={table.getVisibleLeafColumns().length} className="text-center h-24">
              <div className="flex justify-center items-center gap-2">
                <Spinner className="h-6 w-6" />
                <span>Loading data...</span>
              </div>
            </TableCell>
          </TableRow>
        ) : table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={table.getVisibleLeafColumns().length}
              className="text-center h-24 text-muted-foreground"
            >
              No records found for the selected criteria.
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
