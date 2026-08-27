'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ColumnDef, getCoreRowModel, getFilteredRowModel, getPaginationRowModel,
  getSortedRowModel, SortingState, ColumnFiltersState, useReactTable,
} from '@tanstack/react-table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBusinessProfile } from '@/hooks/use-api';
import { logActivity } from '@/lib/client-activity-logger';
import { getApiUrl } from '@/lib/api-config';
import { getSuppliersWithBalance, SupplierWithBalance, SupplierFilters } from '../actions';
import { addSupplier, updateSupplier, deleteSupplier } from '../../products/actions';
import { exportToCSV, exportToPDF } from '../supplier-export-utils';

function SortIcon({ isSorted }: { isSorted: false | 'asc' | 'desc' }) {
  if (isSorted === 'asc') return <ArrowUp className="ml-1 h-3.5 w-3.5" />;
  if (isSorted === 'desc') return <ArrowDown className="ml-1 h-3.5 w-3.5" />;
  return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />;
}

export function useSuppliersList() {
  const { toast } = useToast();
  const { profile } = useBusinessProfile();

  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<SupplierFilters>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<SupplierWithBalance | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierWithBalance | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await getSuppliersWithBalance(searchTerm, filters);
      setSuppliers(data);
    } catch {
      toast({ title: 'Error', description: 'Failed to load suppliers. Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSuppliers(); }, [searchTerm, filters]);

  const handleAddSupplier = async (data: any) => {
    const result = await addSupplier(data);
    if (result.success) {
      await logActivity({ action: 'CREATE', module: 'SUPPLIERS', description: `Added supplier: ${data.name} (${data.id})`, referenceId: data.id });
      toast({ title: 'Success', description: result.message });
      loadSuppliers();
    } else {
      throw new Error(result.message);
    }
  };

  const handleUpdateSupplier = async (id: string, data: any) => {
    const result = await updateSupplier(id, data);
    if (result.success) {
      await logActivity({ action: 'UPDATE', module: 'SUPPLIERS', description: `Updated supplier: ${data.name || id} (${id})`, referenceId: id });
      toast({ title: 'Success', description: result.message });
      loadSuppliers();
    } else {
      throw new Error(result.message);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    try {
      const result = await deleteSupplier(id);
      if (result.success) {
        await logActivity({ action: 'DELETE', module: 'SUPPLIERS', description: `Deleted supplier ID: ${id}`, referenceId: id });
        toast({ title: 'Success', description: result.message });
        loadSuppliers();
      } else {
        toast({ title: 'Error', description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'An unexpected error occurred while deleting the supplier.', variant: 'destructive' });
    }
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filters.paymentTerms) params.append('paymentTerms', filters.paymentTerms);
      if (filters.orderSchedule) params.append('orderSchedule', filters.orderSchedule);
      if (filters.company) params.append('company', filters.company);
      if (filters.hasBalance) params.append('hasBalance', 'true');

      const res = await fetch(getApiUrl(`/suppliers/export?${params.toString()}`));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Export failed');

      const fileName = `suppliers_${new Date().toISOString().split('T')[0]}`;
      if (format === 'csv') await exportToCSV(result.data, fileName);
      else await exportToPDF(result.data, fileName, profile);

      toast({ title: 'Export Successful', description: `Your ${format.toUpperCase()} file has been generated.` });
    } catch {
      toast({ title: 'Export Failed', description: 'An error occurred during export.', variant: 'destructive' });
    }
  };

  const columns = useMemo<ColumnDef<SupplierWithBalance>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Name <SortIcon isSorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.email || '-'}</span>
        </div>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      accessorFn: row => row.contactNumber || row.mobilePhone || row.telephone || '',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.contactNumber || row.original.mobilePhone || row.original.telephone || '-'}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{row.original.address}</span>
        </div>
      ),
    },
    {
      accessorKey: 'orderSchedule',
      header: ({ column }) => (
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Schedule <SortIcon isSorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ getValue }) => {
        const val = getValue<string | null>();
        return val
          ? <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">{val}</span>
          : <span className="text-muted-foreground text-xs">-</span>;
      },
    },
    {
      accessorKey: 'company',
      header: ({ column }) => (
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Company <SortIcon isSorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ getValue }) => getValue<string>() || '-',
    },
    {
      accessorKey: 'tin',
      header: 'TIN',
      cell: ({ getValue }) => getValue<string>() || '-',
    },
    {
      accessorKey: 'paymentTerms',
      header: ({ column }) => (
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 font-semibold" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Payment Terms <SortIcon isSorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ getValue }) => {
        const val = getValue<string | null>();
        return val
          ? <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">{val}</span>
          : <span className="text-muted-foreground text-xs">-</span>;
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      enableSorting: false,
      cell: ({ row }) => {
        const supplier = row.original;
        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setEditingSupplier(supplier); setIsEditDialogOpen(true); }}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit Supplier
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => { setDeletingSupplier(supplier); setIsDeleteDialogOpen(true); }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Supplier
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], []);

  const table = useReactTable({
    data: suppliers,
    columns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const startIndex = pageIndex * pageSize + 1;
  const endIndex = Math.min((pageIndex + 1) * pageSize, totalRows);

  return {
    suppliers, loading,
    globalFilter, setGlobalFilter,
    filters, setFilters,
    table, columns,
    totalRows, startIndex, endIndex,
    editingSupplier, isEditDialogOpen, setIsEditDialogOpen,
    deletingSupplier, setDeletingSupplier, isDeleteDialogOpen, setIsDeleteDialogOpen,
    handleAddSupplier, handleUpdateSupplier, handleDeleteSupplier, handleExport,
  };
}
