'use client';

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { UnitOfMeasure, Warehouse } from '@/lib/types';

import { useAddProductFormContext } from '../add-product-form-context';
import type { WarehouseEntry } from '../product-schema';
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
              const primaryId = entries.find((e) => e.isPrimary)?.warehouseId ?? entries[0]?.warehouseId ?? '';
              const rowErrors = (form.formState.errors as any).warehouses as any;

              // Rebuild the entries from the picked ids, keeping each kept row's
              // stock and primary flag. The FIRST selected warehouse is the
              // primary by default; if the primary is unselected, the first
              // remaining one takes over, so a non-empty list always has one.
              const setSelected = (ids: string[]) => {
                const next: WarehouseEntry[] = ids.map(
                  (id) => entries.find((e) => e.warehouseId === id) ?? { warehouseId: id, stock: 0, isPrimary: false },
                );
                if (next.length > 0 && !next.some((e) => e.isPrimary)) {
                  next[0] = { ...next[0], isPrimary: true };
                }
                field.onChange(next);
              };
              const setPrimary = (id: string) =>
                field.onChange(entries.map((e) => ({ ...e, isPrimary: e.warehouseId === id })));
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
                  />
                  <FormDescription>
                    Cost, prices, reorder point and suppliers are shared by every warehouse. Only the opening stock is set per warehouse.
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

                  {entries.length > 0 && (
                    <RadioGroup
                      value={primaryId}
                      onValueChange={setPrimary}
                      aria-label="Primary warehouse"
                      className="gap-2 pt-1"
                    >
                      <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_7rem_5rem] sm:gap-x-3 px-3 text-xs font-medium text-muted-foreground">
                        <span>Warehouse</span>
                        <span>Initial stock</span>
                        <span>Primary</span>
                      </div>
                      {entries.map((e, i) => {
                        const w = warehouseById(e.warehouseId);
                        const name = w?.name ?? e.warehouseId;
                        const stockError = rowErrors?.[i]?.stock?.message as string | undefined;
                        return (
                          <div
                            key={e.warehouseId}
                            data-testid="warehouse-row"
                            className="rounded-md border p-3 grid grid-cols-[minmax(0,1fr)_7rem_auto] items-start gap-x-3 sm:grid-cols-[minmax(0,1fr)_7rem_5rem]"
                          >
                            <div className="min-w-0 sm:self-center">
                              <div className="truncate text-sm font-medium" title={name}>{name}</div>
                              {w?.branchName && (
                                <div className="truncate text-xs text-muted-foreground">{w.branchName}</div>
                              )}
                            </div>
                            <div>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="0"
                                aria-label={`Initial stock for ${name}`}
                                value={e.stock}
                                onChange={(ev) => setStock(e.warehouseId, parseInt(ev.target.value) || 0)}
                              />
                              {stockError && <p className="mt-1 text-xs text-destructive">{stockError}</p>}
                            </div>
                            <div className="flex items-center gap-1.5 self-center text-xs sm:justify-start">
                              <RadioGroupItem value={e.warehouseId} aria-label={`Primary warehouse: ${name}`} />
                              <span className="sm:sr-only">Primary</span>
                            </div>
                          </div>
                        );
                      })}
                    </RadioGroup>
                  )}
                  <FormMessage />
                </FormItem>
              );
            }}
          />

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
        </>
      )}

      {/* Cost now lives on the base selling unit row in the Selling Units tab —
          one source of truth. Reorder point is set per supplier in the
          Suppliers tab. Opening stock is per warehouse (the rows above). */}
    </div>
  );
}
