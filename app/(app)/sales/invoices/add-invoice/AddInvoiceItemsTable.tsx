'use client';

import { UseFormReturn, FieldArrayWithId } from 'react-hook-form';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Search } from 'lucide-react';
import { formatQuantity } from '@/lib/utils';
import type { SalesInvoiceFormValues } from './add-invoice-types';

type Props = {
  form: UseFormReturn<SalesInvoiceFormValues>;
  fields: FieldArrayWithId<SalesInvoiceFormValues, 'items'>[];
  remove: (index: number) => void;
};

/** Column widths (px) in table order; the leading `0` (Product) flexes to fill. */
const COLUMN_WIDTHS = [0, 110, 140, 150, 56];

export function AddInvoiceItemsTable({ form, fields, remove }: Props) {
  return (
    <div className="flex-1 min-h-0 rounded-lg border bg-background shadow-sm overflow-hidden flex flex-col relative">
      <div className="overflow-auto flex-1 h-full relative">
        <table className="w-full min-w-[640px] table-fixed caption-bottom text-sm text-left border-separate border-spacing-0">
          <colgroup>
            {COLUMN_WIDTHS.map((w, i) => (
              <col key={i} style={w ? { width: w } : undefined} />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 bg-background z-50 shadow-sm">
            <TableRow className="hover:bg-transparent [&>th]:border-b">
              <TableHead className="pl-4 pr-2 h-10">Product</TableHead>
              <TableHead className="px-2 text-center h-10">Qty</TableHead>
              <TableHead className="px-2 text-right h-10">Price</TableHead>
              <TableHead className="px-2 text-right pr-4 h-10">Total</TableHead>
              <TableHead className="h-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-[40vh] min-h-[200px] text-center text-muted-foreground border-none">
                  <div className="flex flex-col items-center justify-center">
                    <div className="bg-muted p-4 rounded-full mb-4"><Search className="h-8 w-8 opacity-20" /></div>
                    <p className="font-medium">No items added</p>
                    <p className="text-xs text-muted-foreground">Scan barcode or search above to add products.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              fields.map((field, index) => (
                <TableRow key={field.id} className="group hover:bg-muted/50 [&>td]:border-b">
                  <TableCell className="font-medium pl-4 pr-2 py-1">
                    <div className="truncate font-bold text-sm leading-tight" title={field.product.name}>{field.product.name}</div>
                    <div className="flex gap-2 text-[11px] leading-tight text-muted-foreground">
                      <span className="truncate">{field.product.sku || 'No SKU'}</span>
                      {field.product.stock !== undefined && (
                        <span className={field.product.stock <= 0 ? 'text-destructive' : 'text-emerald-600'}>
                          Stock: {formatQuantity(field.product.stock)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <div className="flex justify-center">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <Input type="number" className="h-8 w-full max-w-[5rem] text-center bg-background" {...field} onFocus={e => e.target.select()} />
                        )}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="px-2 py-1 text-right">
                    <FormField
                      control={form.control}
                      name={`items.${index}.price`}
                      render={({ field }) => (
                        <Input type="number" step="0.01" className="h-8 w-full text-right ml-auto border-transparent hover:border-input focus:border-input bg-background" {...field} />
                      )}
                    />
                  </TableCell>
                  <TableCell className="text-right px-2 py-1 pr-4 font-mono">
                    ₱{(Number(form.watch(`items.${index}.price`) || 0) * Number(form.watch(`items.${index}.quantity`) || 0)).toFixed(2)}
                  </TableCell>
                  <TableCell className="px-2 py-1">
                    <button
                      type="button"
                      aria-label="Remove item"
                      className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
