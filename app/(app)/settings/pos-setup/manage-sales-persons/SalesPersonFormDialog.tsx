'use client';

import { useState } from 'react';
import { SalesPerson } from '@/lib/types';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Props = {
  salesPerson?: SalesPerson;
  onSave: (name: string, contactNumber?: string) => Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
};

export function SalesPersonFormDialog({ salesPerson, onSave, children, disabled }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(salesPerson?.name || '');
  const [contactNumber, setContactNumber] = useState(salesPerson?.contactNumber || '');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Sales person name cannot be empty.' });
      return;
    }
    setIsSaving(true);
    try {
      await onSave(name, contactNumber);
      toast({ title: salesPerson ? 'Sales Person Updated' : 'Sales Person Added', description: `"${name}" has been successfully saved.` });
      setIsOpen(false);
      if (!salesPerson) { setName(''); setContactNumber(''); }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save sales person. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild disabled={disabled}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{salesPerson ? 'Edit Sales Person' : 'Add New Sales Person'}</DialogTitle>
          <DialogDescription>
            {salesPerson
              ? `Editing the sales person "${salesPerson.name}".`
              : 'Enter the name and contact number for the new sales person.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sp-name" className="text-right">Name</Label>
            <Input id="sp-name" value={name} onChange={e => setName(e.target.value)} className="col-span-3" placeholder="e.g., John Doe" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sp-contact" className="text-right">Contact Number</Label>
            <Input id="sp-contact" value={contactNumber} onChange={e => setContactNumber(e.target.value)} className="col-span-3" placeholder="e.g., +1-555-0101" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={handleSave} disabled={isSaving || !name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? 'Saving...' : 'Save Sales Person'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
