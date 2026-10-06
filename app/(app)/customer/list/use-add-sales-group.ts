'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';

const salesGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
});

type SalesGroupFormValues = z.infer<typeof salesGroupSchema>;

type Options = {
  onGroupAdded: (group: { id: string; name: string }) => void;
  onSalesGroupsUpdated?: () => void;
};

export function useAddSalesGroup({ onGroupAdded, onSalesGroupsUpdated }: Options) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [salesGroups, setSalesGroups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<SalesGroupFormValues>({
    resolver: zodResolver(salesGroupSchema),
    defaultValues: {
      name: '',
    },
  });

  const fetchSalesGroups = async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(getApiUrl('/sales-groups'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setSalesGroups(result.data);
      }
    } catch (error) {
      console.error('Error fetching sales groups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchSalesGroups();
    }
  }, [open]);

  const handleSubmit = async (values: SalesGroupFormValues) => {
    setIsSaving(true);
    try {
      const response = await authFetch(getApiUrl('/sales-groups'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Sales Group Added',
          description: `Sales group "${values.name}" has been successfully added.`,
        });
        onGroupAdded(result.data);
        form.reset();
        fetchSalesGroups();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to add sales group.',
        });
      }
    } catch (error) {
      console.error('Error adding sales group:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add sales group. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;

    try {
      const response = await authFetch(getApiUrl(`/sales-groups?id=${groupToDelete.id}`), {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Sales Group Deleted',
          description: `Sales group "${groupToDelete.name}" has been successfully deleted.`,
        });
        fetchSalesGroups();
        if (onSalesGroupsUpdated) {
          onSalesGroupsUpdated();
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to delete sales group.',
        });
      }
    } catch (error) {
      console.error('Error deleting sales group:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete sales group. Please try again.',
      });
    } finally {
      setGroupToDelete(null);
    }
  };

  return {
    open,
    setOpen,
    isSaving,
    salesGroups,
    isLoading,
    groupToDelete,
    setGroupToDelete,
    form,
    handleSubmit,
    handleConfirmDelete,
  };
}
