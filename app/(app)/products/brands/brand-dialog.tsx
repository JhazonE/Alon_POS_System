'use client';

import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Brand } from '@/lib/types';

import { useBrandForm, type BrandSaveHandler } from './use-brand-form';

export function BrandDialog({
  brand,
  onSave,
  children,
  disabled,
}: {
  brand?: Brand;
  onSave: BrandSaveHandler;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { isOpen, setIsOpen, name, setName, markupPercentage, setMarkupPercentage, isSaving, handleSave } =
    useBrandForm({ brand, onSave });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild disabled={disabled}>{children}</DialogTrigger>
      <DialogContent className="z-[100] sm:max-w-[425px] !rounded-lg !duration-500 ease-in-out data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 data-[state=closed]:!zoom-out-95 data-[state=open]:!zoom-in-90 data-[state=closed]:!slide-out-to-top-[5%] data-[state=open]:!slide-in-from-top-[5%]">
        <DialogHeader>
          <DialogTitle>{brand ? 'Edit Brand' : 'Add New Brand'}</DialogTitle>
          <DialogDescription>
            {brand ? `Editing the brand "${brand.name}".` : 'Enter the name and default markup for the new brand.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              placeholder="e.g., Logitech"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="markup" className="text-right">
              Markup %
            </Label>
            <Input
              id="markup"
              type="number"
              value={markupPercentage}
              onChange={(e) => setMarkupPercentage(e.target.value)}
              className="col-span-3"
              placeholder="e.g., 20"
              min="0"
              step="0.01"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving...' : 'Save Brand'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
