'use client';

import { useState } from 'react';

import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { InlineEditableSelect } from '../../products/components/inline-editable-select';
import type { SalesPerson } from '@/lib/types';

interface InlineSalesPersonSelectProps {
  salesPersons: SalesPerson[];
  value: string;
  onChange: (value: string) => void;
  onListChange: () => void | Promise<void>;
  placeholder?: string;
  triggerClassName?: string;
  itemClassName?: string;
}

export function InlineSalesPersonSelect({
  salesPersons,
  value,
  onChange,
  onListChange,
  placeholder = 'Select...',
  triggerClassName,
  itemClassName,
}: InlineSalesPersonSelectProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleAdd = async (name: string) => {
    try {
      const res = await authFetch(getApiUrl('/sales-persons'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to add sales person');
      await onListChange();
      return String(result.data.id);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to add sales person.' });
      return undefined;
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      // PUT is a full-row update — merge contact/active from the loaded list so they survive the rename
      const existing = salesPersons.find((p) => String(p.id) === id);
      const res = await authFetch(getApiUrl(`/sales-persons/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contactNumber: existing?.contactNumber ?? null,
          isActive: existing?.isActive ?? true,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to rename sales person');
      await onListChange();
      return id;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to rename sales person.' });
      return undefined;
    }
  };

  return (
    <InlineEditableSelect
      items={salesPersons}
      isLoading={false}
      value={value}
      onChange={onChange}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      addLabel="Add Sales Person"
      emptyLabel="No sales persons found"
      getId={(p) => String(p.id)}
      getValue={(p) => String(p.id)}
      getOptionLabel={(p) => p.name}
      getName={(p) => p.name}
      onAdd={handleAdd}
      onRename={handleRename}
      triggerClassName={triggerClassName}
      itemClassName={itemClassName}
    />
  );
}
