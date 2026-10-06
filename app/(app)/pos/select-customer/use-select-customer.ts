'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Customer } from '@/lib/types';
import { getApiUrl, authFetch } from '@/lib/api-config';

type Options = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSelectCustomer: (customer: Customer | null) => void;
};

export function useSelectCustomer({
  isOpen,
  onOpenChange,
  onSelectCustomer
}: Options) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCustomers = useCallback(async (query = '') => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '50');
      if (query) {
        params.append('search', query);
      }
      const response = await authFetch(getApiUrl(`/customers?${params.toString()}`));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setCustomers(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchCustomers();
    }
  }, [isOpen, fetchCustomers]);

  const handleSelect = useCallback((customer: Customer) => {
    onSelectCustomer(customer);
    onOpenChange(false);
  }, [onSelectCustomer, onOpenChange]);

  const handleCustomerAdded = useCallback((newCustomer: Customer) => {
    setCustomers((prev) => {
      const exists = prev.some(c => c.id === newCustomer.id);
      if (exists) return prev;
      return [newCustomer, ...prev];
    });
    handleSelect(newCustomer);
  }, [handleSelect]);

  return {
    customers,
    isLoading,
    isAddCustomerOpen,
    setIsAddCustomerOpen,
    searchQuery,
    setSearchQuery,
    fetchCustomers,
    handleSelect,
    handleCustomerAdded,
  };
}
