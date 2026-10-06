'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import type { PaymentMethod } from '@/lib/types';

const PAGE_SIZE = 10;

export function useManagePaymentMethods(isOpen: boolean, onChange?: () => void) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const { toast } = useToast();

  const fetchPaymentMethods = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(getApiUrl('/payment-methods?activeOnly=false'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setPaymentMethods(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch payment methods');
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load payment methods.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchPaymentMethods();
  }, [isOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleAddMethod = async (name: string, isReferenceRequired: boolean, pointsAmount?: number, currencyEquivalent?: number) => {
    const existing = paymentMethods.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      toast({ variant: 'destructive', title: 'Duplicate Payment Method', description: `A payment method with the name "${name}" already exists.` });
      throw new Error('Payment method already exists');
    }
    const response = await authFetch(getApiUrl('/payment-methods'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isReferenceRequired, pointsAmount, currencyEquivalent }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to add payment method');
    await fetchPaymentMethods();
    onChange?.();
  };

  const handleUpdate = () => { fetchPaymentMethods(); onChange?.(); };
  const handleDelete = () => { fetchPaymentMethods(); onChange?.(); };

  const filteredPaymentMethods = paymentMethods.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalPages = Math.ceil(filteredPaymentMethods.length / PAGE_SIZE);
  const paginatedPaymentMethods = filteredPaymentMethods.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return {
    paymentMethods,
    isLoading,
    searchQuery, setSearchQuery,
    currentPage, setCurrentPage,
    filteredPaymentMethods,
    totalPages,
    paginatedPaymentMethods,
    handleAddMethod,
    handleUpdate,
    handleDelete,
  };
}
