'use client';

import { useState, useMemo } from 'react';
import {
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
import { Customer } from '@/lib/types';
import { Pencil, Trash2, MoreHorizontal, CreditCard, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/client-activity-logger';
import { getApiUrl } from '@/lib/api-config';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomerFormValues } from './edit-customer-dialog';

type Options = {
  customers: Customer[];
  isLoading: boolean;
  onUpdateCustomer: (customerId: string, values: CustomerFormValues) => Promise<void>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  totalCount?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  itemsPerPage?: number;
  onItemsPerPageChange?: (limit: number) => void;
};

function SortIcon({ isSorted }: { isSorted: false | 'asc' | 'desc' }) {
  if (isSorted === 'asc') return <ArrowUp className="ml-1 h-3.5 w-3.5" />;
  if (isSorted === 'desc') return <ArrowDown className="ml-1 h-3.5 w-3.5" />;
  return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />;
}

export function useCustomerList({
  customers = [],
  isLoading,
  onUpdateCustomer,
  onDeleteCustomer,
  totalCount = 0,
  currentPage = 1,
  onPageChange,
  itemsPerPage = 10,
  onItemsPerPageChange,
}: Options): {
  sorting: SortingState;
  setSorting: (state: SortingState) => void;
  editingCustomer: Customer | null;
  setEditingCustomer: (customer: Customer | null) => void;
  isEditDialogOpen: boolean;
  setIsEditDialogOpen: (open: boolean) => void;
  deletingCustomer: Customer | null;
  setDeletingCustomer: (customer: Customer | null) => void;
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
  loyaltyCustomer: Customer | null;
  setLoyaltyCustomer: (customer: Customer | null) => void;
  isLoyaltyDialogOpen: boolean;
  setIsLoyaltyDialogOpen: (open: boolean) => void;
  isCheckingTransactions: boolean;
  hasTransactions: boolean;
  transactionTypes: string[];
  columns: ColumnDef<Customer>[];
  customerWithLoyalty: any;
  handleDelete: () => Promise<void>;
  checkTransactions: (customer: Customer) => Promise<void>;
} {
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<Customer | null>(null);
  const [isLoyaltyDialogOpen, setIsLoyaltyDialogOpen] = useState(false);
  const [isCheckingTransactions, setIsCheckingTransactions] = useState(false);
  const [hasTransactions, setHasTransactions] = useState(false);
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);

  const checkTransactions = async (customer: Customer) => {
    try {
      setIsCheckingTransactions(true);
      const response = await fetch(getApiUrl(`/customers/${customer.id}/check-transactions`));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setHasTransactions(result.hasTransactions);
        setTransactionTypes(result.transactionTypes || []);
      }
    } catch (error) {
      console.error('Error checking transactions:', error);
    } finally {
      setIsCheckingTransactions(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    try {
      await onDeleteCustomer(deletingCustomer.id);
      await logActivity({
        action: 'DELETE',
        module: 'CUSTOMERS',
        description: `Deleted customer: "${deletingCustomer.name}" (ID: ${deletingCustomer.id})`,
        referenceId: deletingCustomer.id,
      });
      toast({
        title: 'Customer Deleted',
        description: `Customer "${deletingCustomer.name}" has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setDeletingCustomer(null);
    } catch (error: any) {
      console.error('Error deleting customer: ', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to delete customer. Please try again.',
      });
    }
  };

  const customerWithLoyalty = loyaltyCustomer
    ? {
        ...loyaltyCustomer,
        loyaltyPoints: loyaltyCustomer.loyaltyPoints || 0,
        lastTransaction: (loyaltyCustomer as any).lastTransaction || '',
        expiryDate: (loyaltyCustomer as any).expiryDate || '',
        pointSetting: (loyaltyCustomer as any).pointSetting || '',
      }
    : undefined;

  const columns = useMemo<ColumnDef<Customer>[]>(() => {
    const cols: ColumnDef<Customer>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <SortIcon isSorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'contactNumber',
      header: 'Contact No.',
      cell: ({ getValue }) => getValue<string>() || '-',
    },
    {
      accessorKey: 'paymentTerms',
      header: ({ column }) => (
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Payment Terms
          <SortIcon isSorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ getValue }) => getValue<string>() || '-',
    },
    {
      accessorKey: 'address',
      header: 'Address',
      cell: ({ getValue }) => getValue<string>() || '-',
    },
    {
      accessorKey: 'billingAddress',
      header: 'Billing Address',
      cell: ({ getValue }) => getValue<string>() || '-',
    },
    {
      accessorKey: 'discount',
      header: ({ column }) => (
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Discount (%)
          <SortIcon isSorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ getValue }) => `${getValue<number>()}%`,
    },
    {
      accessorKey: 'creditLimit',
      header: ({ column }) => (
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 font-semibold"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Credit Limit
          <SortIcon isSorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ getValue }) =>
        `₱${Number(getValue<number>() || 0).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const customer = row.original;
        return (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring text-xs rounded-lg gap-1.5 h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setEditingCustomer(customer);
                    setIsEditDialogOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit Customer
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setLoyaltyCustomer(customer);
                    setIsLoyaltyDialogOpen(true);
                  }}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Add Loyalty Card
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    setDeletingCustomer(customer);
                    setIsDeleteDialogOpen(true);
                    checkTransactions(customer);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Customer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
    ];
    return cols;
  }, []);

  return {
    sorting,
    setSorting,
    editingCustomer,
    setEditingCustomer,
    isEditDialogOpen,
    setIsEditDialogOpen,
    deletingCustomer,
    setDeletingCustomer,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    loyaltyCustomer,
    setLoyaltyCustomer,
    isLoyaltyDialogOpen,
    setIsLoyaltyDialogOpen,
    isCheckingTransactions,
    hasTransactions,
    transactionTypes,
    columns,
    customerWithLoyalty,
    handleDelete,
    checkTransactions,
  };
}
