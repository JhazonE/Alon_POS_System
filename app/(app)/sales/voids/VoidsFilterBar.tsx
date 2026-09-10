'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, FileDown, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Props {
  fromDate: Date | undefined;
  setFromDate: (date: Date | undefined) => void;
  toDate: Date | undefined;
  setToDate: (date: Date | undefined) => void;
  isLoading: boolean;
  recordCount: number;
  onShowReport: () => void;
  onExportPDF: () => void;
}

export function VoidsFilterBar({ fromDate, setFromDate, toDate, setToDate, isLoading, recordCount, onShowReport, onExportPDF }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Void Sales Report
            </CardTitle>
            <CardDescription>View and analyze all voided sales transactions</CardDescription>
          </div>
          <Badge variant="destructive" className="text-sm">
            {recordCount} Voided Transaction{recordCount !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">From Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", 'w-[180px] justify-start text-left font-normal', !fromDate && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDate ? format(fromDate, 'PPP') : 'Select date'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">To Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]", 'w-[180px] justify-start text-left font-normal', !toDate && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toDate ? format(toDate, 'PPP') : 'Select date'}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <button onClick={onShowReport} disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isLoading ? 'Loading...' : 'Show Report'}
          </button>

          <button onClick={onExportPDF} disabled={isLoading || recordCount === 0} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-10 px-[18px]">
            <FileDown className="mr-2 h-4 w-4" />
            Export to PDF
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
