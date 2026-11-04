import { useState, useEffect, useCallback } from 'react';
import { Product, Sale, Customer, PaymentMethod, PurchaseOrder, Supplier } from '@/lib/types';
import { getApiUrl } from '@/lib/api-config';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { useQuery } from '@tanstack/react-query';

// Stable nga empty array — likayan ang bag-ong `[]` matag render nga makahimo ug
// unstable hook output kung gigamit isip effect/memo dependency (infinite-loop risk).
const EMPTY_PRODUCTS: Product[] = [];


export interface UseProductsResult {
  products: Product[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseSalesInvoicesResult {
  salesInvoices: Sale[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * `warehouseId` has three meanings, and only the first two existed before:
 *  - `undefined` or `''` : no warehouse filter (every existing caller; the
 *    sales-order/invoice selectors pass `''`/`undefined` until a warehouse is chosen).
 *  - a non-empty id      : restrict to that warehouse.
 *  - `null`              : "the caller needs a warehouse and has none that
 *    resolves". Sends a blank `warehouseId=`, which the server answers with an
 *    EMPTY result (see resolveWarehouseFilter). Without this the POS, whose
 *    terminal `location` may be blank/NULL, degraded to "no filter" and listed
 *    every warehouse's copy of every product.
 * `null` was not part of the old `string | undefined` type, so no existing
 * caller can be passing it.
 *
 * `enabled: false` holds the query (no request) and reports `loading: true`, so a
 * caller that is not ready to know its warehouse (POS before its terminal has
 * loaded) shows its loading state instead of an unfiltered or empty list.
 */
export function useProducts(search?: string, availability?: string, supplierId?: string, warehouseId?: string | null, expandSellingUnits?: boolean, enabled: boolean = true): UseProductsResult {
  const { data, isLoading, error, refetch: queryRefetch } = useQuery({
    // react-query hashes keys with JSON.stringify, which turns `undefined` into
    // `null`: used raw, "no filter" and "unresolved warehouse" would share one
    // cache entry, so one could be served the other's list. Keep them distinct.
    queryKey: ['products', search, availability, supplierId, warehouseId === null ? '__unresolved__' : warehouseId, expandSellingUnits],
    enabled,
    staleTime: 15 * 1000, // Consider data stale after 15 seconds
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (availability) params.append('availability', availability);
      if (supplierId) params.append('supplierId', supplierId);
      if (warehouseId === null) params.append('warehouseId', '');
      else if (warehouseId) params.append('warehouseId', warehouseId);
      if (expandSellingUnits) params.append('expandSellingUnits', 'true');
      params.append('limit', '100');

      const response = await fetch(getApiUrl(`/products?${params.toString()}`), {
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch products');
      }

      return result.data.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        additionalDescription: '',
        category: item.category || '',
        brand: item.brand || '',
        subcategory: '',
        // The product's primary supplier id. This was hard-coded to '' while
        // the API did not select it, so every consumer saw a product with no
        // supplier: the Restock flow's prefill reads this and silently did
        // nothing rather than failing visibly.
        supplier: item.supplier || '',
        stock: item.stock || 0,
        type: item.type,
        reorderPoint: item.reorderPoint || 0,
        avgDailySales: item.avgDailySales || 0,
        price: parseFloat(item.price) || 0,
        cost: item.cost ? parseFloat(item.cost) : undefined,
        barcode: item.barcode || '',
        imageUrl: '',
        imageHint: '',
        vatStatus: item.vat_status,
        availability: item.availability,
        unitOfMeasure: item.unitOfMeasure || item.unit_of_measure || '',
        incomeAccount: '',
        expenseAccount: '',
        priceLevels: item.priceLevels || [],
        sellingUnitId: item.sellingUnitId,
        isBaseUnit: item.isBaseUnit,
        qtyBase: item.qtyBase,
        baseStock: item.baseStock,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
    },
  });

  // react-query's refetch() ignores `enabled`, and useLiveRefresh calls it, so a
  // held query must not be woken by a live-refresh tick.
  const refetch = useCallback(() => { if (enabled) queryRefetch(); }, [enabled, queryRefetch]);

  useLiveRefresh(refetch);

  return {
    products: data || EMPTY_PRODUCTS,
    loading: isLoading || !enabled,
    error: error instanceof Error ? error.message : null, 
    refetch 
  };
}

export interface UseCustomersResult {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSalesInvoices(): UseSalesInvoicesResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['salesInvoices'],
    staleTime: 15 * 1000, // Consider data stale after 15 seconds
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
    queryFn: async () => {
      const response = await fetch(getApiUrl('/sales'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch sales invoices');
      return result.data || [];
    },
  });

  useLiveRefresh(refetch);

  return { salesInvoices: data || [], loading: isLoading, error: error instanceof Error ? error.message : null, refetch };
}

export function useCustomers(search?: string): UseCustomersResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['customers', search],
    staleTime: 20 * 1000, // Consider data stale after 20 seconds
    refetchInterval: 45 * 1000, // Auto-refetch every 45 seconds
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      params.append('limit', '100');

      const response = await fetch(getApiUrl(`/customers?${params.toString()}`), { cache: 'no-store' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch customers');

      return result.data.map((item: any) => ({
        id: item.id,
        name: item.name,
        contactNumber: item.contactNumber || '',
        active: item.active ?? true,
        salesPerson: item.salesPerson || '',
        salesArea: item.salesArea || '',
        salesGroup: item.salesGroup || '',
        loyaltyPoints: item.loyaltyPoints || 0,
        paymentTerms: item.paymentTerms || '',
        address: item.address || '',
        billingAddress: item.billingAddress || '',
        discount: item.discount || 0,
        creditLimit: item.creditLimit || 0,
        priceLevelId: item.priceLevelId || '',
      }));
    },
  });

  useLiveRefresh(refetch);

  return { customers: data || [], loading: isLoading, error: error instanceof Error ? error.message : null, refetch };
}

export interface UsePaymentMethodsResult {
  paymentMethods: PaymentMethod[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePaymentMethods(search?: string): UsePaymentMethodsResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['paymentMethods', search],
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      params.append('activeOnly', 'true');
      params.append('limit', '100');

      const response = await fetch(getApiUrl(`/payment-methods?${params.toString()}`), { cache: 'no-store' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch payment methods');

      return result.data.map((item: any) => ({
        id: item.id,
        name: item.name,
        isReferenceRequired: item.isReferenceRequired ?? false,
      }));
    },
  });

  useLiveRefresh(refetch);

  return { paymentMethods: data || [], loading: isLoading, error: error instanceof Error ? error.message : null, refetch };
}

export interface UsePurchaseOrdersResult {
  purchaseOrders: PurchaseOrder[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export function usePurchaseOrders(search?: string, status?: string, page: number = 1, limit: number = 10, startDate?: string, endDate?: string, supplierId?: string): UsePurchaseOrdersResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['purchaseOrders', search, status, page, limit, startDate, endDate, supplierId],
    staleTime: 20 * 1000, // Consider data stale after 20 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
    queryFn: async () => {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (status && status !== 'all') params.append('status', status);
      if (supplierId && supplierId !== 'all') params.append('supplierId', supplierId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await fetch(getApiUrl(`/purchase-orders?${params.toString()}`), { cache: 'no-store' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch purchase orders');

      return result;
    },
  });

  useLiveRefresh(refetch);

  return { 
    purchaseOrders: data?.data || [], 
    loading: isLoading, 
    error: error instanceof Error ? error.message : null, 
    refetch,
    pagination: data?.pagination || { total: 0, limit: 10, offset: 0, hasMore: false }
  };
}

export interface BusinessProfile {
  businessName: string;
  address: string;
  contactNumber: string;
  email: string;
  tin: string;
  logoPath: string;
}

export interface UseBusinessProfileResult {
  profile: BusinessProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBusinessProfile(): UseBusinessProfileResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['businessProfile'],
    staleTime: 60 * 1000, // Consider data stale after 60 seconds (settings change less frequently)
    refetchInterval: 120 * 1000, // Auto-refetch every 2 minutes
    queryFn: async () => {
      const response = await fetch(getApiUrl('/pos-settings'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch business profile');
      return result.data;
    },
  });

  useLiveRefresh(refetch);

  return { profile: data || null, loading: isLoading, error: error instanceof Error ? error.message : null, refetch };
}

export interface UseBadOrdersResult {
  badOrders: any[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export function useBadOrders(search?: string, status?: string, page: number = 1, limit: number = 10): UseBadOrdersResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['badOrders', search, status, page, limit],
    staleTime: 20 * 1000, // Consider data stale after 20 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
    queryFn: async () => {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (status && status !== 'all') params.append('status', status);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await fetch(getApiUrl(`/bad-orders?${params.toString()}`), { cache: 'no-store' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch bad orders');

      return result;
    },
  });

  useLiveRefresh(refetch);

  return { 
    badOrders: data?.data || [], 
    loading: isLoading, 
    error: error instanceof Error ? error.message : null, 
    refetch, 
    pagination: data?.pagination || { total: 0, limit: 10, offset: 0, hasMore: false }
  };
}

export interface BadOrderStatsData {
  totalOpenCases: number;
  totalValueAtRisk: number;
  actionRequired: number;
  topSuppliers: {
    supplierId: string;
    supplierName: string;
    openCount: number;
    totalValue: number;
  }[];
}

export function useBadOrderStats() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['badOrderStats'],
    staleTime: 20 * 1000, // Consider data stale after 20 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
    queryFn: async () => {
      const response = await fetch(getApiUrl('/bad-orders/stats'), { cache: 'no-store' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error('Failed to fetch stats');
      return result.data;
    },
  });

  useEffect(() => {
    const handleUpdate = () => refetch();
    window.addEventListener('bad-orders-updated', handleUpdate);
    window.addEventListener('stock-updated', handleUpdate);
    
    return () => {
      window.removeEventListener('bad-orders-updated', handleUpdate);
      window.removeEventListener('stock-updated', handleUpdate);
    };
  }, [refetch]);

  return { stats: data || null, loading: isLoading, refetch };
}

export interface UseSuppliersResult {
  suppliers: Supplier[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export function useSuppliers(search?: string, page: number = 1, limit: number = 100): UseSuppliersResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['suppliers', search, page, limit],
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    refetchInterval: 120 * 1000, // Auto-refetch every 2 minutes
    queryFn: async () => {
      const offset = (page - 1) * limit;
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const response = await fetch(getApiUrl(`/suppliers?${params.toString()}`), { cache: 'no-store' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch suppliers');

      return result;
    },
  });

  useLiveRefresh(refetch);

  return { 
    suppliers: data?.data || [], 
    loading: isLoading, 
    error: error instanceof Error ? error.message : null, 
    refetch, 
    pagination: data?.pagination || { total: 0, limit: 100, offset: 0, hasMore: false }
  };
}
