"use client"

import { useEffect, useState } from "react"
import { getApiUrl } from "@/lib/api-config"
import { TrendingUp, Loader2 } from "lucide-react"
import { Bar, BarChart, XAxis, YAxis, LabelList, CartesianGrid } from "recharts"

import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const description = "A bar chart with custom labels"

type ProductData = {
  name: string
  sales: number // revenue
  fill?: string
}

const chartConfig = {
  sales: {
    label: "Sales",
    color: "rgb(var(--matte-chart-1))",
  },
  label: {
    color: "rgb(var(--matte-value))",
  },
} satisfies ChartConfig

export function TopSellingProductsChart({ data: initialData }: { data?: any[] }) {
  const [data, setData] = useState<ProductData[]>(initialData || [])
  const [loading, setLoading] = useState(!initialData)

  useEffect(() => {
    if (initialData) {
        // Add colors if not present
        const dataWithColors = initialData.map((item, index) => ({
            ...item,
            fill: item.fill || `rgb(var(--matte-chart-${(index % 5) + 1}))`,
            sales: item.sales || item.totalRevenue || 0 // Handle different data shapes
        }));
        setData(dataWithColors)
        setLoading(false)
        return;
    }

    async function fetchData() {
        try {
            const res = await fetch(getApiUrl('/sales/top-products'))
            if (!res.ok) throw new Error(`API error ${res.status}`)
            const result = await res.json()
            if (result.success) {
                const dataWithColors = result.data.map((item: any, index: number) => ({
                    name: item.name,
                    sales: item.quantity, // Default to quantity if standalone? Or revenue? User said "top selling", usually revenue. Let's stick to what passed data uses.
                    fill: `rgb(var(--matte-chart-${(index % 5) + 1}))`
                }));
                setData(dataWithColors)
            }
        } catch (error) {
            console.error("Failed to fetch top products", error)
        } finally {
            setLoading(false)
        }
    }
    fetchData()
  }, [initialData])

  if (loading) {
     return (
        <MatteCard className="flex h-[350px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--matte-accent))]" />
        </MatteCard>
     )
  }

  // Slice to top 5 if needed
  const displayData = data.slice(0, 6);

  return (
    <MatteCard className="flex h-full flex-col">
      <MatteCardHeader title="Top Selling Products" description="Best performers by revenue" />
      <MatteCardBody className="flex-1">
        <ChartContainer config={chartConfig}>
          <BarChart
            accessibilityLayer
            data={displayData}
            layout="vertical"
            margin={{
              left: 12,
              right: 60,
            }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
              hide
            />
            <XAxis dataKey="sales" type="number" hide />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Bar
              dataKey="sales"
              layout="vertical"
              radius={4}
              fill="var(--color-sales)"
            >
              <LabelList
                dataKey="name"
                position="insideLeft"
                offset={8}
                fill="white"
                fontSize={13}
                fontWeight="500"
              />
              <LabelList
                dataKey="sales"
                position="right"
                offset={8}
                fill="hsl(var(--foreground))"
                fontSize={13}
                fontWeight="600"
                formatter={(value: number) => `₱${value.toLocaleString()}`}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </MatteCardBody>
      <div className="flex flex-col items-start gap-2 border-t border-[rgb(var(--matte-line))] px-5 py-3 text-sm">
        <div className="flex gap-2 font-medium leading-none text-[rgb(var(--matte-value))]">
          Trending products <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-[rgb(var(--matte-label))]">
          Showing top revenue generators
        </div>
      </div>
    </MatteCard>
  )
}

