'use client';

import { useState } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import type { SalesPerson } from '@/lib/types';

interface SalesPersonDialogProps {
  salesPerson?: SalesPerson;
  onSave: (name: string, contactNumber?: string) => Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SalesPersonDialog({ salesPerson, onSave, children, disabled, open, onOpenChange }: SalesPersonDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;
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
      toast({
        title: salesPerson ? 'Sales Person Updated' : 'Sales Person Added',
        description: `Sales person "${name}" has been successfully saved.`,
      });
      setIsOpen(false);
      if (!salesPerson) { setName(''); setContactNumber(''); }
    } catch (error) {
      console.error('Failed to save sales person', error);
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
            <Label htmlFor="name" className="text-right">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" placeholder="e.g., John Doe" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="contactNumber" className="text-right">Contact Number</Label>
            <Input id="contactNumber" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className="col-span-3" placeholder="e.g., +1-555-0101" />
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={handleSave} disabled={isSaving || !name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving...' : 'Save Sales Person'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SalesPersonRowProps {
  salesPerson: SalesPerson;
  onUpdate: () => void;
  onDelete: () => void;
}

export function SalesPersonRow({ salesPerson, onUpdate, onDelete }: SalesPersonRowProps) {
  const { toast } = useToast();

  const handleUpdate = async (name: string, contactNumber?: string) => {
    const response = await fetch(getApiUrl(`/sales-persons/${salesPerson.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contactNumber }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to update sales person');
    toast({ title: 'Sales Person Updated', description: `Sales person "${name}" has been successfully updated.` });
    onUpdate();
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete the sales person "${salesPerson.name}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(getApiUrl(`/sales-persons/${salesPerson.id}`), { method: 'DELETE' });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to delete sales person');
      toast({ title: 'Sales Person Deleted', description: `Sales person "${salesPerson.name}" has been deleted.` });
      onDelete();
    } catch (error: any) {
      console.error('Error deleting sales person:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete sales person. It might be in use.' });
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{salesPerson.name}</TableCell>
      <TableCell>{salesPerson.contactNumber || 'N/A'}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <SalesPersonDialog salesPerson={salesPerson} onSave={handleUpdate}>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8">
              <Pencil className="h-4 w-4" />
            </button>
          </SalesPersonDialog>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 p-0 h-8 w-8" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function SalesPersonSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </TableCell>
    </TableRow>
  );
}
