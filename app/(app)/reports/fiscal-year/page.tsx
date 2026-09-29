'use client';

import { useState, useEffect } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, FileDown, FileSpreadsheet, ShoppingCart, TrendingUp, Percent } from 'lucide-react';
import { WaveStatCard } from '@/components/reports/WaveStatCard';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import { exportReportPdf, exportReportExcel } from '@/lib/report-print';
import { ReportSearchInput } from '@/components/reports/ReportSearchInput';

interface MonthRow {
  period: number;
  monthLabel: string;
  revenue: number;
  transactions: number;
  profit: number;
}

interface FiscalReport {
  fiscalYear: number;
  label: string;
  availableFiscalYears: number[];
  summary: { revenue: number; transactions: number; profit: number; avgTransaction: number };
  months: MonthRow[];
}

export default function FiscalYearReportPage() {
  const [report, setReport] = useState<FiscalReport | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const formatCurrency = (value: number) =>
    `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fetchReport = async (year?: string) => {
    setIsLoading(true);
    try {
      const q = year ? `?fiscalYear=${year}` : '';
      const res = await fetch(getApiUrl(`/reports/fiscal-year${q}`));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const result = await res.json();
      if (result.success) {
        setReport(result);
        setSelectedYear(String(result.fiscalYear));
      }
    } catch (error) {
      console.error('Error fetching fiscal year report:', error);
      toast({ title: 'Error', description: 'Failed to fetch fiscal year report.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  const exportToPDF = () => {
    if (!report) return;
    const fileName = `Fiscal_Year_${report.label.replace(/\s+/g, '_')}.pdf`;
    const ok = exportReportPdf<MonthRow>({
      title: 'Fiscal Year Report',
      dateRange: report.label,
      summary: [
        { label: 'Total Revenue', value: formatCurrency(report.summary.revenue) },
        { label: 'Total Transactions', value: String(report.summary.transactions) },
        { label: 'Total Profit', value: formatCurrency(report.summary.profit) },
        { label: 'Avg Transaction', value: formatCurrency(report.summary.avgTransaction) },
      ],
      columns: [
        { header: 'Month', width: 40, cell: (r) => r.monthLabel },
        { header: 'Transactions', width: 30, align: 'right', cell: (r) => String(r.transactions) },
        { header: 'Revenue', width: 35, align: 'right', cell: (r) => r.revenue.toFixed(2) },
        { header: 'Profit', width: 35, align: 'right', cell: (r) => r.profit.toFixed(2) },
      ],
      rows: report.months,
      totals: [
        'TOTALS',
        String(report.summary.transactions),
        report.summary.revenue.toFixed(2),
        report.summary.profit.toFixed(2),
      ],
      fileName,
    });
    if (!ok) {
      toast({ title: 'No Data', description: 'No report loaded to export.', variant: 'destructive' });
      return;
    }
    toast({ title: 'PDF Exported', description: `Report saved as ${fileName}` });
  };

  const filteredMonths = (report?.months || []).filter((m) => {
    if (!searchTerm.trim()) return true;
    return m.monthLabel.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const exportToExcel = () => {
    if (!report) return;
    const transactionsSum = filteredMonths.reduce((s, m) => s + Number(m.transactions), 0);
    const revenueSum = filteredMonths.reduce((s, m) => s + Number(m.revenue), 0);
    const profitSum = filteredMonths.reduce((s, m) => s + Number(m.profit), 0);
    const fileName = `Fiscal_Year_${report.label.replace(/\s+/g, '_')}.xls`;
    const ok = exportReportExcel<MonthRow>({
      title: 'Fiscal Year Report',
      subtitle: report.label,
      columns: [
        { header: 'Month', cell: (r) => r.monthLabel },
        { header: 'Transactions', align: 'right', cell: (r) => r.transactions },
        { header: 'Revenue', align: 'right', cell: (r) => r.revenue },
        { header: 'Profit', align: 'right', cell: (r) => r.profit },
      ],
      rows: filteredMonths,
      totals: [
        'TOTALS',
        String(transactionsSum),
        revenueSum.toFixed(2),
        profitSum.toFixed(2),
      ],
      fileName,
    });
    if (!ok) {
      toast({ title: 'No Data', description: 'No records to export. Please fetch the report first.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Excel Exported', description: `Report saved as ${fileName}` });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                Fiscal Year Report
              </CardTitle>
              <CardDescription>Revenue, transactions, and profit for a chosen fiscal year, broken down by month.</CardDescription>
            </div>
            {report && (
              <Badge variant="outline" className="text-sm border-blue-600 text-blue-600">
                {report.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Fiscal Year</label>
              <Select
                value={selectedYear}
                onValueChange={(v) => { setSelectedYear(v); fetchReport(v); }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select fiscal year" />
                </SelectTrigger>
                <SelectContent>
                  {(report?.availableFiscalYears || []).map((fy) => (
                    <SelectItem key={fy} value={String(fy)}>
                      {report && fy === report.fiscalYear ? report.label : `FY ${fy}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button onClick={() => fetchReport(selectedYear)} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
              {isLoading ? 'Loading...' : 'Show Report'}
            </button>

            <button
              onClick={exportToPDF}
              disabled={isLoading || !report}
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] border-blue-600 text-blue-600 hover:bg-blue-50"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export to PDF
            </button>

            <button
              onClick={exportToExcel}
              disabled={isLoading || !report}
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] border-emerald-700 text-emerald-700 hover:bg-emerald-50"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export to Excel
            </button>
          </div>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Monthly Breakdown</CardTitle>
              <CardDescription>Each fiscal period mapped to its calendar month.</CardDescription>
            </div>
            <ReportSearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search month..."
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="py-2 px-3">Month</TableHead>
                <TableHead className="py-2 px-2 text-right">Transactions</TableHead>
                <TableHead className="py-2 px-2 text-right">Revenue</TableHead>
                <TableHead className="py-2 px-2 text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report && filteredMonths.length > 0 ? (
                filteredMonths.map((m) => (
                  <TableRow key={m.period} className="text-xs">
                    <TableCell className="py-2 px-3 font-medium">{m.monthLabel}</TableCell>
                    <TableCell className="py-2 px-2 text-right font-mono">{m.transactions}</TableCell>
                    <TableCell className="py-2 px-2 text-right font-mono text-blue-600">{m.revenue.toFixed(2)}</TableCell>
                    <TableCell className={cn('py-2 px-2 text-right font-mono', m.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {m.profit.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    {isLoading ? 'Loading...' : <span className="text-muted-foreground">No data for this fiscal year.</span>}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
