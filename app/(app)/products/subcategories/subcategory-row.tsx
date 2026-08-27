'use client';

import { Pencil, Trash2 } from 'lucide-react';

import { TableCell, TableRow } from '@/components/ui/table';
import type { Category } from '@/lib/types';

import { SubcategoryDialog } from './subcategory-dialog';

export function SubcategoryRow({
  subcategory,
  onUpdate,
  onDelete,
}: {
  subcategory: Category;
  onUpdate: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const hasProducts = subcategory.productCount !== undefined && subcategory.productCount > 0;

  return (
    <TableRow>
      <TableCell className="font-medium">{subcategory.name}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <SubcategoryDialog subcategory={subcategory} onSave={(name) => onUpdate(subcategory.id, name)}>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 hover:bg-muted">
              <Pencil className="h-4 w-4 text-muted-foreground transition-colors hover:text-primary" />
              <span className="sr-only">Edit</span>
            </button>
          </SubcategoryDialog>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 hover:bg-muted"
            onClick={() => onDelete(subcategory.id)}
            disabled={hasProducts}
            title={hasProducts ? "Cannot delete subcategory with products assigned" : "Delete subcategory"}
          >
            <Trash2 className={`h-4 w-4 ${hasProducts ? 'text-muted-foreground/50' : 'text-muted-foreground transition-colors hover:text-destructive'}`} />
            <span className="sr-only">Delete</span>
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}
