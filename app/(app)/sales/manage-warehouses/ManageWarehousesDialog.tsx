'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PlusCircle } from 'lucide-react';
import { useManageWarehouses } from './use-manage-warehouses';
import { WarehouseDialog, WarehouseRow, WarehouseSkeleton } from './WarehouseRow';

interface ManageWarehousesDialogProps {
  trigger?: React.ReactNode;
  onChange?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ManageWarehousesDialog({ trigger, onChange, open, onOpenChange }: ManageWarehousesDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  const m = useManageWarehouses(isOpen, onChange);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Manage Warehouses</DialogTitle>
          <DialogDescription>Add, edit, or delete your warehouses.</DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="flex justify-end mb-4">
            <WarehouseDialog onSave={m.handleAddWarehouse}>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Warehouse
              </button>
            </WarehouseDialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.isLoading && Array.from({ length: 4 }).map((_, i) => <WarehouseSkeleton key={i} />)}
                  {m.warehouses?.map((warehouse) => (
                    <WarehouseRow
                      key={warehouse.id}
                      warehouse={warehouse}
                      onUpdate={m.handleUpdate}
                      onDelete={m.handleDelete}
                    />
                  ))}
                  {!m.isLoading && m.warehouses?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-24">No warehouses found.</TableCell>
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
