'use client';

import { Table as ReactTable } from '@tanstack/react-table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CalendarIcon, Columns } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { TerminalSelector } from '@/components/TerminalSelector';
import type { ZReadingData } from './z-reading-preview';

interface Props {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  terminal: string;
  setTerminal: (id: string) => void;
  table: ReactTable<ZReadingData>;
  onShowReport: () => void;
}

export function ZReadingFilterBar({ dateRange, setDateRange, terminal, setTerminal, table, onShowReport }: Props) {
  return (
    <div className="flex items-end gap-4 p-1 bg-background rounded-lg">
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", 'w-[300px] justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? <>{format(dateRange.from, 'yyyy-MM-dd')} - {format(dateRange.to, 'yyyy-MM-dd')}</> : format(dateRange.from, 'yyyy-MM-dd')
              ) : <span>Pick a date range</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} initialFocus numberOfMonths={2} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Terminal</label>
        <TerminalSelector terminalId={terminal} onTerminalChange={setTerminal} showAllOption={true} />
      </div>

      <button onClick={onShowReport} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] bg-white hover:bg-gray-100 text-black border border-gray-200 shadow-sm">
        Show Report
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 ml-auto">
            <Columns className="mr-2 h-4 w-4" />
            Columns
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {table.getAllColumns().filter(col => col.getCanHide()).map(col => (
            <DropdownMenuCheckboxItem
              key={col.id}
              className="capitalize"
              checked={col.getIsVisible()}
              onCheckedChange={val => col.toggleVisibility(!!val)}
            >
              {col.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
