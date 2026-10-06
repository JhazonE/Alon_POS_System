'use client';

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { InlineEditableSelect } from '../../products/components/inline-editable-select';
import type { Supplier } from '@/lib/types';

interface InlineSupplierSelectProps {
  suppliers: Supplier[];
  value: string;
  onChange: (value: string) => void;
  onListChange: () => void | Promise<void>;
  placeholder?: string;
  triggerClassName?: string;
  itemClassName?: string;
}

export function InlineSupplierSelect({
  suppliers,
  value,
  onChange,
  onListChange,
  placeholder = 'Select...',
  triggerClassName,
  itemClassName,
}: InlineSupplierSelectProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleAdd = async (name: string) => {
    try {
      const id = `sup_${uuidv4().substring(0, 8)}`;
      const res = await authFetch(getApiUrl('/suppliers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to add supplier');
      await onListChange();
      return id;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to add supplier.' });
      return undefined;
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      // Ang supplier PUT partial (COALESCE), mao nga ang { name } ra dili mo-wipe sa ubang columns.
      const res = await authFetch(getApiUrl(`/suppliers/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to rename supplier');
      await onListChange();
      return id;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to rename supplier.' });
      return undefined;
    }
  };

  return (
    <InlineEditableSelect
      items={suppliers}
      isLoading={false}
      value={value}
      onChange={onChange}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      addLabel="Add Supplier"
      emptyLabel="No suppliers found"
      getId={(s) => String(s.id)}
      getValue={(s) => String(s.id)}
      getOptionLabel={(s) => s.name}
      getName={(s) => s.name}
      onAdd={handleAdd}
      onRename={handleRename}
      triggerClassName={triggerClassName}
      itemClassName={itemClassName}
    />
  );
}
