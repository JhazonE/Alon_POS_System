'use client';

import Image from 'next/image';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Product } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { AddProductDialog } from './add-product/add-product-dialog';
import { ManageBrandsDialog } from './brands/ManageBrandsDialog';
import { ManageCategoriesDialog } from './categories/ManageCategoriesDialog';
import { ManageDepartmentsDialog } from './departments/ManageDepartmentsDialog';
import { EditProductDialog } from './edit-product/edit-product-dialog';
import { ManagePriceLevelsDialog } from './price-levels/ManagePriceLevelsDialog';
import { ManageSuppliersDialog } from './suppliers/ManageSuppliersDialog';
import { ManageShelfLocationsDialog } from './shelf-locations/ManageShelfLocationsDialog';
import { ManageUnitOfMeasureDialog } from './units-of-measure/ManageUnitOfMeasureDialog';
import { ManageWarehousesDialog } from '../sales/manage-warehouses/ManageWarehousesDialog';

import { Search, ChevronRight, Trash2, PlusCircle, Settings, ShoppingCart, MoreVertical, Edit, Eye, AlertTriangle, Printer } from 'lucide-react';
import { PrintBarcodeDialog } from './print-barcode/print-barcode-dialog';
import { useState, useMemo, Fragment, useEffect, useCallback, Suspense } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn, formatQuantity, formatStockQuantity } from '@/lib/utils';
import { ViewProductDialog } from './view-product/view-product-dialog';
import { getProducts, getProductsCount, deleteProduct, getDepartments, getDefaultProductWarehouse } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLiveRefresh, dispatchStockUpdate } from '@/hooks/use-live-refresh';
import { getSessionUid } from '@/lib/session-uid';
import { SellingUnitsPanel, StockDot } from './components/selling-units-panel';

// Expand, Name, Barcode, Unit, Stock, Cost, Retail Price, Warehouse, Shelf, Actions
const PRODUCT_TABLE_COLUMN_COUNT = 10;

function ProductRow({ product, onProductDeleted, onProductUpdated, products, productOptions, onOptionsRefresh, depth = 0, lowStockThreshold }: {
  product: ProductWithChildren;
  onProductDeleted?: () => void;
  onProductUpdated?: () => void;
  products: Product[];
  productOptions?: any;
  onOptionsRefresh?: () => void;
  depth?: number;
  lowStockThreshold?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const router = useRouter();
  const [printBarcodeOpen, setPrintBarcodeOpen] = useState(false);

  const { toast } = useToast();
  // Services carry no stock, so the stock ladder does not apply — flagging one
  // "Out of Stock" reads as a problem to fix when it is simply how they work.
  const isServiceProduct = product.type === 'service';

  // Effective threshold matches the Low Stock filter/report/notification bell:
  // a product is low stock once it drops under its own reorder point OR the
  // store-wide Low Stock Threshold, whichever is higher.
  const effectiveReorderPoint = Math.max(product.reorderPoint, lowStockThreshold || 0);
  const stockStatus =
    isServiceProduct
      ? 'service'
      : product.stock <= 0
      ? 'out-of-stock'
      : product.stock < effectiveReorderPoint
        ? 'low-stock'
        : 'in-stock';

  const handleDeleteConfirm = async () => {
    const result = await deleteProduct(product.id);
    if (result.success) {
      toast({
        title: 'Product deleted',
        description: result.message,
      });
      if (onProductDeleted) onProductDeleted();
      setDeleteDialogOpen(false);
    } else {
      toast({
        variant: 'destructive',
        title: 'Error deleting product',
        description: result.message,
      });
    }
  };

  const hasChildren = product.children && product.children.length > 0;
  const hasSellingUnits = !!product.sellingUnits && product.sellingUnits.length > 0;
  const indentStyle = { paddingLeft: `${depth * 24}px` };

  return (
    <>
      <TableRow className={cn(depth > 0 && "bg-muted/20", isOpen && "bg-muted/40 hover:bg-muted/40")}>
        <TableCell className="hidden sm:table-cell" style={indentStyle}>
          {hasChildren || hasSellingUnits ? (
            <button
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${product.name}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0 group"
              onClick={() => setIsOpen(!isOpen)}
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-90")} />
            </button>
          ) : depth > 0 ? (
            <div className="text-sm text-muted-foreground">└</div>
          ) : (
            <div className="w-10"></div>
          )}
        </TableCell>
        <TableCell className="font-medium">
          <span className="inline-flex items-center gap-2">
            {product.name}
            {/* Surfaces that a product HAS selling units without expanding it --
                the caret alone did not say whether anything was under it. */}
            {hasSellingUnits && (
              <span className="shrink-0 whitespace-nowrap rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                {product.sellingUnits!.length} units
              </span>
            )}
          </span>
          {product.parentId && <div className="text-xs text-muted-foreground">Child Unit</div>}
          {product.expirationDate && (
            <div className="text-[10px] text-orange-600 font-medium flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-600" />
              Exp: {new Date(product.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </TableCell>
        <TableCell className="hidden lg:table-cell">{product.barcode}</TableCell>
        <TableCell className="hidden sm:table-cell text-center text-muted-foreground">
          {product.unitOfMeasure}
        </TableCell>
        <TableCell className="text-center font-bold">
          <span className="inline-flex items-center justify-center gap-2">
            {stockStatus !== 'service' && <StockDot status={stockStatus} />}
            {formatStockQuantity(product.stock)}
          </span>
        </TableCell>
        <TableCell className="hidden md:table-cell text-right">
          {product.cost && typeof product.cost === 'number' ? `₱${product.cost.toFixed(2)}` : '—'}
        </TableCell>
        <TableCell className="hidden md:table-cell text-right">
          {typeof product.price === 'number' ? `₱${product.price.toFixed(2)}` : 'N/A'}
        </TableCell>
        <TableCell className="hidden md:table-cell text-center">
          {product.warehouseName || '—'}
        </TableCell>
        <TableCell className="hidden md:table-cell text-center">
          {product.shelfLocationNames || product.shelfLocationName || '—'}
        </TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setViewDialogOpen(true)}>
                <Eye className="mr-2 h-4 w-4" />
                <span>View Details</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Edit className="mr-2 h-4 w-4" />
                <span>Edit Product</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPrintBarcodeOpen(true)}>
                <Printer className="mr-2 h-4 w-4" />
                <span>Print Barcode</span>
              </DropdownMenuItem>

              {/* Restock Option */}
              {stockStatus !== 'in-stock' && (
                  <DropdownMenuItem onClick={() => router.push(`/purchases/new?productId=${encodeURIComponent(product.id)}`)} className="text-orange-600 focus:text-orange-600">
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    <span>Restock</span>
                  </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-red-600 focus:text-red-600"
                onSelect={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete Product</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Action Dialogs - Nested here to avoid invalid tbody structure */}
          <div className="hidden">
            <PrintBarcodeDialog
              open={printBarcodeOpen}
              onOpenChange={setPrintBarcodeOpen}
              product={product}
            />
            <ViewProductDialog
                open={viewDialogOpen}
                onOpenChange={setViewDialogOpen}
                product={product}
                onProductUpdated={onProductUpdated}
                products={products}
                productOptions={productOptions}
                onOptionsRefresh={onOptionsRefresh}
            />
            <EditProductDialog 
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                product={product} 
                onProductUpdated={onProductUpdated} 
                productOptions={productOptions}
                onOptionsRefresh={onOptionsRefresh}
            />
          </div>
        </TableCell>
      </TableRow>

      {/* Rendered as sibling <tr> of this row, sharing the table's columns --
          see SellingUnitsPanel. Not wrapped in anything: a wrapper element
          between <tbody> and these rows is invalid table markup. */}
      {isOpen && hasSellingUnits && (
        <SellingUnitsPanel
          product={product}
          priceLevels={productOptions?.priceLevels ?? []}
          effectiveReorderPoint={effectiveReorderPoint}
        />
      )}

      {isOpen && hasChildren && product.children!.map(child => (
        <ProductRow
          key={child.id}
          product={child}
          onProductDeleted={onProductDeleted}
          onProductUpdated={onProductUpdated}
          products={products}
          productOptions={productOptions}
          onOptionsRefresh={onOptionsRefresh}
          depth={depth + 1}
          lowStockThreshold={lowStockThreshold}
        />
      ))}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product "{product.name}" and all related data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProductSkeleton() {
  return (
    <TableRow>
      <TableCell className="hidden sm:table-cell w-12"><Skeleton className="h-5 w-5" /></TableCell>
      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
      <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-10 mx-auto" /></TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-12 mx-auto" /></TableCell>
      <TableCell className="hidden md:table-cell text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
      <TableCell className="hidden md:table-cell text-right"><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20 mx-auto" /></TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20 mx-auto" /></TableCell>
      <TableCell className="text-right"><div className='flex gap-2 justify-end'><Skeleton className="h-8 w-8 rounded-full" /></div></TableCell>
    </TableRow>
  );
}

// Warehouse filter value that matches no row: used when the user's branch has no
// warehouse, so the table is empty instead of unfiltered.
const NO_WAREHOUSE = '__no-warehouse__';

interface ProductWithChildren extends Product {
  children?: Product[];
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<Card><CardHeader><CardTitle>Loading...</CardTitle></CardHeader></Card>}>
        <ProductsContent />
    </Suspense>
  )
}

function ProductsContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const searchParams = useSearchParams();
  const filter = searchParams.get('filter');
  
  // Filter States (Active)
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  // Starts at 'all' only until the user's default warehouse resolves (see the
  // effect below); the products query is held back until then, so 'all' is never
  // fetched on first load.
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [warehouseDefaultReady, setWarehouseDefaultReady] = useState(false);
  const [selectedShelfLocation, setSelectedShelfLocation] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>(filter === 'low-stock' ? 'low-stock' : 'all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Pending Filters (Inside Dialog)
  const [tempBrand, setTempBrand] = useState('all');
  const [tempCategory, setTempCategory] = useState('all');
  const [tempSupplier, setTempSupplier] = useState('all');
  const [tempWarehouse, setTempWarehouse] = useState('all');
  const [tempShelfLocation, setTempShelfLocation] = useState('all');
  const [tempStatus, setTempStatus] = useState(filter === 'low-stock' ? 'low-stock' : 'all');
  const [tempDepartment, setTempDepartment] = useState('all');

  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isBrandsOpen, setIsBrandsOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isPriceLevelsOpen, setIsPriceLevelsOpen] = useState(false);
  const [isSuppliersOpen, setIsSuppliersOpen] = useState(false);
  const [isShelfLocationsOpen, setIsShelfLocationsOpen] = useState(false);
  const [isDepartmentsOpen, setIsDepartmentsOpen] = useState(false);
  const [isUnitOfMeasureOpen, setIsUnitOfMeasureOpen] = useState(false);
  const [isWarehousesOpen, setIsWarehousesOpen] = useState(false);

  // Every user-initiated warehouse change goes through here. Marking the default as
  // settled is what stops the async default from overwriting a choice the user
  // made first: the effect below does nothing once warehouseDefaultReady is set.
  const chooseWarehouse = useCallback((value: string) => {
    setSelectedWarehouse(value);
    setWarehouseDefaultReady(true);
  }, []);

  const filters = {
    search: debouncedSearchTerm || undefined,
    brand: selectedBrand !== 'all' ? selectedBrand : undefined,
    category: selectedCategory !== 'all' ? selectedCategory : undefined,
    supplier: selectedSupplier !== 'all' ? selectedSupplier : undefined,
    warehouse: selectedWarehouse !== 'all' ? selectedWarehouse : undefined,
    shelfLocation: selectedShelfLocation !== 'all' ? selectedShelfLocation : undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
    department: selectedDepartment !== 'all' ? selectedDepartment : undefined,
  };

  const { data: productsDataResult, isLoading: isLoadingProducts, refetch } = useQuery({
    queryKey: ['products', currentPage, pageSize, filters],
    enabled: warehouseDefaultReady,
    queryFn: async () => {
      const [productsData, totalCount] = await Promise.all([
        getProducts(pageSize, (currentPage - 1) * pageSize, filters),
        getProductsCount(filters)
      ]);
      return { productsData, totalCount };
    },
  });

  const allProducts = productsDataResult?.productsData || [];
  const totalProducts = productsDataResult?.totalCount || 0;

  const { data: productOptions, isLoading: isLoadingOptions, refetch: refetchOptions } = useQuery({
    queryKey: ['productOptions'],
    queryFn: async () => {
      const { getProductOptions } = await import('./actions');
      return getProductOptions();
    }
  });

  // Captured once per mount so the query key is stable across renders.
  const [sessionUid] = useState(() => getSessionUid());

  // The branch's default warehouse. Resolved server-side from the session so it is
  // always a warehouse of the user's own branch (never "first of every branch").
  const { data: defaultWarehouse, isError: defaultWarehouseFailed } = useQuery({
    // The identity is part of the key: the QueryClient is a module-level singleton
    // that survives sign-out -> sign-in as another user, so without the uid a user
    // would inherit the previous user's (other branch's) cached default.
    queryKey: ['defaultProductWarehouse', sessionUid],
    queryFn: () => getDefaultProductWarehouse(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Apply the default exactly once, and only if the user has not already chosen
  // (chooseWarehouse sets warehouseDefaultReady, which short-circuits this).
  // No warehouse in the branch => a sentinel that matches nothing, so the list is
  // empty rather than unfiltered.
  useEffect(() => {
    if (warehouseDefaultReady) return;
    if (defaultWarehouse) {
      setSelectedWarehouse(defaultWarehouse.warehouseId ?? NO_WAREHOUSE);
      setWarehouseDefaultReady(true);
    } else if (defaultWarehouseFailed) {
      setWarehouseDefaultReady(true); // fall back to 'all' rather than a blank page
    }
  }, [defaultWarehouse, defaultWarehouseFailed, warehouseDefaultReady]);

  const { data: posSettings } = useQuery({
    queryKey: ['posSettings'],
    queryFn: async () => {
      const response = await fetch('/api/pos-settings');
      if (!response.ok) throw new Error('Failed to fetch POS settings');
      return response.json();
    }
  });
  const lowStockThreshold = posSettings?.data?.lowStockThreshold;

  const loadProducts = useCallback((page?: number, size?: number) => {
    refetch();
  }, [refetch]);

  const loadProductOptions = useCallback(() => {
    refetchOptions();
  }, [refetchOptions]);

  // refetch() ignores `enabled`, so a stock-updated event before the default
  // warehouse resolves would fetch the unfiltered list. Hold it until ready.
  const refreshWhenReady = useCallback(() => {
    if (warehouseDefaultReady) refetch();
  }, [refetch, warehouseDefaultReady]);
  useLiveRefresh(refreshWhenReady);

  // Reset to page 1 when structural filters or search term change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBrand, selectedCategory, selectedSupplier, selectedWarehouse, selectedShelfLocation, selectedStatus, selectedDepartment, debouncedSearchTerm]);

  // Mirrors `rollupSuppressed` in ./actions.ts: row filters (and search) flatten the
  // family tree; the warehouse filter does NOT -- it only scopes which rows are
  // visible, so a family stays nested under its default warehouse. Deliberately
  // separate from the chip/badge checks below, which DO count a warehouse selection
  // as an active filter. Keep this list in step with the server's.
  const suppressRollup = useMemo(() => {
    return selectedBrand !== 'all' || selectedCategory !== 'all' || selectedSupplier !== 'all' || selectedShelfLocation !== 'all' || selectedStatus !== 'all' || selectedDepartment !== 'all' || !!debouncedSearchTerm;
  }, [selectedBrand, selectedCategory, selectedSupplier, selectedShelfLocation, selectedStatus, selectedDepartment, debouncedSearchTerm]);

  // Server-side results are already filtered
  const products = useMemo(() => {
    return allProducts;
  }, [allProducts]);

  const productTree = useMemo(() => {
    if (!products) return [];

    // If a row filter or search is active, show flat list (a warehouse alone does not)
    if (suppressRollup) {
        return products.map((p: Product) => ({ ...p, children: [] }));
    }

    // Build a recursive tree structure
    const buildTree = (parentId: string | null = null, depth = 0): ProductWithChildren[] => {
      return products
        .filter((p: Product) => {
            if (parentId === null) {
                return p.parentId == null; // Loose equality to catch null and undefined
            }
            return p.parentId === parentId;
        })
        .map((p: Product) => ({
          ...p,
          children: depth < 10 ? buildTree(p.id, depth + 1) : [], // Prevent infinite recursion, max depth 10
        }));
    };

    return buildTree();
  }, [products, suppressRollup]);

  const filteredProducts = useMemo(() => {
    return productTree;
  }, [productTree]);

  return (
    <div className="flex flex-col h-full gap-6 pt-2 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-2xl border border-border/50 bg-gradient-to-r from-muted/40 via-background to-muted/40 shadow-sm flex-shrink-0">
            <div className="relative group">
              <Search className="absolute left-3 top-[0.65rem] h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                type="search"
                placeholder="Search products..."
                className="pl-9 w-full sm:w-[320px] bg-background/70 border-input/50 focus:bg-background transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] bg-background/50 backdrop-blur-sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Manage
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass-card">
                <DropdownMenuLabel>Product Settings</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsBrandsOpen(true), 0)}>
                  Manage Brands
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsCategoriesOpen(true), 0)}>
                  Manage Categories
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsPriceLevelsOpen(true), 0)}>
                  Manage Price Levels
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsSuppliersOpen(true), 0)}>
                  Manage Suppliers
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsShelfLocationsOpen(true), 0)}>
                  Manage Shelf Locations
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsDepartmentsOpen(true), 0)}>
                  Manage Departments
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsWarehousesOpen(true), 0)}>
                  Manage Warehouse
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTimeout(() => setIsUnitOfMeasureOpen(true), 0)}>
                  Manage Unit of Measure
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <ManageBrandsDialog 
                open={isBrandsOpen}
                onOpenChange={setIsBrandsOpen}
                onBrandAdded={() => loadProducts(currentPage, pageSize)}
                trigger={<span className="sr-only">Open Brands</span>}
            />
            <ManageCategoriesDialog 
                open={isCategoriesOpen}
                onOpenChange={setIsCategoriesOpen}
                onCategoryAdded={() => loadProducts(currentPage, pageSize)}
                trigger={<span className="sr-only">Open Categories</span>}
            />

             <ManagePriceLevelsDialog
                open={isPriceLevelsOpen}
                onOpenChange={setIsPriceLevelsOpen}
                onLevelAdded={() => { loadProductOptions(); loadProducts(currentPage, pageSize); }}
                trigger={<span className="sr-only">Open Price Levels</span>}
            />
             <ManageSuppliersDialog 
                open={isSuppliersOpen}
                onOpenChange={setIsSuppliersOpen}
                onSupplierAdded={() => loadProducts(currentPage, pageSize)}
                trigger={<span className="sr-only">Open Suppliers</span>}
            />
            <ManageShelfLocationsDialog 
                open={isShelfLocationsOpen}
                onOpenChange={setIsShelfLocationsOpen}
                onLocationAdded={() => loadProducts(currentPage, pageSize)}
                trigger={<span className="sr-only">Open Shelf Locations</span>}
            />
            <ManageDepartmentsDialog 
                open={isDepartmentsOpen}
                onOpenChange={setIsDepartmentsOpen}
                onDepartmentAdded={() => {
                    loadProductOptions();
                    loadProducts(currentPage, pageSize);
                }}
                trigger={<span className="sr-only">Open Departments</span>}
            />
            <ManageUnitOfMeasureDialog 
                open={isUnitOfMeasureOpen}
                onOpenChange={setIsUnitOfMeasureOpen}
                onUnitAdded={() => {
                    loadProductOptions();
                    loadProducts(currentPage, pageSize);
                }}
                trigger={<span className="sr-only">Open Units</span>}
            />
            <ManageWarehousesDialog 
                open={isWarehousesOpen}
                onOpenChange={setIsWarehousesOpen}
                onChange={() => {
                    loadProductOptions();
                    loadProducts(currentPage, pageSize);
                }}
                trigger={<span className="sr-only">Open Warehouses</span>}
            />
            <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
              <DialogTrigger asChild>
                <button className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] gap-2" onClick={() => {
                   // Sync temp with actual when opening
                   setTempBrand(selectedBrand);
                   setTempCategory(selectedCategory);
                   setTempSupplier(selectedSupplier);
                   setTempWarehouse(selectedWarehouse);
                   setTempShelfLocation(selectedShelfLocation);
                   setTempStatus(selectedStatus);
                   setTempDepartment(selectedDepartment);
                }}>
                   <span className="sr-only">Open filters</span>
                   <Settings className="h-4 w-4 mr-2" />
                   Filter Products
                   {(selectedBrand !== 'all' || selectedCategory !== 'all' || selectedSupplier !== 'all' || selectedWarehouse !== 'all' || selectedShelfLocation !== 'all' || selectedStatus !== 'all' || selectedDepartment !== 'all') && (
                       <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center">
                           {
                               [selectedBrand, selectedCategory, selectedSupplier, selectedWarehouse, selectedShelfLocation, selectedStatus, selectedDepartment].filter(v => v !== 'all').length
                           }
                       </Badge>
                   )}
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Filter Products</DialogTitle>
                  <DialogDescription>
                    Narrow down your product list using the filters below.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="brand-filter">Brand</Label>
                    <Select value={tempBrand} onValueChange={setTempBrand}>
                      <SelectTrigger id="brand-filter">
                        <SelectValue placeholder="All Brands" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Brands</SelectItem>
                        {productOptions?.brands?.map((brand: any) => (
                          <SelectItem key={brand.id} value={brand.name}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="category-filter">Category</Label>
                    <Select value={tempCategory} onValueChange={setTempCategory}>
                      <SelectTrigger id="category-filter">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {productOptions?.categories?.map((category: any) => (
                          <SelectItem key={category.id} value={category.name}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="supplier-filter">Supplier</Label>
                    <Select value={tempSupplier} onValueChange={setTempSupplier}>
                      <SelectTrigger id="supplier-filter">
                        <SelectValue placeholder="All Suppliers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Suppliers</SelectItem>
                        {productOptions?.suppliers?.map((supplier: any) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="warehouse-filter">Warehouse</Label>
                    <Select value={tempWarehouse} onValueChange={setTempWarehouse}>
                      <SelectTrigger id="warehouse-filter">
                        <SelectValue placeholder="All Warehouses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Warehouses</SelectItem>
                        {productOptions?.warehouses?.map((warehouse: any) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="shelf-filter">Shelf Location</Label>
                    <Select value={tempShelfLocation} onValueChange={setTempShelfLocation}>
                      <SelectTrigger id="shelf-filter">
                        <SelectValue placeholder="All Shelves" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Shelves</SelectItem>
                        {productOptions?.shelfLocations?.map((shelf: any) => (
                          <SelectItem key={shelf.id} value={shelf.id}>
                            {shelf.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="status-filter">Status</Label>
                    <Select value={tempStatus} onValueChange={setTempStatus}>
                      <SelectTrigger id="status-filter">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="in-stock">In Stock</SelectItem>
                        <SelectItem value="low-stock">Low Stock</SelectItem>
                        <SelectItem value="out-of-stock">Out of Stock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="department-filter">Department</Label>
                    <Select value={tempDepartment} onValueChange={setTempDepartment}>
                      <SelectTrigger id="department-filter">
                        <SelectValue placeholder="All Departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {productOptions?.departments?.map((dept: any) => (
                          <SelectItem key={dept.id} value={dept.name}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="flex justify-between sm:justify-between">
                   <button onClick={() => {
                       setTempBrand('all');
                       setTempCategory('all');
                       setTempSupplier('all');
                       setTempWarehouse('all');
                       setTempShelfLocation('all');
                       setTempStatus('all');
                       setTempDepartment('all');
                   }} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 px-[18px]">Reset</button>
                   <button onClick={() => {
                       setSelectedBrand(tempBrand);
                       setSelectedCategory(tempCategory);
                       setSelectedSupplier(tempSupplier);
                       chooseWarehouse(tempWarehouse);
                       setSelectedShelfLocation(tempShelfLocation);
                       setSelectedStatus(tempStatus);
                       setSelectedDepartment(tempDepartment);
                       setIsFilterDialogOpen(false);
                   }} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">Apply Filters</button>
                </DialogFooter>
              </DialogContent>
           </Dialog>
            <AddProductDialog
              onProductAdded={() => loadProducts(currentPage, pageSize)}
              productOptions={productOptions}
              onOptionsRefresh={loadProductOptions}
            />
      </div>

      <div className="flex flex-wrap items-center gap-3 flex-shrink-0">

        
        {/* Active Filters Badges */}
        {(selectedBrand !== 'all' || selectedCategory !== 'all' || selectedSupplier !== 'all' || selectedWarehouse !== 'all' || selectedShelfLocation !== 'all' || selectedStatus !== 'all' || selectedDepartment !== 'all') && (
            <div className="flex flex-wrap items-center gap-2">
                 {selectedBrand !== 'all' && (
                     <Badge variant="secondary" className="gap-1 pl-2">
                         Brand: {selectedBrand}
                         <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-4 w-4 ml-1 hover:bg-transparent" onClick={() => setSelectedBrand('all')}>
                             <span className="sr-only">Remove</span>
                             <span className="text-xs">×</span>
                         </button>
                     </Badge>
                 )}
                 {selectedCategory !== 'all' && (
                     <Badge variant="secondary" className="gap-1 pl-2">
                         Category: {selectedCategory}
                         <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-4 w-4 ml-1 hover:bg-transparent" onClick={() => setSelectedCategory('all')}>
                             <span className="sr-only">Remove</span>
                             <span className="text-xs">×</span>
                         </button>
                     </Badge>
                 )}
                 {selectedSupplier !== 'all' && (
                     <Badge variant="secondary" className="gap-1 pl-2">
                         Supplier: {productOptions?.suppliers?.find((s:any) => s.id === selectedSupplier)?.name || 'Unknown'}
                         <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-4 w-4 ml-1 hover:bg-transparent" onClick={() => setSelectedSupplier('all')}>
                             <span className="sr-only">Remove</span>
                             <span className="text-xs">×</span>
                         </button>
                     </Badge>
                 )}
                 {selectedWarehouse !== 'all' && (
                     <Badge variant="secondary" className="gap-1 pl-2">
                         Warehouse: {productOptions?.warehouses?.find((w:any) => w.id === selectedWarehouse)?.name || (selectedWarehouse === NO_WAREHOUSE ? 'None in your branch' : 'Unknown')}
                         <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-4 w-4 ml-1 hover:bg-transparent" onClick={() => chooseWarehouse('all')}>
                             <span className="sr-only">Remove</span>
                             <span className="text-xs">×</span>
                         </button>
                     </Badge>
                 )}
                 {selectedShelfLocation !== 'all' && (
                     <Badge variant="secondary" className="gap-1 pl-2">
                         Shelf: {productOptions?.shelfLocations?.find((sl:any) => sl.id === selectedShelfLocation)?.name || 'Unknown'}
                         <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-4 w-4 ml-1 hover:bg-transparent" onClick={() => setSelectedShelfLocation('all')}>
                             <span className="sr-only">Remove</span>
                             <span className="text-xs">×</span>
                         </button>
                     </Badge>
                 )}
                 {selectedStatus !== 'all' && (
                     <Badge variant="secondary" className="gap-1 pl-2">
                         Status: {selectedStatus === 'in-stock' ? 'In Stock' : selectedStatus === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
                         <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-4 w-4 ml-1 hover:bg-transparent" onClick={() => setSelectedStatus('all')}>
                             <span className="sr-only">Remove</span>
                             <span className="text-xs">×</span>
                         </button>
                     </Badge>
                 )}
                 {selectedDepartment !== 'all' && (
                     <Badge variant="secondary" className="gap-1 pl-2">
                         Department: {selectedDepartment}
                         <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-4 w-4 ml-1 hover:bg-transparent" onClick={() => setSelectedDepartment('all')}>
                             <span className="sr-only">Remove</span>
                             <span className="text-xs">×</span>
                         </button>
                     </Badge>
                 )}

                 <button 
                    onClick={() => {
                        setSelectedBrand('all');
                        setSelectedCategory('all');
                        setSelectedSupplier('all');
                        chooseWarehouse('all');
                        setSelectedShelfLocation('all');
                        setSelectedStatus('all');
                        setSelectedDepartment('all');
                        setSearchTerm('');
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-8 text-xs text-muted-foreground"
                >
                    Clear All
                </button>
            </div>
        )}
      </div>

      <Card className="border-0 shadow-lg bg-card/50 backdrop-blur-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <CardContent className="p-0 overflow-hidden flex flex-col flex-1 min-h-0 relative">
        <TooltipProvider>
          <Table 
            className="text-xs" 
            wrapperClassName="flex-1"
          >
            <TableHeader className="z-20">
              <TableRow className="hover:bg-transparent border-b">
                <TableHead className="w-12 hidden sm:table-cell"><span className="sr-only">Expand</span></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden lg:table-cell">Barcode</TableHead>
                <TableHead className="hidden sm:table-cell text-center">Unit</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                <TableHead className="hidden md:table-cell text-right">Cost</TableHead>
                <TableHead className="hidden md:table-cell text-right">Retail Price</TableHead>
                <TableHead className="hidden md:table-cell text-center">Warehouse</TableHead>
                <TableHead className="hidden md:table-cell text-center">Shelf</TableHead>
                <TableHead>
                  Actions
                </TableHead>
              </TableRow>

            </TableHeader>
            <TableBody>
              {isLoadingProducts || !warehouseDefaultReady ? (
                Array.from({ length: 5 }).map((_, i) => <ProductSkeleton key={i} />)
              ) : (
                filteredProducts.map((product: ProductWithChildren) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onProductDeleted={() => loadProducts(currentPage, pageSize)}
                    onProductUpdated={() => loadProducts(currentPage, pageSize)}
                    products={products}
                    productOptions={productOptions}
                    onOptionsRefresh={loadProductOptions}
                    lowStockThreshold={lowStockThreshold}
                  />
                ))
              )}
              {!isLoadingProducts && warehouseDefaultReady && filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={PRODUCT_TABLE_COLUMN_COUNT} className="h-24 text-center">
                    No products found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TooltipProvider>

      </CardContent>
      {/* Pagination Controls */}
      <div className="border-t bg-card/50 backdrop-blur-sm mt-auto">
        {totalProducts > 0 && (
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex-1 text-sm text-muted-foreground">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalProducts)} of {totalProducts} products
            </div>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Label htmlFor="page-size" className="text-sm">Rows per page:</Label>
                <Select
                  value={pageSize.toString()}
                  onValueChange={(value) => {
                    const newSize = parseInt(value);
                    setPageSize(newSize);
                    setCurrentPage(1); // Reset to first page when changing page size
                  }}
                >
                  <SelectTrigger className="w-20" id="page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
                >
                  Previous
                </button>
                <div className="text-sm font-medium">
                  Page {currentPage} of {Math.ceil(totalProducts / pageSize)}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalProducts / pageSize), prev + 1))}
                  disabled={currentPage === Math.ceil(totalProducts / pageSize)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </Card>
    </div>
  );
}
