'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getApiUrl, setStoredToken, authFetch } from '@/lib/api-config';
import {
  navItems, sellNavItems, adminNavItems, insightsNavItems,
  inventoryNavItems, salesNavItems, customerNavItems,
  suppliersNavItems, purchasesNavItems,
} from './layout-nav-config';
import { pageKeyForHref } from '@/lib/page-registry';

type AppUser = { email: string; permissions?: string[]; userType?: string };

export function useAppLayout() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<AppUser | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [businessName, setBusinessName] = useState('ALON POS SYSTEM');
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(new Set());
  const [disabledLoaded, setDisabledLoaded] = useState(false);

  const isPOSPage = pathname === '/pos' || pathname === '/pos/customer-display';

  // Auth check
  useEffect(() => {
    if (isPOSPage) { setIsUserLoading(false); return; }
    const session = localStorage.getItem('mock-user-session');
    if (session) {
      setUser(JSON.parse(session));
    } else if (process.env.NODE_ENV === 'development') {
      // Dev-only: get a REAL signed token for the preview identity instead of
      // fabricating a client-side session, which the server no longer trusts.
      // Plain fetch on purpose: /api/auth/login is public and runs before any
      // token exists (authFetch would redirect on a 401).
      fetch(getApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devPreview: true }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((result) => {
          if (!result?.token) { router.push('/login'); return; }
          setStoredToken(result.token);
          const devSession = {
            uid: result.uid,
            email: result.email,
            username: result.username,
            displayName: result.displayName,
            userType: result.userType,
            roleId: result.roleId,
            permissions: result.permissions,
            photoURL: result.photoURL,
          };
          localStorage.setItem('mock-user-session', JSON.stringify(devSession));
          setUser(devSession);
        })
        .catch(() => router.push('/login'))
        .finally(() => setIsUserLoading(false));
      return;
    } else {
      router.push('/login');
    }
    setIsUserLoading(false);
  }, [router, pathname]);

  // Business name
  useEffect(() => {
    authFetch(getApiUrl('/pos-settings'))
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(result => {
        if (result.success && result.data?.businessName) setBusinessName(result.data.businessName);
      })
      .catch(() => {});
  }, []);

  // Disabled pages (store-wide developer toggles). Skipped on POS/customer-display,
  // which render before the sidebar and never consume the disabled set.
  useEffect(() => {
    if (isPOSPage) { setDisabledLoaded(true); return; }
    authFetch(getApiUrl('/developer/disabled-pages'))
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(result => {
        if (result.success && Array.isArray(result.disabled)) {
          setDisabledKeys(new Set(result.disabled));
        }
      })
      .catch(() => {})
      .finally(() => setDisabledLoaded(true));
  }, [isPOSPage]);

  // Document title
  useEffect(() => { document.title = businessName; }, [businessName]);

  // Force Cashiers to POS
  useEffect(() => {
    if (user?.userType === 'Cashier' && pathname !== '/pos') router.push('/pos');
  }, [user, pathname, router]);

  const hasPermission = (permission?: string) => {
    if (!user) return false;
    if (user.permissions?.includes('super_admin')) return true;
    if (user.userType === 'Cashier') return permission === 'access_pos';
    if (permission && !user.permissions?.includes(permission)) return false;
    return true;
  };

  const getInitials = (email?: string | null) =>
    email ? email.substring(0, 2).toUpperCase() : '..';

  const isEnabled = (href: string) => {
    const key = pageKeyForHref(href);
    return !key || !disabledKeys.has(key);
  };

  const filteredNavItems = navItems.filter(
    item => hasPermission(item.permission) && isEnabled(item.href),
  );
  const filteredSellItems = sellNavItems.filter(
    item => hasPermission(item.permission) && isEnabled(item.href),
  );
  const filteredInsightsNavItems = insightsNavItems.filter(
    item => hasPermission(item.permission) && isEnabled(item.href),
  );
  const filteredAdminNavItems = adminNavItems.filter(
    item => hasPermission(item.permission) && isEnabled(item.href),
  );

  const filteredInventoryNavItems = inventoryNavItems.filter(i => isEnabled(i.href));
  const filteredSalesNavItems = salesNavItems.filter(i => isEnabled(i.href));
  const filteredCustomerNavItems = customerNavItems.filter(i => isEnabled(i.href));
  const filteredSuppliersNavItems = suppliersNavItems.filter(i => isEnabled(i.href));
  const filteredPurchasesNavItems = purchasesNavItems.filter(i => isEnabled(i.href));

  return {
    user, isUserLoading, isPOSPage,
    businessName,
    hasPermission, getInitials,
    filteredNavItems, filteredSellItems, filteredInsightsNavItems, filteredAdminNavItems,
    filteredInventoryNavItems, filteredSalesNavItems,
    filteredCustomerNavItems, filteredSuppliersNavItems,
    filteredPurchasesNavItems,
    disabledKeys, disabledLoaded,
    pathname,
  };
}
