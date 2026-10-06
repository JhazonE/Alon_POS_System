'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';

const salesAreaSchema = z.object({
  name: z.string().min(1, 'Area name is required'),
});

type SalesAreaFormValues = z.infer<typeof salesAreaSchema>;

type Options = {
  onAreaAdded: (area: { id: string; name: string }) => void;
  onSalesAreasUpdated?: () => void;
};

export function useAddSalesArea({ onAreaAdded, onSalesAreasUpdated }: Options) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [salesAreas, setSalesAreas] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<SalesAreaFormValues>({
    resolver: zodResolver(salesAreaSchema),
    defaultValues: {
      name: '',
    },
  });

  const fetchSalesAreas = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(getApiUrl('/sales-areas'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setSalesAreas(result.data);
      }
    } catch (error) {
      console.error('Error fetching sales areas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSalesAreas();
    }
  }, [open]);

  const handleSubmit = async (values: SalesAreaFormValues) => {
    setIsSaving(true);
    try {
      const response = await authFetch(getApiUrl('/sales-areas'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Sales Area Added',
          description: `Sales area "${values.name}" has been successfully added.`,
        });
        onAreaAdded(result.data);
        form.reset();
        fetchSalesAreas();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to add sales area.',
        });
      }
    } catch (error) {
      console.error('Error adding sales area:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add sales area. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!areaToDelete) return;

    try {
      const response = await authFetch(getApiUrl(`/sales-areas?id=${areaToDelete.id}`), {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Sales Area Deleted',
          description: `Sales area "${areaToDelete.name}" has been successfully deleted.`,
        });
        fetchSalesAreas();
        if (onSalesAreasUpdated) {
          onSalesAreasUpdated();
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to delete sales area.',
        });
      }
    } catch (error) {
      console.error('Error deleting sales area:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete sales area. Please try again.',
      });
    } finally {
      setAreaToDelete(null);
    }
  };

  return {
    open,
    setOpen,
    isSaving,
    salesAreas,
    isLoading,
    areaToDelete,
    setAreaToDelete,
    form,
    handleSubmit,
    handleConfirmDelete,
  };
}
