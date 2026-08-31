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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { TerminalSelector } from '@/components/TerminalSelector';
import { usePaymentMethods } from '@/hooks/use-api';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tempInterval: string;
  setTempInterval: (v: string) => void;
  tempTerminal: string;
  setTempTerminal: (v: string) => void;
  tempPaymentType: string;
  setTempPaymentType: (v: string) => void;
  transactionReference: string;
  setTransactionReference: (v: string) => void;
  onApply: () => void;
};

export function ByDateFiltersDialog({
  open, onOpenChange,
  tempInterval, setTempInterval,
  tempTerminal, setTempTerminal,
  tempPaymentType, setTempPaymentType,
  transactionReference, setTransactionReference,
  onApply,
}: Props) {
  const { paymentMethods } = usePaymentMethods();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Filter Options</DialogTitle>
          <DialogDescription className="sr-only">
            Filter sales by date, terminal, and payment method
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Interval</Label>
            <Select value={tempInterval} onValueChange={setTempInterval}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Terminal</Label>
            <div className="col-span-3">
              <TerminalSelector
                terminalId={tempTerminal}
                onTerminalChange={setTempTerminal}
                showAllOption={true}
              />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Payment</Label>
            <Select value={tempPaymentType} onValueChange={setTempPaymentType}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select payment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payment Types</SelectItem>
                {paymentMethods.map((pm) => <SelectItem key={pm.id} value={pm.name}>{pm.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Reference</Label>
            <Input
              placeholder="Transaction Reference"
              className="col-span-3"
              value={transactionReference}
              onChange={(e) => setTransactionReference(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={onApply} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Apply Filters</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
