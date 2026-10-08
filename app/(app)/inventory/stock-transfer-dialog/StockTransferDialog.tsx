'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowRight, Send, Warehouse as WarehouseIcon } from 'lucide-react';
import { formatQuantity } from '@/lib/utils';
import type { Product } from '@/lib/types';

import { useStockTransfer } from './use-stock-transfer';
import { Spinner } from '@/components/ui/spinner';

interface StockTransferDialogProps {
  product: Product;
  children?: React.ReactNode;
  onSuccess?: () => void;
  requireConfirmation?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function StockTransferDialog({ product, children, onSuccess, requireConfirmation, open, onOpenChange }: StockTransferDialogProps) {
  const {
    isOpen,
    setIsOpen,
    isSubmitting,
    warehouses,
    isLoadingWarehouses,
    targetWarehouseId,
    setTargetWarehouseId,
    quantity,
    handleQuantityChange,
    notes,
    setNotes,
    isConfirmOpen,
    setIsConfirmOpen,
    handleTransferClick,
    processTransfer,
    targetWhName,
  } = useStockTransfer({ product, onSuccess, requireConfirmation, open, onOpenChange });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {children && <DialogTrigger asChild>{children}</DialogTrigger>}
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WarehouseIcon className="h-5 w-5 text-primary" />
              Stock Transfer
            </DialogTitle>
            <DialogDescription>
              Move <strong>{product.name}</strong> from <strong>{product.warehouseName || 'Current Warehouse'}</strong> to another location.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="bg-muted/50 p-3 rounded-md border text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Stock:</span>
                <span className="font-semibold">{formatQuantity(product.stock)} {product.unitOfMeasure}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SKU / Barcode:</span>
                <span>{product.sku || product.barcode || 'N/A'}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="targetWarehouse">Destination Warehouse</Label>
              <Select value={targetWarehouseId} onValueChange={setTargetWarehouseId}>
                <SelectTrigger id="targetWarehouse" className="w-full">
                  <SelectValue placeholder={isLoadingWarehouses ? 'Loading warehouses...' : 'Select where to move stock'} />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                  {warehouses.length === 0 && !isLoadingWarehouses && (
                    <div className="p-2 text-sm text-center text-muted-foreground">No other active warehouses found.</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quantity">Transfer Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max={product.stock}
                value={quantity || ''}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder={`Max: ${formatQuantity(product.stock)}`}
                className="w-full"
              />
            </div>

            {quantity > 0 && targetWarehouseId && (
              <div className="flex items-center justify-center gap-3 py-2 px-4 bg-primary/5 rounded-lg border border-primary/20 animate-in fade-in zoom-in duration-300">
                <div className="text-center">
                  <div className="text-[10px] uppercase text-muted-foreground font-bold">From</div>
                  <div className="text-xs font-medium truncate max-w-[100px]">{product.warehouseName || 'Source'}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-primary" />
                <div className="text-center">
                  <div className="text-[10px] uppercase text-muted-foreground font-bold">To</div>
                  <div className="text-xs font-medium truncate max-w-[100px]">{targetWhName || 'Destination'}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10px] uppercase text-primary font-bold">Moving</div>
                  <div className="text-sm font-bold text-primary">{formatQuantity(quantity)}</div>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="notes">Transfer Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Seasonal restocking, store request"
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter>
            <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
            <button
              onClick={handleTransferClick}
              disabled={isSubmitting || !targetWarehouseId || quantity <= 0}
              className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] gap-2"
            >
              {isSubmitting ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              Confirm Transfer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Stock Transfer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to move <strong>{formatQuantity(quantity)} {product.unitOfMeasure}</strong> of <strong>{product.name}</strong> to <strong>{targetWhName}</strong>?
              This action will update stock levels in both locations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={processTransfer} disabled={isSubmitting}>
              {isSubmitting ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Confirm Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
