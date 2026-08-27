'use client';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Customer } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import { AddLoyaltyCardDialog } from '../../customer/loyalty/add-loyalty-card-dialog';
import EditCustomerDialog, { CustomerFormValues } from './edit-customer-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useCustomerList } from './use-customer-list';

interface CustomerListProps {
  customers: Customer[];
  isLoading: boolean;
  onUpdateCustomer: (customerId: string, values: CustomerFormValues) => Promise<void>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  totalCount?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  itemsPerPage?: number;
  onItemsPerPageChange?: (limit: number) => void;
}

function CustomerSkeleton({ colCount }: { colCount: number }) {
  return (
    <TableRow>
      {Array.from({ length: colCount }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-5 w-full" />
        </TableCell>
      ))}
    </TableRow>
  );
}

export default function CustomerList({
  customers = [],
  isLoading,
  onUpdateCustomer,
  onDeleteCustomer,
  totalCount = 0,
  currentPage = 1,
  onPageChange,
  itemsPerPage = 10,
  onItemsPerPageChange,
}: CustomerListProps) {
  const {
    sorting,
    setSorting,
    editingCustomer,
    isEditDialogOpen,
    setIsEditDialogOpen,
    deletingCustomer,
    setDeletingCustomer,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    loyaltyCustomer,
    isLoyaltyDialogOpen,
    setIsLoyaltyDialogOpen,
    isCheckingTransactions,
    hasTransactions,
    transactionTypes,
    columns,
    customerWithLoyalty,
    handleDelete,
  } = useCustomerList({
    customers,
    isLoading,
    onUpdateCustomer,
    onDeleteCustomer,
    totalCount,
    currentPage,
    onPageChange,
    itemsPerPage,
    onItemsPerPageChange,
  });

  const pageCount = Math.ceil(totalCount / itemsPerPage);

  const table = useReactTable({
    data: customers,
    columns,
    state: {
      sorting,
      pagination: {
        pageIndex: currentPage - 1,
        pageSize: itemsPerPage,
      },
    },
    pageCount,
    manualPagination: true,
    manualFiltering: true,
    onSortingChange: (updater) => {
      setSorting(typeof updater === 'function' ? updater(sorting) : updater);
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex: currentPage - 1, pageSize: itemsPerPage })
          : updater;
      if (next.pageIndex !== currentPage - 1 && onPageChange) {
        onPageChange(next.pageIndex + 1);
      }
      if (next.pageSize !== itemsPerPage && onItemsPerPageChange) {
        onItemsPerPageChange(next.pageSize);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const startEntry = totalCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endEntry = Math.min(currentPage * itemsPerPage, totalCount);

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table wrapperClassName="h-[500px] relative">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <CustomerSkeleton key={i} colCount={columns.length} />
              ))}
            {!isLoading && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center h-24">
                  No customers found.
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <p className="text-sm font-medium">Rows per page</p>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={itemsPerPage.toString()} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 40, 50].map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isLoading && totalCount > 0 && (
            <span className="text-sm text-muted-foreground">
              Showing {startEntry}–{endEntry} of {totalCount}
            </span>
          )}
        </div>

        {!isLoading && totalCount > itemsPerPage && (
          <div className="flex items-center gap-1">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium px-2">
              Page {currentPage} of {pageCount}
            </span>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring p-0 h-8 w-8"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Edit Customer Dialog */}
      {editingCustomer && (
        <EditCustomerDialog
          customer={editingCustomer}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSave={(values) => onUpdateCustomer(editingCustomer.id, values)}
        />
      )}

      {/* Add Loyalty Card Dialog */}
      {loyaltyCustomer && (
        <AddLoyaltyCardDialog
          customer={customerWithLoyalty as any}
          open={isLoyaltyDialogOpen}
          onOpenChange={setIsLoyaltyDialogOpen}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasTransactions ? 'Deletion Blocked' : 'Are you absolutely sure?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isCheckingTransactions ? (
                'Checking for existing transactions...'
              ) : hasTransactions ? (
                <>
                  This customer cannot be deleted because they have records in:{' '}
                  <b>{transactionTypes.join(', ')}</b>. Please settle or remove these records first.
                </>
              ) : (
                `This action cannot be undone. This will permanently delete the customer "${deletingCustomer?.name}" and remove their data from our servers.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingCustomer(null)}>Cancel</AlertDialogCancel>
            {!hasTransactions && !isCheckingTransactions && (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
              >
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
