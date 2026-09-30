'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatStockQuantity } from '@/lib/utils';
import type { Product, PriceLevel } from '@/lib/types';

export type StockLevel = 'out-of-stock' | 'low-stock' | 'in-stock';

const STOCK_LEVEL_LABEL: Record<StockLevel, string> = {
  'out-of-stock': 'Out of Stock',
  'low-stock': 'Low Stock',
  'in-stock': 'In Stock',
};

const STOCK_LEVEL_COLOR: Record<StockLevel, string> = {
  'out-of-stock': 'bg-red-500',
  'low-stock': 'bg-amber-500',
  'in-stock': 'bg-green-500',
};

/** Small colored dot with a tooltip; the label is also exposed via aria-label so it is not color-only. */
export function StockDot({ status, testId = 'stock-indicator' }: { status: StockLevel; testId?: string }) {
  const label = STOCK_LEVEL_LABEL[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          data-testid={testId}
          data-status={status}
          className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', STOCK_LEVEL_COLOR[status])}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type SellingUnit = NonNullable<Product['sellingUnits']>[number];

function unitStock(product: Product, unit: SellingUnit): number {
  return unit.qtyBase > 0 ? Math.floor(product.stock / unit.qtyBase) : 0;
}

function unitStockLevel(derivedStock: number, unit: SellingUnit, effectiveReorderPoint: number): StockLevel {
  if (derivedStock <= 0) return 'out-of-stock';
  const derivedThreshold = unit.qtyBase > 0 ? effectiveReorderPoint / unit.qtyBase : 0;
  return derivedStock < derivedThreshold ? 'low-stock' : 'in-stock';
}

export function SellingUnitsPanel({
  product,
  priceLevels,
  effectiveReorderPoint,
}: {
  product: Product;
  priceLevels: PriceLevel[];
  effectiveReorderPoint: number;
}) {
  const isService = product.type === 'service';
  const units = [...(product.sellingUnits ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const levelById = new Map(priceLevels.map(level => [level.id, level]));

  return (
    <Accordion type="multiple" className="w-full">
      {units.map(unit => {
        const derivedStock = unitStock(product, unit);
        const level = unitStockLevel(derivedStock, unit, effectiveReorderPoint);
        const priceRows = Object.entries(unit.prices ?? {})
          .map(([levelId, entry]) => ({
            levelId,
            name: levelById.get(levelId)?.name ?? levelId,
            isDefault: levelById.get(levelId)?.isDefault ?? false,
            price: entry.price,
            minQuantity: entry.minQuantity,
          }))
          .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

        return (
          <AccordionItem
            key={unit.id}
            value={unit.id}
            data-testid="selling-unit-item"
            className="border-b last:border-b-0"
          >
            <AccordionTrigger className="py-2 text-sm hover:no-underline">
              <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 pr-3 text-left">
                <span className="flex min-w-[8rem] items-center gap-2 font-semibold">
                  {unit.unitName}
                  {unit.isBase && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Base</Badge>}
                </span>
                <span className="min-w-[7rem] font-mono text-xs font-normal text-muted-foreground">
                  {unit.barcode || '—'}
                </span>
                {unit.qtyBase !== 1 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    = {parseFloat(Number(unit.qtyBase).toFixed(3))} {product.unitOfMeasure}
                  </span>
                )}
                {!isService && (
                  <span className="flex items-center gap-1.5 font-normal">
                    <StockDot status={level} testId="selling-unit-stock" />
                    <span className="font-semibold">{formatStockQuantity(derivedStock)}</span>
                  </span>
                )}
                <span className="ml-auto font-semibold tabular-nums">
                  {typeof unit.price === 'number' ? `₱${unit.price.toFixed(2)}` : '—'}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-3">
              {priceRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No price levels set</p>
              ) : (
                <table className="w-full max-w-md text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="py-1 pr-4 text-left font-medium">Level</th>
                      <th className="py-1 pr-4 text-right font-medium">Min Qty</th>
                      <th className="py-1 text-right font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceRows.map(row => (
                      <tr key={row.levelId} className="border-t border-border/50">
                        <td className="py-1 pr-4">{row.name}</td>
                        <td className="py-1 pr-4 text-right tabular-nums">{row.minQuantity ?? '—'}</td>
                        <td className="py-1 text-right tabular-nums">
                          {typeof row.price === 'number' ? `₱${row.price.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Cost: {typeof unit.cost === 'number' && unit.cost > 0 ? `₱${unit.cost.toFixed(2)}` : '—'}
              </p>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
