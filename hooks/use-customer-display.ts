'use client';

import { useEffect, useRef, useCallback } from 'react';
import { SaleItem } from '@/app/(app)/pos/page';

export type CustomerDisplayEvent =
  | { type: 'IDLE' }
  | { type: 'CART_UPDATE'; items: SaleItem[]; subtotal: number; discount: number; total: number; currency: string }
  | { type: 'PAYMENT_START'; total: number; tendered: number; currency: string }
  | { type: 'PAYMENT_UPDATE'; tendered: number; change: number; currency: string }
  | { type: 'PAYMENT_COMPLETE'; change: number; orNumber: string; currency: string }
  | { type: 'SETTINGS'; message: string; showLogo: boolean; logoPath: string | null; businessName: string }
  | { type: 'THEME'; theme: 'light' | 'dark' }
  | { type: 'READY' };

const CHANNEL_NAME = 'pos-customer-display';

declare global {
  interface Window {
    electronAPI?: {
      openCustomerDisplay?: () => Promise<{ success: boolean; action: string; hasSecondDisplay?: boolean }>;
      closeCustomerDisplay?: () => Promise<{ success: boolean }>;
      [key: string]: any;
    };
  }
}

export function useCustomerDisplay(enabled: boolean) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastStateRef = useRef<CustomerDisplayEvent | null>(null);
  const lastThemeRef = useRef<CustomerDisplayEvent | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (e: MessageEvent<CustomerDisplayEvent>) => {
      if (e.data?.type === 'READY') {
        if (lastThemeRef.current) channel.postMessage(lastThemeRef.current);
        if (lastStateRef.current) channel.postMessage(lastStateRef.current);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [enabled]);

  const send = useCallback((event: CustomerDisplayEvent) => {
    if (!enabled || event.type === 'READY') return;
    if (event.type === 'THEME') {
      lastThemeRef.current = event;
    } else {
      lastStateRef.current = event;
    }
    channelRef.current?.postMessage(event);
  }, [enabled]);

  const openOnSecondScreen = useCallback(async () => {
    if (!enabled) return;

    // Electron path: frameless fullscreen BrowserWindow on second monitor with Alon icon
    if (typeof window !== 'undefined' && window.electronAPI?.openCustomerDisplay) {
      try {
        await window.electronAPI.openCustomerDisplay();
        return;
      } catch {
        // fall through to browser fallback
      }
    }

    // Browser fallback: window.open with Window Management API for second screen
    const url = '/pos/customer-display';
    const windowName = 'customer-display';

    if ('getScreenDetails' in window) {
      try {
        const perm = await (navigator.permissions as any).query({ name: 'window-management' });
        if (perm.state !== 'denied') {
          const screenDetails = await (window as any).getScreenDetails();
          const secondScreen = (screenDetails.screens as any[]).find((s: any) => !s.isPrimary);
          if (secondScreen) {
            const features = [
              `left=${secondScreen.left}`,
              `top=${secondScreen.top}`,
              `width=${secondScreen.width}`,
              `height=${secondScreen.height}`,
            ].join(',');
            window.open(url, windowName, features);
            return;
          }
        }
      } catch {
        // fall through
      }
    }

    window.open(url, windowName, 'width=1024,height=768,menubar=no,toolbar=no,location=no,status=no');
  }, [enabled]);

  const closeDisplay = useCallback(async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.closeCustomerDisplay) {
      try {
        await window.electronAPI.closeCustomerDisplay();
        return;
      } catch { /* ignore */ }
    }
  }, []);

  return { send, openOnSecondScreen, closeDisplay };
}
