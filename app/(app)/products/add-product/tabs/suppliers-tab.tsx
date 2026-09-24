'use client';

import { useState } from 'react';
import { PlusCircle, X } from 'lucide-react';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { Supplier } from '@/lib/types';

import { useAddProductFormContext } from '../add-product-form-context';
import { InlineEditableSelect } from '../../components/inline-editable-select';
import { addSupplier, updateSupplier, getSuppliers } from '../../actions';

export function SuppliersTab() {
  const {
    form,
    itemType,
    suppliers, isLoadingSuppliers,
    refreshSuppliers,
    supplierMappingFields, addSupplierMapping, removeSupplierMapping, setPrimarySupplierRow,
  } = useAddProductFormContext();

  const [openSupplierRow, setOpenSupplierRow] = useState<number | null>(null);

  if (itemType === 'service') return null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium leading-none">Suppliers</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Every supplier this product can be sourced from. Mark one as primary — it
              feeds automatic markup and the product&apos;s default reorder point.
            </p>
          </div>
          <button
            type="button"
            onClick={addSupplierMapping}
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Supplier
          </button>
        </div>

        {supplierMappingFields.length === 0 && (
          <p className="text-sm text-muted-foreground">No suppliers mapped yet.</p>
        )}

        <div className="space-y-4">
          {supplierMappingFields.map((field, index) => (
            <div
              key={field.id}
              className="relative p-4 pr-14 bg-card border rounded-md shadow-sm"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.supplierId` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Supplier</FormLabel>
                      <InlineEditableSelect
                        items={suppliers}
                        isLoading={isLoadingSuppliers}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        open={openSupplierRow === index}
                        onOpenChange={(o) => setOpenSupplierRow(o ? index : null)}
                        placeholder="Select a supplier"
                        addLabel="Add Supplier"
                        emptyLabel="No suppliers found"
                        getId={(s: Supplier) => s.id}
                        getValue={(s: Supplier) => s.id}
                        getOptionLabel={(s: Supplier) => s.name}
                        getName={(s: Supplier) => s.name}
                        onAdd={async (name) => {
                          const r = await addSupplier({ name });
                          if (r.success) {
                            await refreshSuppliers();
                            const fresh = await getSuppliers();
                            const created = fresh.find((s) => s.name === name);
                            return created?.id;
                          }
                          return undefined;
                        }}
                        onRename={async (id, name) => {
                          const existing = suppliers.find((s: Supplier) => s.id === id);
                          if (!existing) return undefined;
                          const r = await updateSupplier(id, { ...existing, name });
                          if (r.success) { await refreshSuppliers(); return id; }
                          return undefined;
                        }}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.supplierSku` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Supplier SKU</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.cost` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Cost (₱)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.leadTime` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Lead Time (days)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.rop` as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Reorder Point</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.isPrimary` as any}
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-end">
                      <FormLabel className="text-xs">Primary</FormLabel>
                      <FormControl>
                        <label className="flex h-10 items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="primary-supplier-mapping"
                            checked={!!field.value}
                            onChange={() => setPrimarySupplierRow(index)}
                            className="h-4 w-4"
                          />
                          {field.value ? 'Primary supplier' : 'Set as primary'}
                        </label>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="absolute right-3 top-3">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                  onClick={() => removeSupplierMapping(index)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove supplier</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
