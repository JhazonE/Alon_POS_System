'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Loader2, Plus } from 'lucide-react';
import { useAddTaxRate } from './use-add-tax-rate';
import { TaxRateFormFields } from './TaxRateFormFields';

interface Props { onTaxRateAdded: () => void; }

export function AddTaxRateDialog({ onTaxRateAdded }: Props) {
  const [open, setOpen] = useState(false);
  const { formData, set, isLoading, handleSubmit } = useAddTaxRate(onTaxRateAdded);

  const onSubmit = async (e: React.FormEvent) => {
    const ok = await handleSubmit(e);
    if (ok) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
          <Plus className="mr-2 h-4 w-4" />
          Add Tax Rate
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Tax Rate</DialogTitle>
          <DialogDescription>Create a new tax rate configuration.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <TaxRateFormFields formData={formData} set={set} idPrefix="add-" />
          <DialogFooter>
            <button type="submit" disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Tax Rate
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
