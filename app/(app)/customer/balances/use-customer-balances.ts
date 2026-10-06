'use client';

import { useState, useMemo, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';

export interface CustomerWithBalance {
  id: string;
  name: string;
  contactNumber: string;
  paymentTerms?: string;
  balance: number;
  invoiceCount: number;
}

export function useCustomerBalances() {
  const [searchTerm, setSearchTerm] = useState('');
  const [customersWithBalances, setCustomersWithBalances] = useState<CustomerWithBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchCustomerBalances = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(getApiUrl('/customers/balances'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();

      if (result.success) {
        setCustomersWithBalances(result.data);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load customer balances',
        });
      }
    } catch (error) {
      console.error('Error fetching customer balances:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load customer balances',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomerBalances();
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customersWithBalances;
    const term = searchTerm.toLowerCase();
    return customersWithBalances.filter(c =>
      c.name.toLowerCase().includes(term) || c.contactNumber.includes(term)
    );
  }, [customersWithBalances, searchTerm]);

  return {
    searchTerm,
    setSearchTerm,
    customersWithBalances,
    isLoading,
    filteredCustomers,
  };
}
