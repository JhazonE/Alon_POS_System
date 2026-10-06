'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { terminalSchema, TERMINAL_DEFAULTS, type TerminalFormValues } from './add-pos-terminal-types';

export function useAddPosTerminal(isOpen: boolean, onTerminalAdded: () => void) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);

  const form = useForm<TerminalFormValues>({
    resolver: zodResolver(terminalSchema),
    defaultValues: TERMINAL_DEFAULTS,
  });

  const fetchWarehouses = async () => {
    try {
      const res = await authFetch(getApiUrl('/warehouses?activeOnly=true'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) setWarehouses(result.data);
    } catch (e) { console.error('Error fetching warehouses:', e); }
  };

  const fetchNextOR = async () => {
    try {
      const res = await authFetch(getApiUrl('/pos-terminals?getNextOR=true'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success && result.data) form.setValue('orNextReference', result.data);
    } catch (e) { console.error('Error fetching next OR reference:', e); }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWarehouses();
      fetchNextOR();
    }
  }, [isOpen]);

  const onSubmit = async (values: TerminalFormValues) => {
    setIsSaving(true);
    try {
      const res = await authFetch(getApiUrl('/pos-terminals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Terminal Added', description: 'Terminal has been successfully added.' });
        form.reset();
        onTerminalAdded();
        return true;
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to add terminal.' });
        return false;
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to add terminal. Please try again.' });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { form, isSaving, warehouses, onSubmit };
}
