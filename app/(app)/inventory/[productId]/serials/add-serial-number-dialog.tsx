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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Product } from '@/lib/types';

import { useAddSerialForm } from './use-add-serial-form';
import { Spinner } from '@/components/ui/spinner';

/**
 * Mode-toggle button classes: the shared `sm` button recipe plus this row's
 * flex sizing, with the active/inactive halves split out.
 */
const MODE_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-8 px-[13px] text-xs rounded-lg gap-1.5 flex-1';
const MODE_ACTIVE =
  'bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55';
const MODE_INACTIVE =
  'border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring';

export function AddSerialNumberDialog({ product }: { product: Product }) {
  const {
    isOpen,
    setIsOpen,
    isSubmitting,
    serialNumber,
    setSerialNumber,
    quantity,
    setQuantity,
    baseSerial,
    setBaseSerial,
    mode,
    setMode,
    handleAddBatchSerials,
    handleAddSingleSerial,
  } = useAddSerialForm({ product });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Serial Number
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Serial Numbers for {product.name}</DialogTitle>
          <DialogDescription>
            Add individual serial numbers or generate multiple serial numbers in batch.
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selection */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('single')}
            className={cn(MODE_CLASSES, mode === 'single' ? MODE_ACTIVE : MODE_INACTIVE)}
          >
            Single Serial
          </button>
          <button
            onClick={() => setMode('batch')}
            className={cn(MODE_CLASSES, mode === 'batch' ? MODE_ACTIVE : MODE_INACTIVE)}
          >
            Batch Serials
          </button>
        </div>

        {/* Single Serial Mode */}
        {mode === 'single' && (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="serial" className="text-right">
                Serial Number
              </Label>
              <Input
                id="serial"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="col-span-3"
                placeholder="e.g., SN-123456789"
              />
            </div>
          </div>
        )}

        {/* Batch Serial Mode */}
        {mode === 'batch' && (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="baseSerial" className="text-right">
                Base Serial
              </Label>
              <Input
                id="baseSerial"
                value={baseSerial}
                onChange={(e) => setBaseSerial(e.target.value)}
                className="col-span-3"
                placeholder="e.g., SN-001"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">
                Quantity
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="col-span-3"
                placeholder="e.g., 10"
              />
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
              <p className="font-medium mb-1">Preview:</p>
              <p>This will generate serial numbers like:</p>
              <p className="font-mono">
                {baseSerial ? `${baseSerial}-001, ${baseSerial}-002, ..., ${baseSerial}-${String(quantity).padStart(3, '0')}` : 'Enter base serial first'}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
            Cancel
          </button>
          <button
            onClick={mode === 'single' ? handleAddSingleSerial : handleAddBatchSerials}
            disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]"
          >
            {isSubmitting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" /> Adding...
              </>
            ) : mode === 'single' ? (
              'Add Serial'
            ) : (
              `Add ${quantity} Serials`
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
