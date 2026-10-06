'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { transferSchema, type TransferFormValues } from './cash-transfer-types';

type Options = {
  isOpen: boolean;
  shiftId: string | null;
  terminalId: string;
  userId: string;
  onOpenChange: (open: boolean) => void;
};

export function useCashTransfer({ isOpen, shiftId, terminalId, userId, onOpenChange }: Options) {
  const [transferType, setTransferType] = useState<'pickup' | 'deposit'>('pickup');
  const { toast } = useToast();

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { amount: '' as unknown as number, reason: '' },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
      setTransferType('pickup');
    }
  }, [isOpen, form]);

  async function onSubmit(values: TransferFormValues) {
    try {
      const response = await authFetch(getApiUrl('/pos/cash-transfer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId, terminalId, userId, amount: values.amount, type: transferType, reason: values.reason }),
      });
      const result = await response.json();
      if (result.success) {
        toast({ title: 'Transfer Recorded', description: `Successfully recorded cash ${transferType}.` });
        onOpenChange(false);
      } else {
        toast({ title: 'Transfer Failed', description: result.error || 'Failed to record transfer.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Transfer Failed', description: 'An unexpected error occurred.', variant: 'destructive' });
    }
  }

  const { isSubmitting } = form.formState;

  return {
    form, isSubmitting,
    transferType, setTransferType,
    onSubmit,
  };
}
