'use client';

import { useState, useEffect } from 'react';
import { useCustomers } from '@/hooks/use-api';
import { getApiUrl, authFetch } from '@/lib/api-config';
import type { PaymentMethod, Warehouse, SalesPerson } from '@/lib/types';

export function useAddOrderData({ isOpen }: { isOpen: boolean }) {
  const { customers, refetch: refetchCustomers } = useCustomers();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);

  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [isLoadingSalesPersons, setIsLoadingSalesPersons] = useState(false);

  const fetchPaymentMethods = async () => {
    try {
      setIsLoadingPaymentMethods(true);
      const res = await authFetch(getApiUrl('/payment-methods?activeOnly=true'));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const result = await res.json();
      if (result.success) {
        setPaymentMethods(result.data.map((item: any) => ({
          id: item.id,
          name: item.name,
          isReferenceRequired: item.isReferenceRequired ?? false,
        })));
      }
    } catch (e) {
      console.error('Error fetching payment methods:', e);
    } finally {
      setIsLoadingPaymentMethods(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      setIsLoadingWarehouses(true);
      const res = await authFetch(getApiUrl('/warehouses?activeOnly=true'));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const result = await res.json();
      if (result.success) setWarehouses(result.data);
    } catch (e) {
      console.error('Error fetching warehouses:', e);
    } finally {
      setIsLoadingWarehouses(false);
    }
  };

  const fetchSalesPersons = async () => {
    try {
      setIsLoadingSalesPersons(true);
      const res = await authFetch(getApiUrl('/sales-persons?activeOnly=true'));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const result = await res.json();
      if (result.success) setSalesPersons(result.data);
    } catch (e) {
      console.error('Error fetching sales persons:', e);
    } finally {
      setIsLoadingSalesPersons(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      Promise.all([fetchPaymentMethods(), fetchWarehouses(), fetchSalesPersons()]);
    }
  }, [isOpen]);

  return {
    customers, refetchCustomers,
    paymentMethods, isLoadingPaymentMethods, fetchPaymentMethods,
    warehouses, isLoadingWarehouses, fetchWarehouses,
    salesPersons, isLoadingSalesPersons, fetchSalesPersons,
  };
}
