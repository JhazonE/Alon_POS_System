'use client';

import { useState, useEffect } from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import type { PaymentMethod } from '@/lib/types';

interface PaymentMethodDialogProps {
  paymentMethod?: PaymentMethod;
  onSave: (name: string, isReferenceRequired: boolean, pointsAmount?: number, currencyEquivalent?: number) => Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
}

function PaymentMethodDialog({ paymentMethod, onSave, children, disabled }: PaymentMethodDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(paymentMethod?.name || '');
  const [isReferenceRequired, setIsReferenceRequired] = useState(paymentMethod?.isReferenceRequired || false);
  const [pointsAmount, setPointsAmount] = useState<string>(paymentMethod?.pointsAmount?.toString() || '1');
  const [currencyEquivalent, setCurrencyEquivalent] = useState<string>(paymentMethod?.currencyEquivalent?.toString() || '1');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setName(paymentMethod?.name || '');
      setIsReferenceRequired(paymentMethod?.isReferenceRequired || false);
      setPointsAmount(paymentMethod?.pointsAmount?.toString() || '1');
      setCurrencyEquivalent(paymentMethod?.currencyEquivalent?.toString() || '1');
    }
  }, [isOpen, paymentMethod]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Validation Error', description: 'Payment method name cannot be empty.' });
      return;
    }
    setIsSaving(true);
    try {
      const pAmount = name.toUpperCase() === 'POINTS' ? parseFloat(pointsAmount) || 1 : undefined;
      const cEquiv = name.toUpperCase() === 'POINTS' ? parseFloat(currencyEquivalent) || 1 : undefined;
      await onSave(name, isReferenceRequired, pAmount, cEquiv);
      toast({
        title: paymentMethod ? 'Payment Method Updated' : 'Payment Method Added',
        description: `Payment method "${name}" has been successfully saved.`,
      });
      setIsOpen(false);
      if (!paymentMethod) {
        setName('');
        setIsReferenceRequired(false);
      }
    } catch (error) {
      console.error('Failed to save payment method', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to save payment method. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild disabled={disabled}>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{paymentMethod ? 'Edit Payment Method' : 'Add New Payment Method'}</DialogTitle>
          <DialogDescription>
            {paymentMethod
              ? `Editing the payment method "${paymentMethod.name}".`
              : 'Enter the name for the new payment method.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              placeholder="e.g., Credit Card"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="ref-req" className="text-right">Ref. Required</Label>
            <div className="flex items-center space-x-2 col-span-3">
              <Switch id="ref-req" checked={isReferenceRequired} onCheckedChange={setIsReferenceRequired} />
              <Label htmlFor="ref-req" className="font-normal text-muted-foreground">
                Require reference number input
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button onClick={handleSave} disabled={isSaving || !name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isSaving ? 'Saving...' : 'Save Method'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PaymentMethodRowProps {
  paymentMethod: PaymentMethod;
  paymentMethods: PaymentMethod[];
  onUpdate: () => void;
  onDelete: () => void;
}

export function PaymentMethodRow({ paymentMethod, paymentMethods, onUpdate, onDelete }: PaymentMethodRowProps) {
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleUpdate = async (name: string, isReferenceRequired: boolean, pointsAmount?: number, currencyEquivalent?: number) => {
    const existing = paymentMethods.find(m => m.id !== paymentMethod.id && m.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      toast({ variant: 'destructive', title: 'Duplicate Payment Method', description: `A payment method with the name "${name}" already exists.` });
      throw new Error('Payment method already exists');
    }
    const response = await fetch(getApiUrl(`/payment-methods/${paymentMethod.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, isReferenceRequired, pointsAmount, currencyEquivalent }),
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to update payment method');
    toast({ title: 'Payment Method Updated', description: `Payment method "${name}" has been successfully updated.` });
    onUpdate();
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(getApiUrl(`/payment-methods/${paymentMethod.id}`), { method: 'DELETE' });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to delete payment method');
      toast({ title: 'Payment Method Deleted', description: `Payment method "${paymentMethod.name}" has been deleted.` });
      setIsDeleteDialogOpen(false);
      onDelete();
    } catch (error: any) {
      console.error('Error deleting payment method:', error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete payment method. It might be in use.' });
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {paymentMethod.name}
          {paymentMethod.isReferenceRequired && (
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 font-mono">
              REF REQ
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <PaymentMethodDialog paymentMethod={paymentMethod} onSave={handleUpdate}>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8">
              <Pencil className="h-4 w-4" />
            </button>
          </PaymentMethodDialog>
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogTrigger asChild>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 p-0 h-8 w-8">
                <Trash2 className="h-4 w-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Confirm Deletion
                </DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete the payment method &quot;{paymentMethod.name}&quot;? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button onClick={() => setIsDeleteDialogOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
                <button onClick={handleDelete} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-10 px-[18px]">Delete Method</button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function PaymentMethodSkeleton() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-5 w-48" /></TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </TableCell>
    </TableRow>
  );
}
