'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { SalesPerson } from '@/lib/types';

export function useManageSalesPersons(isOpen: boolean, onChange?: () => void) {
  const { toast } = useToast();
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newContact, setNewContact] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchSalesPersons = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(getApiUrl('/sales-persons?activeOnly=false'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) setSalesPersons(result.data);
      else throw new Error(result.error);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load sales persons.' });
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = () => { fetchSalesPersons(); onChange?.(); };

  useEffect(() => { if (isOpen) fetchSalesPersons(); }, [isOpen]);

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Sales person name cannot be empty.' });
      return;
    }
    setIsAdding(true);
    try {
      const res = await authFetch(getApiUrl('/sales-persons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, contactNumber: newContact }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      toast({ title: 'Sales Person Added', description: `"${newName}" has been successfully saved.` });
      setNewName('');
      setNewContact('');
      refresh();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to add sales person.' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdate = async (id: string, name: string, contactNumber?: string) => {
    const res = await authFetch(getApiUrl(`/sales-persons/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contactNumber }),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Failed to update');
    refresh();
  };

  const handleDelete = async (sp: SalesPerson) => {
    if (!confirm(`Are you sure you want to delete "${sp.name}"? This cannot be undone.`)) return;
    try {
      const res = await authFetch(getApiUrl(`/sales-persons/${sp.id}`), { method: 'DELETE' });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      toast({ title: 'Sales Person Deleted', description: `"${sp.name}" has been deleted.` });
      refresh();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to delete sales person.' });
    }
  };

  return { salesPersons, isLoading, newName, setNewName, newContact, setNewContact, isAdding, handleAdd, handleUpdate, handleDelete };
}
