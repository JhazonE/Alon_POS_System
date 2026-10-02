# Wave Stat Card Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-built `WaveStatCard` and `WaveLinkCard` components into every report page so the "wave" card shell (teal SVG flourish + shadow-brand tokens) actually renders, instead of the plain shadcn `Card` still used everywhere today.

**Architecture:** `components/reports/WaveStatCard.tsx` and `components/reports/WaveLinkCard.tsx` exist and are correct, but nothing imports them — that's the root cause of "wala nageffect" (no effect). This plan is a mechanical swap: replace each report page's `Card > CardHeader > CardTitle (+ optional icon) / CardContent > <div className="text-2xl font-bold ...">value</div> (+ optional sub `<p>`)` block with `<WaveStatCard label=... value=... icon=... sub=... valueClassName=... />`, and replace the `/reports` catalog tiles (`Card > CardHeader > CardTitle(icon+title) / CardDescription`, wrapped in `Link`) with `<WaveLinkCard href=... title=... description=... icon=... iconClassName=... />`. No data-fetching, calculation, or table code changes anywhere — only the stat-card/tile JSX blocks and their now-unused imports.

Card value styling (hardcoded/conditional Tailwind color classes, `text-xl` vs `text-2xl`, dark-mode variants) differs per page. Rather than inventing bespoke props per page, `WaveStatCard` gains one optional `valueClassName` prop (appended via `cn()` after the base `text-2xl font-extrabold leading-none text-foreground` classes) so every page's existing color/size logic ports over unchanged as a class string, and `value` stays `React.ReactNode` so multi-value cards (e.g. membership's "Cash / Card") keep working with no new prop.

**Tech Stack:** Next.js 16 (App Router, client components), Tailwind CSS 3.4, lucide-react icons, `cn()` from `@/lib/utils`.

**Spec:** None — `WaveStatCard`/`WaveLinkCard` were already built (see their file-header comments); this plan only wires them into pages. The catalog above was produced by direct codebase investigation (see Task 1).

## Global Constraints

- Do not change any data-fetching, `totals`/`summary` calculation logic, table rendering, filters, or export logic — only the stat-card/tile JSX and its imports.
- Do not remove `CardContent`/`CardDescription`/etc. imports that are still used elsewhere in the same file (e.g. a filter Card or table-wrapper Card) — only drop imports that become fully unused.
- Preserve every page's existing label text, icon choice, value expression, sub-text, and value color/size exactly — this is a shell swap, not a redesign.
- `WaveStatCard`'s new `valueClassName` prop must be additive (optional, default `undefined`) — do not change the existing `label`/`value`/`icon`/`sub` prop contract.
- Every task must pass `npm run typecheck` before commit (class-string and JSX edits can still break TS via prop mismatches or unused-import lint-as-error configs).

## Review Focus

- Cards with **no icon at all** (bir-summary, cost-vs-retail): `WaveStatCard`'s `icon` prop is already optional — confirm omitting it renders cleanly with no leftover gap where the icon used to be.
- Cards with **conditional/dynamic value color** (profit ≥/< 0, margin tiers, outstanding balance, dark-mode variants in cost-vs-retail): confirm the exact same conditional expression is passed through `valueClassName`, not flattened to a static class.
- The **batch-profit and cost-vs-retail variant pattern** (`text-xl` not `text-2xl`, `grid-cols-4` no 2-col breakpoint, batch-profit has no sub-text and puts the label directly in `CardHeader` with no `CardTitle`): confirm these still render at the right size/spacing via `valueClassName`/`sub` omission, not silently upgraded to the common pattern's `text-2xl`.
- The **membership page's 4th card** (dual value "Cash / Card", `text-lg`, no color): confirm `value` accepts the two-currency JSX fragment unchanged and `valueClassName` carries `text-lg` (overriding the component's default `text-2xl`).
- **Unused imports left behind**: after swapping a page's stat grid, confirm `CardHeader`/`CardTitle`/`CardContent` (and any now-orphaned lucide icon only used by the removed `₱`-glyph div, if any) are actually still needed elsewhere in that file before deciding whether to drop them from the import line — a file that still uses `Card` for a filter block must keep that import.

---

## Task 1: Extend `WaveStatCard` with `valueClassName`

**Files:**
- Modify: `components/reports/WaveStatCard.tsx`

**Interfaces:**
- Produces: `WaveStatCard` now accepts an optional `valueClassName?: string` prop. When provided, it's appended after the base value classes via `cn()` so callers can override color/size (e.g. `text-blue-600`, `text-xl`, a conditional ternary string, or dark-mode variants) exactly as their current plain-`Card` code does today.
- Consumes: `cn` from `@/lib/utils` (not currently imported in this file — must be added).

- [ ] **Step 1: Add the prop and apply it**

Open `components/reports/WaveStatCard.tsx`. Add the import and extend the props/JSX:

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The summary card used at the top of report pages. Uses the app's regular
 * shadcn surface tokens (bg-card/border-border/text-foreground) so it tracks
 * light/dark automatically, plus a wave-shaped flourish tinted from
 * --matte-accent -- the same teal accent the sidebar/header/dashboard use,
 * defined in globals.css for both themes.
 */
export function WaveStatCard({
  label,
  value,
  icon: Icon,
  sub,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div
      data-report="stat"
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-4"
    >
      <svg
        aria-hidden
        viewBox="0 0 200 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-1.5 -right-2.5 h-[60px] w-[110px]"
      >
        <path
          d="M0,60 C40,90 80,20 120,50 C150,72 180,40 200,55 L200,100 L0,100 Z"
          fill="rgb(var(--matte-accent))"
          opacity="0.14"
        />
        <path
          d="M20,75 C60,100 100,40 140,65 C165,80 190,55 200,68 L200,100 L0,100 Z"
          fill="rgb(var(--matte-accent))"
          opacity="0.22"
        />
      </svg>

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {Icon ? <Icon className="h-4 w-4 text-[rgb(var(--matte-accent))]" /> : null}
        </div>
        <div className={cn('mt-1.5 text-2xl font-extrabold leading-none text-foreground', valueClassName)}>
          {value}
        </div>
        {sub ? (
          <p className="mt-1.5 text-[11px] text-[rgb(var(--matte-accent))]">{sub}</p>
        ) : null}
      </div>
    </div>
  );
}
```

(Only change from the current file: the `cn` import, the new `valueClassName` prop, and wrapping the value `div`'s className in `cn(base, valueClassName)`. Everything else — the wave SVG, label, icon, sub — is unchanged.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/reports/WaveStatCard.tsx
git commit -m "feat(reports): add valueClassName to WaveStatCard for per-page value styling"
```

---

## Task 2: Wire `WaveLinkCard` into the `/reports` catalog page

**Files:**
- Modify: `app/(app)/reports/page.tsx`

**Interfaces:**
- Consumes: `WaveLinkCard` from `@/components/reports/WaveLinkCard` (existing component, unchanged) — props `href`, `title`, `description`, `icon`, `iconClassName`, `className`, all already matching `ReportCard`'s shape in `lib/report-catalog.ts` (`href`, `title`, `description`, `icon`, `iconClassName?`, `cardClassName?`).

- [ ] **Step 1: Replace the Card-based tile with WaveLinkCard**

Open `app/(app)/reports/page.tsx`. Replace the whole file with:

```tsx

'use client';

import { WaveLinkCard } from '@/components/reports/WaveLinkCard';
import { reportSections } from '@/lib/report-catalog';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
  return (
    <div className="grid gap-6 auto-rows-max">
      {reportSections.map((section, index) => (
        <div key={section.title} className="contents">
          <div className={cn('space-y-2', index > 0 && 'mt-8')}>
            <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
            <p className="text-muted-foreground">{section.blurb}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {section.cards.map(card => (
              <WaveLinkCard
                key={card.href}
                href={card.href}
                title={card.title}
                description={card.description}
                icon={card.icon}
                iconClassName={card.iconClassName}
                className={card.cardClassName}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

(`Card`/`CardDescription`/`CardHeader`/`CardTitle`/`Link` imports are dropped — `WaveLinkCard` renders its own `Link` internally. `cn` stays, still used for the section-spacing className.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open `http://localhost:3000/reports`. Expected: every report tile now shows the teal wave-flourish card shell (rounded-2xl, subtle SVG wave in the bottom-right corner) instead of the flat shadcn `Card`; hover still highlights the tile; clicking still navigates to the report.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/reports/page.tsx
git commit -m "feat(reports): wire WaveLinkCard into the /reports catalog page"
```

---

## Task 3: Wire `WaveStatCard` into the four "top volume/sales/profit-margin/by-product" pages (identical pattern)

**Files:**
- Modify: `app/(app)/reports/sales/top-volume/page.tsx:12-20,306-352`
- Modify: `app/(app)/reports/sales/top-sales/page.tsx:12-20,306-352`
- Modify: `app/(app)/reports/sales/profit-margin/page.tsx:12-20,304-350`
- Modify: `app/(app)/reports/sales/by-product/page.tsx:12-20,304-350`

**Interfaces:**
- Consumes: `WaveStatCard` from `@/components/reports/WaveStatCard` (label, value, icon, sub, valueClassName from Task 1).

All four files share byte-for-byte the same stat-grid structure (4 cards: Total Units Sold / Total Revenue / Total Products / Total Profit). Apply the same edit to each of the 4 files.

- [ ] **Step 1: Add the import**

In each of the 4 files, add next to the existing `Card` import block (do not remove `Card`/`CardContent`/`CardDescription`/`CardHeader`/`CardTitle` — they're still used by the filter Card and the data-table Card elsewhere in each file):

```tsx
import { WaveStatCard } from '@/components/reports/WaveStatCard';
```

- [ ] **Step 2: Replace the stat grid**

In each file, find the stat grid block (`top-volume`/`top-sales`: lines 306-352; `profit-margin`/`by-product`: lines 304-350) — a `<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">` containing 4 `<Card>` blocks for "Total Units Sold", "Total Revenue", "Total Products", "Total Profit". Replace the whole `<div className="grid ...">...</div>` block with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Total Units Sold"
          icon={Package2}
          value={totals.unitsSold.toLocaleString()}
          valueClassName="text-green-600"
          sub="Across all products"
        />

        <WaveStatCard
          label="Total Revenue"
          value={formatCurrency(totals.revenue)}
          valueClassName="text-blue-600"
          sub="Total product sales"
        />

        <WaveStatCard
          label="Total Products"
          icon={TrendingUp}
          value={totals.products}
          valueClassName="text-purple-600"
          sub="Products sold"
        />

        <WaveStatCard
          label="Total Profit"
          icon={TrendingUp}
          value={formatCurrency(totals.profit)}
          valueClassName={totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}
          sub="Revenue minus cost"
        />
      </div>
```

Notes:
- `profit-margin/page.tsx` currently uses `Percent` as the "Total Units Sold" card's icon (not `Package2`, which it imports but only uses in the page banner) — use `icon={Percent}` for that one file's first card instead of `Package2`, matching what was actually on screen before.
- The "Total Revenue" card previously used a literal `₱` glyph div, not a lucide icon — `WaveStatCard`'s `icon` prop is optional, so simply omit `icon` for that card (as shown above) rather than trying to pass the glyph div; this matches `WaveStatCard`'s design (icons are `React.ComponentType`, not arbitrary nodes).
- `cn` is no longer needed for the profit conditional (now a plain ternary string), but check each file for other `cn(...)` usages (e.g. the view-toggle buttons) before removing the `cn` import — in all 4 files `cn` is still used elsewhere, so keep the import.

- [ ] **Step 3: Remove now-unused lucide icon imports, if any**

Each file's lucide import line included `Package2, TrendingUp` (plus `CalendarIcon, FileDown, FileSpreadsheet, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight`, all still used elsewhere for filters/pagination/export buttons — do not remove those). `TrendingUp` and `Package2`/`Percent` are still needed for the icon props above, so no import removal is expected here — confirm by re-reading each file's final icon usage before deleting anything.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors, across all 4 files.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Visit `/reports/sales/top-volume`, `/reports/sales/top-sales`, `/reports/sales/profit-margin`, `/reports/sales/by-product`. Expected on each: 4 stat cards with the teal wave-flourish shell, same labels/values/colors as before.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/reports/sales/top-volume/page.tsx app/\(app\)/reports/sales/top-sales/page.tsx app/\(app\)/reports/sales/profit-margin/page.tsx app/\(app\)/reports/sales/by-product/page.tsx
git commit -m "feat(reports): wire WaveStatCard into top-volume/top-sales/profit-margin/by-product"
```

---

## Task 4: Wire `WaveStatCard` into `sales/summary`, `purchases/by-product`, `sales/returns`, `sales/discounts`

**Files:**
- Modify: `app/(app)/reports/sales/summary/page.tsx:317-363`
- Modify: `app/(app)/reports/purchases/by-product/page.tsx:282-326`
- Modify: `app/(app)/reports/sales/returns/page.tsx:338-395`
- Modify: `app/(app)/reports/sales/discounts/page.tsx:282-326`

**Interfaces:**
- Consumes: `WaveStatCard` (Task 1).

- [ ] **Step 1: `app/(app)/reports/sales/summary/page.tsx`**

Add `import { WaveStatCard } from '@/components/reports/WaveStatCard';` next to the existing `Card` import (keep `Card`/`CardContent`/`CardHeader`/`CardTitle`/`CardDescription` — still used by the filter Card above and the data Card below).

Replace lines 317-363 (the `{/* Summary Cards */}` grid) with:

```tsx
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Total Revenue"
          value={formatCurrency(totals.revenue)}
          valueClassName="text-blue-600"
          sub="Total sales amount"
        />

        <WaveStatCard
          label="Total Transactions"
          icon={ShoppingCart}
          value={totals.transactions}
          valueClassName="text-green-600"
          sub="Number of sales"
        />

        <WaveStatCard
          label="Avg Transaction"
          icon={TrendingUp}
          value={formatCurrency(totals.avgTransaction)}
          valueClassName="text-purple-600"
          sub="Average sale value"
        />

        <WaveStatCard
          label="Total Profit"
          icon={Percent}
          value={formatCurrency(totals.profit)}
          valueClassName={totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}
          sub="Revenue minus cost"
        />
      </div>
```

(The "Total Revenue" card previously used a literal `₱` div — omit `icon`, same as Task 3.)

- [ ] **Step 2: `app/(app)/reports/purchases/by-product/page.tsx`**

Add the `WaveStatCard` import. Replace lines 282-326 with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Total Spend"
          icon={PhilippinePeso}
          value={formatCurrency(totals.totalCost)}
          valueClassName="text-blue-600"
          sub="Total procurement value"
        />

        <WaveStatCard
          label="Units Purchased"
          icon={BarChart}
          value={totals.totalQuantity.toLocaleString()}
          valueClassName="text-green-600"
          sub="Total items bought"
        />

        <WaveStatCard
          label="Unique Products"
          icon={Package2}
          value={totals.totalProducts}
          valueClassName="text-purple-600"
          sub="Different items purchased"
        />

        <WaveStatCard
          label="Avg Unit Cost"
          icon={TrendingUp}
          value={formatCurrency(totals.avgUnitCost)}
          valueClassName="text-orange-600"
          sub="Weighted average cost"
        />
      </div>
```

- [ ] **Step 3: `app/(app)/reports/sales/returns/page.tsx`**

Add the `WaveStatCard` import. Replace lines 338-395 (5-card grid, `lg:grid-cols-5`) with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <WaveStatCard
          label="Revenue"
          value={formatCurrency(totals.revenue)}
          valueClassName="text-blue-600"
          sub="Total returned sales amount"
        />

        <WaveStatCard
          label="Cost"
          icon={Receipt}
          value={formatCurrency(totals.cost)}
          valueClassName="text-orange-600"
          sub="Total product cost"
        />

        <WaveStatCard
          label="Profit"
          icon={TrendingUp}
          value={formatCurrency(totals.profit)}
          valueClassName={totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}
          sub="Revenue minus cost"
        />

        <WaveStatCard
          label="Vatable Sales"
          icon={Receipt}
          value={formatCurrency(totals.vatableSales)}
          valueClassName="text-purple-600"
          sub="Sales excluding VAT"
        />

        <WaveStatCard
          label="VAT Amount"
          icon={Percent}
          value={formatCurrency(totals.vatAmount)}
          valueClassName="text-red-600"
          sub="Total VAT collected"
        />
      </div>
```

Do not touch the per-record card-view grid at lines ~440-518 in this file — that's table row data, out of scope. `DollarSign` was already unused before this change (grid used the `₱` glyph div); leave its import alone unless a lint error flags it.

- [ ] **Step 4: `app/(app)/reports/sales/discounts/page.tsx`**

Add the `WaveStatCard` import. Replace lines 282-326 with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Total Records"
          icon={BadgeCheck}
          value={totals.count.toLocaleString()}
          valueClassName="text-blue-600"
          sub="Discounted line items"
        />

        <WaveStatCard
          label="Total Discount"
          value={formatCurrency(totals.discount)}
          valueClassName="text-green-600"
          sub="Amount discounted"
        />

        <WaveStatCard
          label="Senior Citizen"
          icon={Users}
          value={totals.senior}
          valueClassName="text-orange-600"
          sub="Senior discount records"
        />

        <WaveStatCard
          label="PWD"
          icon={Users}
          value={totals.pwd}
          valueClassName="text-purple-600"
          sub="PWD discount records"
        />
      </div>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors, across all 4 files.

- [ ] **Step 6: Manual verification**

Run `npm run dev`. Visit `/reports/sales/summary`, `/reports/purchases/by-product`, `/reports/sales/returns`, `/reports/sales/discounts`. Expected: same labels/values/colors, now inside the wave-flourish shell.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/reports/sales/summary/page.tsx app/\(app\)/reports/purchases/by-product/page.tsx app/\(app\)/reports/sales/returns/page.tsx app/\(app\)/reports/sales/discounts/page.tsx
git commit -m "feat(reports): wire WaveStatCard into sales-summary/purchases-by-product/returns/discounts"
```

---

## Task 5: Wire `WaveStatCard` into `sales/by-customer`, `purchases/summary`, `purchases/by-supplier`, `fiscal-year`

**Files:**
- Modify: `app/(app)/reports/sales/by-customer/page.tsx:311-357`
- Modify: `app/(app)/reports/purchases/summary/page.tsx:298-342`
- Modify: `app/(app)/reports/purchases/by-supplier/page.tsx:275-319`
- Modify: `app/(app)/reports/fiscal-year/page.tsx:203-249`

**Interfaces:**
- Consumes: `WaveStatCard` (Task 1).

- [ ] **Step 1: `app/(app)/reports/sales/by-customer/page.tsx`**

Add the `WaveStatCard` import. Replace lines 311-357 with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Total Customers"
          icon={Users}
          value={totals.customers}
          valueClassName="text-indigo-600"
          sub="Unique customers"
        />

        <WaveStatCard
          label="Total Sales"
          value={formatCurrency(totals.totalSales)}
          valueClassName="text-blue-600"
          sub="All customer sales"
        />

        <WaveStatCard
          label="Credit Sales"
          icon={TrendingUp}
          value={formatCurrency(totals.creditSales)}
          valueClassName="text-orange-600"
          sub="Non-cash transactions"
        />

        <WaveStatCard
          label="Outstanding"
          icon={TrendingUp}
          value={formatCurrency(totals.outstanding)}
          valueClassName={totals.outstanding > 0 ? 'text-red-600' : 'text-green-600'}
          sub="Unpaid balance"
        />
      </div>
```

- [ ] **Step 2: `app/(app)/reports/purchases/summary/page.tsx`**

Add the `WaveStatCard` import. Replace lines 298-342 with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Total Spent"
          icon={PhilippinePeso}
          value={formatCurrency(totals.totalSpent)}
          valueClassName="text-blue-600"
          sub="Total procurement value"
        />

        <WaveStatCard
          label="Total Orders"
          icon={Package}
          value={totals.totalOrders}
          valueClassName="text-green-600"
          sub="Number of POs issued"
        />

        <WaveStatCard
          label="Avg Order Value"
          icon={TrendingUp}
          value={formatCurrency(totals.avgOrderValue)}
          valueClassName="text-purple-600"
          sub="Average spending per order"
        />

        <WaveStatCard
          label="Pending Orders"
          icon={Timer}
          value={totals.pendingOrders}
          valueClassName="text-orange-600"
          sub="Orders awaiting fulfillment"
        />
      </div>
```

- [ ] **Step 3: `app/(app)/reports/purchases/by-supplier/page.tsx`**

Add the `WaveStatCard` import. Replace lines 275-319 with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Total Spent"
          icon={PhilippinePeso}
          value={formatCurrency(totals.totalSpent)}
          valueClassName="text-indigo-600"
          sub="Across all suppliers"
        />

        <WaveStatCard
          label="Total Suppliers"
          icon={Users}
          value={totals.totalSuppliers}
          valueClassName="text-green-600"
          sub="Engaged suppliers"
        />

        <WaveStatCard
          label="Avg per Supplier"
          icon={TrendingUp}
          value={formatCurrency(totals.avgSpentPerSupplier)}
          valueClassName="text-purple-600"
          sub="Average wallet share"
        />

        <WaveStatCard
          label="Total POs"
          icon={Package}
          value={totals.totalOrders}
          valueClassName="text-blue-600"
          sub="Total purchase orders"
        />
      </div>
```

- [ ] **Step 4: `app/(app)/reports/fiscal-year/page.tsx`**

Add the `WaveStatCard` import. Replace lines 203-249 with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Total Revenue"
          value={formatCurrency(report?.summary.revenue || 0)}
          valueClassName="text-blue-600"
          sub="Fiscal year total"
        />

        <WaveStatCard
          label="Total Transactions"
          icon={ShoppingCart}
          value={report?.summary.transactions || 0}
          valueClassName="text-green-600"
          sub="Number of sales"
        />

        <WaveStatCard
          label="Avg Transaction"
          icon={TrendingUp}
          value={formatCurrency(report?.summary.avgTransaction || 0)}
          valueClassName="text-purple-600"
          sub="Average sale value"
        />

        <WaveStatCard
          label="Total Profit"
          icon={Percent}
          value={formatCurrency(report?.summary.profit || 0)}
          valueClassName={(report?.summary.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}
          sub="Revenue minus cost"
        />
      </div>
```

Note: `fiscal-year/page.tsx` imports the lucide icon as `Calendar` (line 14) which does NOT collide with anything in this replacement block — leave that import line untouched.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors, across all 4 files.

- [ ] **Step 6: Manual verification**

Run `npm run dev`. Visit `/reports/sales/by-customer`, `/reports/purchases/summary`, `/reports/purchases/by-supplier`, `/reports/fiscal-year`. Expected: same labels/values/colors, now inside the wave-flourish shell.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/reports/sales/by-customer/page.tsx app/\(app\)/reports/purchases/summary/page.tsx app/\(app\)/reports/purchases/by-supplier/page.tsx app/\(app\)/reports/fiscal-year/page.tsx
git commit -m "feat(reports): wire WaveStatCard into by-customer/purchases-summary/by-supplier/fiscal-year"
```

---

## Task 6: Wire `WaveStatCard` into `inventory` and `bir-summary` (icon-less variants)

**Files:**
- Modify: `app/(app)/reports/inventory/page.tsx:312-338`
- Modify: `app/(app)/reports/sales/bir-summary/page.tsx:587-624`

**Interfaces:**
- Consumes: `WaveStatCard` (Task 1). Confirms the `icon` prop's optionality works cleanly (Review Focus item 1).

- [ ] **Step 1: `app/(app)/reports/inventory/page.tsx`**

Add the `WaveStatCard` import. Replace lines 312-338 (3-card grid, `md:grid-cols-3`, no icons, no sub-text, no color) with:

```tsx
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <WaveStatCard label="Total Items" value={summary.totalItems} />

        <WaveStatCard label="Total Quantity" value={formatStockQuantity(summary.totalStock)} />

        <WaveStatCard label="Total Value (Avg Cost)" value={formatCurrency(summary.totalValue)} />
      </div>
```

- [ ] **Step 2: `app/(app)/reports/sales/bir-summary/page.tsx`**

Add the `WaveStatCard` import. Replace lines 587-624 (4-card grid, no icons) with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Gross Sales"
          value={peso(summaryTotals.grossSales)}
          valueClassName="text-blue-600"
          sub="Total for the period"
        />

        <WaveStatCard
          label="Total Deductions"
          value={peso(summaryTotals.totalDeductions)}
          valueClassName="text-orange-600"
          sub="Discounts, returns & voids"
        />

        <WaveStatCard
          label="VAT Payable"
          value={peso(summaryTotals.vatPayable)}
          valueClassName="text-purple-600"
          sub="Net of VAT adjustments"
        />

        <WaveStatCard
          label="Net Sales"
          value={peso(summaryTotals.netSales)}
          valueClassName="text-green-600"
          sub="Total income"
        />
      </div>
```

Do not touch the "Deductions Breakdown" / "VAT Adjustment Breakdown" Cards at lines ~723-766 in this file — those are itemized-list cards, out of scope.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors, across both files.

- [ ] **Step 4: Manual verification**

Run `npm run dev`. Visit `/reports/inventory` and `/reports/sales/bir-summary`. Expected: cards render with the wave shell and no icon-shaped empty gap in the header row.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/reports/inventory/page.tsx app/\(app\)/reports/sales/bir-summary/page.tsx
git commit -m "feat(reports): wire WaveStatCard into inventory and bir-summary (icon-less variant)"
```

---

## Task 7: Wire `WaveStatCard` into the variant-pattern pages (`batch-profit`, `cost-vs-retail`, `membership`)

**Files:**
- Modify: `app/(app)/reports/sales/batch-profit/page.tsx:299-343`
- Modify: `app/(app)/reports/cost-vs-retail/page.tsx:285-306`
- Modify: `app/(app)/reports/membership/page.tsx:193-210`

**Interfaces:**
- Consumes: `WaveStatCard` (Task 1). Confirms `valueClassName` carries `text-xl`/`text-lg` overrides and dark-mode variant strings (Review Focus items 3 and 4).

- [ ] **Step 1: `app/(app)/reports/sales/batch-profit/page.tsx`**

This file's cards use `text-xl` (not the component default `text-2xl`), no sub-text, and put the label as bare text (no `CardTitle` wrapper) — `WaveStatCard`'s `label` prop already renders as plain text, so this maps directly; just carry `text-xl` through `valueClassName` alongside the color.

Add the `WaveStatCard` import. Replace lines 299-343 (4-card grid, `md:grid-cols-4`) with:

```tsx
      <div className="grid gap-4 md:grid-cols-4">
        <WaveStatCard
          label="Total Revenue"
          icon={PhilippinePeso}
          value={formatCurrency(totals.revenue)}
          valueClassName="text-xl text-blue-700"
        />

        <WaveStatCard
          label="Total Batch Cost"
          icon={PhilippinePeso}
          value={formatCurrency(totals.cost)}
          valueClassName="text-xl text-muted-foreground"
        />

        <WaveStatCard
          label="Gross Profit"
          icon={TrendingUp}
          value={formatCurrency(totals.profit)}
          valueClassName={cn('text-xl', totals.profit >= 0 ? 'text-green-600' : 'text-red-600')}
        />

        <WaveStatCard
          label="Avg Batch Margin"
          icon={TrendingUp}
          value={`${totals.marginPct}%`}
          valueClassName={cn(
            'text-xl',
            totals.marginPct >= 20 ? 'text-green-600' : totals.marginPct >= 10 ? 'text-amber-600' : 'text-red-600',
          )}
        />
      </div>
```

Note: this drops the per-card icon color variance (`text-green-500`/`text-amber-500` on the icon itself, `h-3 w-3` sizing) since `WaveStatCard` renders icons at a fixed `h-4 w-4 text-[rgb(var(--matte-accent))]` — this is an intentional visual normalization consistent with every other page in this plan (all of which already use the shared teal icon color, not per-card icon colors). Confirm this reads fine in Step 4's manual check; if it looks wrong, that's a Task 7 fix, not a blocker for other tasks.

- [ ] **Step 2: `app/(app)/reports/cost-vs-retail/page.tsx`**

Add the `WaveStatCard` import. Replace lines 285-306 (4-card grid, `md:grid-cols-4`, no icons, no sub-text, dark-mode-aware conditional on card 3) with:

```tsx
      <div className="grid gap-4 md:grid-cols-4">
        <WaveStatCard label="Total Cost Value" value={formatCurrency(summary.totalCostValue)} />

        <WaveStatCard label="Total Retail Value" value={formatCurrency(summary.totalRetailValue)} />

        <WaveStatCard
          label="Potential Profit"
          value={formatCurrency(summary.totalProfit)}
          valueClassName={summary.totalProfit < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
        />

        <WaveStatCard label="Overall Margin" value={`${summary.marginPct.toFixed(1)}%`} />
      </div>
```

- [ ] **Step 3: `app/(app)/reports/membership/page.tsx`**

Add the `WaveStatCard` import. Replace lines 193-210 (4-card grid, card 4 is the dual-value `text-lg` no-color variant) with:

```tsx
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <WaveStatCard
          label="Activations"
          icon={UserPlus}
          value={summary.totalActivations}
          valueClassName="text-emerald-600"
          sub="New cards"
        />

        <WaveStatCard
          label="Renewals"
          icon={RefreshCw}
          value={summary.totalRenewals}
          valueClassName="text-blue-600"
          sub="Extended cards"
        />

        <WaveStatCard
          label="Total Collected"
          value={formatCurrency(summary.totalCollected)}
          valueClassName="text-amber-600"
          sub="All membership fees"
        />

        <WaveStatCard
          label="Cash / Card"
          icon={CreditCard}
          value={
            <>
              {formatCurrency(summary.cashTotal)} <span className="text-muted-foreground">/</span> {formatCurrency(summary.cardTotal)}
            </>
          }
          valueClassName="text-lg"
          sub="Cash vs card"
        />
      </div>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors, across all 3 files. Confirm `cn` is imported in `batch-profit/page.tsx` (it already is, per the existing conditional-color code) — no new import needed there.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Visit `/reports/sales/batch-profit`, `/reports/cost-vs-retail`, `/reports/membership`. Expected: `batch-profit` and `cost-vs-retail` cards render visibly smaller/plainer than the standard 4-card pages (matching their original `text-xl`/no-sub-text look, just with the wave shell); `membership`'s 4th card shows both currency values at `text-lg` with no color tint; toggle OS/browser dark mode on `cost-vs-retail` and confirm "Potential Profit" switches to the `dark:` variant color.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/reports/sales/batch-profit/page.tsx app/\(app\)/reports/cost-vs-retail/page.tsx app/\(app\)/reports/membership/page.tsx
git commit -m "feat(reports): wire WaveStatCard into batch-profit/cost-vs-retail/membership variant layouts"
```

---

## Task 8: Full regression pass

**Files:** none (verification only)

**Interfaces:** none — this task consumes the completed rollout from Tasks 1-7 and confirms nothing broke.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors across the whole repo.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors (in particular, no unused-import warnings from `Card`/`CardHeader`/`CardTitle`/`CardContent`/`CardDescription` left dangling in any of the 18 touched report-detail files, or from any lucide icon that's no longer referenced anywhere in a file after its stat grid was swapped).

- [ ] **Step 3: E2E regression**

Run: `npm run test:e2e`
Expected: all tests pass. These assert behavior/DOM structure via `data-*`/text-content selectors, not this specific class styling, so a failure here means a swap accidentally changed rendered text, a selector, or broke navigation — not a styling regression.

- [ ] **Step 4: Manual visual sweep**

With `npm run dev` running, visit all 18 touched pages and confirm every stat card/tile shows the teal wave-flourish shell with correct label/value/color/sub-text, matching what Tasks 2-7's individual manual-verification steps already confirmed:

`/reports`, `/reports/sales/top-volume`, `/reports/sales/top-sales`, `/reports/sales/profit-margin`, `/reports/sales/by-product`, `/reports/sales/summary`, `/reports/purchases/by-product`, `/reports/sales/returns`, `/reports/sales/discounts`, `/reports/sales/by-customer`, `/reports/purchases/summary`, `/reports/purchases/by-supplier`, `/reports/fiscal-year`, `/reports/inventory`, `/reports/sales/bir-summary`, `/reports/sales/batch-profit`, `/reports/cost-vs-retail`, `/reports/membership`.

Also spot-check that pages explicitly confirmed to have **no** stat cards (`adjustments`, `expiring-soon`, `low-stock`, `movements`, `sales/split-payments`, `velocity`) were untouched by this plan and still render their filter/table Cards normally.

- [ ] **Step 5: Commit (if sweep required fixes)**

If Step 4 surfaces an issue, fix it in the relevant page file (following the same `WaveStatCard`/`WaveLinkCard` prop pattern as Tasks 2-7), re-run Steps 1-4, then:

```bash
git add -A
git commit -m "fix(reports): fix visual regression found in Wave stat card rollout sweep"
```

If Step 4 finds no issues, no commit is needed for this task.
