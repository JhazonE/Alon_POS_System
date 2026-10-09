'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { getApiUrl } from '@/lib/api-config';
import { Spinner } from '@/components/ui/spinner';

const chartConfig = {
  sales: {
    label: 'Sales',
    color: 'rgb(var(--matte-chart-1))',
  },
} satisfies ChartConfig;

type HourlyData = {
  hour: string;
  sales: number;
  count: number;
};

export function HourlySalesChart() {
  const [data, setData] = useState<HourlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(getApiUrl('/sales/hourly'));
        if (!res.ok) {
          throw new Error('Failed to fetch hourly sales');
        }
        const result = await res.json();
        if (result.success) {
          setData(result.data);
        } else {
          throw new Error(result.error || 'Failed to load data');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (error) {
    return (
      <MatteCard className="flex h-[400px] items-center justify-center px-5 text-center text-[13px] text-[rgb(var(--matte-down))]">
        Error: {error}
      </MatteCard>
    );
  }

  return (
    <MatteCard className="h-full">
      <MatteCardHeader title="Hourly Sales" description="Sales distribution by hour for today." />
      <MatteCardBody>
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <Spinner className="h-8 w-8 text-[rgb(var(--matte-accent))]" />
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart accessibilityLayer data={data}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(var(--matte-chart-1))" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="rgb(var(--matte-chart-1))" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgb(var(--matte-line))" />
              <XAxis
                dataKey="hour"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={(value) => value}
                className="text-[11px] fill-[rgb(var(--matte-label))]"
              />
              <ChartTooltip
                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                content={<ChartTooltipContent indicator="dot" className="border-[rgb(var(--matte-line))] bg-[rgb(var(--matte-surface))]" />}
              />
              <Bar
                dataKey="sales"
                fill="url(#colorSales)"
                radius={[4, 4, 0, 0]}
                className="hover:opacity-90 transition-opacity"
              />
            </BarChart>
          </ChartContainer>
        )}
      </MatteCardBody>
    </MatteCard>
  );
}
