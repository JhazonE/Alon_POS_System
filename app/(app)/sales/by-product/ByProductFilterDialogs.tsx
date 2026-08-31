import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TerminalSelector } from '@/components/TerminalSelector';

type DateRangeDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tempDateRange: DateRange | undefined;
  setTempDateRange: (v: DateRange | undefined) => void;
  onApply: () => void;
};

export function DateRangeFilterDialog({ open, onOpenChange, tempDateRange, setTempDateRange, onApply }: DateRangeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-fit max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filter by Date Range</DialogTitle>
          <DialogDescription>Select a date range to filter sales data.</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label>Date Range</Label>
          <div className="mt-2 flex justify-center">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={tempDateRange?.from}
              selected={tempDateRange}
              onSelect={setTempDateRange}
              numberOfMonths={1}
              className="rounded-md border"
            />
          </div>
          {tempDateRange?.from && (
            <p className="text-sm text-muted-foreground text-center mt-2">
              {tempDateRange.to ? (
                <>Selected: {format(tempDateRange.from, 'LLL dd, y')} - {format(tempDateRange.to, 'LLL dd, y')}</>
              ) : (
                <>Selected: {format(tempDateRange.from, 'LLL dd, y')}</>
              )}
            </p>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <button onClick={() => setTempDateRange(undefined)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">Clear Date</button>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">Cancel</button>
          <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">Apply Filter</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TerminalDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tempTerminal: string;
  setTempTerminal: (v: string) => void;
  onApply: () => void;
};

export function TerminalFilterDialog({ open, onOpenChange, tempTerminal, setTempTerminal, onApply }: TerminalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Filter by Terminal</DialogTitle>
          <DialogDescription>Select the terminal to filter sales data.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label>Terminal</Label>
          <div className="mt-2">
            <TerminalSelector terminalId={tempTerminal} onTerminalChange={setTempTerminal} showAllOption={true} />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Apply Filter</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CategoryDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tempCategory: string;
  setTempCategory: (v: string) => void;
  categories: string[];
  onApply: () => void;
};

export function CategoryFilterDialog({ open, onOpenChange, tempCategory, setTempCategory, categories, onApply }: CategoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Filter by Category</DialogTitle>
          <DialogDescription>Select the category to filter products.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label>Category</Label>
          <Select value={tempCategory} onValueChange={setTempCategory}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Apply Filter</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BrandDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tempBrand: string;
  setTempBrand: (v: string) => void;
  brands: string[];
  onApply: () => void;
};

export function BrandFilterDialog({ open, onOpenChange, tempBrand, setTempBrand, brands, onApply }: BrandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Filter by Brand</DialogTitle>
          <DialogDescription>Select the brand to filter products.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label>Brand</Label>
          <Select value={tempBrand} onValueChange={setTempBrand}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Select brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Apply Filter</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CashierDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tempCashier: string;
  setTempCashier: (v: string) => void;
  cashiers: { uid: string; displayName: string }[];
  onApply: () => void;
};

export function CashierFilterDialog({ open, onOpenChange, tempCashier, setTempCashier, cashiers, onApply }: CashierDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Filter by Cashier</DialogTitle>
          <DialogDescription>Select the cashier to filter sales data.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label>Cashier</Label>
          <Select value={tempCashier} onValueChange={setTempCashier}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Select cashier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cashiers</SelectItem>
              {cashiers.map((c) => <SelectItem key={c.uid} value={c.displayName}>{c.displayName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Apply Filter</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ReferenceDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tempReference: string;
  setTempReference: (v: string) => void;
  onApply: () => void;
};

export function ReferenceFilterDialog({ open, onOpenChange, tempReference, setTempReference, onApply }: ReferenceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Filter by Transaction Reference</DialogTitle>
          <DialogDescription>Enter a transaction reference number to filter.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label>Transaction Reference</Label>
          <Input
            className="mt-2"
            placeholder="Order #, Invoice #..."
            value={tempReference}
            onChange={(e) => setTempReference(e.target.value)}
          />
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Apply Filter</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
