import type { UseFormReturn } from 'react-hook-form';

type CalculatePriceLevelPrice = (
  levelId: string,
  calculationBase: 'retail' | 'cost',
  priceLevels: any[],
  formPrice: number,
  formCost: number,
) => number;

interface UseSellingUnitPricingParams {
  form: UseFormReturn<any>;
  priceLevels: any[];
  baseUnitIndex: number;
  /** Each form hook exports its own copy, so it is passed in. */
  calculatePriceLevelPrice: CalculatePriceLevelPrice;
}

/** Two amounts are "the same" if they differ by less than half a centavo. */
const SAME_AMOUNT = 0.005;

const round2 = (n: number) => parseFloat(n.toFixed(2));

const isEmptyCost = (v: unknown) => v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v));

/**
 * Price/Cost derivation shared by the Add and Edit Product "Selling Units" tabs.
 *
 * Everything here is driven by user input only — none of it runs on load, so
 * opening a product never overwrites its stored Costs or prices.
 *
 * The auto-suggestion rule is the same everywhere: a derived value (a non-base
 * row's Retail or Cost) is only replaced when it is empty or still equals the
 * previous suggestion, so anything the user typed by hand is never overwritten.
 */
export function useSellingUnitPricing({
  form,
  priceLevels,
  baseUnitIndex,
  calculatePriceLevelPrice,
}: UseSellingUnitPricingParams) {
  const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];
  const defaultIsRetailBased = !!defaultLevel && (defaultLevel.calculationBase || 'retail') === 'retail';

  const getUnits = (): any[] => form.getValues('sellingUnits' as any) || [];

  /** A row's Retail (default-level price), 0 when empty/invalid. */
  const getRetail = (row: any): number => {
    const n = Number(row?.prices?.[defaultLevel?.id]?.price);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  /** The base row's current Cost, 0 when empty/invalid. */
  const getBaseCost = (): number => Number(getUnits()[baseUnitIndex]?.cost ?? 0) || 0;

  /**
   * Recomputes a row's other price levels from its default-level (Retail) price
   * and its Cost. Retail-based levels follow the Retail price, cost-based levels
   * follow the Cost. Pass `retailOverride` for a Retail keystroke that has not
   * reached the form yet. A level whose basis is empty/0 is left untouched
   * rather than zeroed; the results stay editable.
   */
  const recalcOtherLevels = (index: number, retailOverride?: number) => {
    if (!defaultIsRetailBased) return;
    const units = getUnits();
    const row = units[index];
    if (!row) return;
    const typedRetail = retailOverride ?? Number(row.prices?.[defaultLevel.id]?.price);
    const retail = Number.isFinite(typedRetail) && typedRetail > 0 ? typedRetail : 0;

    // A row's own Cost is already per that unit (one Box); only the base cost
    // fallback is multiplied up to this unit.
    const qty = row.isBase ? 1 : Number(row.qtyBase) || 0;
    const baseCost = Number(units[baseUnitIndex]?.cost ?? 0) || 0;
    const ownCost = isEmptyCost(row.cost) ? NaN : Number(row.cost);
    const rowCost = Number.isFinite(ownCost) ? ownCost : baseCost * qty;

    priceLevels.forEach((level: any) => {
      if (level.id === defaultLevel.id) return;
      const calculationBase = level.calculationBase || 'retail';
      const basis = calculationBase === 'cost' ? rowCost : retail;
      if (!(basis > 0)) return;
      const value = calculatePriceLevelPrice(level.id, calculationBase, priceLevels, retail, rowCost);
      if (!Number.isFinite(value)) return;
      form.setValue(
        `sellingUnits.${index}.prices.${level.id}.price` as any,
        round2(value),
        { shouldDirty: true },
      );
    });
  };

  /**
   * A non-base row's Retail is suggested as the base Retail x its Qty Base (one
   * Box of 12 is priced off 12 Pieces). It only replaces a Retail that is empty
   * or still equals the previous suggestion (`prevBaseRetail` x `prevQty`).
   * Returns true when the row's Retail was written (its other levels then need
   * a recalc).
   */
  const syncDerivedRetail = (index: number, prevBaseRetail: number, prevQty: number): boolean => {
    if (!defaultIsRetailBased) return false;
    const units = getUnits();
    const row = units[index];
    if (!row || row.isBase) return false;
    const qty = Number(row.qtyBase) || 0;
    const baseRetail = getRetail(units[baseUnitIndex]);
    if (!(qty > 0) || !(baseRetail > 0)) return false;
    const current = getRetail(row);
    if (current !== 0 && Math.abs(current - prevBaseRetail * prevQty) >= SAME_AMOUNT) return false;
    form.setValue(
      `sellingUnits.${index}.prices.${defaultLevel.id}.price` as any,
      round2(baseRetail * qty),
      { shouldDirty: true },
    );
    return true;
  };

  /**
   * A non-base row's Cost is suggested as base Cost x Qty Base. `prevBaseCost`
   * and `prevQty` describe the previous suggestion; the Cost is only replaced
   * when it is empty or still equals that (a hand-typed Cost is never touched).
   * When the new suggestion is not computable (no base Cost / no Qty Base) an
   * auto-suggested Cost is cleared again rather than left stale.
   */
  const syncDerivedCost = (index: number, prevBaseCost: number, prevQty: number): boolean => {
    const units = getUnits();
    const row = units[index];
    if (!row || row.isBase) return false;
    const qty = Number(row.qtyBase) || 0;
    const baseCost = Number(units[baseUnitIndex]?.cost ?? 0) || 0;
    const empty = isEmptyCost(row.cost);
    if (!empty && Math.abs(Number(row.cost) - prevBaseCost * prevQty) >= SAME_AMOUNT) return false;
    if (qty > 0 && baseCost > 0) {
      const next = round2(baseCost * qty);
      if (!empty && Number(row.cost) === next) return false;
      form.setValue(`sellingUnits.${index}.cost` as any, next, { shouldDirty: true });
      return true;
    }
    if (empty) return false;
    form.setValue(`sellingUnits.${index}.cost` as any, undefined, { shouldDirty: true });
    return true;
  };

  /**
   * Call AFTER a Cost changed (typed or picked) on `index`. Pass the base Cost
   * captured BEFORE the change (`getBaseCost()`). The row's own levels are
   * recomputed; when it is the base row, every non-base row's auto Cost follows
   * (hand-typed Costs are kept) and its levels are recomputed too.
   */
  const onCostChange = (index: number, prevBaseCost: number) => {
    recalcOtherLevels(index);
    if (index !== baseUnitIndex) return;
    getUnits().forEach((u, j) => {
      if (!u || u.isBase) return;
      syncDerivedCost(j, prevBaseCost, Number(u.qtyBase) || 0);
      recalcOtherLevels(j);
    });
  };

  /**
   * Call AFTER a non-base row's Qty Base changed; `prevQty` is its value before.
   * Suggests the row's Cost (base Cost x qty) and Retail (base Retail x qty)
   * where they are still auto, then recomputes ALL its levels (Retail- and
   * Cost-based) — even when the base has no Retail yet or the row's Retail was
   * hand-typed.
   */
  const onQtyBaseChange = (index: number, prevQty: number) => {
    const units = getUnits();
    if (!units[index] || units[index].isBase) return;
    syncDerivedCost(index, getBaseCost(), prevQty);
    syncDerivedRetail(index, getRetail(units[baseUnitIndex]), prevQty);
    recalcOtherLevels(index);
  };

  /**
   * Call AFTER a default-level (Retail) price was typed on `index` (`next` is the
   * typed value, `prevBaseRetail` the base Retail captured BEFORE the change).
   * The row's other levels follow; when it is the base row, every non-base row
   * whose Retail was still auto follows too (and only those rows are recomputed,
   * so a hand-typed level price is not overwritten by an unrelated base edit).
   */
  const onRetailChange = (index: number, next: number, prevBaseRetail: number) => {
    recalcOtherLevels(index, next);
    if (index !== baseUnitIndex) return;
    getUnits().forEach((u, j) => {
      if (!u || u.isBase) return;
      if (syncDerivedRetail(j, prevBaseRetail, Number(u.qtyBase) || 0)) recalcOtherLevels(j);
    });
  };

  return {
    defaultLevel,
    getRetail,
    getBaseCost,
    recalcOtherLevels,
    syncDerivedRetail,
    syncDerivedCost,
    onCostChange,
    onQtyBaseChange,
    onRetailChange,
  };
}
