import { ArrowRight, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn, formatQuantity } from '@/lib/utils';

import { typeConfig, type AdjustmentItem } from './constants';

export function AdjustmentTableRow({
  adj,
  onUpdate,
  onRemove,
  showExpirationColumn,
  maxQuantity = Number.POSITIVE_INFINITY,
  isShelfTransfer = false,
}: {
  adj: AdjustmentItem;
  onUpdate: (productId: string, updates: Partial<AdjustmentItem>) => void;
  onRemove: (productId: string) => void;
  showExpirationColumn?: boolean;
  /** Ceiling sa quantity. Infinity kung walay limit (add/remove/warehouse transfer). */
  maxQuantity?: number;
  /** Shelf transfer: wala mausab ang total stock, busa dili mo-ubos ang New Stock. */
  isShelfTransfer?: boolean;
}) {
  // Add: mo-taas. Shelf transfer: wala mausab ang total (shelf ra ang mibalhin). Remove ug warehouse transfer: mo-ubos ang source.
  const newStock = adj.type === 'add'
    ? adj.product.stock + adj.quantity
    : isShelfTransfer ? adj.product.stock : adj.product.stock - adj.quantity;
  const isNegative = newStock < 0;
  const cfg = typeConfig[adj.type];
  const Icon = cfg.icon;

  return (
    <TableRow className="group hover:bg-accent/50 transition-colors border-b border-border last:border-0">
      <TableCell className="py-4 pl-6">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
            {adj.product.name}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{adj.product.barcode || adj.product.sku}</span>
            {adj.product.warehouseName && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <WarehouseIcon className="h-3 w-3" />{adj.product.warehouseName}
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="py-4">
        <Badge variant="outline" className={cn("gap-1 font-semibold text-xs px-2.5 py-1 rounded-lg border", cfg.color)}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </Badge>
      </TableCell>
      <TableCell className="py-4">
        <div className="flex items-center gap-2 w-36">
          <button
            className="w-7 h-7 rounded-md bg-muted hover:bg-muted/70 flex items-center justify-center text-foreground font-bold transition-colors"
            onClick={() => onUpdate(adj.product.id, { quantity: Math.max(1, adj.quantity - 1) })}
          >−</button>
          <Input
            type="number"
            min="1"
            className="h-8 w-14 text-center font-bold text-sm px-1"
            value={adj.quantity}
            onChange={e => onUpdate(adj.product.id, { quantity: Math.min(maxQuantity, Math.max(1, parseInt(e.target.value) || 1)) })}
          />
          <button
            className="w-7 h-7 rounded-md bg-muted hover:bg-muted/70 flex items-center justify-center text-foreground font-bold transition-colors"
            onClick={() => onUpdate(adj.product.id, { quantity: Math.min(maxQuantity, adj.quantity + 1) })}
          >+</button>
        </div>
        <p className="text-[10px] text-muted-foreground uppercase mt-1 pl-1">{adj.product.unitOfMeasure}</p>
      </TableCell>
      <TableCell className="py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-muted-foreground tabular-nums">{formatQuantity(adj.product.stock)}</span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
          <span className={cn("text-sm font-bold tabular-nums", isNegative ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
            {formatQuantity(newStock)}
          </span>
          {isNegative && (
            <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 ml-0.5">Low</Badge>
          )}
        </div>
      </TableCell>
      {showExpirationColumn && (
        <TableCell className="py-4">
          {adj.product.isPerishable ? (
            <Input
              type="date"
              className="h-8 text-xs w-[150px]"
              value={adj.expirationDate || ''}
              onChange={e => onUpdate(adj.product.id, { expirationDate: e.target.value })}
            />
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          )}
        </TableCell>
      )}
      <TableCell className="py-4">
        <Input
          placeholder="Optional note..."
          className="h-8 text-xs w-full min-w-[160px]"
          value={adj.reason}
          onChange={e => onUpdate(adj.product.id, { reason: e.target.value })}
        />
      </TableCell>
      <TableCell className="py-4 pr-4">
        <button
          className="inline-flex items-center justify-center gap-2 text-sm font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors rounded-lg"
          onClick={() => onRemove(adj.product.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </TableCell>
    </TableRow>
  );
}
