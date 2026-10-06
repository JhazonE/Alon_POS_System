'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { type SystemSettings, SYSTEM_DEFAULTS, CURRENCIES } from './system-types';

export function useSystem() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettings>(SYSTEM_DEFAULTS);
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
          currencySymbol:      result.data.currencySymbol      || '$',
          currencyCode:        result.data.currencyCode        || 'USD',
          timezone:            result.data.timezone            || 'UTC',
          dateFormat:          result.data.dateFormat          || 'MM/DD/YYYY',
          fiscalYearStartMonth: result.data.fiscalYearStartMonth || 1,
        });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load system preferences' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const set = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const setCurrency = (key: 'symbol' | 'code', value: string) => {
    if (key === 'symbol') {
      const match = CURRENCIES.find(c => c.symbol === value);
      setSettings(prev => ({ ...prev, currencySymbol: value, currencyCode: match?.code ?? prev.currencyCode }));
    } else {
      const match = CURRENCIES.find(c => c.code === value);
      setSettings(prev => ({ ...prev, currencyCode: value, currencySymbol: match?.symbol ?? prev.currencySymbol }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch(getApiUrl('/pos-settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Settings Saved', description: 'System preferences have been updated successfully' });
      } else {
        throw new Error(result.error);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save system preferences' });
    } finally {
      setIsSaving(false);
    }
  };

  return { settings, isLoading, isSaving, set, setCurrency, handleSave };
}
