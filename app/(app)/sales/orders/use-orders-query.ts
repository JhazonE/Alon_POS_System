'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import { appendSessionUid, getSessionUid } from '@/lib/session-uid';
import type { Sale, SalesPerson, Customer } from '@/lib/types';
import type { OrderFilters } from './use-orders-filters';

export function useOrdersQuery({ currentPage, limit, filters, searchTerm }: {
  currentPage: number;
  limit: number;
  filters: OrderFilters;
  searchTerm: string;
}) {
  const { data: ordersResult, isLoading, refetch } = useQuery({
    queryKey: ['salesOrders', currentPage, limit, filters, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
        ...filters,
        ...(searchTerm ? { search: searchTerm } : {}),
      });
      Array.from(params.keys()).forEach(key => { if (!params.get(key)) params.delete(key); });
      const res = await fetch(getApiUrl(`/sales/orders?${params.toString()}`));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error('Failed to fetch sales orders');
      return data;
    },
    placeholderData: (prev) => prev,
  });

  const sales: Sale[] = ordersResult?.data || [];
  const summary = ordersResult?.summary || { totalCount: 0, totalAmount: 0 };
  const totalPages: number = ordersResult?.pagination?.totalPages ?? 1;

  return { sales, summary, totalPages, isLoading, refetch };
}

export function useSalesPersonsQuery() {
  return useQuery<SalesPerson[]>({
    queryKey: ['salesPersonsForOrders'],
    queryFn: async () => {
      const res = await fetch(getApiUrl('/sales-persons?activeOnly=true'));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      return data.success ? data.data : [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCustomersQuery() {
  return useQuery<Customer[]>({
    queryKey: ['customersForOrders'],
    queryFn: async () => {
      const res = await fetch(getApiUrl('/customers'));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      return data.success ? data.data : [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrdersMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // DELETE carries no body, so the uid travels on the query string.
      const params = new URLSearchParams();
      appendSessionUid(params);
      const qs = params.toString();
      const res = await fetch(getApiUrl(`/sales/orders/${id}${qs ? `?${qs}` : ''}`), { method: 'DELETE' });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete order');
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Order Deleted', description: 'The sales order has been deleted and stock returned to inventory.' });
      queryClient.invalidateQueries({ queryKey: ['salesOrders'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const makeDeliveryMutation = useMutation({
    mutationFn: async (sale: Sale) => {
      const res = await fetch(getApiUrl(`/sales/orders/${sale.id}/deliver`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: getSessionUid() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to deliver order');
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Order Delivered', description: 'Stock deducted and status set to Delivered.' });
      queryClient.invalidateQueries({ queryKey: ['salesOrders'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const makeInvoiceMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(getApiUrl('/sales/invoices'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, uid: getSessionUid() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create invoice');
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Invoice Created', description: 'Invoice has been created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['salesOrders'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  return { deleteMutation, makeDeliveryMutation, makeInvoiceMutation };
}
