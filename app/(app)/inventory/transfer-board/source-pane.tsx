'use client';

import { Box, Rows3 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, formatStockQuantity } from '@/lib/utils';
import { ManageWarehousesDialog } from '../../sales/manage-warehouses/ManageWarehousesDialog';

import type { WarehouseStockItem } from './transfer-board-types';

interface SourcePaneProps {
  sourceSearch: string;
  onSearchChange: (value: string) => void;
  filteredSourceItems: WarehouseStockItem[];
  selectedSourceIds: Set<string>;
  onToggleSelectItem: (uniqueId: string) => void;
  onToggleSelectAll: () => void;
  onStageSelected: () => void;
  onStageItem: (uniqueId: string) => void;
  onWarehouseChange: () => void;
}

export function SourcePane({
  sourceSearch,
  onSearchChange,
  filteredSourceItems,
  selectedSourceIds,
  onToggleSelectItem,
  onToggleSelectAll,
  onStageSelected,
  onStageItem,
  onWarehouseChange,
}: SourcePaneProps) {
  const allSelected = filteredSourceItems.length > 0 && selectedSourceIds.size === filteredSourceItems.length;

  return (
    <div className="flex flex-col h-full w-full bg-background min-h-0">
      <div className="p-3 border-b space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-sm flex items-center gap-1.5 truncate">
            <Box className="h-4 w-4" /> Stock Pool
          </h2>
          <div className="flex gap-1">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[13px] rounded-lg gap-1.5 h-7 text-[11px] font-bold"
              onClick={onStageSelected}
              disabled={selectedSourceIds.size === 0}
            >
              Stage Selected
            </button>
            <ManageWarehousesDialog
              onChange={onWarehouseChange}
              trigger={
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring text-xs rounded-lg gap-1.5 h-7 px-1.5">
                  <Rows3 className="h-4 w-4" />
                </button>
              }
            />
          </div>
        </div>
        <Input
          placeholder="Search name or SKU..."
          value={sourceSearch}
          onChange={e => onSearchChange(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-[36px,1fr,56px] px-3 py-1 bg-muted/30 border-b text-[10px] font-bold text-muted-foreground uppercase">
        <div className="flex justify-center">
          <Checkbox checked={allSelected} onCheckedChange={onToggleSelectAll} />
        </div>
        <span>Product</span>
        <span className="text-right">Stock</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-1">
          {filteredSourceItems.map(item => (
            <div
              key={item.uniqueId}
              className={cn(
                "grid grid-cols-[36px,1fr,60px] items-center gap-2 p-2 rounded-lg border",
                selectedSourceIds.has(item.uniqueId) ? "bg-primary/5 border-primary" : "bg-card"
              )}
            >
              <div className="flex justify-center">
                <Checkbox
                  checked={selectedSourceIds.has(item.uniqueId)}
                  onCheckedChange={() => onToggleSelectItem(item.uniqueId)}
                />
              </div>
              <div className="min-w-0 cursor-pointer" onClick={() => onStageItem(item.uniqueId)}>
                <p className="text-xs font-bold truncate leading-tight">{item.product.name}</p>
                <div className="flex items-center gap-1.5 opacity-70">
                  <Badge variant="outline" className="text-[9px] px-1 h-3.5 truncate max-w-[80px]">
                    {item.warehouseName}
                  </Badge>
                  <span className="text-[9px] truncate font-mono">{item.product.sku}</span>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring rounded-lg gap-1.5 h-8 px-1.5 text-xs font-black"
                  onClick={e => { e.stopPropagation(); onStageItem(item.uniqueId); }}
                >
                  {formatStockQuantity(item.quantity)}
                </button>
              </div>
            </div>
          ))}
          {filteredSourceItems.length === 0 && (
            <div className="py-20 text-center text-xs text-muted-foreground opacity-50">No products found</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
