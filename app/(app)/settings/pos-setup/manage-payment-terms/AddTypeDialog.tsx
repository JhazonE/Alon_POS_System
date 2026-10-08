'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newTypeName: string;
  onNewTypeNameChange: (v: string) => void;
  customTypes: any[];
  isLoadingTypes: boolean;
  onAdd: () => void;
  onDeleteType: (id: string, name: string) => void;
}

export function AddTypeDialog({ open, onOpenChange, newTypeName, onNewTypeNameChange, customTypes, isLoadingTypes, onAdd, onDeleteType }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Type</DialogTitle>
          <DialogDescription>Enter a name for the new payment term type</DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <label htmlFor="newType" className="text-sm font-medium">New Type Name</label>
            <Input
              id="newType"
              value={newTypeName}
              onChange={e => onNewTypeNameChange(e.target.value)}
              placeholder="e.g., Net 90, Prepaid"
              className="h-10"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
            />
          </div>
          <button type="button" onClick={onAdd} disabled={!newTypeName.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] h-10">
            <Plus className="h-4 w-4 mr-2" />Add
          </button>
        </div>

        <div className="border rounded-md">
          <div className="max-h-[150px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Existing Types</TableHead>
                  <TableHead className="text-right w-20">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingTypes ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-4"><Spinner className="h-6 w-6 mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : customTypes.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-4 text-muted-foreground">No types available</TableCell></TableRow>
                ) : customTypes.map(type => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell className="text-right">
                      <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10" onClick={() => onDeleteType(type.id, type.name)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <button type="button" onClick={() => { onOpenChange(false); onNewTypeNameChange(''); }} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Close</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
