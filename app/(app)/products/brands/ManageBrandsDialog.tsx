'use client';

import { useState } from 'react';
import { PlusCircle, ListTree } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { BrandDialog } from './brand-dialog';
import { BrandRow } from './brand-row';
import { BrandSkeleton } from './brand-skeleton';
import { useManageBrands } from './use-manage-brands';

export function ManageBrandsDialog({ trigger, onBrandAdded, open, onOpenChange }: { trigger?: React.ReactNode; onBrandAdded?: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const { brands, isLoading, handleAddBrand, handleUpdateBrand, handleDeleteBrand } = useManageBrands({ onBrandAdded });

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  const showTrigger = trigger !== null;
  const dialogTrigger = trigger || (
    <Button variant="outline">
      <ListTree className="mr-2 h-4 w-4" />
      Manage Brands
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          {dialogTrigger}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-3xl !rounded-lg !duration-500 ease-in-out data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 data-[state=closed]:!zoom-out-95 data-[state=open]:!zoom-in-90 data-[state=closed]:!slide-out-to-top-[5%] data-[state=open]:!slide-in-from-top-[5%]">
        <DialogHeader>
          <DialogTitle>Manage Brands</DialogTitle>
          <DialogDescription>
            Add, edit, or delete your product brands.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
            <div className="flex justify-end mb-4">
                <BrandDialog onSave={handleAddBrand}>
                    <Button size="sm">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Brand
                    </Button>
                </BrandDialog>
            </div>
            <Card>
                <CardContent className='p-0'>
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-center">Markup</TableHead>
                        <TableHead>
                            <span className="sr-only">Actions</span>
                        </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading && Array.from({ length: 4 }).map((_, i) => <BrandSkeleton key={i} />)}
                        {!isLoading && brands.map((brand) => (
                        <BrandRow key={brand.id} brand={brand} onUpdate={handleUpdateBrand} onDelete={handleDeleteBrand} />
                        ))}
                         {!isLoading && brands.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24">
                                    No brands found. Add a brand to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline">Close</Button>
          </DialogTrigger>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
