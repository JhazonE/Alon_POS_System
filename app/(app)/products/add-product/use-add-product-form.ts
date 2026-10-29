'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { calculateMarkupPercentage, calculateSuggestedPrice } from '@/lib/purchase-utils';
import { applyPriceLevelAdjustment } from '@/lib/price-level-calc';
import { dispatchStockUpdate } from '@/hooks/use-live-refresh';
import { logActivity } from '@/lib/client-activity-logger';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import { getSessionUid } from '@/lib/session-uid';
import { generateSku } from '@/lib/sku';
import { Category, Brand, UnitOfMeasure, Supplier, TaxRate, SystemSettings } from '@/lib/types';
import type { ProductType } from '@/lib/product-type';

import {
  getCategories,
  getBrands,
  getSubcategories,
  getUnitsOfMeasure,
  addProduct,
  getSuppliers,
  getBranchWarehouses,
  getShelfLocations,
  getDepartments,
} from '../actions';
import { useSupplierMappings } from '../components/use-supplier-mappings';
import { productSchema, withFirstPrimary, type ProductFormValues, type SellingUnitValues, type SupplierMappingValues } from './product-schema';

function getCurrentUid(): string {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem('mock-user-session');
    if (!raw) return 'system';
    const session = JSON.parse(raw);
    return session.uid || session.userId || 'system';
  } catch {
    return 'system';
  }
}

/**
 * Calculate the price for a price level override.
 * Applies the price level's percentage adjustment to the selected base price (retail or cost).
 */
// Re-exported from lib so the selling-units tab can keep importing it from
// here; the implementation moved to lib/price-level-calc.ts (it is pure, and
// the edit form needs the same function).
export { calculatePriceLevelPrice } from '@/lib/price-level-calc';

export interface UseAddProductFormProps {
  /**
   * `productId` is the new product's id; it is undefined (with
   * `pendingApproval: true`) when PRODUCT_CREATE approval is on and the product
   * was queued instead of created.
   */
  onProductAdded?: (productId?: string, result?: { pendingApproval: boolean }) => void;
  productOptions?: any;
  onOptionsRefresh?: () => void;
  /** Controlled open state. Omit both to let the dialog manage its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Seeds the Product Name field each time the dialog opens. */
  defaultName?: string;
  /** Seeds the Suppliers tab with this supplier as the primary mapping on each open. */
  defaultSupplierId?: string;
}

export function useAddProductForm({
  onProductAdded,
  productOptions: externalProductOptions,
  onOptionsRefresh,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultName,
  defaultSupplierId,
}: UseAddProductFormProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (val: boolean) => {
    controlledOnOpenChange?.(val);
    setInternalOpen(val);
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Standard vs Service. The old parent/child `productType` selector is gone —
  // a product's units now live in its `sellingUnits` array, not in sibling rows.
  const [itemType, setItemType] = useState<ProductType>('standard');
  const { toast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [isLoadingSubcategories, setIsLoadingSubcategories] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [unitsOfMeasure, setUnitsOfMeasure] = useState<UnitOfMeasure[]>([]);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  // The warehouses the picker offers: the active ones of the user's own branch
  // (head office, and an unguarded null cookie, get every branch's). Same action
  // and same uid-keyed cache entry as the products-table tab strip: the QueryClient
  // is a module-level singleton that survives sign-out -> sign-in, so an unkeyed
  // query would let the next user on this terminal inherit the previous user's
  // branch's list. Held until the dialog opens; `staleTime` is left at its default
  // (0) so each open refetches and a warehouse added elsewhere shows up.
  const queryClient = useQueryClient();
  const [sessionUid] = useState(() => getSessionUid());
  const branchWarehousesKey = ['branchWarehouses', sessionUid] as const;
  const {
    data: branchWarehouses,
    isLoading: isLoadingWarehouses,
    isError: isWarehousesError,
    refetch: refetchBranchWarehouses,
  } = useQuery({
    queryKey: branchWarehousesKey,
    queryFn: () => getBranchWarehouses(),
    enabled: isOpen,
    refetchOnWindowFocus: false,
  });
  const warehouses = branchWarehouses?.warehouses ?? [];
  // A stable dependency for the default-selection effect below: the array
  // itself is a new identity each render.
  const warehouseIdsKey = warehouses.map((w: { id: string }) => w.id).join(',');
  // `true` only once the server says head office (or an unguarded null cookie).
  const isHeadOffice = branchWarehouses?.isHeadOffice === true;
  /**
   * Whether the warehouse list actually RESOLVED. The min-one-warehouse rule is
   * gated on this, not on the falsy `isHeadOffice` default: while the list is
   * loading, and especially when the fetch FAILED, `isHeadOffice` is false and
   * the picker is empty, so gating on it alone dead-ends a head-office user —
   * the rule blocks submission, there is no warehouse to pick and no way out.
   * With no resolved list the rule is not applied; the server still refuses a
   * branch caller's warehouse-less write, so nothing is let through unguarded,
   * and `warehousesError` below gives the user a retry instead of a dead form.
   */
  const warehousesResolved = branchWarehouses !== undefined;
  const warehouseGateRef = useRef({ isHeadOffice, warehousesResolved });
  warehouseGateRef.current = { isHeadOffice, warehousesResolved };

  const [shelfLocations, setShelfLocations] = useState<any[]>([]);
  const [isLoadingShelfLocations, setIsLoadingShelfLocations] = useState(false);
  const [priceLevels, setPriceLevels] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  const [isLoadingPriceLevels, setIsLoadingPriceLevels] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);

  const [selects, setSelects] = useState({
    categories: false,
    brands: false,
    subcategories: false,
    suppliers: false,
    warehouses: false,
    shelfLocations: false,
    units: false,
    departments: false,
  });

  useEffect(() => {
    fetch(getApiUrl('/pos-settings'))
      .then(res => res.json())
      .then(data => {
        if (data.success) {
            setSystemSettings(data.data);
        }
      })
      .catch(err => console.error('Failed to fetch settings', err));
  }, []);

  const form = useForm<ProductFormValues>({
    resolver: async (values, context, options) => {
      const result = await zodResolver(productSchema)(values, context, options);
      // A branch user must pick at least one warehouse: the server refuses a
      // NULL warehouse for a branch caller ("A product must stay in a warehouse
      // of your branch"), which the user could not otherwise trace to this tab.
      // The schema deliberately accepts an empty list (head office may create a
      // warehouse-less product), so the rule lives here, where isHeadOffice is
      // known. A Service carries no warehouse, so it is exempt.
      const v = values as { itemType?: string; warehouses?: unknown[] };
      const gate = warehouseGateRef.current;
      const needsWarehouse =
        v.itemType === 'standard' &&
        // Only once the list has resolved: a loading or failed list leaves
        // isHeadOffice false with an empty picker, which would dead-end a head
        // office user with a rule they cannot satisfy.
        gate.warehousesResolved &&
        !gate.isHeadOffice &&
        (!Array.isArray(v.warehouses) || v.warehouses.length === 0);
      if (!needsWarehouse) return result;
      return {
        values: {},
        errors: {
          ...(result.errors ?? {}),
          warehouses: { type: 'required', message: 'Select at least one warehouse for this product.' },
        },
      } as typeof result;
    },
    defaultValues: {
      itemType: 'standard',
      name: '',
      brand: '',
      department: '',
      description: '',
      additionalDescription: '',
      category: '',
      subcategory: '',
      supplier: '',
      warehouses: [],
      shelfLocationIds: [],
      unitOfMeasure: '',
      reorderPoint: 0,
      price: 0,
      cost: 0,
      barcode: '',
      sellingUnits: [
        { unitName: '', qtyBase: 1, barcode: '', cost: undefined, isBase: true, prices: {} },
      ],
      supplierMappings: [],
      earnsPoints: true,
      isPerishable: false,
    },
  });

  const { fields: sellingUnitFields, append: appendSellingUnit, remove: removeSellingUnit } = useFieldArray({
    control: form.control as any,
    name: 'sellingUnits',
  });

  const {
    supplierMappingFields, addSupplierMapping, removeSupplierMapping, setPrimarySupplierRow,
    replaceSupplierMappings,
    primarySupplierId, supplierCostOptions,
  } = useSupplierMappings({ form, suppliers });

  const watchedSellingUnits = form.watch('sellingUnits' as any) as SellingUnitValues[] | undefined;
  const baseUnitIndex = Math.max(0, (watchedSellingUnits ?? []).findIndex((u) => u?.isBase));
  const baseUnitName = (watchedSellingUnits ?? [])[baseUnitIndex]?.unitName || '';

  /** Appends a blank non-base row. qtyBase is deliberately left empty. */
  const addSellingUnit = () =>
    appendSellingUnit({
      unitName: '',
      qtyBase: undefined as unknown as number,
      barcode: '',
      cost: undefined,
      isBase: false,
      prices: {},
    } as any);

  /** EAN-8: 7 random digits + 1 check digit. */
  const generateUnitBarcode = (index: number) => {
    const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10));
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
    const check = (10 - (sum % 10)) % 10;
    form.setValue(`sellingUnits.${index}.barcode` as any, [...digits, check].join(''), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const watchedPrice = form.watch('price');
  const formErrors = form.formState.errors as any;
  const tabErrors = {
    basic: !!(formErrors.name || formErrors.brand || formErrors.description || formErrors.category),
    // unitOfMeasure can still error here — a Service edits it on this tab.
    inventory: !!(formErrors.unitOfMeasure || formErrors.warehouses),
    sellingUnits: !!formErrors.sellingUnits,
    suppliers: !!formErrors.supplierMappings,
  };

  // State for selected price level (for automatic price calculation)
  const [selectedPriceLevelId, setSelectedPriceLevelId] = useState<string>('');

  // Use pre-loaded data from parent when available
  useEffect(() => {
    if (externalProductOptions) {
      setCategories(externalProductOptions.categories || []);
      setSubcategories(externalProductOptions.subcategories || []);
      setBrands(externalProductOptions.brands || []);
      setUnitsOfMeasure(externalProductOptions.units || []);
      setSuppliers(externalProductOptions.suppliers || []);
      setShelfLocations(externalProductOptions.shelfLocations || []);
      setDepartments(externalProductOptions.departments || []);
      setPriceLevels(externalProductOptions.priceLevels || []);
      setTaxRates(externalProductOptions.taxRates || []);
    }
  }, [externalProductOptions]);

  useEffect(() => {
    if (isOpen) {
      form.reset();

      // Applied after the reset (not folded into it) so the form's own
      // defaults stay blank — a later reset after submit then can't keep them.
      if (defaultName) form.setValue('name', defaultName);
      if (defaultSupplierId) {
        replaceSupplierMappings([{
          supplierId: defaultSupplierId,
          supplierSku: generateSku(undefined, defaultName),
          leadTime: 0,
          rop: 0,
          cost: undefined,
          isPrimary: true,
        }]);
      }

      // Set default tax rate if available and valid
      if (taxRates.length > 0) {
        const defaultTax = taxRates.find(t => t.isDefault) || taxRates[0];
        form.setValue('vatStatus', defaultTax.name);
      }
    }
  }, [isOpen, form]);

  // Switching to Service clears every stock-side field. Without this, values
  // typed while Standard was selected stay in form state and fail the service
  // branch's z.undefined() checks on submit, with no visible field to fix.

  /**
   * Every warehouse the picker offers starts SELECTED, each at 0.
   *
   * Creating a product in all of the branch's warehouses is the common case;
   * picking a subset is the exception, so the form opens on the common case and
   * the user unticks rather than ticks. Opening stock is still typed per
   * warehouse — the default is the SELECTION, never a quantity.
   *
   * Applied when the list RESOLVES, not at reset, because the list is fetched:
   * at reset time there is nothing to select. It must therefore not clobber a
   * choice the user has already made, so it runs once per dialog opening and
   * only while the collection is still untouched (`isDirty` is false and the
   * collection is empty). `appliedForOpenRef` holds the open it ran for, so a
   * refetch mid-edit — adding a warehouse inline refetches — does not re-select
   * warehouses the user has just unticked.
   *
   * A service carries no warehouse at all; the itemType effect below clears the
   * collection, and the `itemType` guard here keeps this from putting it back.
   */
  const warehouseDefaultAppliedRef = useRef(false);
  useEffect(() => {
    // Reset on CLOSE so the next opening defaults again. Doing this in the same
    // effect that applies the default (rather than during render) keeps the
    // flag's lifetime tied to the dialog's, including the very first mount,
    // which already has isOpen true.
    if (!isOpen) {
      warehouseDefaultAppliedRef.current = false;
      return;
    }
    if (warehouseDefaultAppliedRef.current) return;
    if (!warehousesResolved || warehouses.length === 0) return;
    if (itemType === 'service') return;
    const current = form.getValues('warehouses');
    if (Array.isArray(current) && current.length > 0) return;
    warehouseDefaultAppliedRef.current = true;
    form.setValue(
      'warehouses',
      withFirstPrimary(warehouses.map((w: { id: string }) => ({ warehouseId: w.id, stock: 0 }))),
      { shouldDirty: false },
    );
    // `warehouses` is a fresh array identity on every render (it is derived from
    // the query data), so the effect is keyed on the warehouse IDS instead —
    // otherwise it re-runs constantly and the ref is the only thing stopping it.
  }, [isOpen, warehousesResolved, warehouseIdsKey, itemType, form]);

  useEffect(() => {
    // Must run for BOTH branches: this is the only place that writes the
    // discriminator into react-hook-form state. `itemType` otherwise lives
    // only in React state, so the zod resolver would always see 'standard'
    // and serviceProductSchema (and its required-cost rule) would never run.
    form.setValue('itemType', itemType);

    if (itemType === 'service') {
      form.setValue('stock', 0);
      form.setValue('reorderPoint', 0);
      form.setValue('cost', 0);
      form.setValue('department', undefined);
      form.setValue('supplier', undefined);
      form.setValue('warehouse', undefined);
      form.setValue('warehouses', []);
      form.setValue('shelfLocationIds', undefined);
      form.setValue('sellingUnits' as any, undefined);
      form.setValue('isPerishable', undefined);
      form.setValue('supplierMappings' as any, undefined);
    } else {
      // Switching back from Service: the array above was cleared, so restore a
      // blank base row or the Selling Units tab renders with nothing in it.
      const current = form.getValues('sellingUnits' as any) as SellingUnitValues[] | undefined;
      if (!current || current.length === 0) {
        form.setValue('sellingUnits' as any, [
          { unitName: '', qtyBase: 1, barcode: '', cost: undefined, isBase: true, prices: {} },
        ]);
      }
      // A Service run may have written unitOfMeasure via its own select; a
      // standard product takes it from the base row on submit, so clear it.
      form.setValue('unitOfMeasure', '');
    }
  }, [itemType, form]);

  // Cost now lives on the base selling-unit row (index 0 — defaultValues and
  // addSellingUnit always keep the base row first; nothing in this form
  // reorders rows), not the top-level `cost` field, which no input writes to
  // for a standard product anymore.
  const watchedBaseCost = form.watch('sellingUnits.0.cost' as any) as number | undefined;
  const watchedCategoryName = form.watch('category');
  const watchedSubcategoryName = form.watch('subcategory');
  const watchedBrandName = form.watch('brand');

  const [markupSource, setMarkupSource] = useState<string | null>(null);

  useEffect(() => {
    if (!systemSettings?.enableAutomaticMarkup) {
        setMarkupSource(null);
        return;
    }

    const { markup, source } = calculateMarkupPercentage(
        {
            category: watchedCategoryName,
            subcategory: watchedSubcategoryName,
            brand: watchedBrandName,
            supplierId: primarySupplierId
        },
        systemSettings,
        categories,
        subcategories,
        brands,
        suppliers
    );

    if (source) {
      setMarkupSource(`Calculated from ${source} Markup (${markup}%)`);
      if (watchedBaseCost && watchedBaseCost > 0) {
          // Calculate base price and default level price
          const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];
          const suggestedMainPrice = calculateSuggestedPrice(watchedBaseCost, markup, 0, defaultLevel);

          if (defaultLevel) {
            form.setValue(
              `sellingUnits.0.prices.${defaultLevel.id}.price` as any,
              parseFloat(suggestedMainPrice.toFixed(2)),
            );
          }
      }
    } else {
      setMarkupSource(null);
    }

  }, [watchedBaseCost, watchedCategoryName, watchedSubcategoryName, watchedBrandName, primarySupplierId, categories, subcategories, brands, suppliers, form, priceLevels, systemSettings]);

  // Auto-update main price when a price level is selected
  useEffect(() => {
    if (selectedPriceLevelId) {
      const selectedLevel = priceLevels.find((l: any) => l.id === selectedPriceLevelId);
      if (selectedLevel) {
        const cost = form.getValues('cost');
        if (cost && cost > 0) {
          // Get category/brand markup
          const category = categories.find(c => c.name === form.getValues('category'));
          const subcategory = subcategories.find(s => s.name === form.getValues('subcategory'));
          const brand = brands.find(b => b.name === form.getValues('brand'));

          let markup = 0;
          // Parse markupPriority if it's a string (from DB)
          let priority: string[] = ["subcategory", "category", "brand", "supplier"];
          if (systemSettings?.markupPriority) {
            if (typeof systemSettings.markupPriority === 'string') {
              try {
                priority = JSON.parse(systemSettings.markupPriority);
              } catch (e) {
                console.error('Failed to parse markupPriority:', e);
              }
            } else if (Array.isArray(systemSettings.markupPriority)) {
              priority = systemSettings.markupPriority;
            }
          }

          for (const type of priority) {
            if (type === 'subcategory' && subcategory?.markupPercentage !== undefined && subcategory.markupPercentage !== null) {
              markup = Number(subcategory.markupPercentage);
              break;
            } else if (type === 'category' && category?.markupPercentage !== undefined && category.markupPercentage !== null) {
              markup = Number(category.markupPercentage);
              break;
            } else if (type === 'brand' && brand?.markupPercentage !== undefined && brand.markupPercentage !== null) {
              markup = Number(brand.markupPercentage);
              break;
            }
          }

          const globalDefault = systemSettings?.defaultMarkupPercentage !== undefined ? Number(systemSettings.defaultMarkupPercentage) : undefined;
          if (!markup && globalDefault !== undefined) {
            markup = globalDefault;
          }

          const basePrice = cost * (1 + markup / 100);

          // Calculate price based on selected level
          let finalPrice;
          const selectedLevelMarkup = selectedLevel.percentageAdjustment ?? 0;
          if (selectedLevel.calculationBase === 'cost') {
             finalPrice = cost * (1 + selectedLevelMarkup / 100);
          } else {
             // Retail Base
             if (selectedLevelMarkup === 0 && selectedLevel.name?.toLowerCase() === 'retail') {
                 finalPrice = basePrice;
             } else {
                 finalPrice = basePrice * (1 + selectedLevelMarkup / 100);
             }
          }

          form.setValue('price', parseFloat(finalPrice.toFixed(2)));

          // ALSO fill every price-level column on the BASE selling unit row.
          // Non-base rows are left alone — their price is a per-unit decision,
          // not a derived multiple, and overwriting a typed value would be the
          // same silent-default failure mode the qtyBase rule guards against.
          const units = (form.getValues('sellingUnits' as any) as SellingUnitValues[] | undefined) ?? [];
          const idx = Math.max(0, units.findIndex((u) => u?.isBase));
          priceLevels.forEach((levelDef: any) => {
            let levelPrice: number;
            const levelMarkup = levelDef.percentageAdjustment ?? 0;

            if (levelDef.calculationBase === 'cost') {
              levelPrice = parseFloat((cost * (1 + levelMarkup / 100)).toFixed(2));
            } else {
              // Retail Base
              if (levelMarkup === 0 && levelDef.name?.toLowerCase() === 'retail') {
                levelPrice = parseFloat(basePrice.toFixed(2));
              } else {
                levelPrice = parseFloat((basePrice * (1 + levelMarkup / 100)).toFixed(2));
              }
            }
            form.setValue(`sellingUnits.${idx}.prices.${levelDef.id}.price` as any, levelPrice);
          });
        }
      }
    }
  }, [selectedPriceLevelId, priceLevels, form, categories, subcategories, brands, systemSettings]);

  async function onSubmit(values: ProductFormValues) {
    setIsSubmitting(true);

    try {
      const uid = getCurrentUid();

      // The base selling unit is the single source of truth for the product's
      // scalar price/cost/barcode/unit_of_measure columns. Mirror them here so
      // the ~100+ call sites that read products.* directly keep working;
      // addProduct re-derives the same values server-side as the
      // authoritative pass.
      const units = (values as any).sellingUnits as SellingUnitValues[] | undefined;
      const baseUnit = units?.find((u) => u.isBase) ?? units?.[0];
      const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];

      let mirroredPrice = values.price;
      if (baseUnit && defaultLevel) {
        const entered = Number(baseUnit.prices?.[defaultLevel.id]?.price ?? NaN);
        if (Number.isFinite(entered) && entered > 0) {
          mirroredPrice = entered;
        } else {
          // No explicit default-level price typed — fall back to the level's
          // own adjustment applied to the row's cost/price basis, the same
          // rule the old Price Levels tab used when a level was picked.
          const basis = (defaultLevel.calculationBase || 'retail') === 'cost'
            ? Number(baseUnit.cost ?? values.cost ?? 0)
            : Number(values.price ?? 0);
          mirroredPrice = applyPriceLevelAdjustment(
            defaultLevel.adjustmentType,
            defaultLevel.percentageAdjustment,
            basis,
          );
        }
      }

      const primaryMapping = (values as any).supplierMappings?.find((m: SupplierMappingValues) => m.isPrimary)
        ?? (values as any).supplierMappings?.[0];

      const result = await addProduct(
        {
          ...values,
          itemType,
          supplier: primaryMapping?.supplierId,
          price: mirroredPrice,
          cost: baseUnit?.cost ?? values.cost,
          barcode: baseUnit?.barcode ?? values.barcode,
          unitOfMeasure: baseUnit?.unitName || values.unitOfMeasure,
          image: `https://picsum.photos/seed/${encodeURIComponent(values.name)}/400/300`,
        } as any,
        uid,
      );

      if (result.success && (result as any).pendingApproval) {
        toast({
          title: 'Submitted for Approval',
          description: `${values.name} was submitted and is awaiting approval.`,
        });
        form.reset();
        onProductAdded?.(undefined, { pendingApproval: true });
        setIsOpen(false);
      } else if (result.success) {
        // Fire and forget - don't block form submission on activity logging
        logActivity({
          action: 'CREATE',
          module: 'PRODUCTS',
          description: `Added product: ${values.name} — Category: ${values.category || 'N/A'}`,
          referenceId: result.productId,
        }).catch(() => {
          // Silently ignore activity logging errors
        });
        toast({
          title: 'Product Added',
          description: `${values.name} has been successfully added.`,
        });
        form.reset();
        onProductAdded?.(result.productId, { pendingApproval: false });
        dispatchStockUpdate();
        setIsOpen(false);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.message,
        });
      }
    } catch (error) {
      console.error('Error adding product:', error);
      toast({
        variant: 'destructive',
        title: 'Uh oh! Something went wrong.',
        description: 'There was a problem adding the product. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Refresh callbacks wired to the "Manage …" dialogs.
  const refreshBrands = () => getBrands().then(setBrands);
  const refreshDepartments = () => getDepartments().then(setDepartments);
  const refreshCategories = () => getCategories().then(setCategories);
  const refreshSubcategories = () => getSubcategories().then(setSubcategories);
  const refreshSuppliers = () => getSuppliers().then(setSuppliers);
  // Refetch the branch-scoped list, publish it to the shared cache (so the tab
  // strip sees it too) and hand it back so a caller can look a new warehouse up.
  const refreshWarehouses = async () => {
    const fresh = await getBranchWarehouses();
    queryClient.setQueryData(branchWarehousesKey, fresh);
    return fresh.warehouses;
  };
  const refreshShelfLocations = () => getShelfLocations().then(setShelfLocations);
  const refreshUnits = () => getUnitsOfMeasure().then(setUnitsOfMeasure);

  return {
    // dialog + submit state
    isOpen, setIsOpen,
    isSubmitting,
    itemType, setItemType,
    form,

    // option data + loading flags
    categories, isLoadingCategories,
    subcategories, isLoadingSubcategories,
    brands, isLoadingBrands,
    departments, isLoadingDepartments,
    unitsOfMeasure, isLoadingUnits,
    suppliers, isLoadingSuppliers,
    warehouses, isLoadingWarehouses, isHeadOffice,
    // The picker needs to tell "no warehouses" apart from "the list failed":
    // the second needs a retry, not an empty state the user cannot act on.
    isWarehousesError, retryWarehouses: refetchBranchWarehouses,
    shelfLocations, isLoadingShelfLocations,
    priceLevels, isLoadingPriceLevels,
    taxRates,
    systemSettings,

    // nested popover/select open state
    selects, setSelects,

    // field arrays
    sellingUnitFields, appendSellingUnit, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,
    supplierMappingFields, addSupplierMapping, removeSupplierMapping, setPrimarySupplierRow,

    // derived values
    tabErrors,
    selectedPriceLevelId, setSelectedPriceLevelId,
    markupSource,
    supplierCostOptions,

    // handlers
    onSubmit,
    generateUnitBarcode,
    refreshBrands,
    refreshDepartments,
    refreshCategories,
    refreshSubcategories,
    refreshSuppliers,
    refreshWarehouses,
    refreshShelfLocations,
    refreshUnits,
  };
}

export type AddProductFormController = ReturnType<typeof useAddProductForm>;
