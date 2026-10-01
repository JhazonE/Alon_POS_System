'use client';

import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export interface SupplierCostOption {
  key: string;
  name: string;
  /** Cost per BASE unit. */
  cost: number;
  isPrimary: boolean;
}

/**
 * The chevron that sits over the right edge of a selling unit's Cost input and
 * lets the user pick a mapped supplier's cost. The parent must render it inside
 * a `relative` wrapper next to the (pr-10) Cost input.
 *
 * Always rendered (disabled when there is nothing to pick) so it is clear the
 * picker exists. Supplier costs are per base unit, so a non-base row (1 Box =
 * 12 Pieces) is offered the cost scaled up by its Qty Base (`rowQty`). A pick
 * calls `onPick` with the already-scaled, 2-decimal cost; the parent writes it
 * into the Cost field (which stays editable) and recalculates price levels.
 */
export function SupplierCostPicker({
  options: allOptions,
  rowQty,
  onPick,
}: {
  options: SupplierCostOption[];
  /** 1 for the base row; the row's Qty Base otherwise (0 when not set yet). */
  rowQty: number;
  onPick: (cost: number) => void;
}) {
  const options = rowQty > 0 ? allOptions : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={options.length === 0}
          title={
            options.length === 0
              ? rowQty > 0
                ? 'No supplier cost yet — add one in the Suppliers tab'
                : 'Set the Qty Base first'
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
        {options.map((o) => (
          <DropdownMenuItem
            key={o.key}
            className="text-xs"
            onSelect={() => onPick(parseFloat((o.cost * rowQty).toFixed(2)))}
          >
            {o.name} — ₱{(o.cost * rowQty).toFixed(2)}
            {rowQty !== 1 ? ` (₱${o.cost.toFixed(2)} × ${rowQty})` : ''}
            {o.isPrimary ? ' ★' : ''}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
