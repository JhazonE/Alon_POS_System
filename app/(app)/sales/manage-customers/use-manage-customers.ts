'use client';

import { useState } from 'react';
import { useCustomers } from '@/hooks/use-api';
import { getApiUrl, authFetch } from '@/lib/api-config';
import type { Customer } from '@/lib/types';

export function useManageCustomers() {
  const { customers, loading, error, refetch } = useCustomers();
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleAddCustomer = async (
    customerId: string, name: string, contactNumber: string,
    active: boolean, loyaltyPoints: number, paymentTerms: string,
    address: string, billingAddress: string, discount: number,
    creditLimit: number, priceLevelId?: string
  ) => {
    const response = await authFetch(getApiUrl('/customers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, name, contactNumber, active, loyaltyPoints, paymentTerms, address, billingAddress, discount, creditLimit, priceLevelId }),
    });
    if (!response.ok) throw new Error('Failed to add customer');
    refetch();
  };

  const handleEditCustomer = async (
    customerId: string, name: string, contactNumber: string,
    active: boolean, loyaltyPoints: number, paymentTerms: string,
    address: string, billingAddress: string, discount: number,
    creditLimit: number, priceLevelId?: string
  ) => {
    const response = await authFetch(getApiUrl(`/customers/${editingCustomer?.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, name, contactNumber, active, loyaltyPoints, paymentTerms, address, billingAddress, discount, creditLimit, priceLevelId }),
    });
    if (!response.ok) throw new Error('Failed to update customer');
    setEditingCustomer(null);
    refetch();
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    const response = await authFetch(getApiUrl(`/customers/${customer.id}`), { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete customer');
    refetch();
  };

  const handleToggleActive = async (customer: Customer) => {
    const response = await authFetch(getApiUrl(`/customers/${customer.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...customer, active: !customer.active }),
    });
    if (!response.ok) throw new Error('Failed to update customer');
    refetch();
  };

  return {
    customers, loading, error,
    editingCustomer, setEditingCustomer,
    showAddDialog, setShowAddDialog,
    isOpen, setIsOpen,
    handleAddCustomer,
    handleEditCustomer,
    handleDeleteCustomer,
    handleToggleActive,
  };
}
