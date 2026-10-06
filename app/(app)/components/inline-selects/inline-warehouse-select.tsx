'use client';

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { InlineEditableSelect } from '../../products/components/inline-editable-select';
import type { Warehouse } from '@/lib/types';

interface InlineWarehouseSelectProps {
  warehouses: Warehouse[];
  value: string;
  onChange: (value: string) => void;
  onListChange: () => void | Promise<void>;
  placeholder?: string;
  triggerClassName?: string;
  itemClassName?: string;
}

export function InlineWarehouseSelect({
  warehouses,
  value,
  onChange,
  onListChange,
  placeholder = 'Select...',
  triggerClassName,
  itemClassName,
}: InlineWarehouseSelectProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleAdd = async (name: string) => {
    try {
      const id = `wh_${uuidv4().substring(0, 8)}`;
      const res = await authFetch(getApiUrl('/warehouses'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to add warehouse');
      await onListChange();
      return id;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to add warehouse.' });
      return undefined;
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      // PUT is a full-row update — fetch the record so location/contact/isMain survive the rename
      const getRes = await authFetch(getApiUrl(`/warehouses/${id}`));
      if (!getRes.ok) throw new Error('Failed to load warehouse');
      const existing = await getRes.json();
      if (!existing.success) throw new Error(existing.error || 'Failed to load warehouse');
      const res = await authFetch(getApiUrl(`/warehouses/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          location: existing.data.location,
          contactNumber: existing.data.contactNumber,
          isActive: !!existing.data.active,
          isMain: !!existing.data.isMain,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to rename warehouse');
      await onListChange();
      return id;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to rename warehouse.' });
      return undefined;
    }
  };

  return (
    <InlineEditableSelect
      items={warehouses}
      isLoading={false}
      value={value}
      onChange={onChange}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      addLabel="Add Warehouse"
      emptyLabel="No warehouses found"
      getId={(w) => String(w.id)}
      getValue={(w) => String(w.id)}
      getOptionLabel={(w) => w.name}
      getName={(w) => w.name}
      onAdd={handleAdd}
      onRename={handleRename}
      triggerClassName={triggerClassName}
      itemClassName={itemClassName}
    />
  );
}
