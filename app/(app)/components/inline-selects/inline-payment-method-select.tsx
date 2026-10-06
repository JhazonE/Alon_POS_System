'use client';

import { useState } from 'react';

import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { InlineEditableSelect } from '../../products/components/inline-editable-select';
import type { PaymentMethod } from '@/lib/types';

interface InlinePaymentMethodSelectProps {
  paymentMethods: PaymentMethod[];
  value: string;
  onChange: (value: string) => void;
  onListChange: () => void | Promise<void>;
  placeholder?: string;
  triggerClassName?: string;
  itemClassName?: string;
}

export function InlinePaymentMethodSelect({
  paymentMethods,
  value,
  onChange,
  onListChange,
  placeholder = 'Select...',
  triggerClassName,
  itemClassName,
}: InlinePaymentMethodSelectProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleAdd = async (name: string) => {
    try {
      const duplicate = paymentMethods.find((m) => m.name.toLowerCase() === name.toLowerCase());
      if (duplicate) throw new Error(`A payment method named "${name}" already exists.`);
      const res = await authFetch(getApiUrl('/payment-methods'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isReferenceRequired: false }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to add payment method');
      await onListChange();
      return name;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to add payment method.' });
      return undefined;
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      // PUT is a full-row update — fetch the record so reference/points settings survive the rename
      const getRes = await authFetch(getApiUrl(`/payment-methods/${id}`));
      if (!getRes.ok) throw new Error('Failed to load payment method');
      const existing = await getRes.json();
      if (!existing.success) throw new Error(existing.error || 'Failed to load payment method');
      const res = await authFetch(getApiUrl(`/payment-methods/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          isActive: !!existing.data.isActive,
          isReferenceRequired: !!existing.data.isReferenceRequired,
          pointsAmount: existing.data.pointsAmount,
          currencyEquivalent: existing.data.currencyEquivalent,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to rename payment method');
      await onListChange();
      return name;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to rename payment method.' });
      return undefined;
    }
  };

  return (
    <InlineEditableSelect
      items={paymentMethods}
      isLoading={false}
      value={value}
      onChange={onChange}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      addLabel="Add Payment Method"
      emptyLabel="No payment methods found"
      getId={(m) => String(m.id)}
      getValue={(m) => m.name}
      getOptionLabel={(m) => m.name}
      getName={(m) => m.name}
      onAdd={handleAdd}
      onRename={handleRename}
      triggerClassName={triggerClassName}
      itemClassName={itemClassName}
    />
  );
}
