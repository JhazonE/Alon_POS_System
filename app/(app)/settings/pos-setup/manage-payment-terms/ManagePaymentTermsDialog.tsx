'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { useManagePaymentTerms } from './use-manage-payment-terms';
import { PaymentTermRow } from './PaymentTermRow';
import { AddTypeDialog } from './AddTypeDialog';
import type { ManagePaymentTermsDialogProps } from './manage-payment-terms-types';
import { Spinner } from '@/components/ui/spinner';

export function ManagePaymentTermsDialog({ open: controlledOpen, onOpenChange: setControlledOpen, onPaymentTermsUpdated, trigger }: ManagePaymentTermsDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const m = useManagePaymentTerms(open, onPaymentTermsUpdated);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger !== undefined ? (
          trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>
        ) : (
          <DialogTrigger asChild>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring text-xs rounded-lg gap-1.5 h-8 px-2 text-primary hover:text-primary/80">
              <span className="text-xs font-medium">Manage</span>
            </button>
          </DialogTrigger>
        )}

        <DialogContent className="sm:max-w-[600px] h-[600px] flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Payment Terms</DialogTitle>
            <DialogDescription>Add new payment terms or manage existing ones</DialogDescription>
          </DialogHeader>

          {/* Form */}
          <div className="py-4 border-b">
            <Form {...m.form}>
              <form onSubmit={m.form.handleSubmit(m.onSubmit)}>
                <div className="space-y-4">
                  <FormField control={m.form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Term Name</FormLabel>
                      <FormControl><Input placeholder="e.g., Net 30, Cash on Delivery" {...field} className="h-10" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="flex items-end gap-3">
                    <FormField control={m.form.control} name="type" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Type</FormLabel>
                        <Select open={m.isTypeSelectOpen} onOpenChange={m.setIsTypeSelectOpen} onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10"><SelectValue placeholder="Select type" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {m.customTypes.map(type => (
                              <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                            ))}
                            <div className="border-t mt-1 pt-1">
                              <button type="button" onClick={() => { m.setShowAddTypeDialog(true); m.setIsTypeSelectOpen(false); }} className="w-full text-left px-2 py-1.5 text-sm text-primary hover:bg-accent rounded-sm flex items-center gap-2">
                                <Plus className="h-3 w-3" />Add Type
                              </button>
                            </div>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={m.form.control} name="numberOfDaysMonth" render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Days/Month</FormLabel>
                        <FormControl><Input placeholder="Enter number" {...field} className="h-10" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {m.editingTerm && (
                      <button type="button" onClick={m.cancelEdit} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[18px] h-10">Cancel</button>
                    )}
                    <button type="submit" disabled={m.isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] h-10 min-w-[80px]">
                      {m.isSaving ? <Spinner className="h-4 w-4" /> : <><Plus className="h-4 w-4" /><span className="ml-2">{m.editingTerm ? 'Update' : 'Add'}</span></>}
                    </button>
                  </div>
                </div>
              </form>
            </Form>
          </div>

          {/* List */}
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Term</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Days/Month</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-4"><Spinner className="h-6 w-6 mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : m.paymentTerms.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No payment terms found.</TableCell></TableRow>
                ) : m.paymentTerms.map(term => (
                  <PaymentTermRow key={term.id} term={term} onEdit={m.handleEdit} onDelete={m.setTermToDelete} />
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Close</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!m.termToDelete} onOpenChange={open => !open && m.setTermToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the payment term "{m.termToDelete?.description}". This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={e => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.stopPropagation(); m.confirmDelete(); }} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddTypeDialog
        open={m.showAddTypeDialog}
        onOpenChange={m.setShowAddTypeDialog}
        newTypeName={m.newTypeName}
        onNewTypeNameChange={m.setNewTypeName}
        customTypes={m.customTypes}
        isLoadingTypes={m.isLoadingTypes}
        onAdd={m.handleAddType}
        onDeleteType={m.handleDeleteType}
      />
    </>
  );
}
