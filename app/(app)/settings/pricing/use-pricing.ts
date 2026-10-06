'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { SystemSettings } from '@/lib/types';
import { DropResult } from '@hello-pangea/dnd';

export function usePricing() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(getApiUrl('/pos-settings'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) {
        setSettings({
          ...result.data,
          markupPriority: result.data.markupPriority || ['subcategory', 'category', 'brand', 'supplier'],
        });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load pricing settings' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) =>
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const res = await authFetch(getApiUrl('/pos-settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Settings Saved', description: 'Pricing settings have been updated successfully' });
      } else {
        throw new Error(result.error);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save pricing settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !settings?.markupPriority) return;
    const items = Array.from(settings.markupPriority);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setSettings({ ...settings, markupPriority: items });
  };

  return { settings, isLoading, isSaving, set, handleSave, onDragEnd };
}
