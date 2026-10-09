'use client';

import { useState } from 'react';
import { PlusCircle, Wand2, X } from 'lucide-react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { UnitOfMeasure } from '@/lib/types';

import { useEditProductFormContext } from '../edit-product-form-context';
import { calculatePriceLevelPrice } from '../use-edit-product-form';
import { InlineEditableSelect } from '../../components/inline-editable-select';
import { SupplierCostPicker } from '../../components/supplier-cost-picker';
import { useSellingUnitPricing } from '../../components/use-selling-unit-pricing';
import { addUnitOfMeasure, updateUnitOfMeasure } from '../../actions';

export function SellingUnitsTab() {
  const {
    form,
    product,
    priceLevels, isLoadingPriceLevels,
    units, refreshUnits,
    sellingUnitFields, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,
    generateUnitBarcode,
    supplierCostOptions,
  } = useEditProductFormContext();

  // Which row's Unit Name select is open — local, per-row state (the shared
  // `selects` context flag is a single boolean meant for one top-level field,
  // not a list of rows that can each be open independently).
  const [openUnitRow, setOpenUnitRow] = useState<number | null>(null);

  // Cost/Retail derivation (shared with the other product drawer). Called before
  // the service early return below so hook order never changes between renders.
  const {
    defaultLevel, getRetail, getBaseCost,
    onCostChange, onQtyBaseChange, onRetailChange,
  } = useSellingUnitPricing({ form, priceLevels, baseUnitIndex, calculatePriceLevelPrice });

  // Services have no sellable units — the tab is not rendered for them.
  if (product?.type === 'service') return null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium leading-none">Selling Units</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Every way this product is sold. The first row is the base unit; every other
              row says how many base units it contains (e.g. 1 Box = 12 Pieces).
            </p>
          </div>
          <button
            type="button"
            onClick={addSellingUnit}
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Selling Unit
          </button>
        </div>

        <div className="space-y-4">
          {sellingUnitFields.map((field, index) => {
            const isBaseRow = index === baseUnitIndex;
            return (
              <div
                key={field.id}
                className="relative p-4 pr-14 bg-card border rounded-md shadow-sm"
              >
                {/* Identity block — what this unit is, what it holds, and what it costs.
                    Two per row rather than four: at four across the inputs were too
                    narrow to show their placeholders and the hints wrapped to three lines. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.unitName` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Unit Name</FormLabel>
                        <InlineEditableSelect
                          items={units}
                          isLoading={false}
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          open={openUnitRow === index}
                          onOpenChange={(o) => setOpenUnitRow(o ? index : null)}
                          placeholder={isBaseRow ? 'e.g., Piece' : 'e.g., Box'}
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
                            const existing = units.find((u: UnitOfMeasure) => u.id === id);
                            const r = await updateUnitOfMeasure(id, name, existing?.abbreviation ?? name);
                            if (r.success) { await refreshUnits(); return name; }
                            return undefined;
                          }}
                        />
                        {isBaseRow && (
                          <FormDescription className="text-xs">
                            The product&apos;s unit of measure.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isBaseRow ? (
                    <div className="space-y-2">
                      <label className="text-xs font-medium leading-none">Qty Base</label>
                      <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-semibold">
                        1
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Always 1.
                      </p>
                    </div>
                  ) : (
                    <FormField
                      control={form.control}
                      name={`sellingUnits.${index}.qtyBase` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Qty Base</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.000001"
                              placeholder="e.g., 12"
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const prevQty = Number(form.getValues(`sellingUnits.${index}.qtyBase` as any)) || 0;
                                field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value));
                                onQtyBaseChange(index, prevQty);
                              }}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            How many {baseUnitName || 'base units'} is one of this unit?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.barcode` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Barcode</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              placeholder="e.g., 12345670"
                              {...field}
                              value={field.value ?? ''}
                              className="pr-10"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.preventDefault();
                              }}
                            />
                          </FormControl>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                            onClick={() => generateUnitBarcode(index)}
                          >
                            <Wand2 className="h-4 w-4" />
                            <span className="sr-only">Generate Barcode</span>
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.cost` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Cost (₱)</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={field.value ?? ''}
                              // The picker sits over the right edge, so drop
                              // the native spinner that would otherwise be underneath it.
                              className="pr-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              onChange={(e) => {
                                const prevBaseCost = getBaseCost();
                                field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value));
                                onCostChange(index, prevBaseCost);
                              }}
                            />
                          </FormControl>
                          {/* Always rendered (disabled when nothing to pick). Supplier costs
                              are per base unit, so a non-base row is offered the cost scaled
                              by its Qty Base. Picks fill Cost, which stays editable. */}
                          <SupplierCostPicker
                            options={supplierCostOptions}
                            rowQty={isBaseRow ? 1 : Number(form.watch(`sellingUnits.${index}.qtyBase` as any)) || 0}
                            onPick={(cost) => {
                              const prevBaseCost = getBaseCost();
                              field.onChange(cost);
                              onCostChange(index, prevBaseCost);
                            }}
                          />
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Price Levels block — its own section so a level's Price and Min Qty
                    always sit together on one line instead of wrapping apart inside
                    the identity grid. */}
                <div className="mt-4 border-t pt-4">
                  <h5 className="text-xs font-semibold leading-none text-muted-foreground uppercase tracking-wide">
                    Price Levels
                  </h5>

                  {isLoadingPriceLevels ? (
                    <div className="text-xs text-muted-foreground mt-3">Loading price levels…</div>
                  ) : priceLevels.length === 0 ? (
                    <div className="text-xs text-muted-foreground mt-3">No price levels configured.</div>
                  ) : (
                    <div className="mt-3 space-y-3 sm:space-y-2">
                      {/* Column headers, printed once instead of on every field, so a long
                          level name no longer has to truncate into a field label. */}
                      <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:gap-x-4 text-xs font-medium text-muted-foreground">
                        <span>Level</span>
                        <span>Price (₱)</span>
                        {isBaseRow && <span>Min Qty</span>}
                      </div>

                      {priceLevels.map((level: any) => (
                        <div
                          key={level.id}
                          className="rounded-md border p-3 sm:border-0 sm:p-0 sm:grid sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-start sm:gap-x-4"
                        >
                          <div
                            className="text-xs font-medium sm:self-center sm:py-2 sm:truncate"
                            title={level.name}
                          >
                            {level.name}
                            {level.id === defaultLevel?.id && (
                              <span className="ml-1.5 text-muted-foreground font-normal">(default)</span>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-x-3 sm:mt-0 sm:contents">
                            <FormField
                              control={form.control}
                              name={`sellingUnits.${index}.prices.${level.id}.price` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs sm:sr-only">Price (₱)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={field.value ?? ''}
                                      onChange={(e) => {
                                        const next = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                        const prevBaseRetail = getRetail(form.getValues(`sellingUnits.${baseUnitIndex}` as any));
                                        field.onChange(next);
                                        if (level.id === defaultLevel?.id && next !== undefined) {
                                          onRetailChange(index, next, prevBaseRetail);
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            {/* Min Qty is base-unit only: the POS prices the base unit, so a minimum
                                on another row would be collected and never applied. */}
                            {isBaseRow && (
                              <FormField
                                control={form.control}
                                name={`sellingUnits.${index}.prices.${level.id}.minQuantity` as any}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs sm:sr-only">Min Qty</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                        placeholder="0"
                                        value={field.value ?? ''}
                                        onChange={(e) =>
                                          field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10))
                                        }
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="absolute right-3 top-3 flex items-center gap-1">
                  {!isBaseRow && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                      onClick={() => removeSellingUnit(index)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove selling unit</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
