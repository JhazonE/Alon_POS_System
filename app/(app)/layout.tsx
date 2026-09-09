'use client';

import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/sidebar/sidebar-context';
import { SidebarInset } from '@/components/sidebar/sidebar-shell';
import { NavigationProgress } from '@/components/navigation-progress';
import { pageKeyForHref, isProtectedHref } from '@/lib/page-registry';
import { queryClient } from './layout-nav-config';
import { useAppLayout } from './use-app-layout';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { useLicenseHeartbeat } from './use-license-heartbeat';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const {
    user, isUserLoading, isPOSPage,
    businessName, hasPermission, getInitials,
    filteredNavItems, filteredSellItems, filteredInsightsNavItems, filteredAdminNavItems,
    filteredInventoryNavItems, filteredSalesNavItems,
    filteredCustomerNavItems, filteredSuppliersNavItems,
    filteredPurchasesNavItems,
    disabledKeys, disabledLoaded,
    pathname,
  } = useAppLayout();

  const router = useRouter();

  useLicenseHeartbeat();

  // Seed the sidebar's initial open state from the persisted cookie so a
  // collapsed sidebar stays collapsed across reloads. Read once on mount.
  const [defaultSidebarOpen] = React.useState(() => {
    if (typeof document === 'undefined') return true;
    const match = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
    return match ? match[1] === 'true' : true;
  });

  // Redirect away from pages disabled via developer options. Wait for the set
  // to load so an enabled page is not redirected during the fetch window.
  React.useEffect(() => {
    if (!disabledLoaded) return;
    if (isProtectedHref(pathname)) return;
    const key = pageKeyForHref(pathname);
    if (key && disabledKeys.has(key)) {
      router.replace('/dashboard');
    }
  }, [disabledLoaded, disabledKeys, pathname, router]);

  if (isPOSPage) return <>{children}</>;

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {/*
        The hand-built provider renders no DOM of its own (shadcn's rendered the
        flex wrapper), so the row that lays the panel beside the content lives
        here now. Same classes the provider used to carry.
      */}
      <SidebarProvider defaultOpen={defaultSidebarOpen}>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar
            user={user}
            hasPermission={hasPermission}
            filteredNavItems={filteredNavItems}
            filteredSellItems={filteredSellItems}
            filteredInsightsNavItems={filteredInsightsNavItems}
            filteredAdminNavItems={filteredAdminNavItems}
            inventoryNavItems={filteredInventoryNavItems}
            salesNavItems={filteredSalesNavItems}
            customerNavItems={filteredCustomerNavItems}
            suppliersNavItems={filteredSuppliersNavItems}
            purchasesNavItems={filteredPurchasesNavItems}
            pathname={pathname}
            getInitials={getInitials}
          />
          <SidebarInset>
            <AppHeader user={user} businessName={businessName} />
            <main className="flex-1 flex flex-col overflow-auto p-4 sm:p-6 min-h-0">
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </QueryClientProvider>
  );
}
