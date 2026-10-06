'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';

export interface ViewBadOrderDialogProps {
  badOrder: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function useViewBadOrder({ badOrder, open, onOpenChange, onUpdate }: ViewBadOrderDialogProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && badOrder) {
      setStatus(badOrder.status || '');
      setResolutionNotes(badOrder.resolutionNotes || '');
    }
  }, [open, badOrder]);

  const handleUpdate = async () => {
    setIsSubmitting(true);
    try {
      const response = await authFetch(getApiUrl(`/bad-orders/${badOrder.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolutionNotes }),
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to update bad order');

      toast({ title: 'Bad Order Updated', description: 'The bad order has been updated successfully.' });
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update bad order:', error);
      toast({ title: 'Error', description: 'Failed to update bad order.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    status, setStatus,
    resolutionNotes, setResolutionNotes,
    isSubmitting,
    handleUpdate,
  };
}
