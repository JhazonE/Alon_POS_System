'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { dispatchStockUpdate } from '@/hooks/use-live-refresh';
import { logActivity } from '@/lib/client-activity-logger';
import { useToast } from '@/hooks/use-toast';

/**
 * Controller for the "Start New Count" dialog: owns the open/viewport state, the
 * form fields, warehouse/shelf metadata loading, and the create-count submit.
 */
export function useNewCount({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const [shelfLocationIds, setShelfLocationIds] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [shelves, setShelves] = useState<{ id: string; name: string }[]>([]);

  const { toast } = useToast();
  const router = useRouter();

  // Track viewport so we only open ONE of: mobile sheet or desktop dialog
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetch('/api/warehouses?activeOnly=true')
        .then((r) => r.json())
        .then((d) => { if (d.success) setWarehouses(d.data); })
        .catch(console.error);
      fetch('/api/shelf-locations')
        .then((r) => r.json())
        .then((d) => { if (d.success) setShelves(d.data); })
        .catch(console.error);
    }
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    setName('');
    setNotes('');
    setWarehouseId('all');
    setShelfLocationIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/inventory/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, notes, createdBy: 'Admin',
          warehouseId: warehouseId !== 'all' ? warehouseId : undefined,
          shelfLocationIds: shelfLocationIds.length > 0 ? shelfLocationIds : undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to create count');
      const data = await res.json();
      await logActivity({
        action: 'CREATE',
        module: 'INVENTORY',
        description: `Initialized inventory count: "${name}"${warehouseId && warehouseId !== 'all' ? ` — Warehouse: ${warehouseId}` : ''}`,
        referenceId: data.data?.id,
      });
      toast({ title: 'Inventory count initialized successfully' });
      handleClose();
      dispatchStockUpdate();
      onCreated();
      router.push(`/inventory/stock-counts/${data.data.id}`);
    } catch (err) {
      console.error(err);
      toast({ title: 'An error occurred', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    open,
    setOpen,
    isMobile,
    isSubmitting,
    name,
    setName,
    notes,
    setNotes,
    warehouseId,
    setWarehouseId,
    shelfLocationIds,
    setShelfLocationIds,
    warehouses,
    shelves,
    handleClose,
    handleSubmit,
  };
}
