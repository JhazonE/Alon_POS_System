'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { type PosTerminal } from './pos-terminals-types';

export function usePosTerminals() {
  const { toast } = useToast();
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTerminal, setSelectedTerminal] = useState<PosTerminal | null>(null);
  const [currentTerminalId, setCurrentTerminalId] = useState<string | null>(null);
  const [terminalToDelete, setTerminalToDelete] = useState<{ id: string; description: string } | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);

  const fetchTerminals = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(getApiUrl('/pos-terminals'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) setTerminals(result.data);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load POS terminals' });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await authFetch(getApiUrl('/warehouses?activeOnly=true'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) setWarehouses(result.data);
    } catch (e) { console.error('Error fetching warehouses:', e); }
  };

  useEffect(() => {
    fetchTerminals();
    fetchWarehouses();

    const termId = localStorage.getItem('pos_terminal_id');
    setCurrentTerminalId(termId);

    if (termId) {
      authFetch(getApiUrl('/pos-terminals'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: termId }),
      });
    }

    const interval = setInterval(fetchTerminals, 30000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = (lastActive: string | null) => {
    if (!lastActive) return false;
    return (Date.now() - new Date(lastActive).getTime()) < 5 * 60 * 1000;
  };

  const handleEdit = (terminal: PosTerminal) => {
    setSelectedTerminal(terminal);
    setIsEditDialogOpen(true);
  };

  const handleConnect = (terminal: PosTerminal) => {
    localStorage.setItem('pos_terminal_id', terminal.id);
    setCurrentTerminalId(terminal.id);
    toast({
      title: 'Connected',
      description: `This computer is now linked to ${terminal.terminalDescription || terminal.ipAddress}`,
    });
    authFetch(getApiUrl('/pos-terminals'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: terminal.id }),
    });
  };

  const handleReset = () => {
    if (!confirm('Are you sure you want to disconnect this computer from its current terminal?')) return;
    localStorage.removeItem('pos_terminal_id');
    setCurrentTerminalId(null);
    toast({ title: 'Terminal Disconnected', description: 'This machine is no longer linked to any terminal.' });
  };

  const handleDelete = async () => {
    if (!terminalToDelete) return;
    try {
      const res = await authFetch(getApiUrl(`/pos-terminals?id=${terminalToDelete.id}`), { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Terminal Deleted', description: 'Terminal has been successfully deleted.' });
        fetchTerminals();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete terminal.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete terminal. Please try again.' });
    } finally {
      setTerminalToDelete(null);
    }
  };

  return {
    terminals, isLoading, warehouses,
    selectedTerminal, currentTerminalId,
    terminalToDelete, setTerminalToDelete,
    isEditDialogOpen, setIsEditDialogOpen,
    isOnline, handleEdit, handleConnect, handleReset, handleDelete,
    fetchTerminals,
  };
}
