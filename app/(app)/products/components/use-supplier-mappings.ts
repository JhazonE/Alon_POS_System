'use client';

import { useFieldArray, type UseFormReturn } from 'react-hook-form';

import { generateSku } from '@/lib/sku';
import type { Supplier } from '@/lib/types';

import type { SupplierMappingValues } from '../add-product/product-schema';
import type { SupplierCostOption } from './supplier-cost-picker';

/**
 * Supplier-mapping form logic shared by the Add and Edit product forms: the
 * `supplierMappings` field array plus the add / remove / set-primary handlers
 * and the values derived from the watched rows (primary supplier id, and the
 * supplier costs a selling unit's Cost can be picked from).
 *
 * The host form must have a `supplierMappings` array field whose rows match
 * `supplierMappingSchema`, plus `brand` and `name` fields (used to pre-fill a
 * new row's supplier SKU).
 */
export function useSupplierMappings({
  form,
  suppliers,
  getDefaultFirstRop,
}: {
  // The two forms have different (but overlapping) zod-inferred value types.
  form: UseFormReturn<any, any, any>;
  suppliers: Supplier[];
  /**
   * Reorder point for the FIRST row added to an empty list. Edit passes the
   * product's existing reorder point so adding its first supplier does not
   * zero it; Add passes nothing (a new row starts at 0).
   */
  getDefaultFirstRop?: () => number;
}) {
  const {
    fields: supplierMappingFields,
    append: appendSupplierMapping,
    remove: removeSupplierMappingRow,
    replace: replaceSupplierMappings,
  } = useFieldArray({
    control: form.control,
    name: 'supplierMappings',
  });

  /**
   * The first row ever added defaults to primary — nothing else prompts the
   * user to pick one, and an un-primaried mapping list leaves
   * products.reorder_point at 0 while supplier_id still gets set from the
   * client's own primary-or-first-row fallback (actions.ts reads only
   * `.find(m => m.isPrimary)` for reorder_point), silently disagreeing with
   * what the mapping table itself stores.
   */
  const addSupplierMapping = () => {
    const existing = (form.getValues('supplierMappings') as SupplierMappingValues[] | undefined) ?? [];
    appendSupplierMapping({
      supplierId: '',
      // Pre-filled so every mapping row has a code; still editable so it can be
      // overwritten with the supplier's own SKU.
      supplierSku: generateSku(form.getValues('brand'), form.getValues('name')),
      leadTime: 0,
      rop: existing.length === 0 ? (getDefaultFirstRop?.() ?? 0) : 0,
      cost: undefined,
      isPrimary: existing.length === 0,
    } as any);
  };

  /** Removing the primary row promotes whichever row is now first. */
  const removeSupplierMapping = (index: number) => {
    const rows = (form.getValues('supplierMappings') as SupplierMappingValues[] | undefined) ?? [];
    const removedWasPrimary = rows[index]?.isPrimary;
    removeSupplierMappingRow(index);
    // After removal every later row shifts down one index, so "whichever
    // row is now first" is always index 0 of the remaining rows.
    if (removedWasPrimary && rows.length > 1) {
      form.setValue('supplierMappings.0.isPrimary', true, { shouldDirty: true });
    }
  };

  /** Marks one row primary and clears the flag on every other row. */
  const setPrimarySupplierRow = (index: number) => {
    const rows = (form.getValues('supplierMappings') as SupplierMappingValues[] | undefined) ?? [];
    rows.forEach((_, i) => {
      form.setValue(`supplierMappings.${i}.isPrimary`, i === index, { shouldDirty: true });
    });
  };

  const watchedSupplierMappings = form.watch('supplierMappings') as SupplierMappingValues[] | undefined;
  const primarySupplierId = (watchedSupplierMappings ?? []).find((m) => m?.isPrimary)?.supplierId
    ?? (watchedSupplierMappings ?? [])[0]?.supplierId;

  // Costs the user can pick from for a selling unit's Cost: one entry per
  // mapped supplier that has a cost > 0 (mapping rows without a chosen
  // supplier or cost are skipped).
  const supplierCostOptions: SupplierCostOption[] = (watchedSupplierMappings ?? []).flatMap((m, i) => {
    const cost = Number(m?.cost);
    if (!m?.supplierId || !Number.isFinite(cost) || cost <= 0) return [];
    const name = suppliers.find((s: Supplier) => s.id === m.supplierId)?.name ?? 'Supplier';
    return [{ key: `${i}`, name, cost, isPrimary: !!m.isPrimary }];
  });

  return {
    supplierMappingFields,
    addSupplierMapping,
    removeSupplierMapping,
    setPrimarySupplierRow,
    replaceSupplierMappings,
    primarySupplierId,
    supplierCostOptions,
  };
}
