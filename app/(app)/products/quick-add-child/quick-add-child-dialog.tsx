'use client';

import type { Product } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wand2 } from 'lucide-react';

import { useQuickAddChild } from './use-quick-add-child';

export function QuickAddChildDialog({
  parentProduct,
  baseStock,
  onChildAdded,
  products,
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: {
  parentProduct?: Product,
  baseStock?: number,
  onChildAdded: () => void,
  products: Product[],
  trigger?: React.ReactNode,
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const {
    isOpen,
    setIsOpen,
    childName,
    setChildName,
    sku,
    setSku,
    barcode,
    setBarcode,
    description,
    setDescription,
    unitOfMeasure,
    setUnitOfMeasure,
    price,
    setPrice,
    cost,
    setCost,
    quantity,
    setQuantity,
    selectedParentId,
    setSelectedParentId,
    isSaving,
    localProducts,
    selectedParent,
    availableUnits,
    generateSku,
    generateBarcode,
    handleSave,
  } = useQuickAddChild({
    parentProduct,
    baseStock,
    onChildAdded,
    products,
    open: externalOpen,
    onOpenChange: externalOnOpenChange,
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add Child Product</DialogTitle>
          <DialogDescription>
            Add a new child product unit{parentProduct ? ` to ${parentProduct.name}` : ''}.
          </DialogDescription>

        </DialogHeader>
        <div className="grid grid-cols-1 items-center gap-2 py-4 justify-center">
          {!parentProduct && (
            <>
              <Label htmlFor="parentSelect" className="text-right ml-4">
                Parent
              </Label>
              <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select parent product" />
                </SelectTrigger>
                <SelectContent>
                  {localProducts.filter(p => p.conversionFactors && p.conversionFactors.length > 0).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sku">
                SKU
              </Label>
              <div className="relative">
                <Input
                  id="sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="e.g., COKE-PC"
                  className="pr-10"
                  readOnly={true}
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                  onClick={generateSku}
                >
                  <Wand2 className="h-4 w-4" />
                  <span className="sr-only">Generate SKU</span>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcode">
                Barcode (UPC)
              </Label>
              <div className="relative">
                <Input
                  id="barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="e.g., 123456789012"
                  className="pr-10"
                  readOnly={true}
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                  onClick={generateBarcode}
                >
                  <Wand2 className="h-4 w-4" />
                  <span className="sr-only">Generate Barcode</span>
                </button>
              </div>
            </div>
          </div>

          <Label htmlFor="childName">
           Product Name
          </Label>
          <Input
            id="childName"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="e.g., Piece, Box of 5"
          />

          <Label htmlFor="description" className="text-left ml-4">
            Description
          </Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., A single piece of cola candy"
          />

          <Label htmlFor="unitOfMeasure" className="text-left ml-4">
            Unit
          </Label>
          <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
            <SelectTrigger>
              <SelectValue placeholder="Select unit" />
            </SelectTrigger>
            <SelectContent>
              {availableUnits.map(cf => (
                <SelectItem key={cf.unit} value={cf.unit}>
                  {cf.factor} {cf.unit} (per {selectedParent?.unitOfMeasure || 'unit'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-2">
            <Label htmlFor="quantity">
              Quantity
            </Label>
            <Input
              id="quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              readOnly={true}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">
                Price
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                readOnly={true}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">
                Cost
              </Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
                readOnly={true}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving ? 'Adding...' : 'Add Child Product'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
