'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlusCircle, Loader2 } from 'lucide-react';
import { useManageSalesPersons } from './use-manage-sales-persons';
import { SalesPersonRow, SalesPersonSkeleton } from './SalesPersonRow';

interface ManageSalesPersonsDialogProps {
  trigger?: React.ReactNode;
  onChange?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ManageSalesPersonsDialog({ trigger, onChange, open, onOpenChange }: ManageSalesPersonsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  const m = useManageSalesPersons(isOpen, onChange);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Manage Sales Persons</DialogTitle>
          <DialogDescription>Add, edit, or delete your sales persons.</DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="grid grid-cols-3 gap-4 mb-4 items-end">
            <div className="grid gap-2">
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                placeholder="e.g., John Doe"
                value={m.newName}
                onChange={(e) => m.setNewName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-contact">Contact Number</Label>
              <Input
                id="new-contact"
                placeholder="e.g., +1-555-0101"
                value={m.newContact}
                onChange={(e) => m.setNewContact(e.target.value)}
              />
            </div>
            <button onClick={m.handleAddSalesPerson} disabled={m.isAdding || !m.newName.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
              {m.isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
              {m.isAdding ? 'Adding...' : 'Add Sales Person'}
            </button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact Number</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.isLoading && Array.from({ length: 4 }).map((_, i) => <SalesPersonSkeleton key={i} />)}
                  {m.salesPersons?.map((sp) => (
                    <SalesPersonRow
                      key={sp.id}
                      salesPerson={sp}
                      onUpdate={m.handleUpdate}
                      onDelete={m.handleDelete}
                    />
                  ))}
                  {!m.isLoading && m.salesPersons?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center h-24">No sales persons found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <DialogTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Close</button>
          </DialogTrigger>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
