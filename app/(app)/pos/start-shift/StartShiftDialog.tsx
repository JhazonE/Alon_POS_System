'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useStartShift } from './use-start-shift';
import { billDenominations, coinDenominations } from './start-shift-utils';
import type { StartShiftDialogProps } from './start-shift-types';

const DenominationInput = ({
  denom,
  value,
  onChange
}: {
  denom: { value: number, label: string },
  value: number | undefined,
  onChange: (value: number, count: string) => void
}) => (
  <div className="grid grid-cols-3 items-center gap-4">
    <Label htmlFor={`denom-${denom.value}`} className="text-right">
      {denom.label}
    </Label>
    <span className="text-center text-muted-foreground">x</span>
    <Input
      id={`denom-${denom.value}`}
      type="number"
      placeholder="0"
      value={value || ''}
      onChange={(e) => onChange(denom.value, e.target.value)}
      className="col-span-1"
    />
  </div>
);

export function StartShiftDialog({ isOpen, onShiftStart, onCancel }: StartShiftDialogProps) {
  const { counts, totalCash, handleCountChange, handleStartShift } = useStartShift({
    isOpen,
    onShiftStart,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start New Shift</DialogTitle>
          <DialogDescription>
            Enter your starting cash denominations to begin your shift.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-80 pr-6">
          <div className="py-4 grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-4">
              <h3 className="font-medium text-center">Bills</h3>
              {billDenominations.map(denom => (
                <DenominationInput 
                  key={denom.value} 
                  denom={denom} 
                  value={counts[denom.value]}
                  onChange={handleCountChange}
                />
              ))}
            </div>
            <div className="space-y-4">
               <h3 className="font-medium text-center">Coins</h3>
              {coinDenominations.map(denom => (
                <DenominationInput 
                  key={denom.value} 
                  denom={denom} 
                  value={counts[denom.value]}
                  onChange={handleCountChange}
                />
              ))}
            </div>
          </div>
        </ScrollArea>
        <Separator />
        <div className="flex justify-between items-center pt-4">
            <span className="text-lg font-medium">Total Starting Cash:</span>
            <span className="text-2xl font-bold text-primary">₱{totalCash.toFixed(2)}</span>
        </div>
        <DialogFooter className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleStartShift}
            className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] w-full py-6 h-auto text-lg"
          >
            Start Shift {totalCash > 0 ? `(₱${totalCash.toFixed(2)})` : ''}
          </button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
