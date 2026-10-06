'use client';
import { authFetch } from '@/lib/api-config';

import { useEffect, useState } from 'react';

import { useToast } from '@/hooks/use-toast';
import type { ShelfLocation } from '@/lib/types';

export interface UseManageShelfLocationsProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onLocationAdded?: (locationId?: string) => void;
}

/**
 * Controller for the Manage Shelf Locations dialog: owns the open state, the
 * inline add/edit form fields, and the fetch-backed CRUD operations so the
 * dialog stays presentational.
 */
export function useManageShelfLocations({ open, onOpenChange, onLocationAdded }: UseManageShelfLocationsProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };

  const [locations, setLocations] = useState<ShelfLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { toast } = useToast();

  const fetchLocations = async () => {
    setIsLoading(true);
    try {
      const response = await authFetch('/api/shelf-locations');
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();
      if (data.success) {
        setLocations(data.data);
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load shelf locations.' });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
  };

  useEffect(() => {
    if (dialogOpen) {
      fetchLocations();
    } else {
      resetForm();
    }
  }, [dialogOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const isEditing = !!editingId;
      const url = isEditing ? `/api/shelf-locations/${editingId}` : '/api/shelf-locations';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, isActive: true }),
      });

      const data = await response.json();

      if (data.success) {
        toast({ title: 'Success', description: data.message || `Shelf location ${isEditing ? 'updated' : 'added'}.` });
        resetForm();
        fetchLocations();
        if (onLocationAdded) {
          onLocationAdded(isEditing ? editingId : data.data?.id);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Operation failed.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (location: ShelfLocation) => {
    setEditingId(location.id);
    setName(location.name);
    setDescription(location.description || '');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shelf location?')) return;

    try {
      const response = await authFetch(`/api/shelf-locations/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();

      if (data.success) {
        toast({ title: 'Success', description: 'Shelf location deleted.' });
        fetchLocations();
        if (onLocationAdded) onLocationAdded();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete shelf location.' });
    }
  };

  return {
    dialogOpen,
    handleOpenChange,
    locations,
    isLoading,
    isSaving,
    editingId,
    name,
    setName,
    description,
    setDescription,
    resetForm,
    handleSubmit,
    handleEdit,
    handleDelete,
  };
}
