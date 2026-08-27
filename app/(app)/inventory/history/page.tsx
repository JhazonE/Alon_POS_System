'use client';

import { useMemo, useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import type { StockAdjustment } from '@/lib/types';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { CalendarIcon, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatQuantity } from '@/lib/utils';
import { getStockAdjustments, getStockAdjustmentsCount } from './actions';

function AdjustmentRow({ adjustment }: { adjustment: StockAdjustment }) {
  const formattedDate = useMemo(() => {
    try {
      return format(new Date(adjustment.date), 'PP p');
    } catch (error) {
      return 'Invalid Date';
    }
  }, [adjustment.date]);

  return (
    <TableRow key={adjustment.id} className={cn(adjustment.status === 'Pending' && "bg-blue-50/30 italic")}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
            {adjustment.product?.name || adjustment.productName}
            {adjustment.status === 'Pending' && (
                <Badge variant="secondary" className="text-[9px] h-4 bg-blue-100 text-blue-700 border-blue-200">Pending</Badge>
            )}
        </div>
      </TableCell>
      <TableCell suppressHydrationWarning>{formattedDate}</TableCell>
      <TableCell>
         <Badge variant={adjustment.quantity > 0 ? "default" : "destructive"} className="text-xs">
          {adjustment.quantity > 0 ? '+' : ''}{formatQuantity(adjustment.quantity)}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground italic text-xs">{adjustment.reason}</TableCell>
      <TableCell className="text-right font-bold">
        {adjustment.status === 'Pending' ? '---' : formatQuantity(adjustment.newStock)}
      </TableCell>
    </TableRow>
  );
}

function AdjustmentSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
      <TableCell><Skeleton className="h-6 w-12 rounded-full" /></TableCell>
      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-5 w-10 ml-auto" /></TableCell>
    </TableRow>
  );
}



export default function AdjustmentHistoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  useEffect(() => {
    const fetchAdjustments = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const fetchedAdjustments = await getStockAdjustments();
        setAdjustments(fetchedAdjustments);
      } catch (error) {
        console.error('Failed to fetch stock adjustments:', error);
        setError('Failed to load adjustment history. Please try again.');
        setAdjustments([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdjustments();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, dateRange]);

  const filteredAdjustments = useMemo(() => {
    if (!adjustments) return [];

    return adjustments.filter(adj => {
        // Date filter
        const adjDate = new Date(adj.date);
        if (dateRange?.from && adjDate < dateRange.from) return false;
        if (dateRange?.to) {
            const toDate = new Date(dateRange.to);
            toDate.setHours(23, 59, 59, 999);
            if (adjDate > toDate) return false;
        }

        // Search term filter
        const term = searchTerm.toLowerCase();
        if (term && !((adj.product?.name || adj.productName)?.toLowerCase().includes(term) || adj.reason.toLowerCase().includes(term))) {
            return false;
        }

        return true;
    }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  }, [adjustments, dateRange, searchTerm]);

  const totalPages = Math.ceil(filteredAdjustments.length / pageSize);
  const paginatedAdjustments = filteredAdjustments.slice((page - 1) * pageSize, page * pageSize);

  const resetFilters = () => {
    setSearchTerm('');
    setDateRange(undefined);
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Adjustment History</CardTitle>
        <CardDescription>
          A log of all manual stock adjustments made to your products.
        </CardDescription>
        <div className="flex items-center justify-between gap-4 pt-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by product or reason..."
              className="pl-8 sm:w-[300px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {error && <div className="text-destructive text-sm font-medium items-center flex">{error}</div>}
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", "w-[280px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd, y")} -{" "}
                        {format(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
            {(searchTerm || dateRange) && (
              <button onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0">
                <X className="h-4 w-4" />
                <span className="sr-only">Reset filters</span>
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table wrapperClassName="overflow-auto max-h-[calc(100vh-280px)]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Product</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Resulting Stock</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => <AdjustmentSkeleton key={i} />)}
            {!isLoading && paginatedAdjustments.length > 0 ? (
              paginatedAdjustments.map((adj) => (
                <AdjustmentRow key={adj.id} adjustment={adj} />
              ))
            ) : (
              !isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No adjustments found for the selected criteria.
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            Showing {filteredAdjustments.length === 0 ? 0 : ((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, filteredAdjustments.length)} of {filteredAdjustments.length} entries
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </button>
            <span className="text-sm">Page {page} of {totalPages || 1}</span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || totalPages === 0} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
