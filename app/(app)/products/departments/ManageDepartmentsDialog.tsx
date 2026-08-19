'use client';

import { useState } from 'react';
import { PlusCircle, Building2 } from 'lucide-react';

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

import { DepartmentDialog } from './department-dialog';
import { DepartmentRow } from './department-row';
import { DepartmentSkeleton } from './department-skeleton';
import { useManageDepartments } from './use-manage-departments';

export function ManageDepartmentsDialog({
  trigger,
  onDepartmentAdded,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  onDepartmentAdded?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  const { departments, isLoading, handleAddDepartment, handleUpdateDepartment, handleDeleteDepartment } =
    useManageDepartments({ isOpen, onDepartmentAdded });

  const showTrigger = trigger !== null;
  const dialogTrigger = trigger || (
    <Button variant="outline">
      <Building2 className="mr-2 h-4 w-4" />
      Manage Departments
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
          <DialogTitle>Manage Departments</DialogTitle>
          <DialogDescription>
            Add, edit, or delete your product departments.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
            <div className="flex justify-end mb-4">
                <DepartmentDialog onSave={handleAddDepartment}>
                    <Button size="sm">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Department
                    </Button>
                </DepartmentDialog>
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
                        {isLoading && Array.from({ length: 4 }).map((_, i) => <DepartmentSkeleton key={i} />)}
                        {!isLoading && departments.map((dept) => (
                        <DepartmentRow key={dept.id} department={dept} onUpdate={handleUpdateDepartment} onDelete={handleDeleteDepartment} />
                        ))}
                         {!isLoading && departments.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-24">
                                    No departments found. Add a department to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
