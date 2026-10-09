import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  Line, LineChart,
  Bar, BarChart,
  CartesianGrid, XAxis,
  Pie, PieChart, Cell, Legend,
} from 'recharts';
import { chartConfig, COLORS, type SalesData, type HourlyData, type CategoryData } from './use-sales-analysis';
import { Spinner } from '@/components/ui/spinner';

type Props = {
  salesData: SalesData[];
  hourlyData: HourlyData[];
  categoryData: CategoryData[];
  isLoadingSales: boolean;
  isLoadingHourly: boolean;
  isLoadingCategory: boolean;
  interval: string;
  formatDate: (dateString: string) => string;
};

function ChartLoader() {
  return (
    <div className="h-[300px] flex items-center justify-center">
      <Spinner className="h-6 w-6 mr-2 text-primary" />Loading...
    </div>
  );
}

export function AnalysisChartsGrid({
  salesData,
  hourlyData,
  categoryData,
  isLoadingSales,
  isLoadingHourly,
  isLoadingCategory,
  interval,
  formatDate,
}: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Sales Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Over Time</CardTitle>
          <CardDescription>Revenue trends by {interval} interval.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSales ? <ChartLoader /> : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <LineChart
                accessibilityLayer
                data={salesData.map(d => ({ date: formatDate(d.date), sales: d.totalRevenue }))}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) => v.slice(0, 6)}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Line dataKey="sales" type="natural" stroke="var(--color-sales)" strokeWidth={2} dot={true} />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Hourly Sales */}
      <Card>
        <CardHeader>
          <CardTitle>Hourly Sales Analysis</CardTitle>
          <CardDescription>Sales distribution by hour of day.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHourly ? <ChartLoader /> : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart accessibilityLayer data={hourlyData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
                <Bar dataKey="sales" fill="var(--color-sales)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Monthly Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Comparison</CardTitle>
          <CardDescription>Revenue and transaction trends.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingSales ? <ChartLoader /> : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart
                accessibilityLayer
                data={salesData.slice(0, 12).map(d => ({
                  date: formatDate(d.date),
                  revenue: d.totalRevenue,
                  transactions: d.transactionCount,
                }))}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) => v.slice(0, 6)}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
                <Bar dataKey="revenue" fill="var(--color-sales)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Sales by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Category</CardTitle>
          <CardDescription>Current month category distribution.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingCategory ? <ChartLoader /> : categoryData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={categoryData}
                  dataKey="sales"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {categoryData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center bg-secondary/50 rounded-lg">
              <p className="text-muted-foreground">No category data available.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
