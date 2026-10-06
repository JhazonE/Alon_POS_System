'use client';

import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useQuery } from '@tanstack/react-query';
import { getApiUrl, authFetch } from '@/lib/api-config';
import type { CashTransfer, Cashier } from './cash-transfer-types';

type QueryParams = {
  dateRange: DateRange | undefined;
  terminalId: string;
  cashierId: string;
  type: string;
  currentPage: number;
  pageSize: number;
};

export function useCashTransferQuery({ dateRange, terminalId, cashierId, type, currentPage, pageSize }: QueryParams) {
  const { data: cashiersData } = useQuery({
    queryKey: ['cashiers'],
    queryFn: async () => {
      const res = await authFetch(getApiUrl('/users'));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((user: any): Cashier => ({
          uid: user.uid,
          display_name: user.displayName,
          username: user.email,
        }));
      }
      return [];
    },
  });

  const { data: cashTransferResponse, isLoading, refetch } = useQuery({
    queryKey: [
      'cash-transfer',
      dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : null,
      dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : null,
      terminalId,
      cashierId,
      type,
      currentPage,
      pageSize,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.from) params.append('startDate', format(dateRange.from, 'yyyy-MM-dd'));
      if (dateRange?.to) params.append('endDate', format(dateRange.to, 'yyyy-MM-dd'));
      if (terminalId && terminalId !== 'all') params.append('terminalId', terminalId);
      if (cashierId && cashierId !== 'all') params.append('cashierId', cashierId);
      if (type && type !== 'all') params.append('type', type);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());
      const res = await authFetch(getApiUrl(`/pos/cash-transfer?${params.toString()}`));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error('Failed to fetch cash transfers');
      return json;
    },
    placeholderData: (prev) => prev,
  });

  const cashiers: Cashier[] = cashiersData || [];
  const transfers: CashTransfer[] = cashTransferResponse?.data || [];
  const summary = cashTransferResponse?.summary || { totalCashIn: 0, totalCashOut: 0 };
  const totalPages: number = cashTransferResponse?.pagination?.totalPages || 1;
  const totalCount: number = cashTransferResponse?.pagination?.totalCount || 0;

  return { cashiers, transfers, summary, totalPages, totalCount, isLoading, refetch };
}
