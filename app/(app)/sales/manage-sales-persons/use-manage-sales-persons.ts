'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import type { SalesPerson } from '@/lib/types';

export function useManageSalesPersons(isOpen: boolean, onChange?: () => void) {
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const fetchSalesPersons = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(getApiUrl('/sales-persons?activeOnly=false'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setSalesPersons(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch sales persons');
      }
    } catch (error) {
      console.error('Error fetching sales persons:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load sales persons.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchSalesPersons();
  }, [isOpen]);

  const handleAddSalesPerson = async () => {
    if (!newName.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Sales person name cannot be empty.' });
      return;
    }
    setIsAdding(true);
    try {
      const response = await authFetch(getApiUrl('/sales-persons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, contactNumber: newContact }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to add sales person');
      toast({ title: 'Sales Person Added', description: `Sales person "${newName}" has been successfully saved.` });
      setNewName('');
      setNewContact('');
      await fetchSalesPersons();
      onChange?.();
    } catch (error: any) {
      console.error('Error adding sales person:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add sales person.' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdate = () => { fetchSalesPersons(); onChange?.(); };
  const handleDelete = () => { fetchSalesPersons(); onChange?.(); };

  return {
    salesPersons,
    isLoading,
    newName, setNewName,
    newContact, setNewContact,
    isAdding,
    handleAddSalesPerson,
    handleUpdate,
    handleDelete,
  };
}
