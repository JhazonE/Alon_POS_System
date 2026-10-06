'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1, 'Select at least one permission'),
});

export type UserTypeFormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserTypeUpdated: () => void;
  editingType?: any;
};

export function useAddUserType({ open, onOpenChange, onUserTypeUpdated, editingType }: Props) {
  const { toast } = useToast();

  const form = useForm<UserTypeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', description: '', permissions: [] },
  });

  useEffect(() => {
    if (editingType) {
      form.reset({ name: editingType.name, description: editingType.description || '', permissions: editingType.permissions || [] });
    } else if (open) {
      form.reset({ name: '', description: '', permissions: [] });
    }
  }, [editingType, open, form]);

  const onSubmit = async (values: UserTypeFormValues) => {
    try {
      const url = editingType ? getApiUrl(`/user-types/${editingType.id}`) : getApiUrl('/user-types');
      const response = await authFetch(url, {
        method: editingType ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save user type');

      toast({
        title: editingType ? 'User Type Updated' : 'User Type Created',
        description: `User type "${values.name}" has been ${editingType ? 'updated' : 'created'} successfully.`,
      });
      onUserTypeUpdated();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'An unexpected error occurred.' });
    }
  };

  return { form, onSubmit };
}
