'use client';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TaxRate } from '@/lib/types';
import { useEditTaxRate } from './use-edit-tax-rate';
import { TaxRateFormFields } from './TaxRateFormFields';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  taxRate: TaxRate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaxRateUpdated: () => void;
}

export function EditTaxRateDialog({ taxRate, open, onOpenChange, onTaxRateUpdated }: Props) {
  const { formData, set, isLoading, handleSubmit } = useEditTaxRate(taxRate, onTaxRateUpdated);

  const onSubmit = async (e: React.FormEvent) => {
    const ok = await handleSubmit(e);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Tax Rate</DialogTitle>
          <DialogDescription>Update tax rate configuration.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <TaxRateFormFields formData={formData} set={set} idPrefix="edit-" />
          <DialogFooter>
            <button type="submit" disabled={isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
              {isLoading && <Spinner className="mr-2 h-4 w-4" />}
              Save Changes
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
