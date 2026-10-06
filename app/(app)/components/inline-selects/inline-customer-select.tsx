'use client';

import { useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { InlineEditableSelect } from '../../products/components/inline-editable-select';
import type { Customer } from '@/lib/types';

interface InlineCustomerSelectProps {
  customers: Customer[];
  value: Customer | undefined;
  onChange: (customer: Customer | undefined) => void;
  onListChange: () => void | Promise<void>;
  placeholder?: string;
  triggerClassName?: string;
  itemClassName?: string;
}

export function InlineCustomerSelect({
  customers,
  value,
  onChange,
  onListChange,
  placeholder = 'Select a customer',
  triggerClassName,
  itemClassName,
}: InlineCustomerSelectProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Ang InlineEditableSelect mo-tawag ug onChange(id) dayon human sa add/rename.
  // Ang `customers` prop basin wala pa na-re-render, mao nga ang bag-ong record
  // gitipigan diri isip fallback para sa maong usa ka render.
  const pendingRef = useRef<Customer | null>(null);

  const handleSelect = (id: string) => {
    // pendingRef WINS when it matches the requested id: `customers` is a stale
    // render closure, and on rename it still holds the record under its OLD
    // name, so a bare `find` would silently discard the rename. Single-use —
    // cleared on every read regardless of whether it matched.
    const pending = pendingRef.current;
    pendingRef.current = null;
    const found = pending?.id === id ? pending : customers.find((c) => c.id === id);
    onChange(found ?? undefined);
  };

  const handleAdd = async (name: string) => {
    try {
      const id = `cust_${uuidv4().substring(0, 8)}`;
      const res = await authFetch(getApiUrl('/customers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Ang route mo-basa ug `customerId` gikan sa body ug mao ni ang mahimong id.
        body: JSON.stringify({ customerId: id, name }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to add customer');
      // Ang name-only customer walay ubang fields — tinuod nga NULL/0 sila sa DB.
      pendingRef.current = { id, name, contactNumber: '' };
      await onListChange();
      return id;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to add customer.' });
      return undefined;
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      // Ang customer PUT partial (key-presence), mao nga ang { name } ra dili
      // mo-hilabot sa payment_terms / credit_limit / loyalty_points.
      const res = await authFetch(getApiUrl(`/customers/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to rename customer');
      const existing = customers.find((c) => c.id === id);
      pendingRef.current = existing
        ? { ...existing, name }
        : { id, name, contactNumber: '' };
      await onListChange();
      return id;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Failed to rename customer.' });
      return undefined;
    }
  };

  return (
    <InlineEditableSelect
      items={customers}
      isLoading={false}
      value={value?.id ?? ''}
      onChange={handleSelect}
      open={open}
      onOpenChange={setOpen}
      placeholder={placeholder}
      addLabel="Add Customer"
      emptyLabel="No customers found"
      getId={(c) => c.id}
      getValue={(c) => c.id}
      getOptionLabel={(c) => c.name}
      getName={(c) => c.name}
      onAdd={handleAdd}
      onRename={handleRename}
      triggerClassName={triggerClassName}
      itemClassName={itemClassName}
    />
  );
}
