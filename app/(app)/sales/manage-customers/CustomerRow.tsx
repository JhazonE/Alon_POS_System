'use client';

import { TableCell, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Customer } from '@/lib/types';
import { cn } from "@/lib/utils";

interface CustomerRowProps {
  customer: Customer;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => Promise<void>;
  onToggleActive: (customer: Customer) => Promise<void>;
}

export function CustomerRow({ customer, onEdit, onDelete, onToggleActive }: CustomerRowProps) {
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete the customer "${customer.name}"?`)) return;
    try {
      await onDelete(customer);
      toast({ title: 'Customer Deleted', description: `Customer "${customer.name}" has been deleted.` });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete customer. Please try again.' });
    }
  };

  const handleToggleActive = async () => {
    try {
      await onToggleActive(customer);
      toast({ title: 'Customer Updated', description: `Customer "${customer.name}" has been ${customer.active ? 'deactivated' : 'activated'}.` });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update customer. Please try again.' });
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{customer.name}</TableCell>
      <TableCell>{customer.contactNumber}</TableCell>
      <TableCell>{customer.paymentTerms}</TableCell>
      <TableCell>
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
          customer.active
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
        }`}>
          {customer.active ? 'Active' : 'Inactive'}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <button onClick={() => onEdit(customer)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </button>
          <button
            onClick={handleToggleActive}
            className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5", customer.active ? 'text-orange-600' : 'text-green-600')}
          >
            {customer.active ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {customer.active ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={handleDelete} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CustomerSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </TableCell>
    </TableRow>
  );
}
