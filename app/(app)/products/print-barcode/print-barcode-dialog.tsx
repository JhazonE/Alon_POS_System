'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Printer } from 'lucide-react';
import type { Product } from '@/lib/types';

import { BARCODE_FORMATS, LABEL_SIZES } from './barcode-utils';
import { PreviewLabel } from './preview-label';
import { usePrintBarcode } from './use-print-barcode';

interface PrintBarcodeDialogProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintBarcodeDialog({ product, open, onOpenChange }: PrintBarcodeDialogProps) {
  const {
    qty,
    setQty,
    sizeIndex,
    setSizeIndex,
    format,
    setFormat,
    showPrice,
    setShowPrice,
    showName,
    setShowName,
    size,
    barcodeValue,
    dataUrl,
    handlePrint,
  } = usePrintBarcode({ product });

  if (!barcodeValue) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Print Barcode — {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Label Size</Label>
            <Select value={sizeIndex.toString()} onValueChange={(v) => setSizeIndex(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LABEL_SIZES.map((s, i) => (
                  <SelectItem key={i} value={i.toString()}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Barcode Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BARCODE_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="print-qty">Quantity</Label>
            <Input
              id="print-qty"
              type="number"
              min={1}
              max={500}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(500, Number(e.target.value))))}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Show on Label</Label>
            <div className="flex flex-col gap-1.5 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
                Product Name
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
                Price
              </label>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-3 font-medium">Preview</p>
          <div className="flex justify-center">
            <PreviewLabel
              product={product}
              size={size}
              dataUrl={dataUrl}
              showName={showName}
              showPrice={showPrice}
            />
          </div>
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
            Cancel
          </button>
          <button onClick={handlePrint} disabled={!dataUrl} className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] gap-2">
            <Printer className="h-4 w-4" />
            Print {qty} Label{qty !== 1 ? 's' : ''}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
