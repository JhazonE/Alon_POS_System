'use client';

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { UnitOfMeasure, Warehouse } from '@/lib/types';

import { useAddProductFormContext } from '../add-product-form-context';
import { withFirstPrimary, type WarehouseEntry } from '../product-schema';
import { InlineEditableSelect } from '../../components/inline-editable-select';
import { InlineEditableMultiSelect } from '../../components/inline-editable-multi-select';
import {
  addDepartment, updateDepartment,
  addWarehouse, updateWarehouse,
  addShelfLocation, updateShelfLocation, getShelfLocations,
  addUnitOfMeasure, updateUnitOfMeasure,
} from '../../actions';

export function InventoryTab() {
  const {
    form,
    itemType,
    departments, isLoadingDepartments,
    taxRates,
    warehouses, isLoadingWarehouses, isHeadOffice,
    isWarehousesError, retryWarehouses,
    shelfLocations,
    unitsOfMeasure, isLoadingUnits,
    selects, setSelects,
    refreshDepartments,
    refreshWarehouses,
    refreshShelfLocations,
    refreshUnits,
  } = useAddProductFormContext();
  const { toast } = useToast();

  if (itemType === 'service') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="vatStatus"
          render={({ field }) => (
            <FormItem>
              <FormLabel>VAT Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select VAT status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {taxRates.map((rate) => (
                    <SelectItem key={rate.id} value={rate.name}>
                      {rate.name} {rate.rate > 0 ? `(${rate.rate}%)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="availability"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Availability</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} defaultValue="Available">
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select availability" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="unitOfMeasure"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Base Unit of Measure</FormLabel>
              <InlineEditableSelect
                items={unitsOfMeasure}
                isLoading={isLoadingUnits}
                value={field.value}
                onChange={field.onChange}
                open={selects.units}
                onOpenChange={(o) => setSelects((p) => ({ ...p, units: o }))}
                placeholder="Select a unit"
                addLabel="Add Unit"
                emptyLabel="No units found"
                getId={(u: UnitOfMeasure) => u.id}
                getValue={(u: UnitOfMeasure) => u.name}
                getOptionLabel={(u: UnitOfMeasure) => `${u.name} (${u.abbreviation})`}
                getName={(u: UnitOfMeasure) => u.name}
                onAdd={async (name) => {
                  const r = await addUnitOfMeasure(name, name);
                  if (r.success) { await refreshUnits(); return name; }
                  return undefined;
                }}
                onRename={async (id, name) => {
                  const existing = unitsOfMeasure.find((u: UnitOfMeasure) => u.id === id);
                  const r = await updateUnitOfMeasure(id, name, existing?.abbreviation ?? name);
                  if (r.success) { await refreshUnits(); return name; }
                  return undefined;
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cost"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cost (required)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="e.g., 50.00" value={field.value || ''} onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {itemType === 'standard' && (
        <FormField
          control={form.control}
          name="department"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Department</FormLabel>
              <InlineEditableSelect
                items={departments}
                isLoading={isLoadingDepartments}
                value={field.value}
                onChange={field.onChange}
                open={selects.departments}
                onOpenChange={(o) => setSelects((p) => ({ ...p, departments: o }))}
                placeholder="Select a department"
                addLabel="Add Department"
                emptyLabel="No departments found"
                getId={(d: any) => d.id}
                getValue={(d: any) => d.name}
                getOptionLabel={(d: any) => d.name}
                getName={(d: any) => d.name}
                onAdd={async (name) => {
                  const r = await addDepartment(name, 0);
                  if (r.success) { await refreshDepartments(); return name; }
                  return undefined;
                }}
                onRename={async (id, name) => {
                  const existing = departments.find((d: any) => d.id === id);
                  const r = await updateDepartment(id, name, existing?.markupPercentage);
                  if (r.success) { await refreshDepartments(); return name; }
                  return undefined;
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />
        )}

        <FormField
          control={form.control}
          name="vatStatus"
          render={({ field }) => (
            <FormItem>
              <FormLabel>VAT Status</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select VAT status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {taxRates.map((rate) => (
                    <SelectItem key={rate.id} value={rate.name}>
                      {rate.name} {rate.rate > 0 ? `(${rate.rate}%)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="availability"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Availability</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} defaultValue="Available">
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select availability" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {itemType === 'standard' && (
          <FormField
            control={form.control}
            name="shelfLocationIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shelf Locations (Optional)</FormLabel>
                <InlineEditableMultiSelect
                  items={shelfLocations || []}
                  value={field.value || []}
                  onChange={field.onChange}
                  placeholder="Select locations..."
                  searchPlaceholder="Search location..."
                  addLabel="Add Shelf Location"
                  emptyLabel="No location found."
                  getId={(loc: any) => loc.id}
                  getName={(loc: any) => loc.name}
                  onAdd={async (name) => {
                    const r = await addShelfLocation(name);
                    if (r.success) {
                      await refreshShelfLocations();
                      const fresh = await getShelfLocations();
                      const created = fresh.find((l: any) => l.name === name);
                      return created?.id;
                    }
                    return undefined;
                  }}
                  onRename={async (id, name) => {
                    const existing = (shelfLocations || []).find((l: any) => l.id === id);
                    const r = await updateShelfLocation(id, name, existing?.description);
                    if (r.success) { await refreshShelfLocations(); return id; }
                    return undefined;
                  }}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

      {/* Unit of measure now lives on the base selling-unit row — one source of
          truth, same treatment as barcode and cost. */}
      {itemType === 'standard' && (
        <>
          {/* The warehouses this product is created in, each with its OWN opening
              stock. Everything else on the form (cost, prices, reorder point,
              suppliers) is shared by every warehouse: it is entered once, in the
              tabs that own it, not repeated per row. */}
          <FormField
            control={form.control}
            name="warehouses"
            render={({ field }) => {
              const entries: WarehouseEntry[] = field.value ?? [];
              const warehouseById = (id: string): Warehouse | undefined => warehouses.find((w: Warehouse) => w.id === id);
              const labelOf = (w: Warehouse) => (w.branchName ? `${w.name} · ${w.branchName}` : w.name);
              const rowErrors = (form.formState.errors as any).warehouses as any;
              // A row cannot show its own error while the popover is shut, so
              // they are collected and listed under the field, each naming its
              // warehouse.
              const stockErrorMessages: string[] = entries.flatMap((e, i) => {
                const m = rowErrors?.[i]?.stock?.message as string | undefined;
                if (!m) return [];
                const w = warehouseById(e.warehouseId);
                return [`${w?.name ?? e.warehouseId}: ${m}`];
              });

              // Rebuild the entries from the picked ids, keeping each kept row's
              // stock. There is NO primary control: the FIRST entry is the
              // primary, always. An unticked warehouse is dropped entirely, so
              // unticking the first one promotes the next — a non-empty list
              // therefore always has exactly one primary, and re-ticking starts
              // that warehouse at 0 rather than restoring a hidden old value.
              const setSelected = (ids: string[]) => {
                const next: WarehouseEntry[] = ids.map(
                  (id) => entries.find((e) => e.warehouseId === id) ?? { warehouseId: id, stock: 0, isPrimary: false },
                );
                field.onChange(withFirstPrimary(next));
              };
              const setStock = (id: string, stock: number) =>
                field.onChange(entries.map((e) => (e.warehouseId === id ? { ...e, stock } : e)));

              return (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{isHeadOffice ? 'Warehouses (Optional)' : 'Warehouses'}</FormLabel>
                  <InlineEditableMultiSelect
                    items={warehouses}
                    value={entries.map((e) => e.warehouseId)}
                    onChange={setSelected}
                    placeholder="Select warehouses..."
                    searchPlaceholder="Search warehouse..."
                    addLabel="Add Warehouse"
                    emptyLabel={
                      isLoadingWarehouses
                        ? 'Loading warehouses...'
                        : isWarehousesError
                          ? 'Could not load warehouses'
                          : 'No warehouses found'
                    }
                    getId={(w: Warehouse) => w.id}
                    getName={(w: Warehouse) => w.name}
                    getOptionLabel={labelOf}
                    onAdd={async (name) => {
                      const r = await addWarehouse(name);
                      if (!r.success) return undefined;
                      const fresh = await refreshWarehouses();
                      const created = fresh.find((w: Warehouse) => w.name === name);
                      if (!created) {
                        // addWarehouse files a new warehouse under the MAIN branch;
                        // a branch user's own list does not include it, so it
                        // cannot be picked here (the server would refuse it).
                        toast({
                          title: 'Warehouse added to the main branch',
                          description: `"${name}" is not part of your branch, so it cannot be used for this product.`,
                        });
                        return undefined;
                      }
                      return created.id;
                    }}
                    onRename={async (id, name) => {
                      const existing = warehouseById(id);
                      const r = await updateWarehouse(id, name, existing?.location);
                      if (r.success) { await refreshWarehouses(); return id; }
                      return undefined;
                    }}
                    renderSelectedAccessory={(w: Warehouse) => {
                      const entry = entries.find((e) => e.warehouseId === w.id);
                      if (!entry) return null;
                      const i = entries.indexOf(entry);
                      const stockError = rowErrors?.[i]?.stock?.message as string | undefined;
                      return (
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="0"
                          aria-label={`Initial stock for ${w.name}`}
                          aria-invalid={stockError ? true : undefined}
                          className={`h-7 w-20 rounded-full text-center ${stockError ? 'border-destructive' : ''}`}
                          value={entry.stock}
                          onChange={(ev) => setStock(w.id, parseInt(ev.target.value) || 0)}
                        />
                      );
                    }}
                  />
                  <FormDescription>
                    All warehouses in your branch are selected by default. Open the list and type each one&apos;s opening
                    stock beside its name. Cost, prices, reorder point and suppliers are shared by every warehouse —
                    only the opening stock is set per warehouse, and the first one picked is the primary.
                  </FormDescription>

                  {/* A failed list leaves the picker empty with nothing to pick,
                      so the user needs to be told why and given a retry rather
                      than a silent empty state. */}
                  {isWarehousesError && (
                    <div
                      data-testid="warehouse-list-error"
                      className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
                    >
                      <span>The warehouse list could not be loaded.</span>
                      <button
                        type="button"
                        className="inline-flex h-6 items-center justify-center rounded-md border border-input bg-background px-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        onClick={() => { void retryWarehouses(); }}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* The opening-stock inputs live INSIDE the picker rows
                      (renderSelectedAccessory above), so there is no table
                      here. What a row cannot show is its own validation
                      message while the popover is closed — those are listed
                      here instead, naming the warehouse. */}
                  {stockErrorMessages.length > 0 && (
                    <ul data-testid="warehouse-stock-errors" className="mt-1 space-y-1">
                      {stockErrorMessages.map((m) => (
                        <li key={m} className="text-xs text-destructive">{m}</li>
                      ))}
                    </ul>
                  )}

                  <FormMessage />
                </FormItem>
              );
            }}
          />

        </>
      )}

      {/* Cost now lives on the base selling unit row in the Selling Units tab —
          one source of truth. Reorder point is set per supplier in the
          Suppliers tab. Opening stock is per warehouse (the rows above). */}
    </div>
  );
}
