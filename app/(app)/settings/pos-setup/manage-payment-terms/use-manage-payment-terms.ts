'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { paymentTermSchema, type PaymentTermFormValues } from './manage-payment-terms-types';

const EMPTY_FORM: PaymentTermFormValues = { description: '', type: '', numberOfDaysMonth: '' };

export function useManagePaymentTerms(isOpen: boolean, onPaymentTermsUpdated?: () => void) {
  const { toast } = useToast();
  const [paymentTerms, setPaymentTerms] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [termToDelete, setTermToDelete] = useState<{ id: string; description: string } | null>(null);
  const [editingTerm, setEditingTerm] = useState<any | null>(null);
  const [customTypes, setCustomTypes] = useState<any[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [showAddTypeDialog, setShowAddTypeDialog] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [isTypeSelectOpen, setIsTypeSelectOpen] = useState(false);

  const form = useForm<PaymentTermFormValues>({ resolver: zodResolver(paymentTermSchema), defaultValues: EMPTY_FORM });

  const fetchPaymentTerms = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(getApiUrl('/payment-terms'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) setPaymentTerms(result.data);
    } catch (e) { console.error('Error fetching payment terms:', e); }
    finally { setIsLoading(false); }
  };

  const fetchPaymentTermTypes = async () => {
    setIsLoadingTypes(true);
    try {
      const res = await authFetch(getApiUrl('/payment-term-types'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) setCustomTypes(result.data);
    } catch (e) { console.error('Error fetching payment term types:', e); }
    finally { setIsLoadingTypes(false); }
  };

  useEffect(() => {
    if (isOpen) { fetchPaymentTerms(); fetchPaymentTermTypes(); }
  }, [isOpen]);

  const onSubmit = async (values: PaymentTermFormValues) => {
    setIsSaving(true);
    try {
      const method = editingTerm ? 'PUT' : 'POST';
      const body = editingTerm ? { id: editingTerm.id, ...values } : values;
      const res = await authFetch(getApiUrl('/payment-terms'), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json();
      if (result.success) {
        toast({ title: editingTerm ? 'Payment Term Updated' : 'Payment Term Added', description: `Payment term has been successfully ${editingTerm ? 'updated' : 'added'}.` });
        form.reset(EMPTY_FORM); setEditingTerm(null);
        fetchPaymentTerms(); onPaymentTermsUpdated?.();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || `Failed to ${editingTerm ? 'update' : 'add'} payment term.` });
      }
    } catch { toast({ variant: 'destructive', title: 'Error', description: `Failed to ${editingTerm ? 'update' : 'add'} payment term. Please try again.` }); }
    finally { setIsSaving(false); }
  };

  const confirmDelete = async () => {
    if (!termToDelete) return;
    try {
      const res = await authFetch(getApiUrl(`/payment-terms?id=${termToDelete.id}`), { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Payment Term Deleted', description: 'Payment term has been successfully deleted.' });
        fetchPaymentTerms(); onPaymentTermsUpdated?.();
      } else toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete payment term.' });
    } catch { toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete payment term. Please try again.' }); }
    finally { setTermToDelete(null); }
  };

  const handleEdit = (term: any) => {
    setEditingTerm(term);
    form.reset({ description: term.description || '', type: term.type || '', numberOfDaysMonth: term.numberOfDaysMonth || '' });
  };

  const cancelEdit = () => { setEditingTerm(null); form.reset(EMPTY_FORM); };

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const res = await authFetch(getApiUrl('/payment-term-types'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTypeName.trim() }) });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Type Added', description: `"${newTypeName.trim()}" has been added to the type list.` });
        setNewTypeName(''); setShowAddTypeDialog(false);
        fetchPaymentTermTypes(); form.setValue('type', newTypeName.trim());
      } else toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to add type.' });
    } catch { toast({ variant: 'destructive', title: 'Error', description: 'Failed to add type. Please try again.' }); }
  };

  const handleDeleteType = async (typeId: string, typeName: string) => {
    try {
      const res = await authFetch(getApiUrl(`/payment-term-types?id=${typeId}`), { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Type Removed', description: `"${typeName}" has been removed from the type list.` });
        fetchPaymentTermTypes();
      } else toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete type.' });
    } catch { toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete type. Please try again.' }); }
  };

  return {
    paymentTerms, isLoading, isSaving,
    termToDelete, setTermToDelete,
    editingTerm, handleEdit, cancelEdit,
    customTypes, isLoadingTypes,
    showAddTypeDialog, setShowAddTypeDialog,
    newTypeName, setNewTypeName,
    isTypeSelectOpen, setIsTypeSelectOpen,
    form, onSubmit, confirmDelete, handleAddType, handleDeleteType,
  };
}
