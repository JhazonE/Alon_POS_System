'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import type { NotificationSettings } from './notification-types';

const DEFAULT: NotificationSettings = {
  lowStockThreshold: 10,
  enableEmailNotifications: false,
  notificationEmail: '',
  enablePushNotifications: true,
};

export function useNotifications() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const set = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await authFetch(getApiUrl('/pos-settings'));
        if (!res.ok) throw new Error();
        const result = await res.json();
        if (result.success) {
          setSettings({
            lowStockThreshold: result.data.lowStockThreshold ?? 10,
            enableEmailNotifications: Boolean(result.data.enableEmailNotifications),
            notificationEmail: result.data.notificationEmail || '',
            enablePushNotifications: Boolean(result.data.enablePushNotifications),
          });
        }
      } catch {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load notification settings' });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch(getApiUrl('/pos-settings'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const result = await res.json();
      if (result.success) toast({ title: 'Settings Saved', description: 'Notification preferences have been updated successfully' });
      else throw new Error(result.error);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save notification settings' });
    } finally {
      setIsSaving(false);
    }
  };

  return { settings, set, isLoading, isSaving, handleSave };
}
