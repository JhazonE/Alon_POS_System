# Dashboard Matte Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard around today/month/profit on a hand-built matte card system, and extend `/api/reports/stats` with the figures that layout needs.

**Architecture:** A new `--matte-*` CSS token namespace (light + dark-teal) sits beside the existing shadcn tokens without touching them. Three files under `components/matte/` consume it: `tokens.ts` holds class recipes, `card.tsx` the container, `stat.tsx` the metric primitives. The dashboard page and its four child components move onto those; the stats API grows six summary fields in its existing single-row scalar-subquery pattern.

**Tech Stack:** Next.js 16 (App Router, client components), plain Tailwind (no `cva`, no Radix), raw `mysql2` via `lib/mysql.ts`, recharts, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-dashboard-matte-redesign-design.md`

## Global Constraints

- **Plain Tailwind only** in `components/matte/`. No `cva`, no `@radix-ui/*`, no `asChild`. This follows `2026-08-25-button-plain-tailwind-migration-design.md`.
- **Matte means:** solid fills only — no `backdrop-blur`, no `/60` surface alpha — **no `shadow-*` on any matte surface**, and no stock Tailwind `red-500`/`blue-500`/`green-500`. Separation comes from `--matte-line`.
- **Do not modify** the existing `:root` / `.dark` shadcn token blocks (`app/globals.css:5-108`), the `glass-card` utility (`app/globals.css:140-142`), or `components/ui/card.tsx`. Other pages depend on all three.
- **Token format:** space-separated RGB triplets, consumed as `rgb(var(--matte-x))` and `rgb(var(--matte-x)/0.10)` in Tailwind arbitrary values.
- **No fields are removed** from the `/api/reports/stats` response. This plan only adds.
- **Tests are Playwright only.** There is no unit-test runner in this repo. Pure functions are tested in a Playwright spec that uses no `page` fixture.
- **E2E is sequential** (`workers: 1`) against `alon_pos_test` on port 3100. Run with `npm run test:e2e`.
- Existing e2e specs are commented in Cebuano (see `tests/e2e/db-backed.spec.ts`). Match that.

---

### Task 1: Stats API — today, deltas, and gross profit

**Files:**
- Modify: `lib/fiscal-utils.ts` (append one exported function)
- Modify: `app/api/reports/stats/route.ts:93-143`
- Test: `tests/e2e/dashboard-stats-api.spec.ts` (create)

**Interfaces:**
- Consumes: `toLocalYmd(date: Date): string` from `lib/fiscal-utils.ts:11`
- Produces:
  - `getSamePeriodLastMonth(now: Date): { start: Date; end: Date }`
  - Six new fields on the `summary` object of `GET /api/reports/stats`:
    `todayRevenue: number`, `todaySales: number`, `yesterdayRevenue: number`,
    `lastMonthRevenue: number`, `cogsMonth: number`, `costCoverageMonth: number`
    (`costCoverageMonth` is a fraction in `[0, 1]`, and is `1` when the month has no line revenue)

- [ ] **Step 1: Write the failing test for the date window**

Create `tests/e2e/dashboard-stats-api.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { getSamePeriodLastMonth } from '../../lib/fiscal-utils';

/**
 * Pure nga tests — walay `page` fixture. Ang `lastMonthRevenue` window kay
 * same-period, dili tibuok bulan: kung itandi ang 11 ka adlaw karon batok sa
 * 31 ka adlaw sa milabay, permanente ug pagkaubos ang mapakita.
 */
test.describe('getSamePeriodLastMonth', () => {
  test('mid-month → parehas nga day-of-month sa milabay nga bulan', () => {
    const { start, end } = getSamePeriodLastMonth(new Date(2026, 8, 11)); // Sep 11
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7); // Aug
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(11);
  });

  test('ika-31 batok sa 30-day nga bulan → naka-clamp sa katapusan', () => {
    const { end } = getSamePeriodLastMonth(new Date(2026, 9, 31)); // Oct 31
    expect(end.getMonth()).toBe(8); // Sep
    expect(end.getDate()).toBe(30); // dili Oct 1
  });

  test('ika-29 sa Marso sa dili-leap nga tuig → naka-clamp sa Peb 28', () => {
    const { end } = getSamePeriodLastMonth(new Date(2026, 2, 29)); // Mar 29
    expect(end.getMonth()).toBe(1); // Feb
    expect(end.getDate()).toBe(28);
  });

  test('Enero → mo-rollback sa Disyembre sa milabay nga tuig', () => {
    const { start, end } = getSamePeriodLastMonth(new Date(2026, 0, 15)); // Jan 15
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(11); // Dec
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getDate()).toBe(15);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx playwright test tests/e2e/dashboard-stats-api.spec.ts --reporter=line`
Expected: FAIL — `getSamePeriodLastMonth` is not exported from `lib/fiscal-utils`.

- [ ] **Step 3: Implement `getSamePeriodLastMonth`**

Append to `lib/fiscal-utils.ts`:

```ts
/**
 * The same slice of last month that has elapsed this month, for a
 * month-over-month comparison that is not permanently negative.
 *
 * `new Date(y, m, 0)` is the last day of month `m - 1`, which gives the length
 * of last month; the end day is clamped to it so Oct 31 compares against Sep 30
 * rather than rolling forward into October.
 *
 * JavaScript's Date normalises a month index of -1 into December of the prior
 * year, so January needs no special case.
 */
export function getSamePeriodLastMonth(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const daysInLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    Math.min(now.getDate(), daysInLastMonth),
  );
  return { start, end };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx playwright test tests/e2e/dashboard-stats-api.spec.ts --reporter=line`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write the failing API-shape test**

Append to `tests/e2e/dashboard-stats-api.spec.ts`:

```ts
test.describe('GET /api/reports/stats — bag-ong summary fields', () => {
  test('mo-uli sa today, deltas, ug profit inputs', async ({ request }) => {
    const res = await request.get('/api/reports/stats');
    expect(res.ok()).toBeTruthy();
    const { summary } = await res.json();

    for (const key of [
      'todayRevenue', 'todaySales', 'yesterdayRevenue',
      'lastMonthRevenue', 'cogsMonth', 'costCoverageMonth',
    ]) {
      expect(summary, `nawala ang ${key}`).toHaveProperty(key);
      expect(Number.isFinite(summary[key]), `${key} dili numero`).toBe(true);
    }

    expect(Number.isInteger(summary.todaySales)).toBe(true);
    expect(summary.costCoverageMonth).toBeGreaterThanOrEqual(0);
    expect(summary.costCoverageMonth).toBeLessThanOrEqual(1);
  });

  test('walay gikuha nga existing field', async ({ request }) => {
    const res = await request.get('/api/reports/stats');
    const { summary } = await res.json();

    for (const key of [
      'totalRevenueAllTime', 'totalRevenueMonth', 'totalRevenueFiscalYTD',
      'fiscalYear', 'fiscalStartMonth', 'availableFiscalYears',
      'totalSalesMonth', 'productsSoldMonth', 'lowStockItems', 'totalItems',
    ]) {
      expect(summary, `na-regress ang ${key}`).toHaveProperty(key);
    }
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx playwright test tests/e2e/dashboard-stats-api.spec.ts --reporter=line`
Expected: the two new tests FAIL on the missing `todayRevenue` property. The four date tests still pass.

- [ ] **Step 7: Compute the new dates in the route**

In `app/api/reports/stats/route.ts`, change the import on line 3:

```ts
import { getFiscalYearRange, getCurrentFiscalYear, toLocalYmd, getSamePeriodLastMonth } from '@/lib/fiscal-utils';
```

Then insert directly above the `const summaryQuery = ` declaration (currently line 93):

```ts
        // `invoice_date` is a DATE column (migration 011), so a calendar-day
        // equality match is exact and needs no time-zone handling.
        const now = new Date();
        const todayStr = toLocalYmd(now);

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = toLocalYmd(yesterday);

        const lastMonth = getSamePeriodLastMonth(now);
        const lastMonthStartStr = toLocalYmd(lastMonth.start);
        const lastMonthEndStr = toLocalYmd(lastMonth.end);
```

- [ ] **Step 8: Add the subqueries**

In the same file, replace the `total_items` line at the end of `summaryQuery`
(currently `route.ts:101`) so the SELECT list continues. The line currently reads:

```
                (SELECT COUNT(*) FROM products WHERE type = 'standard') as total_items
```

Replace it with:

```
                (SELECT COUNT(*) FROM products WHERE type = 'standard') as total_items,
                (SELECT COALESCE(SUM(total), 0) FROM sales_transactions WHERE status = 'Paid' AND invoice_date = ?) as today_revenue,
                (SELECT COUNT(*) FROM sales_transactions WHERE status = 'Paid' AND invoice_date = ?) as today_sales,
                (SELECT COALESCE(SUM(total), 0) FROM sales_transactions WHERE status = 'Paid' AND invoice_date = ?) as yesterday_revenue,
                (SELECT COALESCE(SUM(total), 0) FROM sales_transactions WHERE status = 'Paid' AND invoice_date >= ? AND invoice_date <= ?) as last_month_revenue,
                (SELECT COALESCE(SUM(si.quantity * si.cost_at_sale), 0) FROM sale_items si JOIN sales_transactions st ON si.sale_id = st.id WHERE st.status = 'Paid' AND st.invoice_date >= ? AND si.cost_at_sale IS NOT NULL) as cogs_month,
                (SELECT COALESCE(SUM(CASE WHEN si.cost_at_sale IS NOT NULL THEN si.quantity * si.price ELSE 0 END), 0) FROM sale_items si JOIN sales_transactions st ON si.sale_id = st.id WHERE st.status = 'Paid' AND st.invoice_date >= ?) as covered_line_revenue_month,
                (SELECT COALESCE(SUM(si.quantity * si.price), 0) FROM sale_items si JOIN sales_transactions st ON si.sale_id = st.id WHERE st.status = 'Paid' AND st.invoice_date >= ?) as total_line_revenue_month
```

- [ ] **Step 9: Extend the parameter array**

Parameters are positional and must match the subquery order above. Replace the
`query(summaryQuery, [...])` call (currently `route.ts:104`):

```ts
        const [summaryData] = await query(summaryQuery, [
            currentMonthStartStr, currentMonthStartStr, currentMonthStartStr,
            fiscalStartDateStr, fiscalEndDateStr,
            todayStr, todayStr, yesterdayStr,
            lastMonthStartStr, lastMonthEndStr,
            currentMonthStartStr, currentMonthStartStr, currentMonthStartStr,
        ]) as any[];
```

- [ ] **Step 10: Add the fields to the response**

In the `summary` object (currently `route.ts:131-142`), replace the
`totalItems` line so it continues:

```ts
                totalItems: parseInt(summaryData.total_items),
                todayRevenue: parseFloat(summaryData.today_revenue),
                todaySales: parseInt(summaryData.today_sales),
                yesterdayRevenue: parseFloat(summaryData.yesterday_revenue),
                lastMonthRevenue: parseFloat(summaryData.last_month_revenue),
                cogsMonth: parseFloat(summaryData.cogs_month),
                // Share of this month's line revenue that has a recorded cost.
                // `cost_at_sale` is nullable (added by the batch-costing
                // migration), and an uncosted row contributes zero COGS, so it
                // would otherwise read as pure profit. The UI shows this figure
                // rather than silently overstating the margin. A month with no
                // sales is fully covered by definition, not zero.
                costCoverageMonth: parseFloat(summaryData.total_line_revenue_month) > 0
                    ? parseFloat(summaryData.covered_line_revenue_month) / parseFloat(summaryData.total_line_revenue_month)
                    : 1,
```

- [ ] **Step 11: Run the tests and confirm they pass**

Run: `npx playwright test tests/e2e/dashboard-stats-api.spec.ts --reporter=line`
Expected: PASS — 6 tests.

- [ ] **Step 12: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 13: Commit**

```bash
git add lib/fiscal-utils.ts app/api/reports/stats/route.ts tests/e2e/dashboard-stats-api.spec.ts
git commit -F - <<'EOF'
feat: today, month-over-month, and gross-profit inputs on the stats API

Gross profit nets line-item cost against sales_transactions.total rather
than against SUM(quantity * price): sale_items has no discount column, so
line revenue ignores senior and PWD discounts and would overstate margin
on every discounted sale.

cost_at_sale is nullable, so an uncosted row contributes zero COGS and
reads as pure profit. costCoverageMonth reports how much of the month
actually carries cost data so the UI can say how far to trust the margin.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Matte tokens and card primitives

**Files:**
- Modify: `app/globals.css` (append a new `@layer base` block after line 108)
- Create: `components/matte/tokens.ts`
- Create: `components/matte/card.tsx`
- Create: `components/matte/stat.tsx`
- Modify: `app/(app)/dashboard/supplier-schedule-card.tsx`
- Test: `tests/e2e/dashboard-matte.spec.ts` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces, from `components/matte/tokens.ts`:
  `MATTE_SURFACE`, `MATTE_INSET`, `MATTE_ICON_BOX`, `MATTE_LABEL`, `MATTE_VALUE` — all `string`.
- Produces, from `components/matte/card.tsx`:
  - `MatteCard({ className?: string; children: React.ReactNode })`
  - `MatteCardHeader({ title: string; description?: string; icon?: React.ComponentType<{ className?: string }>; action?: React.ReactNode })`
  - `MatteCardBody({ className?: string; children: React.ReactNode })`
- Produces, from `components/matte/stat.tsx`:
  - `StatCard({ statKey: string; label: string; value: string; delta?: number | null; deltaLabel?: string; note?: string; noteTone?: 'muted' | 'warn'; icon?: React.ComponentType<{ className?: string }>; loading?: boolean })`
  - `StatStrip({ children: React.ReactNode })`
  - `StatTile({ statKey: string; label: string; value: string; href?: string; tone?: 'default' | 'down'; icon?: React.ComponentType<{ className?: string }>; loading?: boolean })`

- [ ] **Step 1: Add the token block to `globals.css`**

Insert immediately after the closing `}` of the first `@layer base` block
(after `app/globals.css:108`), before the second `@layer base`:

```css
/*
  Matte palette — a second, deliberately separate namespace.

  The `.dark` block above is a blue-slate ramp, but the sidebar
  (`components/sidebar/nav-card.tsx`) and header (`app/(app)/AppHeader.tsx`)
  hardcode teal, so a card built on `bg-card` turns blue beside a teal panel.
  Those two files solved it with inline hex; that does not scale to a card
  system with six surface roles, so the same hex values live here as tokens.

  Values are space-separated RGB triplets, not the HSL triplets used above:
  these are consumed directly in Tailwind arbitrary values
  (`bg-[rgb(var(--matte-surface))]`, `bg-[rgb(var(--matte-accent)/0.10)]`),
  not fed through tailwind.config.

  Converging this with the shadcn tokens is separate work — it would touch
  every page in the app.
*/
@layer base {
  :root {
    --matte-ground:  241 247 246;  /* #F1F7F6 */
    --matte-surface: 255 255 255;  /* #FFFFFF */
    --matte-line:    220 235 233;  /* #DCEBE9 */
    --matte-inset:   244 251 250;  /* #F4FBFA — matches AppHeader's chip */
    --matte-label:    91 123 121;  /* #5B7B79 */
    --matte-value:    11  42  45;  /* #0B2A2D */
    --matte-accent:   14 124 134;  /* #0E7C86 — sidebar active row */
    --matte-up:       27 122  85;  /* #1B7A55 */
    --matte-down:    180  71  47;  /* #B4472F */
    --matte-warn:    166 116  30;  /* #A6741E */

    --matte-chart-1:  14 124 134;  /* #0E7C86 */
    --matte-chart-2: 217 146  43;  /* #D9922B */
    --matte-chart-3:  27 122  85;  /* #1B7A55 */
    --matte-chart-4:  74 127 181;  /* #4A7FB5 */
    --matte-chart-5: 180  71  47;  /* #B4472F */
  }

  .dark {
    --matte-ground:   11  42  45;  /* #0B2A2D */
    --matte-surface:  15  51  54;  /* #0F3336 — sidebar nav card */
    --matte-line:     23  64  63;  /* #17403F — sidebar nav card border */
    --matte-inset:     8  35  38;  /* #082326 */
    --matte-label:   140 178 176;  /* #8CB2B0 */
    --matte-value:   220 242 240;  /* #DCF2F0 */
    --matte-accent:   79 195 201;  /* #4FC3C9 */
    --matte-up:       74 179 134;  /* #4AB386 */
    --matte-down:    214 122  98;  /* #D67A62 */
    --matte-warn:    242 169  58;  /* #F2A93A */

    --matte-chart-1:  79 195 201;
    --matte-chart-2: 242 169  58;
    --matte-chart-3:  74 179 134;
    --matte-chart-4: 127 168 219;  /* #7FA8DB */
    --matte-chart-5: 214 122  98;
  }
}
```

- [ ] **Step 2: Write `components/matte/tokens.ts`**

```ts
/**
 * Class recipes for the matte card system.
 *
 * These live in their own module rather than in `card.tsx` because `stat.tsx`
 * needs the icon-box and label recipes too -- importing them from `card.tsx`
 * would couple the two components for no reason. Same arrangement as
 * `app/(app)/header-tokens.ts`.
 *
 * Matte rules these encode: solid fills (no backdrop-blur, no surface alpha)
 * and no shadows. Separation comes from `--matte-line` alone.
 */

export const MATTE_SURFACE =
  'rounded-2xl border border-[rgb(var(--matte-line))] bg-[rgb(var(--matte-surface))]';

export const MATTE_INSET = 'rounded-xl bg-[rgb(var(--matte-inset))]';

/** The sidebar's 22px tinted icon square, on the matte accent. */
export const MATTE_ICON_BOX =
  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md '
  + 'bg-[rgb(var(--matte-accent)/0.10)] text-[rgb(var(--matte-accent))]';

export const MATTE_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgb(var(--matte-label))]';

/**
 * `tabular-nums` is deliberate: these are currency figures that re-render on
 * every refetch, and proportional digits make them jitter as values change.
 */
export const MATTE_VALUE =
  'font-semibold tabular-nums text-[rgb(var(--matte-value))]';

/** Pulsing placeholder used while a value is loading. */
export const MATTE_SKELETON =
  'animate-pulse rounded-md bg-[rgb(var(--matte-line))]';
```

- [ ] **Step 3: Write `components/matte/card.tsx`**

```tsx
'use client';

import * as React from 'react';
import { MATTE_SURFACE, MATTE_LABEL, MATTE_ICON_BOX } from './tokens';

export function MatteCard({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-matte="card" className={`${MATTE_SURFACE} ${className}`}>
      {children}
    </div>
  );
}

/**
 * `action` is a right-aligned slot for a control that belongs to the card --
 * the fiscal-year select, a refresh button. It exists so controls stop being
 * nested inside metric readouts the way the old dashboard nested them.
 */
export function MatteCardHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className={MATTE_ICON_BOX}>
              <Icon className="h-[13px] w-[13px]" />
            </span>
          ) : null}
          <h3 className="truncate text-[15px] font-semibold text-[rgb(var(--matte-value))]">
            {title}
          </h3>
        </div>
        {description ? (
          <p className="mt-1 text-[12.5px] text-[rgb(var(--matte-label))]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MatteCardBody({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}

export { MATTE_LABEL };
```

- [ ] **Step 4: Write `components/matte/stat.tsx`**

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { MATTE_SURFACE, MATTE_LABEL, MATTE_VALUE, MATTE_ICON_BOX, MATTE_SKELETON } from './tokens';

/**
 * A signed percentage with direction. `null` renders nothing at all: a card
 * with no prior period to compare against must not show "0%", which reads as
 * "flat" rather than "unknown".
 */
function Delta({ value, label }: { value: number; label?: string }) {
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const tone = flat
    ? 'text-[rgb(var(--matte-label))]'
    : up
      ? 'text-[rgb(var(--matte-up))]'
      : 'text-[rgb(var(--matte-down))]';
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={`mt-2 flex items-center gap-1 text-[12px] font-medium ${tone}`}>
      {flat ? null : <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="tabular-nums">
        {flat ? '0' : `${Math.abs(value).toFixed(1)}`}%
      </span>
      {label ? (
        <span className="font-normal text-[rgb(var(--matte-label))]">{label}</span>
      ) : null}
    </div>
  );
}

export function StatCard({
  statKey, label, value, delta, deltaLabel, note, noteTone = 'muted', icon: Icon, loading = false,
}: {
  statKey: string;
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  note?: string;
  noteTone?: 'muted' | 'warn';
  icon?: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <div data-matte="stat" data-stat={statKey} className={`${MATTE_SURFACE} px-5 py-4`}>
      <div className="flex items-start justify-between gap-2">
        <span className={MATTE_LABEL}>{label}</span>
        {Icon ? (
          <span className={MATTE_ICON_BOX}>
            <Icon className="h-[13px] w-[13px]" />
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className={`${MATTE_SKELETON} mt-2 h-8 w-32`} />
      ) : (
        <div data-stat-value className={`${MATTE_VALUE} mt-2 text-3xl leading-none`}>
          {value}
        </div>
      )}

      {!loading && delta !== null && delta !== undefined ? (
        <Delta value={delta} label={deltaLabel} />
      ) : null}

      {!loading && note ? (
        <p
          className={`mt-1.5 text-[12px] ${
            noteTone === 'warn'
              ? 'text-[rgb(var(--matte-warn))]'
              : 'text-[rgb(var(--matte-label))]'
          }`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** The dense secondary row: one card, four tiles, divided by --matte-line. */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-matte="strip"
      className={`${MATTE_SURFACE} grid grid-cols-2 divide-[rgb(var(--matte-line))] sm:grid-cols-4 sm:divide-x`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  statKey, label, value, href, tone = 'default', icon: Icon, loading = false,
}: {
  statKey: string;
  label: string;
  value: string;
  href?: string;
  tone?: 'default' | 'down';
  icon?: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  const valueTone =
    tone === 'down' ? 'text-[rgb(var(--matte-down))]' : 'text-[rgb(var(--matte-value))]';

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {Icon ? (
          <Icon
            className={`h-3.5 w-3.5 shrink-0 ${
              tone === 'down'
                ? 'text-[rgb(var(--matte-down))]'
                : 'text-[rgb(var(--matte-label))]'
            }`}
          />
        ) : null}
        <span className={MATTE_LABEL}>{label}</span>
      </div>
      {loading ? (
        <div className={`${MATTE_SKELETON} mt-1.5 h-6 w-16`} />
      ) : (
        <div data-stat-value className={`mt-1.5 text-lg font-semibold tabular-nums ${valueTone}`}>
          {value}
        </div>
      )}
    </>
  );

  const className = 'px-5 py-4 transition-colors';

  if (href) {
    return (
      <Link
        href={href}
        data-matte="tile"
        data-stat={statKey}
        className={`${className} hover:bg-[rgb(var(--matte-inset))]`}
      >
        {body}
      </Link>
    );
  }

  return (
    <div data-matte="tile" data-stat={statKey} className={className}>
      {body}
    </div>
  );
}
```

- [ ] **Step 5: Write the failing test for the first consumer**

Create `tests/e2e/dashboard-matte.spec.ts`:

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

/**
 * Ang matte surfaces solid gyud, walay alpha ug walay shadow. Duha ang
 * gidawat nga values kay depende sa theme sa runner; ang importante kay
 * ang token gigamit gyud, dili ang `--background`.
 */
const MATTE_SURFACES = ['rgb(255, 255, 255)', 'rgb(15, 51, 54)'];

test.describe('matte card system', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('ang supplier schedule kay matte card na', async ({ page }) => {
    await page.goto('/dashboard');
    const card = page.locator('[data-matte="card"]').filter({ hasText: 'Order Reminders' });
    await expect(card).toBeVisible();

    const style = await card.evaluate(el => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, shadow: s.boxShadow };
    });
    expect(MATTE_SURFACES).toContain(style.bg);
    expect(style.shadow).toBe('none');
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx playwright test tests/e2e/dashboard-matte.spec.ts --reporter=line`
Expected: FAIL — no `[data-matte="card"]` exists yet.

- [ ] **Step 7: Convert `supplier-schedule-card.tsx`**

In `app/(app)/dashboard/supplier-schedule-card.tsx`, replace the `Card` import
on line 4:

```tsx
import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
```

Replace the loading return (lines 64-70):

```tsx
  if (loading) {
    return (
      <MatteCard className="flex min-h-[150px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--matte-accent))]" />
      </MatteCard>
    );
  }
```

Replace the card open through `</CardHeader>` (lines 77-89). The absolutely
positioned watermark `Truck` goes: at 10% opacity on a matte surface it reads as
a smudge, and the header icon box carries the same meaning at full strength.

```tsx
    <MatteCard>
      <MatteCardHeader
        icon={Calendar}
        title="Order Reminders"
        description={`You have ${scheduledSuppliers.length} supplier${scheduledSuppliers.length !== 1 ? 's' : ''} scheduled for today.`}
      />
      <MatteCardBody>
```

Replace the doubled `<div className="space-y-3 mt-2">` (lines 91-92 — there are
two, one is a duplicate) with a single:

```tsx
        <div className="mt-1 space-y-2">
```

Replace the empty state (lines 94-98):

```tsx
             <div className="flex flex-col items-center justify-center py-6 text-center text-[rgb(var(--matte-label))]">
                <CheckCircle2 className="mb-2 h-10 w-10 text-[rgb(var(--matte-up))]" />
                <p className="text-sm">No supplier orders scheduled for today.</p>
                <p className="text-xs">You&apos;re all caught up!</p>
             </div>
```

Replace the row wrapper (line 101):

```tsx
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-[rgb(var(--matte-inset))] p-3">
```

Replace the two row spans (lines 103-104):

```tsx
                    <span className="text-sm font-semibold text-[rgb(var(--matte-value))]">{s.name}</span>
                    <span className="text-xs text-[rgb(var(--matte-label))]">{s.orderSchedule}</span>
```

Close the body: the `</CardContent>` at line 121 becomes `</MatteCardBody>` and
the `</Card>` at line 122 becomes `</MatteCard>`. Remove the closing `</div>` of
the duplicated wrapper at line 120.

Leave the `Order` button's classes and the `AddPurchaseOrderDialog` block alone.

- [ ] **Step 8: Run the test and confirm it passes**

Run: `npx playwright test tests/e2e/dashboard-matte.spec.ts --reporter=line`
Expected: PASS.

- [ ] **Step 9: Confirm no stray shadcn Card import remains**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Then: `grep -n "CardHeader\|CardContent\|CardTitle\|CardDescription\|glass-card\|blue-500\|green-500" "app/(app)/dashboard/supplier-schedule-card.tsx"`
Expected: the grep prints nothing.

- [ ] **Step 10: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 11: Commit**

```bash
git add app/globals.css components/matte tests/e2e/dashboard-matte.spec.ts "app/(app)/dashboard/supplier-schedule-card.tsx"
git commit -F - <<'EOF'
feat: matte token namespace and card primitives

The .dark tokens are a blue-slate ramp while the sidebar and header
hardcode teal, so a card built on bg-card turns blue beside a teal panel.
Those two files solved it with inline hex; a card system with six surface
roles needs tokens instead. The shadcn tokens and glass-card are left
untouched -- the other ~70 pages still depend on them.

Converts supplier-schedule-card as the first consumer, dropping its
off-palette blue-500/green-500 and its 10%-opacity truck watermark.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Dashboard layout — hero row, stat strip, header controls, resilient states

**Files:**
- Modify: `app/(app)/dashboard/page.tsx` (rewrite; currently 305 lines)
- Test: `tests/e2e/dashboard-matte.spec.ts` (extend)

**Interfaces:**
- Consumes: `MatteCard`, `MatteCardHeader`, `MatteCardBody` from `components/matte/card`; `StatCard`, `StatStrip`, `StatTile` from `components/matte/stat`; the six summary fields from Task 1.
- Produces: nothing imported elsewhere. `data-matte`/`data-stat` hooks used by the spec:
  `data-stat="today"`, `"month"`, `"profit"`, `"txns"`, `"items-sold"`, `"products"`, `"low-stock"`;
  plus `data-dashboard="root" | "error" | "refresh" | "fiscal-year"`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/dashboard-matte.spec.ts`:

```ts
test.describe('dashboard layout', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('tulo ka hero cards ang naa sa taas, naay values', async ({ page }) => {
    await page.goto('/dashboard');
    for (const key of ['today', 'month', 'profit']) {
      const card = page.locator(`[data-stat="${key}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator('[data-stat-value]')).not.toBeEmpty();
    }
  });

  test('upat ka tiles ang stat strip', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-matte="strip"]')).toBeVisible();
    const keys = await page.locator('[data-matte="tile"]').evaluateAll(
      els => els.map(e => e.getAttribute('data-stat')),
    );
    expect(keys).toEqual(['txns', 'items-sold', 'products', 'low-stock']);
  });

  test('ang low-stock tile mo-link sa report', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-stat="low-stock"]')).toHaveAttribute('href', '/reports/low-stock');
  });

  test('ang all-time revenue wala na sa hero row', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-stat="today"]')).toBeVisible();
    await expect(page.locator('[data-stat="revenue-all-time"]')).toHaveCount(0);
  });

  test('ang dashboard root nagbutang sa matte ground', async ({ page }) => {
    await page.goto('/dashboard');
    const bg = await page.locator('[data-dashboard="root"]')
      .evaluate(el => getComputedStyle(el).backgroundColor);
    expect(['rgb(241, 247, 246)', 'rgb(11, 42, 45)']).toContain(bg);
  });

  test('kung mapakyas ang refetch, magpabilin ang cards ug motungha ang banner', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-stat="today"] [data-stat-value]')).not.toBeEmpty();
    const before = await page.locator('[data-stat="today"] [data-stat-value]').innerText();

    // Ang sunod ra nga fetch ang paltuson -- ang una nagsugod na sa cards.
    await page.route('**/api/reports/stats**', route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Database unavailable"}' }),
    );
    await page.click('[data-dashboard="refresh"]');

    await expect(page.locator('[data-dashboard="error"]')).toContainText('Database unavailable');
    // Ang mga numero dili mawala samtang naa ang error -- dili gub-on sa
    // pakyas nga refresh ang usa ka screen nga mabasa nga data.
    await expect(page.locator('[data-stat="today"] [data-stat-value]')).toHaveText(before);
  });

  test('ang fiscal-year select naa sa page header, dili sulod sa metric card', async ({ page }) => {
    await page.goto('/dashboard');
    const select = page.locator('[data-dashboard="fiscal-year"]');
    if (await select.count() === 0) test.skip(true, 'calendar fiscal year ang test DB');
    await expect(select.locator('xpath=ancestor::*[@data-matte="stat"]')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx playwright test tests/e2e/dashboard-matte.spec.ts --reporter=line`
Expected: the supplier-card test from Task 2 passes; all seven new tests FAIL on missing `data-stat` / `data-dashboard` hooks.

- [ ] **Step 3: Rewrite `app/(app)/dashboard/page.tsx`**

Replace the entire file:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { CartesianGrid, XAxis, Area, AreaChart } from 'recharts';
import { AlertCircle, Boxes, Package, RefreshCw, ShoppingCart, TrendingUp } from 'lucide-react';
import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
import { StatCard, StatStrip, StatTile } from '@/components/matte/stat';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiUrl } from '@/lib/api-config';
import { formatFiscalYear } from '@/lib/fiscal-utils';
import type { ChartConfig } from '@/components/ui/chart';
import { SupplierScheduleCard } from './supplier-schedule-card';
import { HourlySalesChart } from './hourly-sales-chart';
import { TopSellingProductsChart } from './top-selling-products-chart';
import { SalesByCategoryChart } from './sales-by-category-chart';

const salesChartConfig = {
  sales: { label: 'Sales', color: 'rgb(var(--matte-chart-1))' },
} satisfies ChartConfig;

const peso = (n: number) => `₱${Math.round(n || 0).toLocaleString()}`;
const count = (n: number) => (n || 0).toLocaleString();

/**
 * Percentage change, or `null` when there is no prior figure to compare
 * against. Returning 0 there would render as "flat", which is a different and
 * wrong claim.
 */
function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('current');

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const fyParam = selectedFiscalYear !== 'current' ? `?fiscalYear=${selectedFiscalYear}` : '';
      const res = await fetch(getApiUrl(`/reports/stats${fyParam}`));
      if (!res.ok) {
        // Prefer the server-provided message (e.g. "Database unavailable")
        // over a generic status string.
        let message = `Request failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // response had no JSON body; keep the status-based message
        }
        throw new Error(message);
      }
      setData(await res.json());
      // The timestamp belongs to the data, not to the render. The old header
      // called new Date() inline, which was never the fetch time and never
      // updated.
      setUpdatedAt(new Date());
    } catch (err: any) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedFiscalYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const { salesByDay, topProducts, salesByCategory, summary } = data || {};

  const grossProfit = (summary?.totalRevenueMonth || 0) - (summary?.cogsMonth || 0);
  const margin = summary?.totalRevenueMonth
    ? (grossProfit / summary.totalRevenueMonth) * 100
    : 0;
  const coverage = summary?.costCoverageMonth ?? 1;
  // Below full coverage the margin is computed over only part of the month's
  // sales, because `cost_at_sale` is null on pre-batch-costing rows. Say so on
  // the card rather than quietly overstating profit.
  const profitNote = coverage >= 0.99
    ? `${margin.toFixed(1)}% margin`
    : `${margin.toFixed(1)}% margin · based on ${Math.round(coverage * 100)}% of sales`;

  const showFiscal = summary?.fiscalStartMonth !== undefined && summary?.fiscalStartMonth !== 1;
  const fiscalNote = showFiscal
    ? selectedFiscalYear === 'current'
      ? `FY since ${MONTHS[summary.fiscalStartMonth - 1]} 1: ${peso(summary?.totalRevenueFiscalYTD)}`
      : `${formatFiscalYear(summary?.fiscalYear, summary?.fiscalStartMonth)}: ${peso(summary?.totalRevenueFiscalYTD)}`
    : undefined;

  return (
    // The `<main>` in app/(app)/layout.tsx carries the page padding and no
    // background, so the ground is painted here and pulled out to the padding
    // edges. Scoped to this route -- the other pages keep `--background`.
    <div
      data-dashboard="root"
      className="animate-fade-in -m-4 flex flex-1 flex-col gap-4 bg-[rgb(var(--matte-ground))] p-4 sm:-m-6 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[rgb(var(--matte-value))]">Dashboard</h1>
          <p className="text-[13px] text-[rgb(var(--matte-label))]">Overview of your business performance.</p>
        </div>

        {/* Controls live in the page header, not inside a metric card. */}
        <div className="flex items-center gap-2">
          {showFiscal && (
            <Select value={selectedFiscalYear} onValueChange={setSelectedFiscalYear}>
              <SelectTrigger data-dashboard="fiscal-year" className="h-9 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current (YTD)</SelectItem>
                {(summary?.availableFiscalYears || []).map((fy: number) => (
                  <SelectItem key={fy} value={fy.toString()}>
                    {formatFiscalYear(fy, summary?.fiscalStartMonth)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            type="button"
            data-dashboard="refresh"
            onClick={fetchData}
            disabled={refreshing}
            className="flex h-9 items-center gap-2 rounded-xl border border-[rgb(var(--matte-line))] bg-[rgb(var(--matte-surface))] px-3 text-[12.5px] font-medium text-[rgb(var(--matte-label))] transition-colors hover:bg-[rgb(var(--matte-inset))] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--matte-accent)/0.40)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {updatedAt ? updatedAt.toLocaleTimeString() : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div
          data-dashboard="error"
          className="flex items-start gap-3 rounded-2xl border border-[rgb(var(--matte-down)/0.35)] bg-[rgb(var(--matte-down)/0.06)] px-4 py-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--matte-down))]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[rgb(var(--matte-down))]">Failed to load dashboard</p>
            <p className="text-[12.5px] text-[rgb(var(--matte-label))]">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="shrink-0 rounded-lg border border-[rgb(var(--matte-down)/0.35)] px-3 py-1 text-[12px] font-medium text-[rgb(var(--matte-down))] transition-colors hover:bg-[rgb(var(--matte-down)/0.10)]"
          >
            Retry
          </button>
        </div>
      )}

      {/* Hero: the answer to "did we make money?" */}
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${error && data ? 'opacity-60' : ''}`}>
        <StatCard
          statKey="today"
          label="Sales Today"
          value={peso(summary?.todayRevenue)}
          delta={pctChange(summary?.todayRevenue || 0, summary?.yesterdayRevenue || 0)}
          deltaLabel="vs yesterday"
          note={`${count(summary?.todaySales)} transaction${summary?.todaySales === 1 ? '' : 's'}`}
          loading={loading}
        />
        <StatCard
          statKey="month"
          label="This Month"
          value={peso(summary?.totalRevenueMonth)}
          delta={pctChange(summary?.totalRevenueMonth || 0, summary?.lastMonthRevenue || 0)}
          deltaLabel="vs last month"
          note={fiscalNote}
          loading={loading}
        />
        <StatCard
          statKey="profit"
          label="Gross Profit"
          value={peso(grossProfit)}
          note={profitNote}
          noteTone={coverage >= 0.99 ? 'muted' : 'warn'}
          loading={loading}
        />
      </div>

      {/* Secondary: four figures that do not deserve a card each. */}
      <StatStrip>
        <StatTile statKey="txns" label="Transactions" value={count(summary?.totalSalesMonth)} icon={ShoppingCart} loading={loading} />
        <StatTile statKey="items-sold" label="Items Sold" value={count(summary?.productsSoldMonth)} icon={TrendingUp} loading={loading} />
        <StatTile statKey="products" label="Products" value={count(summary?.totalItems)} icon={Boxes} loading={loading} />
        <StatTile statKey="low-stock" label="Low Stock" value={count(summary?.lowStockItems)} icon={AlertCircle} tone="down" href="/reports/low-stock" loading={loading} />
      </StatStrip>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-1 lg:col-span-4">
          <MatteCard className="h-full">
            <MatteCardHeader title="Sales Over Time" description="Daily revenue (last 30 days)." />
            <MatteCardBody>
              <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
                <AreaChart accessibilityLayer data={salesByDay} margin={{ left: 12, right: 12 }}>
                  <defs>
                    <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgb(var(--matte-line))" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                  <Area dataKey="sales" type="natural" stroke="var(--color-sales)" strokeWidth={2} fill="url(#fillSales)" />
                </AreaChart>
              </ChartContainer>
            </MatteCardBody>
          </MatteCard>
        </div>
        <div className="col-span-1 lg:col-span-3">
          <TopSellingProductsChart data={topProducts} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* The parent owns the span now; the child no longer sets col-span-4. */}
        <div className="col-span-1 lg:col-span-4">
          <HourlySalesChart />
        </div>
        <div className="col-span-1 lg:col-span-3">
          <SalesByCategoryChart data={salesByCategory} />
        </div>
      </div>

      <SupplierScheduleCard />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx playwright test tests/e2e/dashboard-matte.spec.ts --reporter=line`
Expected: PASS — 8 tests (1 from Task 2, 7 new; the fiscal-year one may report as skipped).

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/dashboard/page.tsx" tests/e2e/dashboard-matte.spec.ts
git commit -F - <<'EOF'
feat: owner-first dashboard layout on the matte card system

Six equal-weight KPI cards communicated no priority. Three hero cards
(today, this month, gross profit) now carry the largest type and the four
weaker figures collapse into one four-tile strip.

All-time revenue is dropped from the page: it only ever grows and moves
less each month, so it answers nothing an owner acts on. It stays in the
API response and remains reachable from /reports/sales/summary.

The fiscal-year select moves out of the metric card it was nested in, and
"last updated" becomes the actual fetch time instead of new Date() called
during render. A failed refetch now shows an inline banner and keeps the
previous values on screen rather than replacing the page with a spinner.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Chart cards onto matte

**Files:**
- Modify: `app/(app)/dashboard/hourly-sales-chart.tsx`
- Modify: `app/(app)/dashboard/top-selling-products-chart.tsx`
- Modify: `app/(app)/dashboard/sales-by-category-chart.tsx`
- Test: `tests/e2e/dashboard-matte.spec.ts` (extend)

**Interfaces:**
- Consumes: `MatteCard`, `MatteCardHeader`, `MatteCardBody` from `components/matte/card`.
- Produces: no signature changes. `HourlySalesChart` keeps taking no props; `TopSellingProductsChart` and `SalesByCategoryChart` keep their `data` prop.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/dashboard-matte.spec.ts`:

```ts
test.describe('chart cards', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, ADMIN);
  });

  test('tanang dashboard cards kay matte, walay glass ug walay shadow', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-matte="card"]').first()).toBeVisible();

    // Walay nahabilin nga glass-card sa dashboard.
    await expect(page.locator('main .glass-card')).toHaveCount(0);

    const styles = await page.locator('[data-matte="card"]').evaluateAll(els =>
      els.map(el => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, shadow: s.boxShadow, filter: s.backdropFilter };
      }),
    );
    expect(styles.length).toBeGreaterThanOrEqual(4);
    for (const s of styles) {
      expect(MATTE_SURFACES).toContain(s.bg);
      expect(s.shadow).toBe('none');
      expect(['none', '']).toContain(s.filter);
    }
  });

  test('ang hourly chart wala nay kaugalingong col-span', async ({ page }) => {
    await page.goto('/dashboard');
    const card = page.locator('[data-matte="card"]').filter({ hasText: 'Hourly Sales' });
    await expect(card).toBeVisible();
    await expect(card).not.toHaveClass(/col-span-4/);
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx playwright test tests/e2e/dashboard-matte.spec.ts --reporter=line`
Expected: the two new tests FAIL — the three chart cards are still `glass-card`.

- [ ] **Step 3: Convert `hourly-sales-chart.tsx`**

Replace the `Card` import block (lines 5-11) with:

```tsx
import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
```

Change the chart config colour (line 24) to `color: 'rgb(var(--matte-chart-1))',`.

Replace the error return (lines 62-68):

```tsx
  if (error) {
    return (
      <MatteCard className="flex h-[400px] items-center justify-center px-5 text-center text-[13px] text-[rgb(var(--matte-down))]">
        Error: {error}
      </MatteCard>
    );
  }
```

Replace the card open through `</CardHeader>` (lines 70-77). The `col-span-4`
goes: the parent grid in `page.tsx` owns the span now.

```tsx
  return (
    <MatteCard className="h-full">
      <MatteCardHeader title="Hourly Sales" description="Sales distribution by hour for today." />
      <MatteCardBody>
```

Replace the loading spinner colour (line 81) with
`<Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--matte-accent))]" />`.

In the chart body, replace the two gradient stops (lines 88-89):

```tsx
                  <stop offset="5%" stopColor="rgb(var(--matte-chart-1))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="rgb(var(--matte-chart-1))" stopOpacity={0.1}/>
```

Replace the grid (line 92) with
`<CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--matte-line))" />`,
and the `XAxis` className (line 99) with
`className="text-[11px] fill-[rgb(var(--matte-label))]"`.

Replace the tooltip content className (line 103) — matte means no blur:

```tsx
                content={<ChartTooltipContent indicator="dot" className="border-[rgb(var(--matte-line))] bg-[rgb(var(--matte-surface))]" />}
```

Close with `</MatteCardBody>` and `</MatteCard>` in place of `</CardContent>` and `</Card>`.

- [ ] **Step 4: Convert `top-selling-products-chart.tsx`**

Replace the `Card` import with:

```tsx
import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
```

Change the chart config colours (lines 34 and 37) to
`color: "rgb(var(--matte-chart-1))",` and `color: "rgb(var(--matte-value))",`.

Replace the loading return (lines 81-86):

```tsx
  if (loading) {
     return (
        <MatteCard className="flex h-[350px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--matte-accent))]" />
        </MatteCard>
     )
  }
```

Replace the card open through `</CardHeader>` (lines 92-96):

```tsx
    <MatteCard className="flex h-full flex-col">
      <MatteCardHeader title="Top Selling Products" description="Best performers by revenue" />
      <MatteCardBody className="flex-1">
```

Replace the `<CardFooter ...>` block (lines 150-156) with a plain footer div —
`CardFooter` is no longer imported:

```tsx
      <div className="flex flex-col items-start gap-2 border-t border-[rgb(var(--matte-line))] px-5 py-3 text-sm">
        <div className="flex gap-2 font-medium leading-none text-[rgb(var(--matte-value))]">
          Trending products <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-[rgb(var(--matte-label))]">
```

Keep the footer's inner text as it is, and close the card with `</MatteCard>`.
The `</CardContent>` before the footer becomes `</MatteCardBody>`.

- [ ] **Step 5: Convert `sales-by-category-chart.tsx`**

Replace the `Card` import with:

```tsx
import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
```

Change the chart config colours (lines 34 and 38) to
`color: "rgb(var(--matte-chart-1))",`. Any further `hsl(var(--chart-N))` entries
in this file become `rgb(var(--matte-chart-N))` with the same N.

Replace the loading return (lines 81-86) and the empty return (lines 89-95) so
both use `MatteCard` in place of `Card`, keeping their existing height classes
and replacing `glass-card border-none shadow-sm` with nothing, and
`text-primary` on the spinner with `text-[rgb(var(--matte-accent))]`.

Replace the card open through `</CardHeader>` (lines 100-104):

```tsx
    <MatteCard className="flex h-full flex-col">
      <MatteCardHeader title="Sales by Category" description="Breakdown of sales revenue" />
      <MatteCardBody className="flex-1 pb-0">
```

Replace the two label fills (lines 174 and 181) with
`className="fill-[rgb(var(--matte-value))] text-2xl font-bold"` and
`className="fill-[rgb(var(--matte-label))]"`.

Replace the `<CardFooter ...>` (line 195) with a plain footer div, matching
Task 4 Step 4:

```tsx
      <div className="flex flex-col gap-2 border-t border-[rgb(var(--matte-line))] px-5 py-3 text-sm">
```

Keep its inner text, change `text-muted-foreground` inside it to
`text-[rgb(var(--matte-label))]`, and close the card with `</MatteCard>`.
The `</CardContent>` becomes `</MatteCardBody>`.

- [ ] **Step 6: Confirm nothing shadcn-Card or off-palette remains**

Run:

```bash
grep -rn "components/ui/card\|glass-card\|blue-500\|green-500\|red-500\|hsl(var(--primary))\|hsl(var(--chart" "app/(app)/dashboard/"
```

Expected: prints nothing.

- [ ] **Step 7: Run the full dashboard suite**

Run: `npx playwright test tests/e2e/dashboard-matte.spec.ts tests/e2e/dashboard-stats-api.spec.ts --reporter=line`
Expected: PASS — 16 tests (1 supplier card, 7 layout, 2 chart cards, 6 API).

- [ ] **Step 8: Run the whole e2e suite for regressions**

Run: `npm run test:e2e`
Expected: PASS. `sidebar-panel.spec.ts` and `page-registry.spec.ts` both navigate
to `/dashboard`, so they exercise the rewritten page.

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/dashboard/"
git commit -F - <<'EOF'
feat: move the dashboard chart cards onto matte surfaces

Drops glass-card (translucent and blurred, the opposite of matte) from
the three chart components and repoints their series at --matte-chart-*,
which were previously hsl(var(--primary)) and turned blue in dark mode
beside teal panels.

HourlySalesChart loses the col-span-4 it set on its own root; the grid in
page.tsx owns the span.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Token namespace (light, dark, chart) | Task 2 Step 1 |
| `components/matte/` — tokens, card, stat | Task 2 Steps 2-4 |
| Hero row, stat strip, dropped all-time revenue | Task 3 Step 3 |
| Controls to page header; real `updatedAt` | Task 3 Step 3 |
| Loading skeletons, stale-preserving error banner | Task 2 Step 4 (`loading`/`MATTE_SKELETON`), Task 3 Step 3 |
| `todayRevenue`, `todaySales`, `yesterdayRevenue`, `lastMonthRevenue`, `cogsMonth`, `costCoverageMonth` | Task 1 Steps 7-10 |
| Profit = `total` − line-item COGS | Task 1 Step 10, Task 3 Step 3 |
| Same-period last-month window with clamp | Task 1 Step 3 |
| Coverage note on the profit card | Task 3 Step 3 (`profitNote`) |
| `col-span-4` removed from the child | Task 4 Step 3 |
| Supplier card off-palette colours | Task 2 Step 7 |
| Chart colours off `--primary`/`--chart-*` | Task 4 Steps 3-5 |
| No fields removed from the API | Task 1 Step 5, second test |

Two items the spec left implicit and this plan resolves:

- **Page ground.** `<main>` in `app/(app)/layout.tsx:90` sets no background, so
  the dashboard would inherit `--background` rather than `--matte-ground`. Task 3
  paints it on the dashboard root and pulls it out to the padding edges with
  `-m-4 sm:-m-6`, scoped to this route. Asserted in Task 3 Step 1.
- **`MATTE_SKELETON`** is not named in the spec, which describes the loading
  behaviour without naming the recipe. Added in Task 2 Step 2.

**Placeholder scan:** none. Every code step carries the literal content; no
"similar to Task N", no "handle errors appropriately".

**Type consistency:** `statKey` is the prop name in both `StatCard` and
`StatTile` and renders to `data-stat` in both. `MatteCardBody` takes `className`
in all four consumers. `getSamePeriodLastMonth` returns `{ start, end }` as
`Date` objects, and Task 1 Step 7 passes both through `toLocalYmd` before they
reach SQL. `costCoverageMonth` is a `0..1` fraction everywhere — the API
produces it as a ratio (Task 1 Step 10) and `page.tsx` multiplies by 100 only for
display (Task 3 Step 3).
