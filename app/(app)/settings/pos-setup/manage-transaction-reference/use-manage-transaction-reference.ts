'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import {
  transactionReferenceSchema,
  type TransactionReferenceFormValues,
  type LastReferences,
} from './manage-transaction-reference-types';

const DEFAULTS: TransactionReferenceFormValues = {
  salesOrder: '', purchaseOrder: '', salesDelivery: '', paymentToSupplier: '',
  salesInvoice: '', customerPayment: '', deliveryReceipt: '', stockAdjustment: '',
  salesHold: '', receiptNumber: '',
};

function calcNext(lastRef: string | null | undefined): string {
  if (!lastRef) return '';
  const match = lastRef.match(/^(.*?)(\d+)$/);
  if (!match) return '';
  const [, prefix, numStr] = match;
  return `${prefix}${(parseInt(numStr) + 1).toString().padStart(numStr.length, '0')}`;
}

export function useManageTransactionReference(isOpen: boolean, onUpdated?: () => void) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastReferences, setLastReferences] = useState<LastReferences | null>(null);

  const form = useForm<TransactionReferenceFormValues>({
    resolver: zodResolver(transactionReferenceSchema),
    defaultValues: DEFAULTS,
  });

  const fetchReferences = async () => {
    setIsLoading(true);
    try {
      const [nextRes, lastRes] = await Promise.all([
        authFetch(getApiUrl('/transaction-references')),
        authFetch(getApiUrl('/transactions/last-references')),
      ]);
      const nextResult = await nextRes.json();
      const lastResult = await lastRes.json();

      const newValues: TransactionReferenceFormValues = { ...DEFAULTS };
      let lastRefs: LastReferences | null = null;

      if (lastResult.success && lastResult.data) {
        setLastReferences(lastResult.data);
        lastRefs = lastResult.data;
      }

      if (nextResult.success && nextResult.data) {
        Object.assign(newValues, nextResult.data);
      }

      if (lastRefs) {
        (Object.keys(DEFAULTS) as Array<keyof TransactionReferenceFormValues>).forEach(key => {
          if (!newValues[key] && lastRefs![key]) {
            newValues[key] = calcNext(lastRefs![key]);
          }
        });
      }

      form.reset(newValues);
    } catch (e) {
      console.error('Error fetching references:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (isOpen) fetchReferences(); }, [isOpen]);

  const onSubmit = async (values: TransactionReferenceFormValues) => {
    setIsSaving(true);
    try {
      const res = await authFetch(getApiUrl('/transaction-references'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'References Updated', description: 'Transaction references have been updated successfully.' });
        onUpdated?.();
        return true;
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to update references.' });
        return false;
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update transaction references. Please try again.' });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { form, isSaving, isLoading, lastReferences, onSubmit };
}
