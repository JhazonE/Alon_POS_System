'use client';

import { Pencil, Trash2 } from 'lucide-react';

import { TableCell, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type { Supplier } from '@/lib/types';

export function SupplierRow({
  supplier,
  onEdit,
  onDeleteSupplier,
}: {
  supplier: Supplier;
  onEdit: (supplier: Supplier) => void;
  onDeleteSupplier: () => void;
}) {
  const { toast } = useToast();

  const handleDelete = () => {
    onDeleteSupplier();
    toast({
      title: 'Supplier Deleted',
      description: `Supplier "${supplier.name}" has been deleted.`,
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{supplier.name}</TableCell>
      <TableCell>{supplier.company || '-'}</TableCell>
      <TableCell>{supplier.tin || '-'}</TableCell>
      <TableCell>{supplier.address || '-'}</TableCell>
      <TableCell>{supplier.contactNumber || supplier.mobilePhone}</TableCell>
      <TableCell>{supplier.paymentTerms || '-'}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <button onClick={() => onEdit(supplier)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </button>
          <button onClick={handleDelete} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}
