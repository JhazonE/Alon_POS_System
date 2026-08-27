'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calculator, Search } from 'lucide-react';
import { format } from 'date-fns';

type Props = {
  loadingPOs: boolean;
  filteredPOs: any[];
  selectedPOs: Record<string, number>;
  poSearchTerm: string;
  setPoSearchTerm: (v: string) => void;
  handleAutoAllocate: () => void;
  handlePOToggle: (id: string, balance: number) => void;
  handlePOAmountChange: (id: string, amount: number, balance: number) => void;
  amountValue: number;
  totalAllocated: number;
};

export function PoAllocationPanel({
  loadingPOs, filteredPOs, selectedPOs,
  poSearchTerm, setPoSearchTerm,
  handleAutoAllocate, handlePOToggle, handlePOAmountChange,
  amountValue, totalAllocated,
}: Props) {
  return (
    <div className="space-y-2 border rounded-md p-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">PO Allocations</Label>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-7 text-xs"
          onClick={handleAutoAllocate}
          disabled={amountValue <= 0 || loadingPOs}
        >
          <Calculator className="h-3 w-3 mr-1" />
          Auto-Allocate
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
        <Input
          placeholder="Search PO reference..."
          className="pl-7 h-8 text-xs"
          value={poSearchTerm}
          onChange={e => setPoSearchTerm(e.target.value)}
        />
      </div>

      <ScrollArea className="h-[200px] pr-4">
        {loadingPOs ? (
          <div className="text-center py-4 text-xs text-muted-foreground">Loading POs...</div>
        ) : filteredPOs.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            {poSearchTerm ? 'No matching POs found.' : 'No unpaid POs found.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPOs.map(po => (
              <div key={po.id} className={`flex flex-col gap-1 border-b pb-2 last:border-0 ${po.isOverdue ? 'bg-red-50/50 dark:bg-red-950/10 -mx-1 px-1 rounded' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Checkbox
                      id={`po-${po.id}`}
                      checked={!!selectedPOs[po.id]}
                      onCheckedChange={() => handlePOToggle(po.id, po.balance)}
                    />
                    <label htmlFor={`po-${po.id}`} className={`text-xs font-medium cursor-pointer truncate ${po.isOverdue ? 'text-red-700 dark:text-red-400' : ''}`}>
                      {po.referenceNumber || po.id}
                    </label>
                    {po.isOverdue && (
                      <span className="text-[9px] text-red-600 font-semibold shrink-0">OVERDUE</span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {po.dueDate
                      ? `Due ${format(new Date(po.dueDate + 'T00:00:00'), 'MM/dd/yy')}`
                      : format(new Date(po.date), 'MM/dd/yy')}
                  </span>
                </div>
                <div className="flex items-center justify-between pl-6">
                  <span className="text-[10px] text-muted-foreground">
                    Bal: ₱{po.balance.toLocaleString()}
                  </span>
                  {selectedPOs[po.id] !== undefined && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px]">Pay:</span>
                      <Input
                        type="number"
                        className="h-6 w-20 text-[10px] p-1"
                        value={selectedPOs[po.id]}
                        onChange={e => handlePOAmountChange(po.id, parseFloat(e.target.value) || 0, po.balance)}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="flex justify-between items-center text-[11px] font-semibold pt-2 border-t mt-2">
        <span>Allocated: ₱{totalAllocated.toLocaleString()}</span>
        <span className={totalAllocated > amountValue ? 'text-red-500' : 'text-emerald-600'}>
          Rem: ₱{(amountValue - totalAllocated).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
