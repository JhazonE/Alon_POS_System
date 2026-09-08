# Sidebar Custom Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `components/ui/sidebar.tsx` with a hand-built sidebar in the Segmented-cards design, keeping every existing behaviour.

**Architecture:** One 777-line shadcn file becomes four focused modules — a pure cookie module, a plain-React context, a panel shell with three presentations (expanded / 56px icon rail / mobile drawer), and a group-card component. `AppSidebar.tsx` keeps its job of turning `layout-nav-config` plus permissions into markup and stops knowing how a panel is built.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, plain Tailwind (no cva, no Radix), Playwright for tests.

**Spec:** `docs/superpowers/specs/2026-09-08-sidebar-custom-panel-design.md`

## Global Constraints

- **The `sidebar_state` cookie is a compatibility contract.** Name `sidebar_state`, values exactly `"true"`/`"false"`, `path=/`, `max-age=604800`. `app/(app)/layout.tsx` parses it with `/(?:^|;\s*)sidebar_state=(true|false)/`. Changing any part silently resets every existing user's collapsed preference.
- **Keyboard shortcut:** `b` with `metaKey` or `ctrlKey`.
- **Mobile breakpoint:** 768px (`max-width: 767px`).
- **Panel widths:** the expanded column is 300px with a 10px inset, so the visible card is 280px; the collapsed column is 56px with a 6px inset; the mobile drawer is a flush 280px. `SIDEBAR_WIDTH` and `SIDEBAR_WIDTH_ICON` in `sidebar-cookie.ts` name the column widths for tests to assert against — Tailwind classes stay literal, since a class name cannot interpolate a JS constant.
- **Colours — use these exact values, invent none:** panel `#0B2A2D`, card `#0F3336`, card border `#17403F`, panel border `#174145`, text `#C0E8E6`, active fill `#0E7C86`, hover/open fill `#143A3D`, sub-rail `#1F5155`, open-icon `#4FC3C9`, amber `#F2A93A`.
- **Row states:** rest `rgba(192,232,230,0.66)` weight 400; hover background `#143A3D`; active background `#0E7C86`, text `#FFFFFF`, weight 600; open accordion parent background `#143A3D`.
- **Do not touch `components/ui/*` other than deleting `sidebar.tsx`.** `Sheet` (35 importers), `Skeleton` (34), `Separator` (10) and `Tooltip` (6) all stay.
- **`npm run typecheck` must stay at exactly 10 errors.** That is the pre-existing baseline in `app/(app)/products/**`. Any new error is a failure.
- **Test commands:** whole suite `npm run test:e2e`; one file `npx playwright test tests/e2e/<file>.spec.ts`; one test `npx playwright test tests/e2e/<file>.spec.ts -g "<name>"`. Tests run on port 3100 against `alon_pos_test`, `workers: 1`.
- **Test attributes.** Every element a test targets carries a stable hook: panel `data-sidebar="panel"` with `data-state`, card `data-sidebar="card"` with `data-label`, row `data-sidebar="row"` with `data-active` and `data-href`, accordion trigger `data-sidebar="accordion"` with `data-state` and `data-label`.
- **Assert computed styles, not class names,** for anything about colour or background. A class list can look right while a base style still paints — that exact bug shipped in `7335b1e`.

---

### Task 1: Cookie contract and sidebar context

The cookie is the sharp edge of the whole rewrite, so it is isolated in a JSX-free module and gated by its own tests before anything renders.

**Files:**
- Create: `components/sidebar/sidebar-cookie.ts`
- Create: `components/sidebar/sidebar-context.tsx`
- Test: `tests/e2e/sidebar-cookie.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SIDEBAR_COOKIE_NAME: 'sidebar_state'`, `SIDEBAR_COOKIE_MAX_AGE: 604800`, `SIDEBAR_WIDTH: 300`, `SIDEBAR_WIDTH_ICON: 56`, `SIDEBAR_MOBILE_BREAKPOINT: 768`, `SIDEBAR_KEYBOARD_SHORTCUT: 'b'`
  - `readSidebarStateCookie(cookie: string): boolean`
  - `sidebarStateCookie(open: boolean): string`
  - `SidebarProvider({ defaultOpen?: boolean; children: React.ReactNode }): JSX.Element`
  - `useSidebar(): { open, setOpen, toggle, state, isMobile, mobileOpen, setMobileOpen }` where `state: 'expanded' | 'collapsed'`

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/sidebar-cookie.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_COOKIE_MAX_AGE,
  readSidebarStateCookie,
  sidebarStateCookie,
} from '../../components/sidebar/sidebar-cookie';

test.describe('sidebar cookie contract', () => {
  test('constants match the legacy shadcn provider', () => {
    expect(SIDEBAR_COOKIE_NAME).toBe('sidebar_state');
    expect(SIDEBAR_COOKIE_MAX_AGE).toBe(604800);
  });

  test('defaults to open when the cookie is absent', () => {
    expect(readSidebarStateCookie('')).toBe(true);
    expect(readSidebarStateCookie('other=1; another=2')).toBe(true);
  });

  test('reads both persisted values', () => {
    expect(readSidebarStateCookie('sidebar_state=false')).toBe(false);
    expect(readSidebarStateCookie('sidebar_state=true')).toBe(true);
  });

  test('reads the cookie when others surround it', () => {
    expect(readSidebarStateCookie('a=1; sidebar_state=false; b=2')).toBe(false);
  });

  test('ignores a cookie whose name merely ends in sidebar_state', () => {
    expect(readSidebarStateCookie('x_sidebar_state=false')).toBe(true);
  });

  test('serializes exactly what layout.tsx parses back', () => {
    expect(sidebarStateCookie(false)).toBe('sidebar_state=false; path=/; max-age=604800');
    expect(sidebarStateCookie(true)).toBe('sidebar_state=true; path=/; max-age=604800');
  });

  test('round-trips through the layout regex', () => {
    for (const open of [true, false]) {
      expect(readSidebarStateCookie(sidebarStateCookie(open))).toBe(open);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/sidebar-cookie.spec.ts`
Expected: FAIL — cannot resolve `../../components/sidebar/sidebar-cookie`.

- [ ] **Step 3: Write the cookie module**

Create `components/sidebar/sidebar-cookie.ts` (no JSX — it must stay importable from a plain test):

```ts
/**
 * Persistence contract for the sidebar's open state.
 *
 * These values are NOT free to change. app/(app)/layout.tsx seeds the
 * provider by parsing this cookie itself on mount, and existing installs
 * already carry it. A different name, value spelling or max-age silently
 * resets every user's collapsed preference on their next reload.
 */
export const SIDEBAR_COOKIE_NAME = 'sidebar_state';
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 604800 — one week

/** Column widths, for tests to assert against. Tailwind classes stay literal. */
export const SIDEBAR_WIDTH = 300;
export const SIDEBAR_WIDTH_ICON = 56;
export const SIDEBAR_MOBILE_BREAKPOINT = 768;
export const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

/** Parse the persisted open state out of a document.cookie string. */
export function readSidebarStateCookie(cookie: string): boolean {
  const match = cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
  return match ? match[1] === 'true' : true;
}

/** Serialize the cookie exactly as layout.tsx expects to read it back. */
export function sidebarStateCookie(open: boolean): string {
  return `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/sidebar-cookie.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the context**

Create `components/sidebar/sidebar-context.tsx`:

```tsx
'use client';

import * as React from 'react';
import {
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_MOBILE_BREAKPOINT,
  sidebarStateCookie,
} from './sidebar-cookie';

type SidebarContextValue = {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
  state: 'expanded' | 'collapsed';
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used inside <SidebarProvider>');
  return ctx;
}

export function SidebarProvider({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpenState] = React.useState(defaultOpen);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // Starts false so server and first client render agree; the effect below
  // corrects it before paint on a narrow viewport.
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SIDEBAR_MOBILE_BREAKPOINT - 1}px)`);
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    document.cookie = sidebarStateCookie(value);
  }, []);

  const toggle = React.useCallback(() => {
    if (isMobile) setMobileOpen(v => !v);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const value = React.useMemo<SidebarContextValue>(() => ({
    open,
    setOpen,
    toggle,
    state: open ? 'expanded' : 'collapsed',
    isMobile,
    mobileOpen,
    setMobileOpen,
  }), [open, setOpen, toggle, isMobile, mobileOpen]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
```

- [ ] **Step 6: Verify types**

Run: `npm run typecheck 2>&1 | grep -c "error TS"`
Expected: `10` — the pre-existing baseline, no new errors.

- [ ] **Step 7: Commit**

```bash
git add components/sidebar/sidebar-cookie.ts components/sidebar/sidebar-context.tsx tests/e2e/sidebar-cookie.spec.ts
git commit -m "feat: sidebar cookie contract and provider

Pure cookie module pinned by tests to the exact name, values and max-age
layout.tsx parses, so the rewrite cannot silently reset anyone's collapsed
preference. Plain-React provider replaces shadcn's, no Radix."
```

---

### Task 2: Panel shell and group cards, wired in

The swap. After this task the app runs on the new panel and `layout.tsx` no longer imports shadcn's sidebar. Collapsed simply hides the panel for now; Task 3 gives it the rail.

**Files:**
- Create: `components/sidebar/sidebar-shell.tsx`
- Create: `components/sidebar/nav-card.tsx`
- Modify: `app/(app)/AppSidebar.tsx` (rewrite the shell and row markup; keep the permission gating and `openSection` state)
- Modify: `app/(app)/layout.tsx` (swap the provider and inset imports)
- Modify: `components/AnimatedSidebarTrigger.tsx` (rename `toggleSidebar` → `toggle`, change import)
- Test: `tests/e2e/sidebar-panel.spec.ts`

**Interfaces:**
- Consumes: `SidebarProvider`, `useSidebar` from Task 1; `SIDEBAR_WIDTH` from `sidebar-cookie`.
- Produces:
  - `SidebarPanel({ children }): JSX.Element` — renders `<aside data-sidebar="panel" data-state={state}>`
  - `SidebarInset({ children }): JSX.Element`
  - `NavCard({ label, children }): JSX.Element` — `<div data-sidebar="card" data-label={label}>`
  - `NavRow({ href, icon, label, active, badge? }): JSX.Element` — `<Link data-sidebar="row" data-active data-href>`
  - `NavAccordion({ label, icon, items, pathname, isActive, openSection, onOpenChange }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/sidebar-panel.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';

const ADMIN = {
  ...DEFAULT_ADMIN,
  permissions: [
    'view_dashboard', 'manage_products', 'manage_inventory', 'view_sales',
    'manage_customers', 'manage_suppliers', 'manage_purchases', 'view_approvals',
    'manage_approval_settings', 'view_reports', 'manage_users', 'manage_settings',
  ],
};

const bg = (page: import('@playwright/test').Page, selector: string) =>
  page.locator(selector).evaluate(el => getComputedStyle(el).backgroundColor);

test.describe('sidebar panel', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('renders group cards', async ({ page }) => {
    await page.goto('/dashboard');
    const labels = await page.locator('[data-sidebar="card"]').evaluateAll(
      els => els.map(e => e.getAttribute('data-label')),
    );
    expect(labels).toContain('OVERVIEW');
    expect(labels).toContain('SELL');
    expect(labels).toContain('PURCHASING');
  });

  test('the active row is filled with the brand teal', async ({ page }) => {
    await page.goto('/products');
    await expect(page.locator('[data-sidebar="row"][data-href="/products"]')).toHaveAttribute('data-active', 'true');
    expect(await bg(page, '[data-sidebar="row"][data-href="/products"]')).toBe('rgb(14, 124, 134)');
  });

  test('a resting row has no background', async ({ page }) => {
    await page.goto('/products');
    expect(await bg(page, '[data-sidebar="row"][data-href="/dashboard"]')).toBe('rgba(0, 0, 0, 0)');
  });

  test('only one accordion section is open at a time', async ({ page }) => {
    await page.goto('/dashboard');
    const openLabels = () => page.locator('[data-sidebar="accordion"][data-state="open"]')
      .evaluateAll(els => els.map(e => e.getAttribute('data-label')));

    await page.click('[data-sidebar="accordion"][data-label="Sales"]');
    expect(await openLabels()).toEqual(['Sales']);

    await page.click('[data-sidebar="accordion"][data-label="Inventory"]');
    expect(await openLabels()).toEqual(['Inventory']);

    await page.click('[data-sidebar="accordion"][data-label="Inventory"]');
    expect(await openLabels()).toEqual([]);
  });

  test('navigating into a section opens it', async ({ page }) => {
    await page.goto('/inventory/stock-counts');
    await expect(page.locator('[data-sidebar="accordion"][data-label="Inventory"]')).toHaveAttribute('data-state', 'open');
  });

  test('a collapsed cookie survives a reload', async ({ page, context }) => {
    await context.addCookies([{
      name: 'sidebar_state', value: 'false', domain: 'localhost', path: '/',
    }]);
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="panel"]')).toHaveAttribute('data-state', 'collapsed');
  });

  test('Ctrl+B flips the state and writes the cookie', async ({ page, context }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="panel"]')).toHaveAttribute('data-state', 'expanded');

    await page.keyboard.press('Control+b');
    await expect(page.locator('[data-sidebar="panel"]')).toHaveAttribute('data-state', 'collapsed');

    const cookie = (await context.cookies()).find(c => c.name === 'sidebar_state');
    expect(cookie?.value).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/sidebar-panel.spec.ts`
Expected: FAIL — no `[data-sidebar="card"]` elements exist yet.

- [ ] **Step 3: Write the shell**

Create `components/sidebar/sidebar-shell.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useSidebar } from './sidebar-context';

/**
 * The floating panel. Three presentations share these children; this task
 * ships expanded and a collapsed state that simply hides the panel. Task 3
 * replaces the hidden state with the 56px icon rail and Task 4 adds the
 * mobile drawer.
 */
export function SidebarPanel({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <aside
      data-sidebar="panel"
      data-state={state}
      className={[
        'non-printable shrink-0 overflow-hidden transition-[width] duration-200',
        collapsed ? 'w-0' : 'w-[300px]',
      ].join(' ')}
    >
      <div className="sticky top-0 flex h-svh w-[300px] p-[10px]">
        <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-[#174145] bg-[#0B2A2D]">
          {children}
        </div>
      </div>
    </aside>
  );
}

export function SidebarInset({ children }: { children: React.ReactNode }) {
  return <main className="flex min-w-0 flex-1 flex-col">{children}</main>;
}
```

- [ ] **Step 4: Write the group card and rows**

Create `components/sidebar/nav-card.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

const ROW_BASE =
  'flex h-8 items-center gap-[9px] rounded-lg px-2 text-[12.5px] transition-colors';
const ROW_REST = 'text-[rgba(192,232,230,0.66)] hover:bg-[#143A3D]';
const ROW_ACTIVE = 'bg-[#0E7C86] font-semibold text-white';
const ICON_BOX =
  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md';

export function NavCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      data-sidebar="card"
      data-label={label}
      className="flex flex-col gap-0.5 rounded-xl border border-[#17403F] bg-[#0F3336] px-2 py-[9px]"
    >
      <div className="px-2 pb-1.5 pt-0.5 text-[8px] font-bold tracking-[0.15em] text-[rgba(192,232,230,0.34)]">
        {label}
      </div>
      {children}
    </div>
  );
}

export function NavRow({
  href, icon: Icon, label, active, badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      data-sidebar="row"
      data-href={href}
      data-active={active}
      className={`${ROW_BASE} ${active ? ROW_ACTIVE : ROW_REST}`}
    >
      <span className={`${ICON_BOX} ${active ? 'bg-white/20' : 'bg-[rgba(45,165,176,0.13)]'}`}>
        <Icon className="h-[13px] w-[13px]" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge ? (
        <span className="rounded-full bg-[#F2A93A] px-1.5 py-0.5 text-[9px] font-bold text-[#0B2A2D]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function NavAccordion({
  label, icon: Icon, items, pathname, isActive, openSection, onOpenChange,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { href: string; label: string }[];
  pathname: string;
  isActive: boolean;
  openSection: string | null;
  onOpenChange: (section: string | null) => void;
}) {
  const open = openSection === label;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        data-sidebar="accordion"
        data-label={label}
        data-state={open ? 'open' : 'closed'}
        aria-expanded={open}
        onClick={() => onOpenChange(open ? null : label)}
        className={`${ROW_BASE} w-full ${open || isActive ? 'bg-[#143A3D] font-medium text-[#DCF2F0]' : ROW_REST}`}
      >
        <span className={`${ICON_BOX} ${open ? 'bg-[rgba(45,165,176,0.2)]' : 'bg-[rgba(45,165,176,0.13)]'}`}>
          <Icon className={`h-[13px] w-[13px] ${open ? 'text-[#4FC3C9]' : ''}`} />
        </span>
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-[rgba(192,232,230,0.35)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="my-[3px] ml-[19px] flex flex-col gap-px border-l border-[#1F5155] pl-3">
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              data-sidebar="row"
              data-href={item.href}
              data-active={pathname === item.href}
              className={`flex h-7 items-center rounded-md px-2 text-[12px] transition-colors ${
                pathname === item.href
                  ? 'bg-[#0E7C86] font-semibold text-white'
                  : 'text-[rgba(192,232,230,0.6)] hover:bg-[#143A3D]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Rewire AppSidebar, layout and the trigger**

In `app/(app)/AppSidebar.tsx`: delete every `@/components/ui/sidebar` import and replace the markup with `SidebarPanel` + `NavCard`/`NavRow`/`NavAccordion`. Keep unchanged: the `Props` type, all `hasPermission(...)` gating, the `isSalesPage`/`isInventoryPage`/etc. flags, `activeSection`, the `openSection` state and its effect, the search box, `navIndex` (including the `reportSearchItems` entry), and the footer. Delete `CollapsibleNavSection`, `FlatNavLinks`, `SectionProps` and the `NAV_ROW` constant.

The composed body takes this shape — the SELL card shows both row kinds, and every other card follows it:

```tsx
<SidebarPanel>
  <SidebarHeaderBlock />        {/* the existing logo + wordmark markup, unchanged */}
  <SidebarSearchBlock />        {/* the existing search input + Ctrl+K handling, unchanged */}

  <div className="flex flex-1 flex-col gap-[9px] overflow-y-auto px-3">
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

    {/* PURCHASING: Purchase Orders + Suppliers accordions, gated as today */}
    {/* Inventory and Customers accordions, gated as today */}
    {/* Insights and Admin rows, gated as today */}
  </div>

  <SidebarFooterBlock />        {/* the existing avatar + dropdown markup, unchanged */}
</SidebarPanel>
```

The three commented lines are the remaining groups; build each exactly like SELL, with the same `hasPermission` guard each one carries today. Task 5 later merges the last two comments into `OPERATIONS` and `INSIGHTS & ADMIN` cards — leave them as separate cards for now so this task's diff stays reviewable on its own.

In `app/(app)/layout.tsx`, change the imports only:

```tsx
import { SidebarProvider } from '@/components/sidebar/sidebar-context';
import { SidebarInset, SidebarPanel } from '@/components/sidebar/sidebar-shell';
```

Leave the existing `defaultSidebarOpen` `useState` initializer exactly as it is — it already parses the cookie Task 1 pins, and it still feeds `<SidebarProvider defaultOpen={defaultSidebarOpen}>`.

In `components/AnimatedSidebarTrigger.tsx`, two edits:

```tsx
import { useSidebar } from '@/components/sidebar/sidebar-context';
// ...
const { toggle, state } = useSidebar();
```

and change the `onClick` body from `toggleSidebar()` to `toggle()`. Nothing else in that file changes.

- [ ] **Step 6: Run the tests**

Run: `npx playwright test tests/e2e/sidebar-panel.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Check nothing else regressed**

Run: `npm run typecheck 2>&1 | grep -c "error TS"`
Expected: `10`.

Run: `npx playwright test tests/e2e/developer-page-toggles.spec.ts`
Expected: PASS — that suite asserts sidebar links appear and disappear, so it proves the permission and disabled-page gating survived the rewrite.

- [ ] **Step 8: Commit**

```bash
git add components/sidebar/ app/\(app\)/AppSidebar.tsx app/\(app\)/layout.tsx components/AnimatedSidebarTrigger.tsx tests/e2e/sidebar-panel.spec.ts
git commit -m "feat: hand-built sidebar panel with segmented group cards

Replaces shadcn's Sidebar/SidebarMenu* with our own shell and nav card in
the approved Segmented-cards design. No Radix Slot, no cva; row state is
written directly. Accordion stays single-open and the sidebar_state cookie
still round-trips, both covered by tests."
```

---

### Task 3: Collapsed icon rail

**Files:**
- Modify: `components/sidebar/sidebar-shell.tsx`
- Modify: `components/sidebar/nav-card.tsx`
- Test: `tests/e2e/sidebar-rail.spec.ts`

**Interfaces:**
- Consumes: `SidebarPanel`, `NavCard`, `NavRow`, `NavAccordion` from Task 2; `useSidebar` from Task 1; `SIDEBAR_WIDTH_ICON` from `sidebar-cookie`.
- Produces: no new exports. `NavCard`/`NavRow`/`NavAccordion` gain internal collapsed rendering driven by `useSidebar().state`.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/sidebar-rail.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { SIDEBAR_WIDTH_ICON } from '../../components/sidebar/sidebar-cookie';

const ADMIN = {
  ...DEFAULT_ADMIN,
  permissions: [
    'view_dashboard', 'manage_products', 'manage_inventory', 'view_sales',
    'manage_customers', 'manage_suppliers', 'manage_purchases', 'view_approvals',
    'view_reports', 'manage_users', 'manage_settings',
  ],
};

test.describe('collapsed icon rail', () => {
  test.beforeEach(async ({ page, context }) => {
    await seedSession(page, ADMIN);
    await context.addCookies([{
      name: 'sidebar_state', value: 'false', domain: 'localhost', path: '/',
    }]);
  });

  test('the rail is SIDEBAR_WIDTH_ICON wide', async ({ page }) => {
    await page.goto('/dashboard');
    const width = await page.locator('[data-sidebar="panel"]')
      .evaluate(el => el.getBoundingClientRect().width);
    expect(Math.round(width)).toBe(SIDEBAR_WIDTH_ICON);
  });

  test('rows keep their icons but hide their labels', async ({ page }) => {
    await page.goto('/dashboard');
    const row = page.locator('[data-sidebar="row"][data-href="/dashboard"]');
    await expect(row.locator('svg')).toBeVisible();
    await expect(row.locator('[data-sidebar="row-label"]')).toBeHidden();
  });

  test('the card grouping still reads as separate blocks', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="card"]').first()).toBeVisible();
    expect(await page.locator('[data-sidebar="card"]').count()).toBeGreaterThan(1);
  });

  test('every row keeps an accessible name', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="row"][data-href="/dashboard"]'))
      .toHaveAttribute('aria-label', 'Dashboard');
  });

  test('hovering a row reveals its label', async ({ page }) => {
    await page.goto('/dashboard');
    const row = page.locator('[data-sidebar="row"][data-href="/dashboard"]');
    await expect(page.locator('[data-sidebar="tip"]')).toHaveCount(0);
    await row.hover();
    await expect(page.locator('[data-sidebar="tip"]')).toHaveText('Dashboard');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/sidebar-rail.spec.ts`
Expected: FAIL — the panel measures 0px wide, since Task 2 collapses to `w-0`.

- [ ] **Step 3: Give the panel a rail width**

In `components/sidebar/sidebar-shell.tsx`, replace `collapsed ? 'w-0' : 'w-[300px]'` with `collapsed ? 'w-[56px]' : 'w-[300px]'`, and change the inner `w-[300px]` to `${collapsed ? 'w-[56px] p-[6px]' : 'w-[300px] p-[10px]'}`. Import `useSidebar` is already present.

- [ ] **Step 4: Add collapsed rendering to the card and rows**

In `components/sidebar/nav-card.tsx`, import `useSidebar` from `./sidebar-context` and add a small tooltip. Wrap each row's text in a labelled span so the rail test can assert on it:

```tsx
import { useSidebar } from './sidebar-context';

function RowTip({ label }: { label: string }) {
  return (
    <span
      data-sidebar="tip"
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-[#174145] bg-[#0B2A2D] px-2 py-1 text-[11px] text-[#DCF2F0] shadow-lg"
    >
      {label}
    </span>
  );
}
```

`NavCard` hides its label when collapsed:

```tsx
const { state } = useSidebar();
const collapsed = state === 'collapsed';
// ...className={`flex flex-col gap-0.5 rounded-xl border border-[#17403F] bg-[#0F3336] ${collapsed ? 'px-1 py-1.5' : 'px-2 py-[9px]'}`}
{collapsed ? null : (
  <div className="px-2 pb-1.5 pt-0.5 text-[8px] font-bold tracking-[0.15em] text-[rgba(192,232,230,0.34)]">
    {label}
  </div>
)}
```

`NavRow` becomes hover-aware and self-labelling:

```tsx
const { state } = useSidebar();
const collapsed = state === 'collapsed';
const [hovered, setHovered] = React.useState(false);

return (
  <Link
    href={href}
    aria-label={label}
    data-sidebar="row"
    data-href={href}
    data-active={active}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    onFocus={() => setHovered(true)}
    onBlur={() => setHovered(false)}
    className={`${ROW_BASE} relative ${collapsed ? 'justify-center px-0' : ''} ${active ? ROW_ACTIVE : ROW_REST}`}
  >
    <span className={`${ICON_BOX} ${active ? 'bg-white/20' : 'bg-[rgba(45,165,176,0.13)]'}`}>
      <Icon className="h-[13px] w-[13px]" />
    </span>
    {collapsed ? null : <span data-sidebar="row-label" className="flex-1 truncate">{label}</span>}
    {!collapsed && badge ? (
      <span className="rounded-full bg-[#F2A93A] px-1.5 py-0.5 text-[9px] font-bold text-[#0B2A2D]">{badge}</span>
    ) : null}
    {collapsed && hovered ? <RowTip label={label} /> : null}
  </Link>
);
```

`NavAccordion`'s trigger gets the same treatment. Note the sub-item list is suppressed entirely when collapsed — there is no room for it — but the click still records `onOpenChange`, so the section is already open when the panel expands:

```tsx
export function NavAccordion({
  label, icon: Icon, items, pathname, isActive, openSection, onOpenChange,
}: { /* unchanged props */ }) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const [hovered, setHovered] = React.useState(false);
  const open = openSection === label;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        data-sidebar="accordion"
        data-label={label}
        data-state={open ? 'open' : 'closed'}
        onClick={() => onOpenChange(open ? null : label)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={`${ROW_BASE} relative w-full ${collapsed ? 'justify-center px-0' : ''} ${
          open || isActive ? 'bg-[#143A3D] font-medium text-[#DCF2F0]' : ROW_REST
        }`}
      >
        <span className={`${ICON_BOX} ${open ? 'bg-[rgba(45,165,176,0.2)]' : 'bg-[rgba(45,165,176,0.13)]'}`}>
          <Icon className={`h-[13px] w-[13px] ${open ? 'text-[#4FC3C9]' : ''}`} />
        </span>
        {collapsed ? null : (
          <>
            <span data-sidebar="row-label" className="flex-1 truncate text-left">{label}</span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 text-[rgba(192,232,230,0.35)] transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </>
        )}
        {collapsed && hovered ? <RowTip label={label} /> : null}
      </button>

      {open && !collapsed ? (
        <div className="my-[3px] ml-[19px] flex flex-col gap-px border-l border-[#1F5155] pl-3">
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              data-sidebar="row"
              data-href={item.href}
              data-active={pathname === item.href}
              className={`flex h-7 items-center rounded-md px-2 text-[12px] transition-colors ${
                pathname === item.href
                  ? 'bg-[#0E7C86] font-semibold text-white'
                  : 'text-[rgba(192,232,230,0.6)] hover:bg-[#143A3D]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx playwright test tests/e2e/sidebar-rail.spec.ts`
Expected: PASS, 5 tests.

Run: `npx playwright test tests/e2e/sidebar-panel.spec.ts`
Expected: PASS, 7 tests — the expanded behaviour is unchanged.

- [ ] **Step 6: Commit**

```bash
git add components/sidebar/ tests/e2e/sidebar-rail.spec.ts
git commit -m "feat: 56px collapsed icon rail

Each group card shrinks to a block of icon squares so the grouping still
reads vertically. Labels move to a hand-rolled hover tooltip; the link
keeps its accessible name via aria-label, so the tip is decoration only."
```

---

### Task 4: Mobile overlay drawer

**Files:**
- Modify: `components/sidebar/sidebar-shell.tsx`
- Test: `tests/e2e/sidebar-mobile.spec.ts`

**Interfaces:**
- Consumes: `useSidebar` from Task 1 (`isMobile`, `mobileOpen`, `setMobileOpen`).
- Produces: no new exports. `SidebarPanel` renders a fixed drawer plus backdrop when `isMobile`.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/sidebar-mobile.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';

const ADMIN = {
  ...DEFAULT_ADMIN,
  permissions: ['view_dashboard', 'manage_products', 'view_sales', 'view_reports', 'manage_settings'],
};

test.use({ viewport: { width: 375, height: 780 } });

test.describe('mobile drawer', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
    await page.goto('/dashboard');
  });

  test('is closed on load', async ({ page }) => {
    await expect(page.locator('[data-sidebar="drawer"]')).toHaveCount(0);
  });

  test('the trigger opens it', async ({ page }) => {
    await page.click('button[aria-label*="sidebar"]');
    await expect(page.locator('[data-sidebar="drawer"]')).toBeVisible();
    await expect(page.locator('[data-sidebar="drawer"]')).toHaveAttribute('aria-modal', 'true');
  });

  test('clicking the backdrop closes it', async ({ page }) => {
    await page.click('button[aria-label*="sidebar"]');
    await page.locator('[data-sidebar="backdrop"]').click({ position: { x: 350, y: 400 } });
    await expect(page.locator('[data-sidebar="drawer"]')).toHaveCount(0);
  });

  test('Escape closes it and returns focus to the trigger', async ({ page }) => {
    const trigger = page.locator('button[aria-label*="sidebar"]');
    await trigger.click();
    await expect(page.locator('[data-sidebar="drawer"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-sidebar="drawer"]')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('body scroll is locked while open', async ({ page }) => {
    await page.click('button[aria-label*="sidebar"]');
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/sidebar-mobile.spec.ts`
Expected: FAIL — no `[data-sidebar="drawer"]` exists.

- [ ] **Step 3: Implement the drawer**

In `components/sidebar/sidebar-shell.tsx`, branch `SidebarPanel` on `isMobile` before the desktop return:

```tsx
export function SidebarPanel({ children }: { children: React.ReactNode }) {
  const { state, isMobile, mobileOpen, setMobileOpen } = useSidebar();

  React.useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        // Focus goes back where it came from: the trigger that opened this.
        document.querySelector<HTMLElement>('button[aria-label*="sidebar"]')?.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobile, mobileOpen, setMobileOpen]);

  if (isMobile) {
    if (!mobileOpen) return null;
    return (
      <>
        <div
          data-sidebar="backdrop"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50"
        />
        <div
          data-sidebar="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-hidden border-r border-[#174145] bg-[#0B2A2D]"
        >
          {children}
        </div>
      </>
    );
  }

  const collapsed = state === 'collapsed';
  // ...the desktop return from Tasks 2 and 3, unchanged
}
```

The drawer deliberately has no focus trap: it is a nav list over a static page, and Escape plus backdrop-click cover the exits the test asserts.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test tests/e2e/sidebar-mobile.spec.ts`
Expected: PASS, 5 tests.

Run: `npx playwright test tests/e2e/sidebar-panel.spec.ts tests/e2e/sidebar-rail.spec.ts`
Expected: PASS — desktop behaviour unchanged at the default viewport.

- [ ] **Step 5: Commit**

```bash
git add components/sidebar/sidebar-shell.tsx tests/e2e/sidebar-mobile.spec.ts
git commit -m "feat: hand-rolled mobile sidebar drawer

Fixed panel plus backdrop under 768px, closing on backdrop click and
Escape with focus returned to the trigger, and body scroll locked while
open. Replaces the Radix Sheet the shadcn sidebar used; Sheet itself
stays for the 35 other files that import it."
```

---

### Task 5: OPERATIONS and INSIGHTS & ADMIN groupings

**Files:**
- Modify: `app/(app)/layout-nav-config.ts`
- Modify: `app/(app)/AppSidebar.tsx`
- Test: `tests/e2e/sidebar-panel.spec.ts` (add one test)

**Interfaces:**
- Consumes: `NavCard` from Task 2.
- Produces: no new exports; `AppSidebar` renders cards labelled `OPERATIONS` and `INSIGHTS & ADMIN`.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/sidebar-panel.spec.ts` inside the existing `describe`:

```ts
  test('Inventory and Customers sit under OPERATIONS', async ({ page }) => {
    await page.goto('/dashboard');
    const card = page.locator('[data-sidebar="card"][data-label="OPERATIONS"]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-sidebar="accordion"][data-label="Inventory"]')).toBeVisible();
    await expect(card.locator('[data-sidebar="accordion"][data-label="Customers"]')).toBeVisible();
  });

  test('Reports joins the admin items in one card', async ({ page }) => {
    await page.goto('/dashboard');
    const card = page.locator('[data-sidebar="card"][data-label="INSIGHTS & ADMIN"]');
    await expect(card.locator('[data-sidebar="row"][data-href="/reports"]')).toBeVisible();
    await expect(card.locator('[data-sidebar="row"][data-href="/settings"]')).toBeVisible();
    const labels = await page.locator('[data-sidebar="card"]').evaluateAll(
      els => els.map(e => e.getAttribute('data-label')),
    );
    expect(labels).not.toContain('INSIGHTS');
    expect(labels).not.toContain('ADMIN');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/sidebar-panel.spec.ts -g "OPERATIONS"`
Expected: FAIL — no card carries that label.

- [ ] **Step 3: Regroup**

In `app/(app)/AppSidebar.tsx`, wrap the Inventory and Customers accordions in a single `<NavCard label="OPERATIONS">`, replacing the current unlabelled group. Merge the Insights group and the Admin group into one `<NavCard label="INSIGHTS & ADMIN">` holding Reports, Approvals Board, User Management and Settings.

Keep each item's existing permission gate exactly as it is — `view_reports` on Reports, `view_approvals` on Approvals Board, `manage_users` on User Management, `manage_settings` on Settings, `manage_inventory` on Inventory, `manage_customers` on Customers. Render the card only when at least one of its items survives gating, so a card never appears empty:

```tsx
{(filteredInsightsNavItems.length > 0 || filteredAdminNavItems.length > 0) && (
  <NavCard label="INSIGHTS &amp; ADMIN">
    {/* rows */}
  </NavCard>
)}
```

In `app/(app)/layout-nav-config.ts`, update the comment above `insightsNavItems` to say the Insights and Admin items now render in one card, so the file does not describe a structure that no longer exists.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test tests/e2e/sidebar-panel.spec.ts`
Expected: PASS, 9 tests.

Run: `npx playwright test tests/e2e/developer-page-toggles.spec.ts`
Expected: PASS — proves the regrouping did not disturb permission or disabled-page gating.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/AppSidebar.tsx app/\(app\)/layout-nav-config.ts tests/e2e/sidebar-panel.spec.ts
git commit -m "feat: group nav under OPERATIONS and INSIGHTS & ADMIN

Inventory and Customers gain a heading they never had, and Reports joins
the admin items in one card. Each card renders only when at least one of
its items survives permission gating."
```

---

### Task 6: Pending-approvals badge

**Files:**
- Create: `app/api/approvals/queue/count/route.ts`
- Modify: `app/(app)/AppSidebar.tsx`
- Test: `tests/e2e/approvals-count.spec.ts`

**Interfaces:**
- Consumes: `NavRow`'s existing `badge?: number` prop from Task 2.
- Produces: `GET /api/approvals/queue/count?status=Pending` → `{ count: number }`.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/approvals-count.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';

const ADMIN = {
  ...DEFAULT_ADMIN,
  permissions: ['view_dashboard', 'view_approvals', 'view_reports', 'manage_users', 'manage_settings'],
};

test.describe('approvals count endpoint', () => {
  test('returns a numeric count', async ({ request }) => {
    const res = await request.get('/api/approvals/queue/count?status=Pending');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.count).toBe('number');
    expect(body.count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('approvals badge', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('shows the count when there are pending approvals', async ({ page }) => {
    await page.route('**/api/approvals/queue/count*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 4 }) }),
    );
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="row"][data-href="/approvals"] [data-sidebar="badge"]'))
      .toHaveText('4');
  });

  test('shows no badge when the count is zero', async ({ page }) => {
    await page.route('**/api/approvals/queue/count*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }),
    );
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="row"][data-href="/approvals"] [data-sidebar="badge"]'))
      .toHaveCount(0);
  });

  test('the row still renders when the count request fails', async ({ page }) => {
    await page.route('**/api/approvals/queue/count*', route => route.fulfill({ status: 500, body: '' }));
    await page.goto('/dashboard');
    await expect(page.locator('[data-sidebar="row"][data-href="/approvals"]')).toBeVisible();
    await expect(page.locator('[data-sidebar="row"][data-href="/approvals"] [data-sidebar="badge"]'))
      .toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/approvals-count.spec.ts`
Expected: FAIL — the route 404s and no badge element exists.

- [ ] **Step 3: Add the endpoint**

Create `app/api/approvals/queue/count/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';

/**
 * Lightweight count for the sidebar badge.
 *
 * GET /api/approvals/queue returns full rows and then runs follow-up queries
 * for products, warehouses and shelves — far too heavy to sit behind a nav
 * item that renders on every page.
 */
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status') || 'Pending';
    const rows = await query(
      'SELECT COUNT(*) AS count FROM approval_queue WHERE status = ?',
      [status],
    ) as { count: number }[];
    return NextResponse.json({ count: Number(rows?.[0]?.count ?? 0) });
  } catch (error) {
    console.error('Error counting approval queue:', error);
    return NextResponse.json({ error: 'Failed to count approvals' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Add the badge element and fetch**

In `components/sidebar/nav-card.tsx`, tag the badge span so tests can find it — change the badge element opening tag to:

```tsx
<span
  data-sidebar="badge"
  className="rounded-full bg-[#F2A93A] px-1.5 py-0.5 text-[9px] font-bold text-[#0B2A2D]"
>
```

In `app/(app)/AppSidebar.tsx`, fetch the count and pass it to the Approvals Board row:

```tsx
// The badge is a convenience indicator, never a source of truth: any failure
// leaves it at 0, and NavRow renders no badge for 0, so a nav item can never
// fail to render because a count failed.
const [pendingApprovals, setPendingApprovals] = React.useState(0);

React.useEffect(() => {
  if (!hasPermission('view_approvals')) return;
  let cancelled = false;
  fetch(getApiUrl('/approvals/queue/count?status=Pending'))
    .then(res => (res.ok ? res.json() : { count: 0 }))
    .then(data => { if (!cancelled) setPendingApprovals(Number(data?.count) || 0); })
    .catch(() => { if (!cancelled) setPendingApprovals(0); });
  return () => { cancelled = true; };
}, [pathname, hasPermission]);
```

Add `import { getApiUrl } from '@/lib/api-config';` and pass `badge={pendingApprovals}` on the Approvals Board `NavRow`.

- [ ] **Step 5: Run the tests**

Run: `npx playwright test tests/e2e/approvals-count.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add app/api/approvals/queue/count/route.ts app/\(app\)/AppSidebar.tsx components/sidebar/nav-card.tsx tests/e2e/approvals-count.spec.ts
git commit -m "feat: pending-approvals badge on the sidebar

New count endpoint backed by a single COUNT(*), because the existing queue
route returns full rows and runs follow-up queries. The badge degrades to
nothing on error or zero so a nav row can never fail on a count."
```

---

### Task 7: Delete the shadcn sidebar

**Files:**
- Delete: `components/ui/sidebar.tsx`
- Test: `tests/e2e/no-shadcn-sidebar.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: nothing. This task only removes.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/no-shadcn-sidebar.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full);
  }
  return out;
}

test.describe('shadcn sidebar is gone', () => {
  test('the component file no longer exists', () => {
    expect(existsSync(join(ROOT, 'components', 'ui', 'sidebar.tsx'))).toBe(false);
  });

  test('nothing imports components/ui/sidebar', () => {
    const offenders = walk(join(ROOT, 'app'))
      .concat(walk(join(ROOT, 'components')))
      .filter(f => /from\s+['"]@\/components\/ui\/sidebar['"]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('the components the rest of the app still needs survive', () => {
    for (const kept of ['sheet.tsx', 'tooltip.tsx', 'separator.tsx', 'skeleton.tsx']) {
      expect(existsSync(join(ROOT, 'components', 'ui', kept))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/no-shadcn-sidebar.spec.ts`
Expected: FAIL on the first two tests — the file still exists.

- [ ] **Step 3: Delete it**

```bash
git rm components/ui/sidebar.tsx
```

If the second test still reports offenders, fix those imports; do not weaken the test.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test tests/e2e/no-shadcn-sidebar.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck 2>&1 | grep -c "error TS"`
Expected: `10`.

Run: `npm run lint`
Expected: no new errors.

Run: `npm run test:e2e`
Expected: the whole suite passes, including every pre-existing spec.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete components/ui/sidebar.tsx

777 lines and 24 exports, 10 of which were already dead, replaced by four
focused modules. A test now asserts the file is gone and that nothing
imports it, and that Sheet, Tooltip, Separator and Skeleton survive —
those are used by 35, 6, 10 and 34 other files and are out of scope."
```

---

## Notes for the executor

- **Do not "improve" the row design mid-plan.** The filled active block is a deliberate reversal of the plain rows shipped in `7335b1e`, chosen from a design canvas. If it looks wrong to you, raise it — do not quietly restore the old treatment.
- **`AppSidebar.tsx` keeps behaviour added in earlier commits.** The single-open `openSection` state and its effect (`93c65aa`), the `reportSearchItems` entry in `navIndex` (`6b0edd8`), and the narrowed `isSalesPage`/`isInventoryPage` predicates all survive the rewrite. Port them; do not reinvent them.
- **There is no MySQL in a bare working environment.** Tasks 1 and 7's tests are filesystem/pure and run anywhere. Tasks 2–6 need the test database — `npm run test:e2e:db` reseeds it.
