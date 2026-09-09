'use client';

import { useState, useEffect, useCallback } from 'react';
import { CartesianGrid, XAxis, Area, AreaChart } from 'recharts';
import { AlertCircle, Boxes, RefreshCw, ShoppingCart, TrendingUp } from 'lucide-react';
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
