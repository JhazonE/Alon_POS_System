'use client';

import { Tag } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  priceLevels: { id: string; name: string; isDefault?: boolean }[];
  /** The level actually pricing the cart (may come from the customer). */
  activeLevelId: string;
  /** The cashier's pick. '' means "follow the customer / default". */
  selectedPriceLevelId: string;
  setSelectedPriceLevelId: (id: string) => void;
  /** True when the customer carries their own level, which outranks the pick. */
  lockedToCustomer: boolean;
};

/**
 * Lets the cashier price the cart at another level — the walk-in who buys ten
 * and should earn the wholesale tier without being registered as a customer.
 *
 * Switching levels does not force that level's prices onto every line:
 * `resolvePriceLevel` falls back to the default level and then the base price
 * when the chosen level has no row the quantity qualifies for, so a 10+ tier
 * leaves quantities 1-9 at the normal price.
 *
 * Rendered only when `enablePriceLevelSwitch` is on in POS setup. Disabled
 * while a customer with their own level is selected, so the control never
 * implies it can undercut that customer's contract pricing.
 */
export function PosPriceLevelSelect({
  priceLevels,
  activeLevelId,
  selectedPriceLevelId,
  setSelectedPriceLevelId,
  lockedToCustomer,
}: Props) {
  // Nothing to switch between until a second level exists.
  if (priceLevels.length < 2) return null;

  const defaultLevel = priceLevels.find((l) => l.isDefault) || priceLevels[0];

  return (
    <div className="flex items-center gap-1.5">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
      <Select
        value={lockedToCustomer ? activeLevelId : selectedPriceLevelId || defaultLevel.id}
        onValueChange={(id) => setSelectedPriceLevelId(id === defaultLevel.id ? '' : id)}
        disabled={lockedToCustomer}
      >
        <SelectTrigger
          className="h-8 w-[150px] text-xs"
          title={
            lockedToCustomer
              ? "This customer has their own price level"
              : 'Price level for this sale'
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {priceLevels.map((level) => (
            <SelectItem key={level.id} value={level.id} className="text-xs">
              {level.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
