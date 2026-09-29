'use client';

import { useState } from 'react';
import { ChevronDown, PlusCircle, Wand2, X } from 'lucide-react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UnitOfMeasure } from '@/lib/types';

import { useAddProductFormContext } from '../add-product-form-context';
import { calculatePriceLevelPrice } from '../use-add-product-form';
import { InlineEditableSelect } from '../../components/inline-editable-select';
import { addUnitOfMeasure, updateUnitOfMeasure } from '../../actions';

export function SellingUnitsTab() {
  const {
    form,
    itemType,
    priceLevels, isLoadingPriceLevels,
    unitsOfMeasure, isLoadingUnits,
    refreshUnits,
    sellingUnitFields, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,
    generateUnitBarcode,
    supplierCostOptions,
  } = useAddProductFormContext();

  // Which row's Unit Name select is open — local, per-row state (the shared
  // `selects` context flag is a single boolean meant for one top-level field,
  // not a list of rows that can each be open independently).
  const [openUnitRow, setOpenUnitRow] = useState<number | null>(null);

  // Services have no sellable units — the tab is not rendered for them.
  if (itemType === 'service') return null;

  /**
   * Fills every price-level column of one row from that row's own cost and the
   * base row's retail price, using the same adjustment rule the old Price
   * Levels tab applied when a level was picked. A non-base row scales by its
   * qtyBase: one Box of 12 is priced off 12 Pieces of retail.
   *
   * Idempotent — clicking it again gives the same values. The retail basis is
   * never an output of the same click:
   * - retail-based default level (the normal case): the base row's default
   *   price IS the retail basis (the old Price Levels tab's main price), so on
   *   the base row it is left as entered, and a non-base row's default price is
   *   exactly retail × qty. Re-applying the default level's own adjustment to
   *   its own price is what compounded on every click.
   * - cost-based default level: computed from the base row's cost, like any
   *   cost-based level.
   * A level whose basis is empty/0 is left untouched rather than zeroed.
   */
  const autoPriceRow = (index: number) => {
    const units: any[] = form.getValues('sellingUnits' as any) || [];
    const row = units[index];
    if (!row) return;

    const baseRow = units[baseUnitIndex];
    const qty = row.isBase ? 1 : Number(row.qtyBase) || 0;
    if (!qty) return;

    const baseCost = Number(baseRow?.cost ?? 0) || 0;
    // A row's own Cost is already per that unit (one Box), so it is not scaled
    // again; only the base cost fallback is multiplied up to this unit.
    const ownCost = row.cost === undefined || row.cost === null || row.cost === '' ? NaN : Number(row.cost);
    const rowCost = row.isBase ? baseCost : Number.isFinite(ownCost) ? ownCost : baseCost * qty;

    const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];
    const defaultIsRetailBased = !!defaultLevel && (defaultLevel.calculationBase || 'retail') === 'retail';
    const baseRetail = !defaultLevel
      ? 0
      : defaultIsRetailBased
        ? Number(baseRow?.prices?.[defaultLevel.id]?.price ?? 0) || 0
        : calculatePriceLevelPrice(defaultLevel.id, 'cost', priceLevels, 0, baseCost);
    const rowRetail = baseRetail * qty;

    priceLevels.forEach((level: any) => {
      const calculationBase = level.calculationBase || 'retail';
      let value: number;
      if (defaultIsRetailBased && level.id === defaultLevel.id) {
        if (row.isBase) return; // the input itself — leave as entered
        value = rowRetail;
      } else {
        value = calculatePriceLevelPrice(level.id, calculationBase, priceLevels, rowRetail, rowCost);
      }
      const basis = calculationBase === 'cost' ? rowCost : rowRetail;
      if (!(basis > 0) || !Number.isFinite(value)) return;
      form.setValue(
        `sellingUnits.${index}.prices.${level.id}.price` as any,
        parseFloat(value.toFixed(2)),
        { shouldDirty: true },
      );
    });
  };

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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.unitName` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Unit Name</FormLabel>
                        <InlineEditableSelect
                          items={unitsOfMeasure}
                          isLoading={isLoadingUnits}
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
                            const existing = unitsOfMeasure.find((u: UnitOfMeasure) => u.id === id);
                            const r = await updateUnitOfMeasure(id, name, existing?.abbreviation ?? name);
                            if (r.success) { await refreshUnits(); return name; }
                            return undefined;
                          }}
                        />
                        {isBaseRow && (
                          <FormDescription className="text-xs">
                            Base unit — this is the product&apos;s unit of measure.
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
                        Locked — the base row always equals 1.
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
                              onChange={(e) =>
                                field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))
                              }
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
                              // The base row's picker sits over the right edge, so drop
                              // the native spinner that would otherwise be underneath it.
                              className={isBaseRow ? 'pr-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none' : undefined}
                              onChange={(e) =>
                                field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))
                              }
                            />
                          </FormControl>
                          {isBaseRow && (
                            // Always rendered (disabled when nothing to pick) so it is
                            // clear the picker exists. Picks fill Cost, which stays editable.
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  disabled={supplierCostOptions.length === 0}
                                  title={
                                    supplierCostOptions.length === 0
                                      ? 'No supplier cost yet — add one in the Suppliers tab'
                                      : 'Pick from supplier cost'
                                  }
                                  className="inline-flex items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:pointer-events-none p-0 absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                  <span className="sr-only">Pick from supplier cost</span>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel className="text-xs">Supplier cost</DropdownMenuLabel>
                                {supplierCostOptions.map((o) => (
                                  <DropdownMenuItem
                                    key={o.key}
                                    className="text-xs"
                                    onSelect={() => field.onChange(o.cost)}
                                  >
                                    {o.name} — ₱{o.cost.toFixed(2)}{o.isPrimary ? ' ★' : ''}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isLoadingPriceLevels ? (
                    <div className="text-xs text-muted-foreground self-end pb-2">Loading price levels…</div>
                  ) : (
                    priceLevels.map((level: any) => (
                      <FormField
                        key={level.id}
                        control={form.control}
                        name={`sellingUnits.${index}.prices.${level.id}.price` as any}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs truncate" title={level.name}>
                              {level.name} (₱)
                            </FormLabel>
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
                    ))
                  )}
                </div>

                <div className="absolute right-3 top-3 flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground"
                    onClick={() => autoPriceRow(index)}
                  >
                    <Wand2 className="h-4 w-4" />
                    <span className="sr-only">Auto-fill prices for this unit</span>
                  </button>
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
