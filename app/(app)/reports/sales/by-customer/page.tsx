'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { CalendarIcon, FileDown, FileSpreadsheet, Users, TrendingUp, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { WaveStatCard } from '@/components/reports/WaveStatCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getApiUrl } from '@/lib/api-config';
import { exportReportPdf, exportReportExcel } from '@/lib/report-print';
import { Spinner } from '@/components/ui/spinner';

interface CustomerSale {
  customerId: string;
  customerName: string;
  contactNumber: string;
  paymentTerms: string;
  transactionCount: number;
  totalSales: number;
  totalPaid: number;
  outstandingBalance: number;
  lastPurchaseDate: string;
}

export default function SalesByCustomerPage() {
  const [fromDate, setFromDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [toDate, setToDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [records, setRecords] = useState<CustomerSale[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { toast } = useToast();

  const totals = {
    customers: records.length,
    totalSales: records.reduce((sum, r) => sum + r.totalSales, 0),
    creditSales: records.filter(r => r.paymentTerms !== 'Cash').reduce((sum, r) => sum + r.totalSales, 0),
    cashSales: records.filter(r => r.paymentTerms === 'Cash').reduce((sum, r) => sum + r.totalSales, 0),
    outstanding: records.reduce((sum, r) => sum + r.outstandingBalance, 0),
    avgSale: records.length > 0 ? records.reduce((sum, r) => sum + r.totalSales, 0) / records.length : 0,
  };

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) {
        params.append('startDate', format(fromDate, 'yyyy-MM-dd'));
      }
      if (toDate) {
        params.append('endDate', format(toDate, 'yyyy-MM-dd'));
      }

      const response = await fetch(getApiUrl(`/sales/transactions?${params.toString()}`));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      
      if (result.success) {
        // Group by customer
        const customerMap = new Map<string, CustomerSale>();
        
        result.data.forEach((tx: any) => {
          const customerId = tx.customer?.id || 'walk-in';
          const customerName = tx.customer?.name || 'Walk-in Customer';
          
          if (!customerMap.has(customerId)) {
            customerMap.set(customerId, {
              customerId,
              customerName,
              contactNumber: tx.customer?.contactNumber || '-',
              paymentTerms: tx.paymentMethod || 'Cash',
              transactionCount: 0,
              totalSales: 0,
              totalPaid: 0,
              outstandingBalance: 0,
              lastPurchaseDate: tx.date,
            });
          }
          
          const customer = customerMap.get(customerId)!;
          customer.transactionCount++;
          customer.totalSales += tx.total || 0;
          customer.totalPaid += tx.amountPaid || tx.total || 0;
          customer.outstandingBalance += tx.balance || 0;
          
          // Update last purchase date if newer
          if (new Date(tx.date) > new Date(customer.lastPurchaseDate)) {
            customer.lastPurchaseDate = tx.date;
          }
        });
        
        setRecords(Array.from(customerMap.values()));
      }
    } catch (error) {
      console.error("Error fetching sales by customer:", error);
      toast({
        title: "Error",
        description: "Failed to fetch customer sales data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredRecords = records.filter(record => {
    if (!searchTerm.trim()) return true;
    const search = searchTerm.toLowerCase();
    return (
      record.customerName?.toLowerCase().includes(search) ||
      record.contactNumber?.toLowerCase().includes(search) ||
      record.paymentTerms?.toLowerCase().includes(search)
    );
  });

  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  const exportToPDF = () => {
    const fileName = `Sales_By_Customer_${format(fromDate || new Date(), 'yyyyMMdd')}_${format(toDate || new Date(), 'yyyyMMdd')}.pdf`;
    const ok = exportReportPdf<CustomerSale>({
      title: 'Sales by Customer Report',
      dateRange: `From: ${fromDate ? format(fromDate, 'yyyy-MM-dd') : 'N/A'} To: ${toDate ? format(toDate, 'yyyy-MM-dd') : 'N/A'}`,
      summary: [
        { label: 'Total Customers', value: String(totals.customers) },
        { label: 'Total Sales', value: formatCurrency(totals.totalSales) },
        { label: 'Outstanding', value: formatCurrency(totals.outstanding) },
      ],
      columns: [
        { header: 'Customer Name', width: 45, cell: (r) => r.customerName || 'N/A' },
        { header: 'Contact', width: 30, cell: (r) => r.contactNumber || '-' },
        { header: 'Payment Terms', width: 25, cell: (r) => r.paymentTerms || '-' },
        { header: '# Trans', width: 20, align: 'right', cell: (r) => r.transactionCount.toString() },
        { header: 'Total Sales', width: 25, align: 'right', cell: (r) => r.totalSales.toFixed(2) },
        { header: 'Total Paid', width: 25, align: 'right', cell: (r) => r.totalPaid.toFixed(2) },
        { header: 'Outstanding', width: 25, align: 'right', cell: (r) => r.outstandingBalance.toFixed(2) },
        { header: 'Last Purchase', width: 30, cell: (r) => r.lastPurchaseDate ? format(new Date(r.lastPurchaseDate), 'MMM dd, yyyy') : '-' },
      ],
      rows: records,
      totals: ['TOTALS', null, null, null, totals.totalSales.toFixed(2), null, totals.outstanding.toFixed(2), null],
      fileName,
    });
    if (!ok) {
      toast({ title: 'No Data', description: 'No records to export. Please fetch the report first.', variant: 'destructive' });
      return;
    }
    toast({ title: 'PDF Exported', description: `Report saved as ${fileName}` });
  };

  const exportToExcel = () => {
    const totalSalesSum = filteredRecords.reduce((s, r) => s + Number(r.totalSales), 0);
    const outstandingSum = filteredRecords.reduce((s, r) => s + Number(r.outstandingBalance), 0);
    const fileName = `Sales_By_Customer_${format(fromDate || new Date(), 'yyyyMMdd')}_${format(toDate || new Date(), 'yyyyMMdd')}.xls`;
    const ok = exportReportExcel<CustomerSale>({
      title: 'Sales by Customer Report',
      subtitle: `From: ${fromDate ? format(fromDate, 'yyyy-MM-dd') : 'N/A'} To: ${toDate ? format(toDate, 'yyyy-MM-dd') : 'N/A'}`,
      columns: [
        { header: 'Customer Name', cell: (r) => r.customerName || 'N/A' },
        { header: 'Contact', cell: (r) => r.contactNumber || '-' },
        { header: 'Payment Terms', cell: (r) => r.paymentTerms || '-' },
        { header: '# Trans', align: 'right', cell: (r) => r.transactionCount },
        { header: 'Total Sales', align: 'right', cell: (r) => r.totalSales },
        { header: 'Total Paid', align: 'right', cell: (r) => r.totalPaid },
        { header: 'Outstanding', align: 'right', cell: (r) => r.outstandingBalance },
        { header: 'Last Purchase', cell: (r) => r.lastPurchaseDate ? format(new Date(r.lastPurchaseDate), 'MMM dd, yyyy') : '-' },
      ],
      rows: filteredRecords,
      totals: ['TOTALS', null, null, null, totalSalesSum.toFixed(2), null, outstandingSum.toFixed(2), null],
      fileName,
    });
    if (!ok) {
      toast({ title: 'No Data', description: 'No records to export. Please fetch the report first.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Excel Exported', description: `Report saved as ${fileName}` });
  };

  const formatCurrency = (value: number) => {
    return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-600" />
                Sales by Customer Report
              </CardTitle>
              <CardDescription>
                Customer purchase history with credit sales tracking
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm border-indigo-600 text-indigo-600">
              {records.length} Customer{records.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">From Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", "w-[180px] justify-start text-left font-normal", !fromDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate ? format(fromDate, "PPP") : "Select date"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={setFromDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">To Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", "w-[180px] justify-start text-left font-normal", !toDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "PPP") : "Select date"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={setToDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <button 
              onClick={fetchReport} 
              disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]"
            >
              {isLoading ? 'Loading...' : 'Show Report'}
            </button>

            <button 
              onClick={exportToPDF} 
              disabled={isLoading || records.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] border-indigo-600 text-indigo-600 hover:bg-indigo-50"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export to PDF
            </button>

            <button
              onClick={exportToExcel}
              disabled={isLoading || records.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] border-emerald-700 text-emerald-700 hover:bg-emerald-50"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export to Excel
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
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

      {/* Data Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Customer Sales Details</CardTitle>
              <CardDescription>
                Detailed breakdown of sales by customer
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-[250px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="py-2 px-3">Customer Name</TableHead>
                <TableHead className="py-2 px-2">Contact</TableHead>
                <TableHead className="py-2 px-2">Payment Terms</TableHead>
                <TableHead className="py-2 px-2 text-right"># Trans</TableHead>
                <TableHead className="py-2 px-2 text-right">Total Sales</TableHead>
                <TableHead className="py-2 px-2 text-right">Total Paid</TableHead>
                <TableHead className="py-2 px-2 text-right">Outstanding</TableHead>
                <TableHead className="py-2 px-2">Last Purchase</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRecords.length > 0 ? (
                paginatedRecords.map((record, index) => (
                  <TableRow 
                    key={index}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50 transition-colors text-xs",
                      record.outstandingBalance > 0 && "bg-red-50/50"
                    )}
                  >
                    <TableCell className="py-2 px-3 font-medium">{record.customerName}</TableCell>
                    <TableCell className="py-2 px-2 text-muted-foreground">{record.contactNumber}</TableCell>
                    <TableCell className="py-2 px-2">{record.paymentTerms}</TableCell>
                    <TableCell className="py-2 px-2 text-right font-mono">
                      {record.transactionCount}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right font-mono text-blue-600">
                      {record.totalSales.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right font-mono text-green-600">
                      {record.totalPaid.toFixed(2)}
                    </TableCell>
                    <TableCell className={cn(
                      "py-2 px-2 text-right font-mono font-semibold",
                      record.outstandingBalance > 0 ? "text-red-600" : "text-green-600"
                    )}>
                      {record.outstandingBalance.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2">
                      {record.lastPurchaseDate ? format(new Date(record.lastPurchaseDate), 'MMM dd, yyyy') : '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <Spinner className="h-4 w-4" />
                        Loading...
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        No customer sales found for the selected date range.
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          
          {/* Pagination Controls */}
          {filteredRecords.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredRecords.length)} of {filteredRecords.length} entries
                </span>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page:</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[70px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  
                  <div className="flex items-center gap-1 px-2">
                    <span className="text-sm font-medium">
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>

                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
