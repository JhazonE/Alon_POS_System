'use client';

import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { printBadOrder } from '@/lib/print-bad-order';

function statusVariant(status: string) {
  switch (status) {
    case 'Resolved':
    case 'Replaced':
    case 'Credited':
      return 'secondary';
    case 'Return Requested':
      return 'default';
    default:
      return 'outline';
  }
}

interface BadOrderRowProps {
  order: any;
  onView: (order: any) => void;
}

export function BadOrderRow({ order, onView }: BadOrderRowProps) {
  return (
    <TableRow className="text-xs group hover:bg-muted/50">
      <TableCell className="font-medium">
        {order.id.substring(0, 8).toUpperCase()}
      </TableCell>
      <TableCell>{order.supplierName || '-'}</TableCell>
      <TableCell>{format(new Date(order.reportDate), 'MMM dd, yyyy')}</TableCell>
      <TableCell className="text-right font-medium">
        ₱{order.totalAffectedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </TableCell>
      <TableCell className="text-center">
        <Badge
          variant={statusVariant(order.status) as any}
          className="rounded-sm font-normal text-[10px] h-5"
        >
          {order.status}
        </Badge>
      </TableCell>
      <TableCell>{order.reportedBy || '-'}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(order)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => printBadOrder(order)}>
              <Printer className="mr-2 h-4 w-4" />
              Print Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
