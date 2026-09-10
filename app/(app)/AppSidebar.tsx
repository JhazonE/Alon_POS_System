'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/sidebar/sidebar-context';
import { SidebarPanel } from '@/components/sidebar/sidebar-shell';
import { NavCard, NavRow, NavAccordion } from '@/components/sidebar/nav-card';
import { Input } from '@/components/ui/input';
import {
  Warehouse, ChartNoAxesCombined, User as UserIcon,
  ShoppingCart, Users, LogOut, Search,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { handleSignOut } from '../auth-actions';
import { buildNavIndex, filterNavIndex, matchSegments } from '@/lib/sidebar-search';
import { reportSearchItems } from '@/lib/report-catalog';
import { useMemo, useRef, useState, useEffect } from 'react';

/**
 * Sign out, recovering automatically when this tab is running a stale bundle.
 *
 * Server Action ids are minted per build, so a tab left open across a deploy
 * posts an id the current server no longer knows and the action rejects with
 * "Failed to find Server Action". The tab is then stuck: every click repeats
 * the same dead id. Reloading is the only cure, because the old id lives in
 * the already-downloaded bundle — so do it for the user instead of leaving
 * them on a button that silently does nothing.
 *
 * A plain try/catch would be wrong here: redirect() signals success by
 * THROWING, so the happy path lands in catch too. Re-throw those (they carry
 * a NEXT_REDIRECT digest) and only reload on a genuine failure.
 */
async function signOut() {
  try {
    await handleSignOut();
  } catch (err) {
    const digest = (err as { digest?: string })?.digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw err;
    // Stale bundle (or the action is otherwise unreachable) — reload to pull
    // the current one. Go straight to /login so the reload doubles as the
    // sign-out the user asked for.
    window.location.href = '/login';
  }
}

type AppUser = { email: string; permissions?: string[]; userType?: string };

type Props = {
  user: AppUser;
  hasPermission: (permission?: string) => boolean;
  filteredNavItems: { href: string; icon: any; label: string; permission?: string }[];
  filteredSellItems: { href: string; icon: any; label: string; permission?: string }[];
  filteredInsightsNavItems: { href: string; icon: any; label: string; permission?: string }[];
  filteredAdminNavItems: { href: string; icon: any; label: string; permission?: string }[];
  inventoryNavItems: { href: string; label: string }[];
  salesNavItems: { href: string; label: string }[];
  customerNavItems: { href: string; label: string }[];
  suppliersNavItems: { href: string; label: string }[];
  purchasesNavItems: { href: string; label: string }[];
  pathname: string;
  getInitials: (email?: string | null) => string;
};

export function AppSidebar({
  user, hasPermission,
  filteredNavItems, filteredSellItems, filteredInsightsNavItems, filteredAdminNavItems,
  inventoryNavItems, salesNavItems, customerNavItems,
  suppliersNavItems, purchasesNavItems,
  pathname, getInitials,
}: Props) {
  // The Sales collapsible now holds only the two pages you create records on.
  // Every other /sales/* route is a read-only report reached from /reports, so
  // match the two operational paths explicitly rather than the whole prefix.
  const isSalesPage = pathname.startsWith('/sales/orders') || pathname.startsWith('/sales/invoices');
  // /inventory/history and /inventory/movement are reports reached from
  // /reports; every other /inventory/* route is operational and belongs here.
  const isInventoryPage = pathname.startsWith('/inventory')
    && pathname !== '/inventory/history' && pathname !== '/inventory/movement';
  const isCustomerPage = pathname.startsWith('/customer');
  const isSuppliersPage = pathname.startsWith('/suppliers');
  const isPurchasesPage = pathname.startsWith('/purchases');

  const hasSell = filteredSellItems.length > 0 || hasPermission('view_sales');
  const hasPurchasing = hasPermission('manage_purchases') || hasPermission('manage_suppliers');

  // One section open at a time. Sections are keyed by their label, and the
  // section owning the current route opens itself -- on mount, and again
  // whenever navigation moves into a different section. Closing that section by
  // hand sticks, because activeSection has not changed and the effect below
  // only fires when it does.
  const activeSection =
    isSalesPage ? 'Sales'
    : isPurchasesPage ? 'Purchase Orders'
    : isSuppliersPage ? 'Suppliers'
    : isInventoryPage ? 'Inventory'
    : isCustomerPage ? 'Customers'
    : null;

  const [openSection, setOpenSection] = useState<string | null>(activeSection);
  useEffect(() => {
    if (activeSection) setOpenSection(activeSection);
  }, [activeSection]);

  const { state: sidebarState, setOpen } = useSidebar();
  const isCollapsed = sidebarState === 'collapsed';
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const navIndex = useMemo(() => buildNavIndex([
    { section: null, items: filteredNavItems },
    { section: null, items: filteredSellItems },
    { section: 'Sales', items: salesNavItems },
    { section: 'Purchases', items: purchasesNavItems },
    { section: 'Suppliers', items: suppliersNavItems },
    { section: 'Inventory', items: inventoryNavItems },
    { section: 'Customers', items: customerNavItems },
    { section: null, items: filteredInsightsNavItems },
    // Reports are reached from the /reports page rather than the sidebar, so
    // they render nothing here -- but they must still be findable by search.
    { section: 'Reports', items: reportSearchItems },
    { section: null, items: filteredAdminNavItems },
  ]), [filteredNavItems, filteredSellItems, filteredInsightsNavItems, filteredAdminNavItems]);

  const matches = filterNavIndex(navIndex, query);
  const isSearching = query.trim().length > 0;

  // Ctrl/Cmd+K focuses the search box.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  return (
    <SidebarPanel>
      <div className="sticky top-0 z-10 flex h-20 shrink-0 items-center border-b border-[#174145] px-6">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size={36} />
          <div className="flex min-w-0 flex-col">
            <h1 className="font-headline text-xl font-extrabold leading-none tracking-tight text-[#DCF2F0]">ALON</h1>
            <span className="mt-1 text-[11px] font-semibold uppercase leading-none tracking-[0.12em] text-[#A8D5D3]">POS System</span>
            <span className="mt-1 text-[10px] font-bold uppercase leading-none tracking-[0.2em] text-[#4FC3C9] opacity-90">Enterprise</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-3 py-3">
        {isCollapsed ? (
          <button
            type="button"
            aria-label="Search navigation"
            title="Search (Ctrl+K)"
            onClick={() => { setOpen(true); setTimeout(() => searchRef.current?.focus(), 0); }}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[rgba(192,232,230,0.66)] transition-colors hover:bg-[#143A3D]"
          >
            <Search className="size-4" />
          </button>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[rgba(192,232,230,0.5)]" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setQuery(''); searchRef.current?.blur(); }
                if (e.key === 'Enter' && matches.length > 0) {
                  window.location.assign(matches[0].href);
                }
              }}
              placeholder="Search... (Ctrl+K)"
              className="h-9 pl-9 text-sm bg-[#0F3336] border-[#17403F] text-[#DCF2F0] placeholder:text-[rgba(192,232,230,0.45)] focus-visible:ring-1"
            />
          </div>
        )}
      </div>

      <div data-sidebar="scroll" className="flex flex-1 flex-col gap-[9px] overflow-y-auto px-3 pb-3">
        {isSearching ? (
          <NavCard label={`RESULTS (${matches.length})`}>
            {matches.length === 0 && (
              <div className="px-2 py-1.5 text-[12px] text-[rgba(192,232,230,0.5)]">No pages found.</div>
            )}
            {matches.map(m => (
              <Link
                key={m.href}
                href={m.href}
                data-sidebar="row"
                data-href={m.href}
                data-active={pathname === m.href}
                className={`flex h-8 items-center rounded-lg px-2 text-[12.5px] transition-colors ${
                  pathname === m.href
                    ? 'bg-[#0E7C86] font-semibold text-white'
                    : 'text-[rgba(192,232,230,0.66)] hover:bg-[#143A3D]'
                }`}
              >
                <span className="truncate">
                  {matchSegments(m.label, query).map((seg, i) =>
                    seg.match
                      ? <mark key={i} className="rounded-sm bg-[#0E7C86]/40 px-0.5 text-inherit">{seg.text}</mark>
                      : <span key={i}>{seg.text}</span>,
                  )}
                  {m.section && <span className="ml-1 text-[11px] text-[rgba(192,232,230,0.45)]">· {m.section}</span>}
                </span>
              </Link>
            ))}
          </NavCard>
        ) : (
          <>
            {filteredNavItems.length > 0 && (
              <NavCard label="OVERVIEW">
                {filteredNavItems.map(item => (
                  <NavRow
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={pathname === item.href}
                  />
                ))}
              </NavCard>
            )}

            {hasSell && (
              <NavCard label="SELL">
                {filteredSellItems.map(item => (
                  <NavRow
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={pathname === item.href}
                  />
                ))}
                {hasPermission('view_sales') && (
                  <NavAccordion
                    label="Sales"
                    icon={ChartNoAxesCombined}
                    items={salesNavItems}
                    pathname={pathname}
                    isActive={isSalesPage}
                    openSection={openSection}
                    onOpenChange={setOpenSection}
                  />
                )}
              </NavCard>
            )}

            {hasPurchasing && (
              <NavCard label="PURCHASING">
                {hasPermission('manage_purchases') && (
                  <NavAccordion
                    label="Purchase Orders"
                    icon={ShoppingCart}
                    items={purchasesNavItems}
                    pathname={pathname}
                    isActive={isPurchasesPage}
                    openSection={openSection}
                    onOpenChange={setOpenSection}
                  />
                )}
                {hasPermission('manage_suppliers') && (
                  <NavAccordion
                    label="Suppliers"
                    icon={Users}
                    items={suppliersNavItems}
                    pathname={pathname}
                    isActive={isSuppliersPage}
                    openSection={openSection}
                    onOpenChange={setOpenSection}
                  />
                )}
              </NavCard>
            )}

            {hasPermission('manage_inventory') && (
              <NavCard label="INVENTORY">
                <NavAccordion
                  label="Inventory"
                  icon={Warehouse}
                  items={inventoryNavItems}
                  pathname={pathname}
                  isActive={isInventoryPage}
                  openSection={openSection}
                  onOpenChange={setOpenSection}
                />
              </NavCard>
            )}

            {hasPermission('manage_customers') && (
              <NavCard label="CUSTOMERS">
                <NavAccordion
                  label="Customers"
                  icon={UserIcon}
                  items={customerNavItems}
                  pathname={pathname}
                  isActive={isCustomerPage}
                  openSection={openSection}
                  onOpenChange={setOpenSection}
                />
              </NavCard>
            )}

            {filteredInsightsNavItems.length > 0 && (
              <NavCard label="INSIGHTS">
                {filteredInsightsNavItems.map(item => (
                  <NavRow
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={pathname === item.href}
                  />
                ))}
              </NavCard>
            )}

            {filteredAdminNavItems.length > 0 && (
              <NavCard label="ADMIN">
                {filteredAdminNavItems.map(item => (
                  <NavRow
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={pathname === item.href}
                  />
                ))}
              </NavCard>
            )}
          </>
        )}
      </div>

      <div className="mt-auto shrink-0 border-t border-[#174145] p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 overflow-hidden rounded-lg p-2 text-left text-sm text-[#DCF2F0] outline-none transition-colors hover:bg-[#143A3D] focus-visible:ring-2">
              <Avatar className="size-9 ring-2 ring-[#174145] shadow-sm">
                <AvatarFallback className="bg-[rgba(45,165,176,0.13)] text-[#4FC3C9] font-semibold border border-[#17403F]">
                  {getInitials(user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col truncate">
                <span className="text-sm font-semibold">{user.email || 'Anonymous'}</span>
                <span className="text-[11px] text-[rgba(192,232,230,0.5)]">View Profile</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">My Account</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" /><span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarPanel>
  );
}
