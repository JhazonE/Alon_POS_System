'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlusCircle, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SupplierProductMapping, Supplier } from '@/lib/types';

import { ManageSuppliersDialog } from '../suppliers/ManageSuppliersDialog';
import { useSupplierMappingForm } from './use-supplier-mapping-form';

interface AddSupplierMappingDialogProps {
  productId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (data?: any) => void;
  editingMapping: SupplierProductMapping | null;
  suppliers: Supplier[];
  onRefreshSuppliers: () => void;
}

export function AddSupplierMappingDialog({
  productId,
  isOpen,
  onOpenChange,
  onSuccess,
  editingMapping,
  suppliers,
  onRefreshSuppliers,
}: AddSupplierMappingDialogProps) {
  const {
    selectedSupplier,
    setSelectedSupplier,
    leadTime,
    setLeadTime,
    rop,
    setRop,
    cost,
    setCost,
    supplierSku,
    setSupplierSku,
    isSubmitting,
    onSubmit,
  } = useSupplierMappingForm({ productId, isOpen, onOpenChange, onSuccess, editingMapping });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editingMapping ? 'Edit Mapping' : 'Add Supplier Mapping'}</DialogTitle>
          <DialogDescription>
            Configure supplier specific details.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier} disabled={!!editingMapping}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
                {!editingMapping && (
                    <div className="p-1 w-full border-t mt-1">
                      <ManageSuppliersDialog
                          trigger={
                              <button type="button" className="inline-flex items-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 w-full justify-start font-normal h-8">
                                  <PlusCircle className="mr-2 h-4 w-4" />
                                  Add New Supplier
                              </button>
                          }
                          onSupplierAdded={onRefreshSuppliers}
                        />
                    </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
                <Label htmlFor="leadTime">Lead Time (Days)</Label>
                <Input id="leadTime" type="number" value={leadTime} onChange={e => setLeadTime(e.target.value)} placeholder="e.g. 7" />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="rop">Reorder Point</Label>
                <Input id="rop" type="number" value={rop} onChange={e => setRop(e.target.value)} placeholder="e.g. 50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                  <Label htmlFor="cost">Cost (₱)</Label>
                  <Input id="cost" type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} placeholder="e.g. 100.00" />
              </div>
              <div className="grid gap-2">
                  <Label htmlFor="supplierSku">Supplier SKU</Label>
                  <Input id="supplierSku" value={supplierSku} onChange={e => setSupplierSku(e.target.value)} placeholder="Optional" />
              </div>
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={onSubmit} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
