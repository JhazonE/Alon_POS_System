'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { calculateMarkupPercentage, calculateSuggestedPrice } from '@/lib/purchase-utils';
import { applyPriceLevelAdjustment } from '@/lib/price-level-calc';
import { dispatchStockUpdate } from '@/hooks/use-live-refresh';
import { logActivity } from '@/lib/client-activity-logger';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import { Category, Product, Brand, UnitOfMeasure, Supplier, TaxRate, SystemSettings } from '@/lib/types';

import {
  updateProduct,
  getBrands,
  getCategories,
  getSubcategories,
  getUnitsOfMeasure,
  getSuppliers,
  getWarehouses,
  getShelfLocations,
  getDepartments,
} from '../actions';
import { productSchema, type ProductFormValues, type SellingUnitValues } from './product-schema';

/**
 * Calculate the price for a price level override.
 * Applies the price level's percentage adjustment to the selected base price (retail or cost).
 */
export function calculatePriceLevelPrice(
  levelId: string,
  calculationBase: 'retail' | 'cost',
  priceLevels: any[],
  formPrice: number,
  formCost: number
): number {
  if (!levelId) return 0;

  const level = priceLevels.find(l => l.id === levelId);
  if (!level) return 0;

  const basePrice = calculationBase === 'retail' ? formPrice : formCost;
  if (basePrice === undefined || basePrice === null) return 0;

  return applyPriceLevelAdjustment(level.adjustmentType, level.percentageAdjustment, basePrice);
}

/**
 * Maps a product's stored selling units onto the form shape.
 *
 * A service never gets units (its tab is hidden and updateProduct leaves the
 * selling-unit tables alone when the field is absent). A standard product that
 * somehow has no rows yet — one created before this feature, or one loaded by a
 * caller that does not hydrate them (e.g. the inventory detail page's
 * `<EditProductDialog product={product} />` at
 * app/(app)/inventory/[productId]/page.tsx:110) — gets a synthesized base row
 * from its scalar columns, so the tab is never blank and saving cannot
 * silently wipe it.
 */
export function toFormSellingUnits(product: Product): any[] | undefined {
  if (product?.type === 'service') return undefined;

  const stored = product?.sellingUnits ?? [];
  if (stored.length > 0) {
    return stored
      .slice()
      .sort((a, b) => (a.isBase === b.isBase ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0) : a.isBase ? -1 : 1))
      .map((u) => ({
        id: u.id,
        unitName: u.unitName,
        qtyBase: Number(u.qtyBase),
        barcode: u.barcode ?? '',
        cost: u.cost ?? undefined,
        isBase: !!u.isBase,
        prices: u.prices ?? {},
      }));
  }

  return [
    {
      unitName: product?.unitOfMeasure ?? '',
      qtyBase: 1,
      barcode: product?.barcode ?? '',
      cost: product?.cost ?? undefined,
      isBase: true,
      prices: {},
    },
  ];
}

export interface UseEditProductFormProps {
  product: Product;
  onProductUpdated?: () => void;
  productOptions?: any;
  onOptionsRefresh?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function useEditProductForm({
  product,
  onProductUpdated,
  productOptions: externalProductOptions,
  onOptionsRefresh,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: UseEditProductFormProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = externalOnOpenChange !== undefined ? externalOnOpenChange : setInternalOpen;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [shelfLocations, setShelfLocations] = useState<any[]>([]);
  const [isLoadingShelfLocations, setIsLoadingShelfLocations] = useState(false);
  const [priceLevels, setPriceLevels] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [isLoadingPriceLevels, setIsLoadingPriceLevels] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
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

  // Guard to prevent auto-calculation on initial form reset
  const isInitialLoad = useState(true);

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

  // Use pre-loaded data from parent when available
  useEffect(() => {
    if (externalProductOptions) {
      setBrands(externalProductOptions.brands || []);
      setCategories(externalProductOptions.categories || []);
      setSubcategories(externalProductOptions.subcategories || []);
      setUnits(externalProductOptions.units || []);
      setSuppliers(externalProductOptions.suppliers || []);
      setDepartments(externalProductOptions.departments || []);
      setWarehouses(externalProductOptions.warehouses || []);
      setShelfLocations(externalProductOptions.shelfLocations || []);
      setPriceLevels(externalProductOptions.priceLevels || []);
      setTaxRates(externalProductOptions.taxRates || []);
      setIsLoadingPriceLevels(false);
    }
  }, [externalProductOptions]);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      ...product,
      category: product.category ?? '',
      brand: product.brand ?? '',
      department: product.department ?? '',
      cost: product.cost ?? 0,
      barcode: product.barcode ?? '',
      additionalDescription: product.additionalDescription ?? '',
      incomeAccount: product.incomeAccount ?? '',
      expenseAccount: product.expenseAccount ?? '',
      warehouse: product.warehouse ?? '',
      shelfLocationIds: product.shelfLocationIds || [],
      subcategory: product.subcategory ?? '', // Handle null
      supplier: product.supplier ?? '', // Handle null
      unitOfMeasure: product.unitOfMeasure ?? '', // Handle null
      sellingUnits: toFormSellingUnits(product),
      vatStatus: product.vatStatus || 'YES (Subject to 12% VAT)',
      availability: product.availability || 'Available',
      earnsPoints: product.earnsPoints ?? true,
      isPerishable: product.isPerishable ?? false,
      description: product.description ?? '',
    },
  });

  const { fields: sellingUnitFields, append: appendSellingUnit, remove: removeSellingUnit } = useFieldArray({
    control: form.control as any,
    name: 'sellingUnits',
  });

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

  const selectedSupplierId = form.watch('supplier');
  const costValue = form.watch('cost');
  const watchedCost = form.watch('cost');
  const watchedPrice = form.watch('price');
  const watchedCategoryName = form.watch('category');
  const watchedSubcategoryName = form.watch('subcategory');
  const watchedBrandName = form.watch('brand');
  const formErrors = form.formState.errors as any;
  const tabErrors = {
    basic: !!(formErrors.name || formErrors.brand || formErrors.sku || formErrors.description || formErrors.category),
    // unitOfMeasure can still error here — a Service edits it on this tab.
    inventory: !!(formErrors.unitOfMeasure),
    sellingUnits: !!formErrors.sellingUnits,
  };

  // State for selected price level (for automatic price calculation)
  const [selectedPriceLevelId, setSelectedPriceLevelId] = useState<string>('');

  useEffect(() => {
    if (product && isOpen) {
      const sanitizedProduct = {
          ...product,
          category: product.category ?? '',
          brand: product.brand ?? '',
          cost: product.cost ?? 0,
          barcode: product.barcode ?? '',
          additionalDescription: product.additionalDescription ?? '',
          incomeAccount: product.incomeAccount ?? '',
          expenseAccount: product.expenseAccount ?? '',
          warehouse: product.warehouseId ?? product.warehouse ?? '',
          shelfLocationIds: product.shelfLocationIds || [],
          reorderPoint: product.reorderPoint ?? 0,
          subcategory: product.subcategory ?? '', // Handle null
          supplier: product.supplier ?? '', // Handle null
          unitOfMeasure: product.unitOfMeasure ?? '', // Handle null
          sellingUnits: toFormSellingUnits(product),
          vatStatus: product.vatStatus || 'YES (Subject to 12% VAT)',
          availability: product.availability || 'Available',
          earnsPoints: product.earnsPoints ?? true,
          isPerishable: product.isPerishable ?? false,
          description: product.description ?? '',
          department: product.department ?? '',
      };
      form.reset(sanitizedProduct);
    }
    // priceLevels (level definitions) is deliberately NOT a dependency here —
    // this effect's job is resetting the form for a newly opened product; if
    // level definitions arrive after that reset already ran, this session
    // just won't have the auto-seeded row (closing/reopening picks it up).
    // Depending on it would re-run form.reset (and wipe any in-progress edit
    // across every tab) any time productOptions happens to refresh elsewhere
    // while this dialog is open — a materially worse failure than a missed
    // seed on the rare cold-load race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, isOpen, form]);

  const [markupSource, setMarkupSource] = useState<string | null>(null);

  // Track initial load to prevent overwriting existing prices
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isOpen) {
        // Reset initialization state when dialog opens
        setIsInitialized(false);
        // Small timeout to allow form.reset to complete before allowing calculations
        const timer = setTimeout(() => setIsInitialized(true), 1000);
        return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    // Skip if not initialized or automation disabled
    if (!isInitialized || !systemSettings?.enableAutomaticMarkup) {
        setMarkupSource(null);
        return;
    }

    const { markup, source } = calculateMarkupPercentage(
        {
            category: watchedCategoryName,
            subcategory: watchedSubcategoryName,
            brand: watchedBrandName,
            supplierId: selectedSupplierId
        },
        systemSettings,
        categories,
        subcategories,
        brands,
        suppliers
    );

    if (source) {
      setMarkupSource(`Calculated from ${source} Markup (${markup}%)`);
      if (watchedCost && watchedCost > 0) {
          // Calculate base price and default level price
          const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];
          const suggestedMainPrice = calculateSuggestedPrice(watchedCost, markup, 0, defaultLevel);

          form.setValue('price', parseFloat(suggestedMainPrice.toFixed(2)));
      }
    } else {
      setMarkupSource(null);
    }
  }, [watchedCost, watchedCategoryName, watchedSubcategoryName, watchedBrandName, selectedSupplierId, categories, subcategories, brands, suppliers, form, priceLevels, systemSettings, isInitialized]);

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
          // Non-base rows keep whatever the user typed.
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

  const saveChanges = async (values: ProductFormValues) => {
    try {
      setIsSubmitting(true);

      // The base selling unit is the single source of truth for the product's
      // scalar price/cost/barcode/unit_of_measure columns. Mirror them here;
      // updateProduct re-derives the same values server-side as the
      // authoritative pass. A service submits no sellingUnits, so its own
      // Inventory-tab values pass through untouched.
      const units = (values as any).sellingUnits as SellingUnitValues[] | undefined;
      const baseUnit = units?.find((u) => u.isBase) ?? units?.[0];
      const defaultLevel = priceLevels.find((l: any) => l.isDefault) || priceLevels[0];

      let mirroredPrice = values.price;
      if (baseUnit && defaultLevel) {
        const entered = Number(baseUnit.prices?.[defaultLevel.id]?.price ?? NaN);
        if (Number.isFinite(entered) && entered > 0) mirroredPrice = entered;
      }

      const result = await updateProduct(product.id, {
        ...values,
        price: mirroredPrice,
        cost: baseUnit ? baseUnit.cost : values.cost,
        barcode: baseUnit ? baseUnit.barcode : values.barcode,
        unitOfMeasure: baseUnit?.unitName || values.unitOfMeasure,
      } as any);

      if (result.success) {
        await logActivity({
          action: 'UPDATE',
          module: 'PRODUCTS',
          description: `Updated product: ${values.name || product.name} (SKU: ${values.sku || product.sku})`,
          referenceId: String(product.id),
        });
        toast({
          title: 'Product Updated',
          description: result.message,
        });
        onProductUpdated?.();
        dispatchStockUpdate();
        setIsOpen(false);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error Updating Product',
          description: result.message,
        });
      }
    } catch (error) {
      console.error('Error in EditProductDialog:', error);
      toast({
        variant: 'destructive',
        title: 'Error Updating Product',
        description: 'An unexpected error occurred. Check console for details.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Refresh callbacks wired to the "Manage …" dialogs.
  const refreshBrands = () => getBrands().then(setBrands);
  const refreshDepartments = () => getDepartments().then(setDepartments);
  const refreshCategories = () => getCategories().then(setCategories);
  const refreshSubcategories = () => getSubcategories().then(setSubcategories);
  const refreshSuppliers = () => getSuppliers().then(setSuppliers);
  const refreshWarehouses = () => getWarehouses().then(setWarehouses);
  const refreshShelfLocations = () => getShelfLocations().then(setShelfLocations);
  const refreshUnits = () => getUnitsOfMeasure().then(setUnits);

  return {
    // the product being edited (read-only stock display, etc.)
    product,

    // dialog + submit state
    isOpen, setIsOpen,
    isSubmitting,
    form,

    // option data + loading flags
    brands,
    categories,
    subcategories,
    units,
    suppliers,
    warehouses,
    shelfLocations, isLoadingShelfLocations,
    priceLevels, isLoadingPriceLevels,
    departments, isLoadingDepartments,
    taxRates,
    systemSettings,

    // nested popover/select open state
    selects, setSelects,

    // field arrays
    sellingUnitFields, appendSellingUnit, addSellingUnit, removeSellingUnit,
    baseUnitIndex, baseUnitName,

    // watched / derived values
    selectedSupplierId,
    tabErrors,
    selectedPriceLevelId, setSelectedPriceLevelId,
    markupSource,

    // handlers
    generateUnitBarcode,
    saveChanges,
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

export type EditProductFormController = ReturnType<typeof useEditProductForm>;
