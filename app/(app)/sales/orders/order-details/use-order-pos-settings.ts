'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api-config';
import type { POSSettings } from './order-details-types';

export function useOrderPosSettings() {
  const [settings, setSettings] = useState<POSSettings>({});

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(getApiUrl('/pos-settings'));
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();
        if (data.success && data.data) {
          setSettings({
            businessName: data.data.businessName || 'ALON POS SYSTEM',
            logoPath: data.data.logoPath,
            address: data.data.address || '',
            contactNumber: data.data.contactNumber || '',
            tin: data.data.tin || '',
            salesOrderTerms: data.data.salesOrderTerms || '',
          });
        }
      } catch (e) {
        console.error('Error fetching settings:', e);
      }
    };
    fetchSettings();
  }, []);

  return { settings };
}
