import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { CalendarIcon, SlidersHorizontal, FileDown, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type Props = {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  interval: string;
  setInterval: (value: string) => void;
  hasActiveFilters: boolean;
  resetFilters: () => void;
  onOpenAdvancedFilters: () => void;
  exportToCSV: () => void;
  exportToPDF: () => void;
};

export function AnalysisFilterBar({
  dateRange,
  setDateRange,
  interval,
  setInterval,
  hasActiveFilters,
  resetFilters,
  onOpenAdvancedFilters,
  exportToCSV,
  exportToPDF,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap bg-muted/20 p-2 rounded-md border">
      <div className="flex items-center gap-2">
        {/* Export */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 h-8">
              <FileDown className="h-4 w-4 mr-2" />
              Export
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={exportToCSV}>Export to CSV</DropdownMenuItem>
            <DropdownMenuItem onSelect={exportToPDF}>Export to PDF</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5", 'h-8 justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>{format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}</>
                ) : (
                  format(dateRange.from, 'LLL dd, y')
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

        {/* Filters Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 h-8">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2 px-1 rounded-sm">!</Badge>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filter Options</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Time Interval ({interval})</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={interval} onValueChange={setInterval}>
                  <DropdownMenuRadioItem value="daily">Daily</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="hourly">Hourly</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="monthly">Monthly</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); onOpenAdvancedFilters(); }}
            >
              Advanced Filters...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={resetFilters} className="text-destructive">
              Reset Filters
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasActiveFilters && (
          <button onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring text-xs rounded-lg gap-1.5 h-8 w-8 p-0">
            <X className="h-4 w-4" />
            <span className="sr-only">Reset</span>
          </button>
        )}
      </div>
    </div>
  );
}
