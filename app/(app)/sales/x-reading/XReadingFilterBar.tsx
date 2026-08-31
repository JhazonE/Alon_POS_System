'use client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

interface Props {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  selectedCashier: string;
  setSelectedCashier: (cashier: string) => void;
  uniqueCashiers: string[];
  xReadingsCount: number;
  onShowReport: () => void;
}

export function XReadingFilterBar({ dateRange, setDateRange, selectedCashier, setSelectedCashier, uniqueCashiers, xReadingsCount, onShowReport }: Props) {
  return (
    <div className="flex items-end gap-4 p-1 bg-background rounded-lg">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium leading-none">Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", 'w-[300px] justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>{format(dateRange.from, 'yyyy-MM-dd')} - {format(dateRange.to, 'yyyy-MM-dd')}</>
                ) : format(dateRange.from, 'yyyy-MM-dd')
              ) : (
                <span>Pick a date range</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} initialFocus numberOfMonths={2} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Cashier</label>
        <Select value={selectedCashier} onValueChange={setSelectedCashier} disabled={xReadingsCount === 0}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Cashiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cashiers</SelectItem>
            {uniqueCashiers.map((cashier) => (
              <SelectItem key={cashier} value={cashier}>{cashier}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <button onClick={onShowReport} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] bg-white hover:bg-gray-100 text-black border border-gray-200 shadow-sm">
        Show Report
      </button>
    </div>
  );
}
