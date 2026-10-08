'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PlusCircle, Trash2, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

import { AddSupplierMappingDialog } from '../supplier-mapping/AddSupplierMappingDialog';
import { useProductSuppliers } from './use-product-suppliers';
import { Spinner } from '@/components/ui/spinner';

export function ProductSuppliers({ productId, onUpdate }: { productId: string, onUpdate?: () => void }) {
  const {
    mappings,
    suppliers,
    isLoading,
    isDialogOpen,
    setIsDialogOpen,
    editingMapping,
    confirmPrimaryOpen,
    setConfirmPrimaryOpen,
    loadData,
    handleOpenDialog,
    handleDelete,
    initiateSetPrimary,
    confirmSetPrimary,
  } = useProductSuppliers({ productId, onUpdate });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Supplier Mappings</h3>
          <p className="text-sm text-muted-foreground">
            Manage suppliers, lead times, and reorder points for this product.
          </p>
        </div>
        <button onClick={() => handleOpenDialog()} type="button" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Supplier
        </button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Lead Time (Days)</TableHead>
              <TableHead>ROP</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Spinner className="h-6 w-6 mx-auto" />
                </TableCell>
              </TableRow>
            ) : mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No suppliers mapped yet.
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((mapping) => (
                <TableRow key={mapping.id} className={mapping.isPrimary ? 'bg-muted/30' : ''}>
                  <TableCell>
                    {mapping.isPrimary ? (
                      <TooltipProvider>
                         <Tooltip>
                            <TooltipTrigger>
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            </TooltipTrigger>
                            <TooltipContent>Primary Supplier</TooltipContent>
                         </Tooltip>
                      </TooltipProvider>
                    ) : (
                       <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring text-xs rounded-lg gap-1.5 h-6 w-6 p-0 opacity-20 hover:opacity-100" onClick={() => initiateSetPrimary(mapping.id)} type="button">
                           <Star className="h-4 w-4" />
                       </button>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {mapping.supplierName}
                    {mapping.isPrimary && <Badge variant="secondary" className="ml-2 text-xs">Primary</Badge>}
                  </TableCell>
                  <TableCell>{mapping.supplierSku || '-'}</TableCell>
                  <TableCell>{mapping.supplierLeadTime} days</TableCell>
                  <TableCell>{mapping.supplierSpecificRop}</TableCell>
                  <TableCell className="text-right">₱{mapping.supplierCost?.toFixed(2) || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleOpenDialog(mapping)} type="button" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
                        Edit
                      </button>
                      <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 text-destructive hover:text-destructive" onClick={() => handleDelete(mapping.id)} type="button">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AddSupplierMappingDialog
        productId={productId}
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={() => {
            loadData();
            onUpdate?.();
        }}
        editingMapping={editingMapping}
        suppliers={suppliers}
        onRefreshSuppliers={loadData}
      />

      <AlertDialog open={confirmPrimaryOpen} onOpenChange={setConfirmPrimaryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Primary Supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the primary supplier will update the effective Reorder Point (ROP) for this product based on the new supplier's lead time and ROP settings.
              <br /><br />
              Please confirm that you have validated the ROP and Lead Time for this supplier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSetPrimary}>Confirm Change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
