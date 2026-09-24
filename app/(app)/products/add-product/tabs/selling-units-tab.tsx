'use client';

import { PlusCircle, Wand2, X } from 'lucide-react';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { useAddProductFormContext } from '../add-product-form-context';
import { calculatePriceLevelPrice } from '../use-add-product-form';

export function SellingUnitsTab() {
  const {
    form,
    itemType,
    priceLevels, isLoadingPriceLevels,
    sellingUnitFields, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,
    generateUnitBarcode,
  } = useAddProductFormContext();

  // Services have no sellable units — the tab is not rendered for them.
  if (itemType === 'service') return null;

  /**
   * Fills every price-level column of one row from that row's own cost and the
   * base row's retail price, using the same adjustment rule the old Price
   * Levels tab applied when a level was picked. A non-base row scales by its
   * qtyBase: one Box of 12 is priced off 12 Pieces of retail.
   */
  const autoPriceRow = (index: number) => {
    const units: any[] = form.getValues('sellingUnits' as any) || [];
    const row = units[index];
    if (!row) return;

    const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];
    const baseRetail = defaultLevel
      ? Number(units[baseUnitIndex]?.prices?.[defaultLevel.id]?.price ?? 0)
      : 0;
    const qty = row.isBase ? 1 : Number(row.qtyBase) || 0;
    if (!qty) return;

    const rowRetail = row.isBase ? baseRetail : baseRetail * qty;
    const rowCost = Number(row.cost ?? units[baseUnitIndex]?.cost ?? 0) * (row.isBase ? 1 : qty);

    priceLevels.forEach((level: any) => {
      const value = calculatePriceLevelPrice(
        level.id,
        level.calculationBase || 'retail',
        priceLevels,
        rowRetail,
        rowCost,
      );
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

        {/* Column header — the price-level columns are rendered once here. */}
        <div className="hidden md:flex items-end gap-3 px-3 pb-2 text-xs font-medium text-muted-foreground">
          <div className="flex-1 min-w-[140px]">Unit Name</div>
          <div className="w-[120px]">Qty Base</div>
          <div className="w-[170px]">Barcode</div>
          <div className="w-[110px]">Cost (₱)</div>
          {isLoadingPriceLevels ? (
            <div className="w-[110px]">Loading…</div>
          ) : (
            priceLevels.map((level: any) => (
              <div key={level.id} className="w-[110px] truncate" title={level.name}>
                {level.name} (₱)
              </div>
            ))
          )}
          <div className="w-[72px]" />
        </div>

        <div className="space-y-3">
          {sellingUnitFields.map((field, index) => {
            const isBaseRow = index === baseUnitIndex;
            return (
              <div
                key={field.id}
                className="flex flex-wrap md:flex-nowrap items-end gap-3 p-3 bg-card border rounded-md shadow-sm overflow-x-auto"
              >
                <div className="flex-1 min-w-[140px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.unitName` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Unit Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={isBaseRow ? 'e.g., Piece' : 'e.g., Box'}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        {isBaseRow && (
                          <FormDescription className="text-xs">
                            Base unit — this is the product&apos;s unit of measure.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="w-[120px]">
                  {isBaseRow ? (
                    <div className="space-y-2">
                      <span className="text-xs font-medium md:sr-only block">Qty Base</span>
                      <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-semibold">
                        1
                      </div>
                    </div>
                  ) : (
                    <FormField
                      control={form.control}
                      name={`sellingUnits.${index}.qtyBase` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs md:sr-only">Equals how many base units?</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.000001"
                              placeholder="Qty"
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
                </div>

                <div className="w-[170px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.barcode` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Barcode</FormLabel>
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
                </div>

                <div className="w-[110px]">
                  <FormField
                    control={form.control}
                    name={`sellingUnits.${index}.cost` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs md:sr-only">Cost (₱)</FormLabel>
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
                </div>

                {priceLevels.map((level: any) => (
                  <div key={level.id} className="w-[110px]">
                    <FormField
                      control={form.control}
                      name={`sellingUnits.${index}.prices.${level.id}.price` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs md:sr-only">{level.name} (₱)</FormLabel>
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
                  </div>
                ))}

                <div className="flex w-[72px] items-center gap-1 self-center pb-1">
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
