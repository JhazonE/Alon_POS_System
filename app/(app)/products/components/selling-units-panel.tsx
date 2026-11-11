'use client';

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

/**
 * One price level as a compact pill: level name, price, and the minimum
 * quantity as `24+` when the level carries one.
 *
 * These replace what used to be a third nested table (a Level / Min Qty /
 * Price header repeated once per selling unit). The old shape put three sets
 * of column headers on screen at the same time, none of them aligned to the
 * products table they sat inside.
 */
function PriceLevelChip({ name, price, minQuantity }: { name: string; price: number | null; minQuantity?: number | null }) {
  return (
    <span className="inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]">
      <span className="text-muted-foreground">{name}</span>
      <span className="font-semibold tabular-nums">
        {typeof price === 'number' ? `₱${price.toFixed(2)}` : '—'}
      </span>
      {minQuantity ? <span className="text-muted-foreground">· {minQuantity}+</span> : null}
    </span>
  );
}

/**
 * The selling units of one product, as sibling rows of the products table.
 *
 * These are deliberately `<tr>` in the SAME `<table>` as the product rows, so
 * they inherit its column widths and `Stock` / `Cost` / `Retail Price` land
 * under the headers they belong to. The previous version rendered an
 * `Accordion` inside a single full-width `colSpan` cell, which laid itself out
 * with its own flex widths and therefore lined up with nothing -- and needed a
 * second click to reach a wholesale price.
 *
 * Returns a fragment of rows, so the caller must splice it directly into
 * `<TableBody>`: wrapping it in anything produces invalid table markup.
 *
 * Every cell repeats the product row's responsive visibility classes. They
 * must stay in lockstep -- a unit row that keeps a column its product row
 * drops shifts every cell after it at that breakpoint.
 */
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
    <>
      {units.map((unit, index) => {
        const derivedStock = unitStock(product, unit);
        const level = unitStockLevel(derivedStock, unit, effectiveReorderPoint);
        const isLast = index === units.length - 1;
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
          <tr
            key={unit.id}
            data-testid="selling-unit-item"
            className={cn('bg-muted/20 hover:bg-muted/30', !isLast && 'border-b-0')}
          >
            {/* The accent spine carries the depth that an indent used to. Child
                rows keep full column width so their figures stay in-column. */}
            <td className="hidden p-0 sm:table-cell">
              <div className="h-full border-l-[3px] border-primary" />
            </td>

            <td className="py-2 pl-0 pr-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="h-px w-[18px] shrink-0 bg-border" aria-hidden="true" />
                <span className="whitespace-nowrap font-semibold">{unit.unitName}</span>
                {unit.isBase && (
                  <span className="shrink-0 rounded-[5px] bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
                    Base
                  </span>
                )}
                {unit.qtyBase !== 1 && (
                  <span className="shrink-0 whitespace-nowrap rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {parseFloat(Number(unit.qtyBase).toFixed(3))} {product.unitOfMeasure}
                  </span>
                )}
                {priceRows.map(row => (
                  <PriceLevelChip
                    key={row.levelId}
                    name={row.name}
                    price={row.price}
                    minQuantity={row.minQuantity}
                  />
                ))}
              </div>
            </td>

            <td className="hidden truncate px-4 text-xs tabular-nums text-muted-foreground lg:table-cell">
              {unit.barcode || '—'}
            </td>

            {/* The unit's own name already states the unit, so repeating the
                product's base unit of measure here would be noise. */}
            <td className="hidden sm:table-cell" />

            <td className="px-4 text-center">
              {isService ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className="inline-flex items-center justify-center gap-2">
                  <StockDot status={level} testId="selling-unit-stock" />
                  <span className="font-semibold tabular-nums">{formatStockQuantity(derivedStock)}</span>
                </span>
              )}
            </td>

            <td className="hidden px-4 text-right text-xs tabular-nums text-muted-foreground md:table-cell">
              {typeof unit.cost === 'number' && unit.cost > 0 ? `₱${unit.cost.toFixed(2)}` : '—'}
            </td>

            <td className="hidden px-4 text-right font-semibold tabular-nums md:table-cell">
              {typeof unit.price === 'number' ? `₱${unit.price.toFixed(2)}` : '—'}
            </td>

            {/* Warehouse and shelf belong to the product, not to a unit of it. */}
            <td className="hidden md:table-cell" />
            <td className="hidden md:table-cell" />
            <td />
          </tr>
        );
      })}
    </>
  );
}
