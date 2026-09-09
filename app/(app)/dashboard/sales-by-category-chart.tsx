"use client"

import { useEffect, useState } from "react"
import { getApiUrl } from "@/lib/api-config"
import { TrendingUp, Loader2 } from "lucide-react"
import { Pie, PieChart, Label, Cell, Bar, BarChart, XAxis, YAxis, LabelList } from "recharts"

import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

export const description = "A donut chart with text"

type CategoryData = {
  name: string
  value: number
  fill?: string
}

const chartConfig = {
  value: {
    label: "Sales",
    color: "rgb(var(--matte-chart-1))",
  },
  category: {
    label: "Category",
    color: "rgb(var(--matte-chart-1))",
  },
} satisfies ChartConfig

// Above this many slices a pie becomes cluttered — switch to a ranked bar chart.
const MAX_PIE_SLICES = 5

export function SalesByCategoryChart({ data: initialData }: { data?: any[] }) {
  const [data, setData] = useState<CategoryData[]>(initialData || [])
  const [loading, setLoading] = useState(!initialData)

  useEffect(() => {
    if (initialData) {
        const dataWithColors = initialData.map((item, index) => ({
            ...item,
            fill: item.fill || `rgb(var(--matte-chart-${(index % 5) + 1}))`
        }));
        setData(dataWithColors)
        setLoading(false)
        return;
    }

    // Fallback fetch if needed (though dashboard usually passes data)
    async function fetchData() {
        try {
            const res = await fetch(getApiUrl('/reports/stats')) // Use the same endpoint or specific one if available?
            // The dashboard uses /api/reports/stats which returns everything.
            // For now, assume data is passed via props or handle empty.
            // If data is null, we just show loading or empty.
            setLoading(false) 
        } catch (error) {
            console.error("Failed to fetch category data", error)
            setLoading(false)
        }
    }
    // fetchData() 
  }, [initialData])

  const totalSales = data.reduce((acc, curr) => acc + curr.value, 0)
  const useBarChart = data.length > MAX_PIE_SLICES
  const rankedData = [...data].sort((a, b) => b.value - a.value)

  if (loading) {
     return (
        <MatteCard className="flex h-[350px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--matte-accent))]" />
        </MatteCard>
     )
  }

  if (data.length === 0) {
      return (
        <MatteCard className="h-[350px]">
            <MatteCardHeader title="Sales by Category" description="No sales data available yet." />
        </MatteCard>
      )
  }

  return (
    <MatteCard className="flex h-full flex-col">
      <MatteCardHeader title="Sales by Category" description="Breakdown of sales revenue" />
      <MatteCardBody className="flex-1 pb-0">
        {useBarChart ? (
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart
              accessibilityLayer
              data={rankedData}
              layout="vertical"
              margin={{ left: 12, right: 64 }}
            >
              <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} hide />
              <XAxis dataKey="value" type="number" hide />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar dataKey="value" layout="vertical" radius={4} fill="var(--color-value)">
                <LabelList
                  dataKey="name"
                  position="insideLeft"
                  offset={8}
                  fill="white"
                  fontSize={13}
                  fontWeight="500"
                />
                <LabelList
                  dataKey="value"
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
        ) : (
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[250px]"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                strokeWidth={5}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-[rgb(var(--matte-value))] text-2xl font-bold"
                          >
                            ₱{totalSales.toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-[rgb(var(--matte-label))]"
                          >
                            Total Sales
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </MatteCardBody>
      <div className="flex flex-col gap-2 border-t border-[rgb(var(--matte-line))] px-5 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium leading-none">
          Across {data.length} {data.length === 1 ? 'category' : 'categories'} <TrendingUp className="h-4 w-4" />
        </div>
        <div className="leading-none text-[rgb(var(--matte-label))]">
          Showing distribution of sales revenue
        </div>
      </div>
    </MatteCard>
  )
}
