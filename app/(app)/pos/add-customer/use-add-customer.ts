'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';

type Options = {
  onCustomerAdded: (customer: any) => void;
  onOpenChange: (open: boolean) => void;
};

export function useAddCustomer({ onCustomerAdded, onOpenChange }: Options) {
  const [name, setName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const resetForm = () => {
    setName('');
    setContactNumber('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Customer name is required.' });
      return;
    }

    setIsSaving(true);
    try {
      const newCustomer = {
        customerId: 'CUST-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        name,
        contactNumber,
        address: '',
        active: true,
        paymentTerms: 'Due on receipt',
      };

      const response = await authFetch(getApiUrl('/customers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomer),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to create customer');

      toast({ title: 'Success', description: 'Customer added successfully.' });
      onCustomerAdded({ ...newCustomer, id: newCustomer.customerId });
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to add customer. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  return { name, setName, contactNumber, setContactNumber, isSaving, handleSave, handleOpenChange };
}
