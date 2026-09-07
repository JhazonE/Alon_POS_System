'use client';

import Link from 'next/link';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSidebar } from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import {
  Warehouse, ChartNoAxesCombined, User as UserIcon,
  ShoppingCart, Users, ChevronDown, LogOut, Search,
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
    <Sidebar className="non-printable" collapsible="icon" variant="floating">
      <SidebarHeader className="h-20 border-b border-sidebar-border sticky top-0 bg-gradient-to-b from-sidebar to-sidebar/95 backdrop-blur-xl z-10 px-6 group-data-[collapsible=icon]:px-0 justify-center shadow-sm">
        <div className="flex items-center gap-3 transition-all duration-300 group-data-[collapsible=icon]:justify-center">
          <Logo variant="icon" size={36} />
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <h1 className="text-xl font-extrabold font-headline tracking-tight text-sidebar-foreground">ALON POS SYSTEM</h1>
            <span className="text-[10px] uppercase font-bold text-primary tracking-[0.2em] mt-0.5 opacity-90">Enterprise</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-6 gap-2 overflow-y-auto flex-1 group-data-[collapsible=icon]:px-0">
        {isCollapsed ? (
          <button
            type="button"
            aria-label="Search navigation"
            title="Search (Ctrl+K)"
            onClick={() => { setOpen(true); setTimeout(() => searchRef.current?.focus(), 0); }}
            className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Search className="size-4" />
          </button>
        ) : (
          <div className="relative px-1 mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
              className="h-9 pl-9 text-sm bg-sidebar-accent/40 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus-visible:ring-1"
            />
          </div>
        )}

        {isSearching ? (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted-foreground/80 px-4 mb-3">
              Results ({matches.length})
            </SidebarGroupLabel>
            <SidebarMenu>
              {matches.length === 0 && (
                <div className="px-4 py-2 text-[13px] text-muted-foreground">No pages found.</div>
              )}
              {matches.map(m => (
                <SidebarMenuItem key={m.href}>
                  <Link href={m.href}>
                    <SidebarMenuButton isActive={pathname === m.href} className="gap-3 px-4 py-2 font-medium rounded-lg">
                      <span className="text-[14px]">
                        {matchSegments(m.label, query).map((seg, i) =>
                          seg.match
                            ? <mark key={i} className="bg-primary/20 text-primary rounded-sm px-0.5">{seg.text}</mark>
                            : <span key={i}>{seg.text}</span>,
                        )}
                        {m.section && <span className="ml-1 text-[11px] text-muted-foreground">· {m.section}</span>}
                      </span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          <>
            {filteredNavItems.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted-foreground/80 px-4 mb-3">Overview</SidebarGroupLabel>
                <SidebarMenu>
                  <FlatNavLinks items={filteredNavItems} pathname={pathname} />
                </SidebarMenu>
              </SidebarGroup>
            )}

            {hasSell && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted-foreground/80 px-4 mb-3">Sell</SidebarGroupLabel>
                <SidebarMenu>
                  <FlatNavLinks items={filteredSellItems} pathname={pathname} />
                  {hasPermission('view_sales') && (
                    <CollapsibleNavSection label="Sales" icon={ChartNoAxesCombined} isActive={isSalesPage} items={salesNavItems} pathname={pathname} openSection={openSection} onOpenChange={setOpenSection} />
                  )}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {hasPurchasing && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted-foreground/80 px-4 mb-3">Purchasing</SidebarGroupLabel>
                <SidebarMenu>
                  {hasPermission('manage_purchases') && (
                    <CollapsibleNavSection label="Purchase Orders" icon={ShoppingCart} isActive={isPurchasesPage} items={purchasesNavItems} pathname={pathname} openSection={openSection} onOpenChange={setOpenSection} />
                  )}
                  {hasPermission('manage_suppliers') && (
                    <CollapsibleNavSection label="Suppliers" icon={Users} isActive={isSuppliersPage} items={suppliersNavItems} pathname={pathname} openSection={openSection} onOpenChange={setOpenSection} />
                  )}
                </SidebarMenu>
              </SidebarGroup>
            )}

            {hasPermission('manage_inventory') && (
              <SidebarGroup>
                <SidebarMenu>
                  <CollapsibleNavSection label="Inventory" icon={Warehouse} isActive={isInventoryPage} items={inventoryNavItems} pathname={pathname} openSection={openSection} onOpenChange={setOpenSection} />
                </SidebarMenu>
              </SidebarGroup>
            )}

            {hasPermission('manage_customers') && (
              <SidebarGroup>
                <SidebarMenu>
                  <CollapsibleNavSection label="Customers" icon={UserIcon} isActive={isCustomerPage} items={customerNavItems} pathname={pathname} openSection={openSection} onOpenChange={setOpenSection} />
                </SidebarMenu>
              </SidebarGroup>
            )}

            {filteredInsightsNavItems.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted-foreground/80 px-4 mb-3">Insights</SidebarGroupLabel>
                <SidebarMenu>
                  <FlatNavLinks items={filteredInsightsNavItems} pathname={pathname} />
                </SidebarMenu>
              </SidebarGroup>
            )}

            {filteredAdminNavItems.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.1em] font-bold text-muted-foreground/80 px-4 mb-3">Admin</SidebarGroupLabel>
                <SidebarMenu>
                  <FlatNavLinks items={filteredAdminNavItems} pathname={pathname} />
                </SidebarMenu>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="sticky bottom-0 bg-gradient-to-t from-sidebar to-sidebar/95 backdrop-blur-xl border-t border-sidebar-border mt-auto shadow-lg">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 overflow-hidden rounded-lg p-3 text-left text-sm text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground focus-visible:ring-2">
              <Avatar className="size-9 ring-2 ring-sidebar-border shadow-sm">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-semibold border border-primary/20">
                  {getInitials(user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col truncate">
                <span className="text-sm font-semibold">{user.email || 'Anonymous'}</span>
                <span className="text-[11px] text-muted-foreground">View Profile</span>
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
      </SidebarFooter>
    </Sidebar>
  );
}

function FlatNavLinks({ items, pathname }: {
  items: { href: string; icon: any; label: string }[];
  pathname: string;
}) {
  return (
    <>
      {items.map(item => (
        <SidebarMenuItem key={item.href}>
          <Link href={item.href}>
            <SidebarMenuButton isActive={pathname === item.href} tooltip={{ children: item.label }} className="gap-3 px-4 py-2.5 rounded-lg">
              <item.icon />
              <span className="text-[14px]">{item.label}</span>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      ))}
    </>
  );
}

type SectionProps = {
  label: string;
  icon: any;
  isActive: boolean;
  items: { href: string; label: string }[];
  pathname: string;
  /** Label of the one section currently open, or null when all are closed. */
  openSection: string | null;
  onOpenChange: (section: string | null) => void;
};

function CollapsibleNavSection({ label, icon: Icon, isActive, items, pathname, openSection, onOpenChange }: SectionProps) {
  return (
    <SidebarMenuItem>
      <Collapsible
        open={openSection === label}
        onOpenChange={next => onOpenChange(next ? label : null)}
        className="group/collapsible group-data-[collapsible=icon]:items-center"
      >
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={isActive} tooltip={{ children: label }} className="justify-between gap-3 px-4 py-2.5 rounded-lg">
            <div className="flex items-center gap-3">
              <Icon />
              <span className="text-[14px]">{label}</span>
            </div>
            <ChevronDown className="size-4 text-muted-foreground/60 transition-transform duration-300 group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="ml-5 border-l-2 border-sidebar-border/40 pl-3 my-2 space-y-1">
            {items.map(item => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuSubButton asChild isActive={pathname === item.href} className="text-[13px] h-9 rounded-md">
                  <Link href={item.href}>{item.label}</Link>
                </SidebarMenuSubButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
