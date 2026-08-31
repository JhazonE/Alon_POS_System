import { QueryClient, DefaultOptions } from '@tanstack/react-query';
import {
  LayoutDashboard, Package, ClipboardCheck, BarChart3,
  Users, Settings,
} from 'lucide-react';

const queryConfig: DefaultOptions = {
  queries: {
    staleTime: 30 * 1000, // Data is considered stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Cache is garbage collected after 5 minutes
    retry: 1, // Retry failed requests once
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnReconnect: true, // Refetch when reconnecting to network
  },
};

export const queryClient = new QueryClient({ defaultOptions: queryConfig });

// Overview — single-page top-level links, no submenu.
export const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'view_dashboard' },
];

// Sell — flat "Products" link plus the Sales collapsible (operational items
// only; the reporting/analysis items live under Insights, see below).
export const sellNavItems = [
  { href: '/products', icon: Package, label: 'Products', permission: 'manage_products' },
];

// Only the two pages you actually create records on. Every read-only sales
// view — POS transactions/details/cash-transfer, merchandise credits, post
// voids, and the X/Z/Overall readings — is reached from the /reports page
// instead; the routes still live under app/(app)/sales/.
export const salesNavItems = [
  { href: '/sales/orders', label: 'Sales Order' },
  { href: '/sales/invoices', label: 'Sales Invoice/Delivery' },
];

export const inventoryNavItems = [
  { href: '/inventory', label: 'Stock Levels' },
  { href: '/inventory/stock-counts', label: 'Stock Counts (Snapshots)' },
  { href: '/inventory/repackaging', label: 'Repackaging' },
  { href: '/inventory/history', label: 'Adjustment History' },
  { href: '/inventory/movement', label: 'Stock Movement' },
];

export const customerNavItems = [
  { href: '/customer', label: 'Customer List' },
  { href: '/customer/payment', label: 'Customer Payment' },
  { href: '/customer/balances', label: 'Customer Balances' },
  { href: '/customer/loyalty', label: 'Customer Loyalty Points' },
];

// Purchasing — Purchase Orders and Suppliers grouped together, since
// suppliers only matter in the context of buying from them.
export const purchasesNavItems = [
  { href: '/purchases', label: 'Purchase Orders' },
  { href: '/purchases/bad-orders', label: 'Bad Orders' },
];

export const suppliersNavItems = [
  { href: '/suppliers/list', label: 'Supplier List' },
  { href: '/suppliers/balance', label: 'Balance to Supplier' },
  { href: '/suppliers/payment', label: 'Payment Suppliers' },
];

// Insights — analytics/reporting hub. Every report reaches the user through
// the /reports page's cards, including the three that still live under
// app/(app)/sales/ (by-product, by-date, analysis); the sidebar deliberately
// carries no second Sales Reports list of its own.
export const insightsNavItems = [
  { href: '/reports', icon: BarChart3, label: 'Reports', permission: 'view_reports' },
];

// Admin — approvals/workflow config, users, and store settings.
export const adminNavItems = [
  { href: '/approvals', icon: ClipboardCheck, label: 'Approvals Board', permission: 'view_approvals' },
  { href: '/approvals/settings', icon: Settings, label: 'Workflow Settings', permission: 'manage_approval_settings' },
  { href: '/user-management', icon: Users, label: 'User Management', permission: 'manage_users' },
  { href: '/settings', icon: Settings, label: 'Settings', permission: 'manage_settings' },
];
