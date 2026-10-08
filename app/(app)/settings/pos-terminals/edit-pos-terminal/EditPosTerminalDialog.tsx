'use client';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEditPosTerminal } from './use-edit-pos-terminal';
import { TEXT_FIELDS, type PosTerminal } from './edit-pos-terminal-types';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  terminal: PosTerminal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTerminalUpdated: () => void;
}

export function EditPosTerminalDialog({ terminal, open, onOpenChange, onTerminalUpdated }: Props) {
  const { form, isSaving, warehouses, onSubmit } = useEditPosTerminal(terminal, open, onTerminalUpdated);

  const handleSubmit = form.handleSubmit(async (values) => {
    const ok = await onSubmit(values);
    if (ok) onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Pos Terminal</DialogTitle>
          <DialogDescription className="sr-only">Update the configuration for this POS terminal</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Form {...form}>
            <form onSubmit={handleSubmit} className="space-y-4">

              {TEXT_FIELDS.map(({ name, label }) => (
                <FormField key={name} control={form.control} name={name} render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}

              <FormField control={form.control} name="permitDateIssued" render={({ field }) => (
                <FormItem>
                  <FormLabel>PTU DATE ISSUED</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="printOfficialReceipt" render={({ field }) => (
                <FormItem>
                  <FormLabel>Print Official Receipt</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select option" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="No">No</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="inventoryLocation" render={({ field }) => (
                <FormItem>
                  <FormLabel>Inventory Location</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {warehouses.length === 0
                        ? <SelectItem value="Store">Store</SelectItem>
                        : warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter className="mt-6">
                <button type="button" onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Close</button>
                <button type="submit" disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
                  {isSaving ? <><Spinner className="h-4 w-4 mr-2" />Saving...</> : 'Save Changes'}
                </button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
