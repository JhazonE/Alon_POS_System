'use client';

import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

type Props = { open: boolean; onClose: () => void; tempDateRange: DateRange | undefined; setTempDateRange: (v: DateRange | undefined) => void; onApply: () => void };

export function InvoicesDateRangeDialog({ open, onClose, tempDateRange, setTempDateRange, onApply }: Props) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-fit">
        <DialogHeader><DialogTitle>Filter by Date Range</DialogTitle></DialogHeader>
        <div className="py-4">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={tempDateRange?.from}
            selected={tempDateRange}
            onSelect={setTempDateRange}
            numberOfMonths={1}
            className="rounded-md border mx-auto"
          />
        </div>
        <DialogFooter>
          <button onClick={() => setTempDateRange(undefined)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Clear</button>
          <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Apply</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
