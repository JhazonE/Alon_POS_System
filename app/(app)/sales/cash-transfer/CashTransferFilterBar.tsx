import { format } from 'date-fns';
import { CalendarIcon, RefreshCcw, Eye } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TerminalSelector } from '@/components/TerminalSelector';
import { cn } from '@/lib/utils';
import type { Table } from '@tanstack/react-table';
import type { Cashier } from './cash-transfer-types';

type Props = {
  dateRange: DateRange | undefined;
  setDateRange: (v: DateRange | undefined) => void;
  terminalId: string;
  setTerminalId: (v: string) => void;
  cashierId: string;
  setCashierId: (v: string) => void;
  type: string;
  setType: (v: string) => void;
  cashiers: Cashier[];
  refetch: () => void;
  table: Table<any>;
};

export function CashTransferFilterBar({
  dateRange, setDateRange,
  terminalId, setTerminalId,
  cashierId, setCashierId,
  type, setType,
  cashiers, refetch, table,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Date Range */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", 'w-[240px] justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}
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

      <TerminalSelector terminalId={terminalId} onTerminalChange={setTerminalId} showAllOption={true} />

      {/* Cashier */}
      <Select value={cashierId} onValueChange={setCashierId}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Cashiers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Cashiers</SelectItem>
          {cashiers.map((c) => (
            <SelectItem key={c.uid} value={c.uid}>
              {c.display_name || c.username || c.uid}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Type */}
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="deposit">Cash In (Deposit)</SelectItem>
          <SelectItem value="pickup">Cash Out (Pickup)</SelectItem>
        </SelectContent>
      </Select>

      <button onClick={() => refetch()} title="Refresh" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0">
        <RefreshCcw className="h-4 w-4" />
      </button>

      {/* Column Visibility */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 ml-auto">
            <Eye className="h-4 w-4 mr-2" />
            Columns
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {table.getAllColumns().filter((col) => col.getCanHide()).map((col) => (
            <DropdownMenuCheckboxItem
              key={col.id}
              className="capitalize"
              checked={col.getIsVisible()}
              onCheckedChange={(value) => col.toggleVisibility(!!value)}
            >
              {col.id.replace(/_/g, ' ')}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
