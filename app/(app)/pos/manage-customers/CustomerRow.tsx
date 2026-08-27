'use client';

import { TableCell, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Customer } from '@/lib/types';
import { CustomerDialog } from './CustomerDialog';

interface CustomerRowProps {
  customer: Customer;
  onCustomersUpdated: () => void;
}

export function CustomerRow({ customer, onCustomersUpdated }: CustomerRowProps) {
  const { toast } = useToast();

  const handleUpdate = async (name: string, contactNumber: string, paymentTerms: string) => {
    console.log('Mock update:', { id: customer.id, name, contactNumber, paymentTerms });
    onCustomersUpdated();
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete the customer "${customer.name}"?`)) {
      console.log('Mock delete:', customer.id);
      onCustomersUpdated();
      toast({ title: 'Customer Deleted (Mock)', description: `Customer "${customer.name}" has been deleted.` });
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{customer.name}</TableCell>
      <TableCell>{customer.contactNumber}</TableCell>
      <TableCell>{customer.paymentTerms}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <CustomerDialog customer={customer} onSave={handleUpdate}>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"><Pencil className="mr-2 h-4 w-4" /> Edit</button>
          </CustomerDialog>
          <button onClick={handleDelete} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}
