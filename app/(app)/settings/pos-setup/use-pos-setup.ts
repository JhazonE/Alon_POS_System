'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { DEFAULT_POS_SETTINGS, type PosSettings } from './pos-setup-types';

export function usePosSetup() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PosSettings>(DEFAULT_POS_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const isRefreshingRef = useRef(false);

  const set = <K extends keyof PosSettings>(key: K, value: PosSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const fetchSettings = async () => {
    isRefreshingRef.current = true;
    setIsLoading(true);
    try {
      const res = await authFetch(getApiUrl('/pos-settings'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) {
        const termId = localStorage.getItem('pos_terminal_id');
        let termName = null;
        if (termId) {
          const termRes = await authFetch(getApiUrl('/pos-terminals?activeOnly=true'));
          if (termRes.ok) {
            const termData = await termRes.json();
            if (termData.success) {
              const found = termData.data.find((t: any) => t.id === termId);
              if (found) termName = found.terminalDescription;
            }
          }
        }
        setSettings({ ...result.data, currentTerminalId: termId, currentTerminalName: termName });
        setLogoPreview(result.data.logoPath);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load POS settings' });
    } finally {
      setIsLoading(false);
      setTimeout(() => { isRefreshingRef.current = false; }, 100);
    }
  };

  const handleSave = useCallback(async (settingsToSave?: PosSettings) => {
    setIsSaving(true);
    try {
      const res = await authFetch(getApiUrl('/pos-settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsToSave ?? settings),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Settings Saved', description: 'POS settings have been updated successfully' });
        localStorage.setItem('pos_settings_version', Date.now().toString());
        await fetchSettings();
      } else throw new Error(result.error);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save POS settings' });
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Invalid File Type', description: 'Only PNG, JPG, and JPEG files are allowed' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'Logo file size must be less than 2MB' });
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await authFetch(getApiUrl('/pos-settings/upload-logo'), { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) {
        set('logoPath', result.data.logoPath);
        toast({ title: 'Logo Uploaded', description: 'Business logo has been uploaded successfully' });
      } else throw new Error(result.error);
    } catch {
      toast({ variant: 'destructive', title: 'Upload Failed', description: 'Failed to upload logo. Please try again.' });
      setLogoPreview(settings.logoPath);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  return { settings, set, setSettings, isLoading, isSaving, isUploading, logoPreview, handleSave, handleLogoUpload, fetchSettings };
}
