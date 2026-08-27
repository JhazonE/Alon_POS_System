'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { CartesianGrid, XAxis, Area, AreaChart } from 'recharts';
import { Package, ShoppingCart, AlertCircle, Boxes, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiUrl } from '@/lib/api-config';
import { formatFiscalYear } from '@/lib/fiscal-utils';
import type { ChartConfig } from '@/components/ui/chart';
import { SupplierScheduleCard } from './supplier-schedule-card';
import { HourlySalesChart } from './hourly-sales-chart';
import { TopSellingProductsChart } from './top-selling-products-chart';
import { SalesByCategoryChart } from './sales-by-category-chart';

const salesChartConfig = {
  sales: {
    label: 'Sales',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

// Removed topProductsChartConfig and categoryChartConfig as they are now handled in components

function CurrencyIcon({ className }: { className?: string }) {
    return (
        <span className={`font-bold ${className}`} style={{ fontSize: '1em', lineHeight: 1 }}>
            ₱
        </span>
    )
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('current');

  const fetchData = useCallback(async () => {
    setLoading(true);
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
      const result = await res.json();

      // Data processing for charts is now handled within the components

      setData(result);
    } catch (err: any) {
      console.error("Failed to fetch dashboard data:", err);
      setError(err?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [selectedFiscalYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
      return (
          <div className="flex items-center justify-center h-screen">
              <Loader2 className="h-8 w-8 animate-spin" />
          </div>
      );
  }

  if (error) {
      return (
          <div className="flex flex-col items-center justify-center h-screen gap-4 text-center px-4">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Failed to load dashboard</h2>
                  <p className="text-sm text-muted-foreground max-w-md">{error}</p>
              </div>
              <button onClick={fetchData} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
              </button>
          </div>
      );
  }

  const { salesByDay, topProducts, salesByCategory, summary } = data || {};

  return (
    <div className="flex flex-col gap-6 animate-fade-in p-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your business performance.</p>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full border">
                Last updated: {new Date().toLocaleTimeString()}
            </span>
        </div>
      </div>

      <div className={`grid gap-4 md:grid-cols-2 ${summary?.fiscalStartMonth !== 1 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
        <Card className="glass-card group hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <div className="p-2 bg-primary/10 rounded-full text-primary">
                <CurrencyIcon className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{(summary?.totalRevenueAllTime || 0).toLocaleString()}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
                <TrendingUp className="w-3 h-3 mr-1" />
                <span>+₱{(summary?.totalRevenueMonth || 0).toLocaleString()} this month</span>
            </div>
          </CardContent>
        </Card>
        
        {summary?.fiscalStartMonth !== 1 && (
          <Card className="glass-card group hover:shadow-md transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {selectedFiscalYear === 'current' ? 'Fiscal YTD' : 'Fiscal Year'}
              </CardTitle>
              <Select value={selectedFiscalYear} onValueChange={setSelectedFiscalYear}>
                <SelectTrigger className="h-7 w-[130px] text-xs">
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
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₱{(summary?.totalRevenueFiscalYTD || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedFiscalYear === 'current'
                  ? `Since ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][summary?.fiscalStartMonth - 1]} 1, ${summary?.fiscalYear}`
                  : formatFiscalYear(summary?.fiscalYear, summary?.fiscalStartMonth)}
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="glass-card group hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sales</CardTitle>
            <div className="p-2 bg-muted rounded-full text-muted-foreground">
             <ShoppingCart className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{summary?.totalSalesMonth || 0}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
                <TrendingUp className="w-3 h-3 mr-1" />
                <span>Transactions this month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card group hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Products Sold</CardTitle>
            <div className="p-2 bg-muted rounded-full text-muted-foreground">
                <Package className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{summary?.productsSoldMonth || 0}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
                <TrendingUp className="w-3 h-3 mr-1" />
                <span>Items sold this month</span>
            </div>
          </CardContent>
        </Card>

         <Card className="glass-card group hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
            <div className="p-2 bg-muted rounded-full text-muted-foreground">
                <Boxes className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalItems || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique products in inventory</p>
          </CardContent>
        </Card>

        <Link href="/reports/low-stock" className="block h-full">
          <Card className="h-full glass-card overflow-hidden relative group hover:shadow-md transition-all duration-300 border-destructive/20 bg-destructive/5 hover:bg-destructive/10 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-destructive">Low Stock</CardTitle>
               <div className="p-2 bg-destructive/10 rounded-full text-destructive group-hover:scale-110 transition-transform">
                <AlertCircle className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary?.lowStockItems || 0}</div>
              <p className="text-xs text-destructive/80 mt-1 font-medium">Items Need Attention</p>
            </CardContent>
          </Card>
        </Link>
      </div>
      
      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
         <div className="col-span-1 lg:col-span-4">
            <Card className="glass-card border-none shadow-sm h-full">
              <CardHeader>
                <CardTitle>Sales Over Time</CardTitle>
                <CardDescription>Daily revenue (Last 30 Days).</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={salesChartConfig} className="h-[300px] w-full">
                  <AreaChart accessibilityLayer data={salesByDay} margin={{ left: 12, right: 12 }}>
                    <defs>
                      <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent indicator="line" />}
                    />
                    <Area
                      dataKey="sales"
                      type="natural"
                      stroke="var(--color-sales)"
                      strokeWidth={2}
                      fill="url(#fillSales)"
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
         </div>
         <div className="col-span-1 lg:col-span-3">
             <TopSellingProductsChart data={topProducts} />
         </div>
      </div>

       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <HourlySalesChart />
            <div className="col-span-1 lg:col-span-3">
                <SalesByCategoryChart data={salesByCategory} />
            </div>
       </div>

       <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-1">
             <SupplierScheduleCard />
       </div>

    </div>
  );
}
