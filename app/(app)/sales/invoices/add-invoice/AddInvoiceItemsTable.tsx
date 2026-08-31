'use client';

import { UseFormReturn, FieldArrayWithId } from 'react-hook-form';
import { FormControl, FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Search } from 'lucide-react';
import { formatQuantity } from '@/lib/utils';
import type { Product } from '@/lib/types';
import type { SalesInvoiceFormValues } from './add-invoice-types';
import { AddInvoiceProductSelector } from './AddInvoiceProductSelector';

type Props = {
  form: UseFormReturn<SalesInvoiceFormValues>;
  fields: FieldArrayWithId<SalesInvoiceFormValues, 'items'>[];
  remove: (index: number) => void;
  total: number;
  handleAddProduct: (product: Product) => void;
};

export function AddInvoiceItemsTable({ form, fields, remove, total, handleAddProduct }: Props) {
  const warehouseId = form.watch('warehouse');
  const shipping = Number(form.watch('shipping') || 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/5 p-4 relative">
      <div className="max-w-2xl mb-4 z-10">
        <AddInvoiceProductSelector onSelectProduct={handleAddProduct} warehouseId={warehouseId} />
      </div>

      <div className="flex-1 rounded-lg border bg-background shadow-sm overflow-hidden flex flex-col relative">
        <div className="overflow-y-auto flex-1 h-full relative">
          <table className="w-full caption-bottom text-sm text-left border-collapse">
            <TableHeader className="sticky top-0 bg-background z-50 shadow-sm">
              <TableRow className="hover:bg-transparent border-b">
                <TableHead className="w-[40%] pl-4 h-10">Product</TableHead>
                <TableHead className="w-[15%] text-center h-10">Qty</TableHead>
                <TableHead className="w-[20%] text-right h-10">Price</TableHead>
                <TableHead className="w-[20%] text-right pr-4 h-10">Total</TableHead>
                <TableHead className="w-[5%] h-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-[300px] text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="bg-muted p-4 rounded-full"><Search className="h-8 w-8 opacity-20" /></div>
                      <p className="font-medium">No items added</p>
                      <p className="text-xs text-muted-foreground">Scan barcode or search above to add products.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                fields.map((field, index) => (
                  <TableRow key={field.id} className="group hover:bg-muted/50 border-b">
                    <TableCell className="font-medium pl-4 py-2">
                      <div className="font-medium">{field.product.name}</div>
                      <div className="text-xs text-muted-foreground flex gap-2">
                        <span>{field.product.sku || 'No SKU'}</span>
                        {field.product.stock !== undefined && (
                          <span className={field.product.stock <= 0 ? 'text-destructive' : 'text-emerald-600'}>
                            Stock: {formatQuantity(field.product.stock)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex justify-center">
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <Input type="number" className="h-8 w-20 text-center bg-background" {...field} onFocus={e => e.target.select()} />
                          )}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <FormField
                        control={form.control}
                        name={`items.${index}.price`}
                        render={({ field }) => (
                          <Input type="number" step="0.01" className="h-8 w-24 text-right ml-auto border-transparent hover:border-input focus:border-input bg-background" {...field} />
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-right py-2 pr-4 font-mono">
                      ₱{(Number(form.watch(`items.${index}.price`) || 0) * Number(form.watch(`items.${index}.quantity`) || 0)).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2">
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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

        <div className="bg-muted/30 p-4 border-t grid grid-cols-12 gap-4">
          <div className="col-span-8" />
          <div className="col-span-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₱{(Number(total) - shipping).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span>₱{shipping.toFixed(2)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="font-semibold text-lg">Total</span>
              <span className="font-bold text-xl text-primary">₱{Number(total).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
