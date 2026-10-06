'use client';
import { authFetch } from '@/lib/api-config';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useQuery } from '@tanstack/react-query';
import type { SalesData } from './by-date-types';

type QueryParams = {
  dateRange: DateRange | undefined;
  terminal: string;
  interval: string;
  paymentType: string;
  currentPage: number;
  limit: number;
};

export function useByDateQuery({ dateRange, terminal, interval, paymentType, currentPage, limit }: QueryParams) {
  const [totalPages, setTotalPages] = useState(1);

  const { data: rawData, isLoading } = useQuery({
    queryKey: [
      'salesByDate',
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
      terminal,
      interval,
      paymentType,
      currentPage,
      limit,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.from) params.append('startDate', format(dateRange.from, 'yyyy-MM-dd'));
      if (dateRange?.to) params.append('endDate', format(dateRange.to, 'yyyy-MM-dd'));
      if (terminal && terminal !== 'all') params.append('terminalId', terminal);
      if (interval) params.append('interval', interval);
      if (paymentType && paymentType !== 'all') params.append('paymentType', paymentType);
      params.append('page', currentPage.toString());
      params.append('limit', limit.toString());
      const res = await authFetch(`/api/sales/by-date?${params.toString()}`);
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (rawData?.success && rawData.pagination) {
      if (rawData.pagination.totalPages !== totalPages)
        setTotalPages(rawData.pagination.totalPages);
    }
  }, [rawData]);

  const salesData: SalesData[] = rawData?.success ? rawData.data : [];

  return { salesData, isLoading, totalPages };
}
