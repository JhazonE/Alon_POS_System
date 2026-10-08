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
import type { UnitOfMeasure } from '@/lib/types';

import { useUnitOfMeasureForm, type UnitOfMeasureSaveHandler } from './use-unit-of-measure-form';
import { Spinner } from '@/components/ui/spinner';

export function UnitOfMeasureDialog({
  unit,
  onSave,
  children,
  disabled,
}: {
  unit?: UnitOfMeasure;
  onSave: UnitOfMeasureSaveHandler;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { isOpen, setIsOpen, name, setName, abbreviation, setAbbreviation, isSaving, handleSave } =
    useUnitOfMeasureForm({ unit, onSave });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild disabled={disabled}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{unit ? 'Edit Unit of Measure' : 'Add New Unit of Measure'}</DialogTitle>
          <DialogDescription>
            {unit ? `Editing the unit "${unit.name}".` : 'Enter the details for the new unit of measure.'}
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
              placeholder="e.g., Piece"
            />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="abbreviation" className="text-right">
              Abbreviation
            </Label>
            <Input
              id="abbreviation"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              className="col-span-3"
              placeholder="e.g., pc"
            />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={handleSave} disabled={isSaving || !name.trim() || !abbreviation.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving ? <Spinner className="mr-2 h-4 w-4" /> : null}
            {isSaving ? 'Saving...' : 'Save Unit'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
