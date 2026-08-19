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

import { CategoryDialog } from './category-dialog';
import { CategoryRow } from './category-row';
import { CategorySkeleton } from './category-skeleton';
import { useManageCategories } from './use-manage-categories';

export function ManageCategoriesDialog({ trigger, onCategoryAdded, open, onOpenChange }: { trigger?: React.ReactNode; onCategoryAdded?: () => void; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const { categories, isLoading, handleAddCategory, handleUpdateCategory, handleDeleteCategory } = useManageCategories({ onCategoryAdded });

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  const showTrigger = trigger !== null;
  const dialogTrigger = trigger || (
    <Button variant="outline">
      <ListTree className="mr-2 h-4 w-4" />
      Manage Categories
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
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>
            Add, edit, or delete your product categories.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
            <div className="flex justify-end mb-4">
                <CategoryDialog onSave={handleAddCategory}>
                    <Button size="sm">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Category
                    </Button>
                </CategoryDialog>
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
                        {isLoading && Array.from({ length: 4 }).map((_, i) => <CategorySkeleton key={i} />)}
                        {!isLoading && categories.map((category) => (
                        <CategoryRow key={category.id} category={category} onUpdate={handleUpdateCategory} onDelete={handleDeleteCategory} />
                        ))}
                         {!isLoading && categories.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24">
                                    No categories found. Add a category to get started.
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
