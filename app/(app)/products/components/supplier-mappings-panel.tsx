'use client';

import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { PlusCircle, Star, X } from 'lucide-react';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Supplier } from '@/lib/types';

import { InlineEditableSelect } from './inline-editable-select';
import { addSupplier, updateSupplier, getSuppliers } from '../actions';

/**
 * The Suppliers tab body shared by the Add and Edit product forms. It is
 * purely presentational: the host form's controller supplies the
 * `supplierMappings` field array (see use-supplier-mappings.ts) and the
 * supplier list.
 *
 * `isLoadingMappings` / `loadError` are only used by Edit, which loads the
 * product's existing mappings asynchronously; Add never sets them.
 */
export function SupplierMappingsPanel({
  form,
  suppliers, isLoadingSuppliers,
  refreshSuppliers,
  supplierMappingFields, addSupplierMapping, removeSupplierMapping, setPrimarySupplierRow,
  isLoadingMappings = false,
  loadError = null,
}: {
  form: UseFormReturn<any, any, any>;
  suppliers: Supplier[];
  isLoadingSuppliers: boolean;
  refreshSuppliers: () => Promise<unknown>;
  supplierMappingFields: { id: string }[];
  addSupplierMapping: () => void;
  removeSupplierMapping: (index: number) => void;
  setPrimarySupplierRow: (index: number) => void;
  isLoadingMappings?: boolean;
  loadError?: string | null;
}) {
  const [openSupplierRow, setOpenSupplierRow] = useState<number | null>(null);

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
            disabled={isLoadingMappings || !!loadError}
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Supplier
          </button>
        </div>

        {isLoadingMappings && (
          <p className="text-sm text-muted-foreground">Loading suppliers…</p>
        )}

        {loadError && (
          <p className="text-sm text-destructive" role="alert">{loadError}</p>
        )}

        {supplierMappingFields.length === 0 && !isLoadingMappings && !loadError && (
          <p className="text-sm text-muted-foreground">No suppliers mapped yet.</p>
        )}

        <TooltipProvider delayDuration={150}>
        <div className="space-y-4">
          {supplierMappingFields.map((field, index) => (
            <div
              key={field.id}
              className="relative flex items-start gap-3 p-4 pr-14 bg-card border rounded-md shadow-sm"
            >
              <FormField
                control={form.control}
                name={`supplierMappings.${index}.isPrimary` as any}
                render={({ field }) => (
                  <FormItem className="shrink-0 space-y-0 pt-[22px]">
                    <FormControl>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={!!field.value}
                            aria-label={field.value ? 'Primary supplier' : 'Set as primary supplier'}
                            onClick={() => setPrimarySupplierRow(index)}
                            className="flex h-10 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Star
                              className={
                                field.value
                                  ? 'h-6 w-6 fill-yellow-400 text-yellow-500'
                                  : 'h-6 w-6 text-muted-foreground hover:text-yellow-500'
                              }
                            />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {field.value ? 'Primary supplier' : 'Set as primary'}
                        </TooltipContent>
                      </Tooltip>
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-x-4 gap-y-4">
                <FormField
                  control={form.control}
                  name={`supplierMappings.${index}.supplierId` as any}
                  render={({ field }) => (
                    <FormItem className="lg:col-span-3">
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
                    <FormItem className="lg:col-span-3">
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
                  name={`supplierMappings.${index}.leadTime` as any}
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
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
                  name={`supplierMappings.${index}.cost` as any}
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
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
                  name={`supplierMappings.${index}.rop` as any}
                  render={({ field }) => (
                    <FormItem className="lg:col-span-2">
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
        </TooltipProvider>
      </div>
    </div>
  );
}
