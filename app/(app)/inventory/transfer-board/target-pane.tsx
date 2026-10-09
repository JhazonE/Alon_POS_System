'use client';

import { ArrowRightLeft, CheckCircle2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatStockQuantity } from '@/lib/utils';
import type { Warehouse } from '@/lib/types';

import type { StagedTransferItem } from './transfer-board-types';
import { Spinner } from '@/components/ui/spinner';

interface TargetPaneProps {
  warehouses: Warehouse[];
  targetWarehouseId: string;
  onTargetWarehouseChange: (id: string) => void;
  stagedItems: StagedTransferItem[];
  onUpdateQuantity: (stagedId: string, value: string) => void;
  onRemoveItem: (stagedId: string) => void;
  onClearAll: () => void;
  onExecuteTransfer: () => void;
  isTransferring: boolean;
}

export function TargetPane({
  warehouses,
  targetWarehouseId,
  onTargetWarehouseChange,
  stagedItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearAll,
  onExecuteTransfer,
  isTransferring,
}: TargetPaneProps) {
  return (
    <div className="flex flex-col h-full w-full bg-background min-h-0 relative">
      <div className="p-3 border-b space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-1.5 text-primary">
            <ArrowRightLeft className="h-4 w-4" /> Transfer Destination
          </h2>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-7 text-[10px] text-destructive uppercase font-bold"
            onClick={onClearAll}
          >
            Clear All
          </button>
        </div>
        <Select value={targetWarehouseId} onValueChange={onTargetWarehouseChange}>
          <SelectTrigger className={cn("h-9 text-xs font-bold transition-all", !targetWarehouseId ? "border-primary/50 bg-primary/5" : "bg-card")}>
            <SelectValue placeholder="Select Destination Warehouse..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned" className="text-orange-600 font-bold">Unassigned/Returns</SelectItem>
            {warehouses.map(w => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-between px-3 py-1 bg-muted/30 border-b text-[10px] font-bold text-muted-foreground uppercase">
        <span>Staged ({stagedItems.length})</span>
        <span>Move Qty</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-1 pb-4">
          {stagedItems.map(item => (
            <div key={item.stagedId} className="flex items-center justify-between gap-2 p-2 border rounded-lg bg-card">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate leading-tight">{item.product.name}</p>
                <p className="text-[9px] opacity-60 truncate">
                  From: {item.sourceWarehouseName} | Max: {formatStockQuantity(item.maxQuantity)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="1"
                  value={item.transferQuantity}
                  onChange={e => onUpdateQuantity(item.stagedId, e.target.value)}
                  className="h-7 w-12 text-center text-xs p-1"
                />
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-7 w-7 text-muted-foreground"
                  onClick={() => onRemoveItem(item.stagedId)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {stagedItems.length === 0 && (
            <div className="py-20 text-center text-xs opacity-40">Staging empty</div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t bg-background/80 backdrop-blur shrink-0">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] w-full h-11 font-black shadow-lg shadow-primary/20"
          disabled={!targetWarehouseId || stagedItems.length === 0 || isTransferring}
          onClick={onExecuteTransfer}
        >
          {isTransferring
            ? <Spinner className="h-4 w-4 mr-2" />
            : <CheckCircle2 className="h-4 w-4 mr-2" />
          }
          Confirm Transfer
        </button>
      </div>
    </div>
  );
}
