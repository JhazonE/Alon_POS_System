'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Calendar as CalendarIcon, ShoppingCart } from 'lucide-react';
import { Supplier } from '@/lib/types';
import { getSuppliers } from '../products/actions';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { Spinner } from '@/components/ui/spinner';

export function ScheduledOrdersDialog({
  onCreateOrder
}: {
  onCreateOrder: (supplierId: string) => void
}) {
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      getSuppliers().then(data => {
        // Filter only suppliers with a schedule
        const scheduled = data.filter((s: Supplier) => s.orderSchedule && s.orderSchedule.trim() !== '');
        setSuppliers(scheduled);
        setLoading(false);
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
           <CalendarIcon className="mr-2 h-4 w-4" />
           Scheduled Orders
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Supplier Schedules</DialogTitle>
          <DialogDescription>
            View suppliers with defined order schedules.
          </DialogDescription>
        </DialogHeader>
        
        <div className="rounded-md border mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                 <TableRow>
                   <TableCell colSpan={4} className="text-center py-8">
                      <Spinner className="h-6 w-6 mx-auto text-muted-foreground" />
                   </TableCell>
                 </TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No order schedules found. Set schedules in the "Manage Suppliers" dialog.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map(supplier => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.name}</TableCell>
                    <TableCell>
                         <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-semibold">
                                {supplier.orderSchedule}
                            </span>
                         </div>
                    </TableCell>
                     <TableCell className="text-muted-foreground text-sm">
                        {supplier.contactNumber || supplier.mobilePhone || supplier.email || '-'}
                     </TableCell>
                    <TableCell className="text-right">
                      <button onClick={() => {
                        onCreateOrder(supplier.id);
                        setOpen(false);
                      }} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
                        <ShoppingCart className="mr-2 h-3.5 w-3.5" />
                        Order Now
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
