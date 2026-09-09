# Dashboard: Owner-First Layout on a Matte Card System — Design

**Date:** 2026-09-09
**Area:** `app/(app)/dashboard/`, `app/api/reports/stats/route.ts`, `app/globals.css`
**Goal:** Reorganise the dashboard around the question an owner actually opens it to ask — "did we make money?" — and render it on a hand-built matte card system that continues the teal direction set by the sidebar and header.

## Context

This continues the plain-Tailwind migration begun in
`2026-08-25-button-plain-tailwind-migration-design.md` and carried into the nav
by `2026-09-08-sidebar-custom-panel-design.md`. Those two established the
house pattern for replacing a shadcn surface: hand-built components, plain
Tailwind, class recipes in a sibling `*-tokens.ts` module, and hardcoded teal
rather than the app's semantic tokens.

That last point is the reason this spec exists in the form it does. The `.dark`
block in `globals.css` is a **blue-slate** ramp (`--card: 222 47% 11%`,
`--primary: 217 91% 60%`), while the new sidebar and header hardcode **teal**
(`#0F3336`, `#17403F`, `#0E7C86`, `#4FC3C9`). Any dashboard card built on
`bg-card` therefore turns blue in dark mode while the panels beside it stay
teal. The sidebar and header solved this by hardcoding hex inline. That does
not scale to a card system with five or six surface roles, so this spec
introduces a token namespace instead.

Two things separate this from the sidebar work: the information architecture
changes, not just the styling, and the API grows to support it.

## Goals

- Reorganise the dashboard so the largest type on screen answers "did we make
  money today?"
- Introduce a reusable `--matte-*` token namespace with light and dark (teal)
  values, and a `components/matte/` card system built on it.
- Extend `/api/reports/stats` with today's sales, period-over-period deltas, and
  gross profit.
- Leave every other page working exactly as it does now.

## Non-goals

- **Not** a migration of the other ~70 pages. The matte system is designed to be
  reusable, but this spec ships it on the dashboard only.
- **Not** a removal of `Table`, `Select`, or `ChartContainer`. They work, they
  are used far beyond the dashboard, and replacing them is separate work. Only
  their containers get restyled.
- **Not** a change to the existing `glass-card` utility or the shadcn
  `--background`/`--card`/`--primary` tokens. Both stay exactly as they are;
  other pages still depend on them.
- Not a redesign of the sidebar, header, or breadcrumbs — those are done.
- Not a new report. Every number added is derived from tables the dashboard
  query already reads.

## Current state (verified against the codebase)

### Layout

`app/(app)/dashboard/page.tsx` is 305 lines. It renders six KPI cards in one
grid, then three chart rows, then the supplier schedule. Concrete problems:

| Problem | Location |
|---|---|
| Six KPI cards at identical visual weight — "Total Items" (a static count) reads as loud as "Total Revenue" | `page.tsx:134-245` |
| A fiscal-year `<Select>` lives *inside* a metric card, mixing a control into a readout | `page.tsx:159-171` |
| "Last updated" is `new Date()` evaluated during render — not the data's timestamp, and it never updates | `page.tsx:129` |
| No "today" anywhere. Every figure is month-to-date, fiscal-YTD, or all-time | `page.tsx:134-245` |
| `HourlySalesChart` hardcodes `col-span-4` on its own root, so the child owns the parent's grid | `hourly-sales-chart.tsx:71`, consumed bare at `page.tsx:293` |
| Full-screen `h-screen` loading and error states replace the whole page, so the layout jumps on every refetch | `page.tsx:94-116` |
| `supplier-schedule-card.tsx` uses off-palette Tailwind colours (`border-l-blue-500`, `text-blue-600`, `text-green-500`) that belong to no theme | `supplier-schedule-card.tsx:66-95` |

### Styling

All six dashboard files use shadcn `Card` plus the `glass-card` utility
(`globals.css:140`), which is `bg-card/60 backdrop-blur-sm border-border/50` —
translucent and blurred, the opposite of matte.

Chart colours come from `hsl(var(--primary))` and `hsl(var(--chart-1))`, both of
which are blue in dark mode.

### API

`app/api/reports/stats/route.ts:93-102` builds the summary as a single row of
scalar subqueries and returns seven fields (`route.ts:131-142`). It has no
today figure, no prior-period comparison, and no cost or profit.

Relevant schema facts, verified:

- `sales_transactions.invoice_date` is a **`DATE`** column
  (`scripts/migrations/011_create_sales_transactions_tables.ts:32`), so a
  calendar-day comparison is exact and needs no time-zone handling.
- `sale_items` has columns `quantity`, `price`, `cost_at_sale`
  (`app/api/sales/transactions/route.ts:407`). It has **no discount column**.
- `cost_at_sale` is `DECIMAL(14,4) DEFAULT NULL`
  (`app/api/migrate/batch-costing/route.ts:45`) — rows written before batch
  costing landed have no cost.
- There is no business-date abstraction in `lib/`. `business_date_locked_at` on
  `pos_terminals` is a post-Z-reading terminal lock, not an alternate date for
  sales. "Today" therefore means `invoice_date = <local calendar date>`, which
  is how every other report already groups.

## Design

### 1. Token namespace

A new `--matte-*` block in `globals.css`, added alongside the existing `:root`
and `.dark` blocks without modifying either. Values are **space-separated RGB
triplets** so Tailwind's slash-opacity syntax works:
`bg-[rgb(var(--matte-surface))]`, `border-[rgb(var(--matte-line)/0.6)]`.

(RGB rather than the HSL triplets used by the shadcn tokens above them: these
are consumed directly in arbitrary-value classes, not fed through
`tailwind.config`, and the source palette is the hex already hardcoded in
`nav-card.tsx` and `AppHeader.tsx`.)

Light — continues the header's `#FFFFFF` card on `#F4FBFA` inset:

| Token | RGB | Hex | Role |
|---|---|---|---|
| `--matte-ground` | `241 247 246` | `#F1F7F6` | page background |
| `--matte-surface` | `255 255 255` | `#FFFFFF` | card fill |
| `--matte-line` | `220 235 233` | `#DCEBE9` | card border, dividers |
| `--matte-inset` | `244 251 250` | `#F4FBFA` | tiles nested inside a card |
| `--matte-label` | `91 123 121` | `#5B7B79` | labels, captions |
| `--matte-value` | `11 42 45` | `#0B2A2D` | numbers, headings |
| `--matte-accent` | `14 124 134` | `#0E7C86` | icon boxes, links |
| `--matte-up` | `27 122 85` | `#1B7A55` | positive delta |
| `--matte-down` | `180 71 47` | `#B4472F` | negative delta, low stock |
| `--matte-warn` | `166 116 30` | `#A6741E` | warnings |

Dark — the sidebar's own surfaces (`nav-card.tsx:19`, `AppHeader.tsx:36`):

| Token | RGB | Hex |
|---|---|---|
| `--matte-ground` | `11 42 45` | `#0B2A2D` |
| `--matte-surface` | `15 51 54` | `#0F3336` |
| `--matte-line` | `23 64 63` | `#17403F` |
| `--matte-inset` | `8 35 38` | `#082326` |
| `--matte-label` | `140 178 176` | `#8CB2B0` |
| `--matte-value` | `220 242 240` | `#DCF2F0` |
| `--matte-accent` | `79 195 201` | `#4FC3C9` |
| `--matte-up` | `74 179 134` | `#4AB386` |
| `--matte-down` | `214 122 98` | `#D67A62` |
| `--matte-warn` | `242 169 58` | `#F2A93A` |

Five chart series, `--matte-chart-1` … `--matte-chart-5`:

| # | Light | Dark |
|---|---|---|
| 1 | `#0E7C86` | `#4FC3C9` |
| 2 | `#D9922B` | `#F2A93A` |
| 3 | `#1B7A55` | `#4AB386` |
| 4 | `#4A7FB5` | `#7FA8DB` |
| 5 | `#B4472F` | `#D67A62` |

"Matte" is enforced by three rules the components follow: solid fills only (no
`backdrop-blur`, no `/60` surface alpha), **no shadows** — separation comes from
`--matte-line` — and desaturated semantic colours rather than Tailwind's stock
`red-500`/`blue-500`/`green-500`.

### 2. `components/matte/`

Three files, plain Tailwind, no Radix and no `cva`, following the
`header-tokens.ts` precedent:

**`tokens.ts`** — class recipes shared by the components. It is a separate
module for the same reason `header-tokens.ts` is: `stat.tsx` uses the icon-box
recipe and `card.tsx` uses it too, and putting it in either would risk an import
cycle as the system grows.

```
MATTE_SURFACE   rounded-2xl border bg + border-[rgb(var(--matte-line))]
MATTE_INSET     rounded-xl fill for nested tiles
MATTE_ICON_BOX  22px tinted square, accent-on-10%-accent
MATTE_LABEL     11px, 0.08em tracking, uppercase, --matte-label
MATTE_VALUE     --matte-value, tabular-nums
```

`tabular-nums` is deliberate: these are currency figures that update on refetch,
and proportional digits make them jitter.

**`card.tsx`** — `MatteCard`, `MatteCardHeader`, `MatteCardBody`.
`MatteCardHeader` takes `title`, optional `description`, and an optional `action`
slot on the right. That slot is where the fiscal-year `Select` goes, which is
what lets it leave the metric card.

**`stat.tsx`** — `StatCard` (hero: label, value, optional `delta` and `note`) and
`StatStrip` / `StatTile` (the dense secondary row). `delta` takes a signed
number and renders ▲/▼ in `--matte-up` / `--matte-down`; passing `null` renders
nothing rather than a misleading `0%`.

Every component sets `data-matte="card" | "stat" | "tile"` and `data-stat="<key>"`,
so the e2e spec can assert structure the way `sidebar-panel.spec.ts` does with
`data-sidebar`.

### 3. Layout

```
Dashboard                          [FY: Current ▾]  [⟳ 2:14 PM]
─────────────────────────────────────────────────────────────
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ SALES TODAY  │ │ THIS MONTH   │ │ GROSS PROFIT │   hero: text-3xl
│ ₱42,180      │ │ ₱1,284,300   │ │ ₱312,400     │
│ ▲12% vs yest │ │ ▲8% vs last  │ │ 24.3% margin │   delta
│ 47 txns      │ │ FY24 ₱9.1M   │ │ 100% covered │   note
└──────────────┘ └──────────────┘ └──────────────┘
┌─────────────────────────────────────────────────┐
│  318        1,204       847       ⚠ 23          │   one card, four tiles
│  Txns       Items sold  Products  Low stock →   │   text-lg
└─────────────────────────────────────────────────┘
┌───────────────────────────┐ ┌─────────────────┐
│ Sales Over Time (30d)     │ │ Top Selling     │   lg: 4 / 3
└───────────────────────────┘ └─────────────────┘
┌───────────────────────────┐ ┌─────────────────┐
│ Hourly Sales              │ │ By Category     │   lg: 4 / 3
└───────────────────────────┘ └─────────────────┘
┌─────────────────────────────────────────────────┐
│ Supplier Schedule                               │
└─────────────────────────────────────────────────┘
```

Three deliberate changes beyond arrangement:

- **The four weak KPIs collapse into one `StatStrip`.** Six equal cards
  communicate no priority; three loud cards over one quiet strip do. The low-stock
  tile keeps its link to `/reports/low-stock` and its `--matte-down` accent.
- **Controls move to the page header.** The fiscal-year `Select` and a real
  refresh button sit in a header row, not inside metrics.
- **`HourlySalesChart` loses its `col-span-4`.** The parent grid owns spans; the
  child owns its own contents. Its wrapper becomes a `MatteCard` like its siblings.

Each hero card's `note` line carries the figure that used to justify a card of
its own: `todaySales` under Sales Today, fiscal YTD under This Month (only when
`fiscalStartMonth !== 1`, matching today's conditional), and cost coverage under
Gross Profit. They are context for the headline, not headlines themselves.

**All-time revenue is dropped from the dashboard.** It is currently the loudest
card on the page (`page.tsx:135-151`) and it answers nothing an owner acts on —
it only ever grows, and it moves less each month as the denominator rises. It
does not earn the top-left position on a screen meant to show whether *this* day
and *this* month are going well, and the same total is reachable from
`/reports/sales/summary` over a full date range. `totalRevenueAllTime` stays in
the API response — this spec removes no fields, only adds them.

### 4. Loading and error states

The current full-page `h-screen` swap makes the layout jump on every refetch.
Instead:

- **First load** — the real layout renders with `MatteCard` skeletons in place
  (a pulsing `--matte-inset` block at each value's position). Structure is stable
  from the first paint.
- **Refetch** — cards keep their last values and the refresh control shows a
  spinner. Numbers never blank out under the user.
- **Error** — an inline `--matte-down` banner above the grid with the message and
  a Retry button. Stale cards stay visible beneath it, dimmed. A failed refresh
  should not destroy a screen of readable data.

### 5. API changes

`app/api/reports/stats/route.ts` — new scalar subqueries in the existing summary
query, and the corresponding fields on `summary`. No new round-trip.

| Field | Definition |
|---|---|
| `todayRevenue` | `SUM(total)` of Paid sales where `invoice_date = :today` |
| `todaySales` | `COUNT(*)` of the same |
| `yesterdayRevenue` | same, `invoice_date = :yesterday` |
| `lastMonthRevenue` | Paid sales in `[first of last month, last month + same day-of-month]` |
| `cogsMonth` | `SUM(si.quantity * si.cost_at_sale)` over Paid sales this month |
| `costCoverageMonth` | share of this month's line revenue whose `cost_at_sale` is non-null |

Dates are computed with the existing `toLocalYmd` helper (`lib/fiscal-utils.ts:11`).

**Gross profit is `totalRevenueMonth - cogsMonth`,** and this asymmetry is
deliberate. Revenue comes from `sales_transactions.total`, which is net of
transaction-level discounts; cost comes from `sale_items`, which has no discount
column. Taking revenue from `SUM(quantity * price)` on the line items instead
would ignore senior and PWD discounts entirely — a large, mandatory category in
Philippine retail — and overstate margin on every discounted sale. Netting the
line-item cost against the true collected total is the honest arrangement.

**`lastMonthRevenue` is a same-period window, not the whole prior month.**
Comparing eleven days of this month against thirty-one of last month would show
a permanent decline that resets monthly. The window is
`[YYYY-MM-01 of last month .. last month day min(today.day, daysInLastMonth)]`;
the clamp handles the 31st against a 30-day month.

**`costCoverageMonth` exists because `cost_at_sale` is nullable.** A row with no
recorded cost contributes zero to `cogsMonth` and so reads as pure profit.
Rather than silently overstate, the profit card shows its coverage: at ≥99% it
renders the margin plainly; below that it appends "based on N% of sales" in
`--matte-warn`. The number stays useful while saying how much to trust it.

One accepted imprecision: the "vs yesterday" delta compares a partial today
against a complete yesterday, so it reads low until close of business. This is
the standard convention for a live daily figure and the label says "vs
yesterday" plainly; correcting for time-of-day would need an hourly-shape model
the dashboard has no reason to carry.

### 6. Files touched

| File | Change |
|---|---|
| `app/globals.css` | add `--matte-*` light + dark blocks; touch nothing existing |
| `components/matte/tokens.ts` | new |
| `components/matte/card.tsx` | new |
| `components/matte/stat.tsx` | new |
| `app/(app)/dashboard/page.tsx` | rewrite layout, header controls, load/error states |
| `app/(app)/dashboard/hourly-sales-chart.tsx` | `Card` → `MatteCard`; drop `col-span-4`; chart colour → `--matte-chart-1` |
| `app/(app)/dashboard/top-selling-products-chart.tsx` | `Card` → `MatteCard`; chart colours |
| `app/(app)/dashboard/sales-by-category-chart.tsx` | `Card` → `MatteCard`; chart colours |
| `app/(app)/dashboard/supplier-schedule-card.tsx` | `Card` → `MatteCard`; drop `blue-500`/`green-500` for matte tokens |
| `app/api/reports/stats/route.ts` | six new summary fields |

`components/ui/card.tsx` and the `glass-card` utility are **not** removed — the
rest of the app still imports them.

## Testing

- `npm run typecheck` and `npm run lint` clean.
- `tests/e2e/dashboard-matte.spec.ts`, following `sidebar-panel.spec.ts`:
  - the three `data-stat` hero cards render with values
  - the `StatStrip` renders four tiles
  - the low-stock tile links to `/reports/low-stock`
  - the fiscal-year `Select` is in the page header, not inside a `data-matte="stat"`
  - a failed `/api/reports/stats` (route-intercepted) shows the inline error
    banner **and** leaves previously rendered cards on screen
- An API test against the seeded test DB covering the new summary fields:
  today with and without sales, the day-of-month clamp on `lastMonthRevenue`,
  and `costCoverageMonth` when some `cost_at_sale` values are NULL.

## Risks

- **Profit is the number an owner will trust most and the one with the weakest
  data behind it.** `costCoverageMonth` and the on-card note are the mitigation;
  if coverage turns out to be low on real installs, the honest follow-up is to
  backfill `cost_at_sale`, not to soften the label.
- The `--matte-*` namespace is a second colour system living beside the shadcn
  tokens. That is accepted for now, and is a smaller risk than rewriting `.dark`
  under all ~70 pages. The eventual convergence is a separate spec.
