'use client';

import { SalesPerson } from '@/lib/types';
import { TableCell, TableRow } from '@/components/ui/table';
import { Pencil, Trash2 } from 'lucide-react';
import { SalesPersonFormDialog } from './SalesPersonFormDialog';

type Props = {
  salesPerson: SalesPerson;
  onUpdate: (name: string, contactNumber?: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function SalesPersonRow({ salesPerson, onUpdate, onDelete }: Props) {
  return (
    <TableRow>
      <TableCell className="font-medium">{salesPerson.name}</TableCell>
      <TableCell>{salesPerson.contactNumber || 'N/A'}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <SalesPersonFormDialog salesPerson={salesPerson} onSave={onUpdate}>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8">
              <Pencil className="h-4 w-4" />
            </button>
          </SalesPersonFormDialog>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 p-0 h-8 w-8" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}
