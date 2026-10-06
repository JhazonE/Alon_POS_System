'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';

export function useManageUserTypes() {
  const { toast } = useToast();
  const [userTypes, setUserTypes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingType, setEditingType] = useState<any>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingType, setDeletingType] = useState<any>(null);

  const fetchUserTypes = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(getApiUrl('/user-types'));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setUserTypes(data);
    } catch (error) {
      console.error('Failed to fetch user types:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchUserTypes(); }, [fetchUserTypes]);

  const handleEdit = (type: any) => {
    setEditingType(type);
    setIsAddOpen(true);
  };

  const handleDeleteClick = (type: any) => {
    setDeletingType(type);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingType) return;
    try {
      const res = await authFetch(getApiUrl(`/user-types/${deletingType.id}`), { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user type');
      toast({ title: 'User Type Deleted', description: 'The user type has been removed.' });
      fetchUserTypes();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsDeleteDialogOpen(false);
      setDeletingType(null);
    }
  };

  return {
    userTypes, isLoading,
    isAddOpen, setIsAddOpen,
    editingType, setEditingType,
    isDeleteDialogOpen, setIsDeleteDialogOpen,
    deletingType,
    fetchUserTypes, handleEdit, handleDeleteClick, handleDeleteConfirm,
  };
}
