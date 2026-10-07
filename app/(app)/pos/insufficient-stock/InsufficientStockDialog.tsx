'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatQuantity } from '@/lib/utils';
import type { InsufficientStockDialogProps } from './insufficient-stock-types';

export function InsufficientStockDialog({ open, onOpenChange, items }: InsufficientStockDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Insufficient Stock</AlertDialogTitle>
          <AlertDialogDescription>
            The following items have insufficient stock and cannot be tendered.
            Please adjust the quantities or remove them from the cart.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[300px] overflow-y-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead className="text-right">Requested Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.lineId}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right text-destructive font-bold">{formatQuantity(item.stock)}</TableCell>
                  <TableCell className="text-right">{formatQuantity(item.quantity)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <AlertDialogFooter>
          <AlertDialogAction onClick={() => onOpenChange(false)}>Close</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
