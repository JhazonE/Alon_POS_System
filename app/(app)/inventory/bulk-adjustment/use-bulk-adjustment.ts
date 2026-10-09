'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { logActivity } from '@/lib/client-activity-logger';
import { dispatchStockUpdate } from '@/hooks/use-live-refresh';
import { useToast } from '@/hooks/use-toast';
import type { Product, ShelfLocation, Supplier, Warehouse } from '@/lib/types';

import { getProducts, updateProductShelfLocations } from '../../products/actions';
import type { AdjustmentItem, AdjustmentType, TransferTarget } from './constants';
import { shelfQuantityOf, productsOnShelf, UNASSIGNED_SHELF_ID } from './shelf-quantities';

/**
 * Controller for the bulk stock adjustment screen: owns product/metadata
 * loading, the batch of pending adjustments, the per-item mutations, and the
 * submit flow. Keeps the screen and its sub-components presentational.
 */
export function useBulkAdjustment() {
  const router = useRouter();
  const { toast } = useToast();
  const searchRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('add');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>('');
  const [transferTarget, setTransferTarget] = useState<TransferTarget>('warehouse');
  const [sourceShelfId, setSourceShelfId] = useState<string>('');
  const [targetShelfId, setTargetShelfId] = useState<string>('');
  const [shelfLocations, setShelfLocations] = useState<ShelfLocation[]>([]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [referenceNo, setReferenceNo] = useState('');
  const [note, setNote] = useState('');

  const [adjustments, setAdjustments] = useState<AdjustmentItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // The column only earns its width when it can actually be used: adding stock,
  // with at least one perishable product in the batch.
  const showExpirationColumn =
    adjustmentType === 'add' && adjustments.some(a => Boolean(a.product.isPerishable));

  // One delivery usually shares a single expiry, so let the user stamp them all
  // at once instead of typing the same date on every row.
  const applyExpirationToAll = (date: string) => {
    setAdjustments(prev =>
      prev.map(a => (a.product.isPerishable ? { ...a, expirationDate: date } : a))
    );
  };

  // Mobile: show config panel or list
  const [mobileView, setMobileView] = useState<'list' | 'config'>('list');
  // Mobile: show search overlay
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  useEffect(() => {
    loadProducts();
    loadMetadata();
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const data = await getProducts();
      // Services are excluded: they have no stock, so they can't be added,
      // removed, or transferred. getProducts() is shared with the general
      // inventory list, so filter here rather than in the action itself.
      setAllProducts(data.filter((p: Product) => p.type !== 'service'));
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const loadMetadata = async () => {
    try {
      const [whRes, supRes, shelfRes] = await Promise.all([
        fetch('/api/warehouses?activeOnly=true').then(r => r.json()),
        fetch('/api/suppliers').then(r => r.json()),
        fetch('/api/shelf-locations?activeOnly=true').then(r => r.json())
      ]);
      if (whRes.success) setWarehouses(whRes.data);
      if (supRes.success) setSuppliers(supRes.data);
      if (shelfRes.success) setShelfLocations(shelfRes.data);
    } catch (error) {
      console.error('Failed to load metadata:', error);
    }
  };

  /**
   * Ang ceiling sa usa ka item. Sa shelf transfer, kung pila ang naa sa SOURCE
   * SHELF — dili ang total stock (Review Focus 2). Kung dili shelf, ang stock.
   */
  const maxQuantityFor = (product: Product): number => {
    if (adjustmentType === 'transfer' && transferTarget === 'shelf' && sourceShelfId) {
      return shelfQuantityOf(product, sourceShelfId);
    }
    return product.stock;
  };

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return [];
    let filtered = allProducts;

    const isShelfTransfer = adjustmentType === 'transfer' && transferTarget === 'shelf';

    if (isShelfTransfer) {
      // Sa shelf mode, ang naa ra gyuy stock sa source shelf ang mahimong
      // ibalhin — kung dili ni i-filter, maka-stage ang user ug item nga dili
      // diay ma-transfer. Ang warehouse filter gi-laktawan kay global ang
      // shelves (walay warehouse_id ang shelf_locations).
      filtered = sourceShelfId ? productsOnShelf(filtered, sourceShelfId) : [];
    } else if (warehouseId && warehouseId !== 'none') {
      filtered = filtered.filter(p => p.warehouseId === warehouseId || p.warehouse === warehouseId);
    }

    return filtered.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    ).slice(0, 40);
  }, [allProducts, search, warehouseId, adjustmentType, transferTarget, sourceShelfId]);

  const addProduct = (product: Product) => {
    if (adjustments.some(a => a.product.id === product.id)) {
      toast({ title: 'Already added', description: `${product.name} is already in the list.` });
      return;
    }
    setAdjustments(prev => [...prev, { product, quantity: 1, type: adjustmentType, reason: '' }]);
    setSearch('');
    setShowResults(false);
    setShowMobileSearch(false);
  };

  const removeAdjustment = (productId: string) => {
    setAdjustments(prev => prev.filter(a => a.product.id !== productId));
  };

  const updateAdjustment = (productId: string, updates: Partial<AdjustmentItem>) => {
    setAdjustments(prev => prev.map(a => a.product.id === productId ? { ...a, ...updates } : a));
  };

  /** Switch the batch mode and re-stamp every existing item with the new type. */
  const changeAdjustmentType = (type: AdjustmentType) => {
    setAdjustmentType(type);
    setAdjustments(prev => prev.map(a => ({ ...a, type })));
  };

  /**
   * Kung mo-usab ang destination type, mo-usab sad ang ceiling sa matag item
   * (total stock vs. shelf quantity), mao nga i-clamp ang na-stage na aron dili
   * mabilin nga mo-tumong sa daan nga ceiling (Review Focus 4).
   */
  const changeTransferTarget = (target: TransferTarget) => {
    setTransferTarget(target);
    setAdjustments(prev => prev.map(a => {
      const max = target === 'shelf' && sourceShelfId
        ? shelfQuantityOf(a.product, sourceShelfId)
        : a.product.stock;
      return { ...a, quantity: Math.min(a.quantity, Math.max(1, max)) };
    }));
  };

  const handleProcessAdjustments = async () => {
    if (adjustments.length === 0) return;
    if (adjustmentType === 'transfer') {
      if (transferTarget === 'warehouse' && !targetWarehouseId) {
        toast({ variant: 'destructive', title: 'Target Warehouse Required', description: 'Please select a destination warehouse.' });
        return;
      }
      if (transferTarget === 'shelf') {
        if (!sourceShelfId || !targetShelfId) {
          toast({ variant: 'destructive', title: 'Shelves Required', description: 'Please select both a source and destination shelf.' });
          return;
        }
        if (sourceShelfId === targetShelfId) {
          toast({ variant: 'destructive', title: 'Invalid Transfer', description: 'Source and destination shelf must be different.' });
          return;
        }
        // Final nga check sa submit: ang quantity sa na-stage mahimong daan na
        // kay ang source shelf o ang mode nausab human ma-stage. Kinahanglan
        // naay sulod ang source shelf ug dili molapas ang quantity niini.
        const overLimit = adjustments.find(a => {
          const available = shelfQuantityOf(a.product, sourceShelfId);
          return available < 1 || a.quantity > available;
        });
        if (overLimit) {
          const available = shelfQuantityOf(overLimit.product, sourceShelfId);
          toast({
            variant: 'destructive',
            title: 'Insufficient Shelf Quantity',
            description: `${overLimit.product.name}: only ${available} available on the source shelf.`,
          });
          return;
        }
      }
    }
    setIsProcessing(true);
    try {
      // Ang shelf transfer lahi nga write path: mo-usab ra siya sa
      // `product_shelves`, wala sa `products.stock`, ug naa siyay kaugalingong
      // SHELF_TRANSFER approval. Gi-reuse ang server action nga naa nay tanan
      // niini — wala gyud nato gi-hilabtan ang stock arithmetic.
      if (adjustmentType === 'transfer' && transferTarget === 'shelf') {
        const userSession = localStorage.getItem('mock-user-session');
        const userId = userSession ? JSON.parse(userSession).uid : 'system';

        const result = await updateProductShelfLocations(
          adjustments.map(a => ({
            productId: a.product.id,
            sourceShelfId: sourceShelfId === UNASSIGNED_SHELF_ID ? null : sourceShelfId,
            targetShelfId: targetShelfId === UNASSIGNED_SHELF_ID ? null : targetShelfId,
            quantity: a.quantity,
          })),
          userId,
        );

        if (!result.success) throw new Error('Shelf transfer failed');

        await logActivity({
          action: 'TRANSFER',
          module: 'INVENTORY',
          description: `Shelf transfer: ${adjustments.length} item(s)${result.pendingApproval ? ' (pending approval)' : ''}`,
        });

        toast(result.pendingApproval
          ? { title: 'Approval Required', description: 'The shelf transfer was sent for approval.' }
          : { title: 'Shelf Transfer Successful', description: `Moved ${adjustments.length} item(s).` });

        setAdjustments([]);
        dispatchStockUpdate();
        router.push('/inventory');
        return;
      }

      const userSession = localStorage.getItem('mock-user-session');
      const userId = userSession ? JSON.parse(userSession).uid : 'system';
      const payload = {
        adjustments: adjustments.map(a => ({
          productId: a.product.id,
          quantity: a.quantity,
          reason: a.reason || note || 'Bulk Stock Adjustment',
          expirationDate: a.product.isPerishable && adjustmentType === 'add' ? (a.expirationDate || null) : null,
        })),
        notes: note || 'Bulk Stock Adjustment',
        userId, warehouseId, targetWarehouseId, referenceNo, supplierId, adjustmentType
      };
      const response = await fetch('/api/inventory/adjust/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        await logActivity({
          action: 'ADJUST',
          module: 'INVENTORY',
          description: `Bulk stock adjustment: processed ${result.processed} item(s)`,
        });
        toast({ title: 'Bulk Adjustment Successful', description: `Processed ${result.processed} items.` });
        setAdjustments([]);
        dispatchStockUpdate();
        router.push('/inventory');
      } else {
        throw new Error(result.error || 'Failed to process adjustments');
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Adjustment Failed', description: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const hasNegativeStock = adjustments.some(a => {
    const newStock = a.type === 'remove' ? a.product.stock - a.quantity : a.product.stock + a.quantity;
    return newStock < 0;
  });

  const addCount = adjustments.filter(a => a.type === 'add').length;
  const removeCount = adjustments.filter(a => a.type === 'remove').length;
  const transferCount = adjustments.filter(a => a.type === 'transfer').length;

  return {
    router,
    searchRef,
    search,
    setSearch,
    isLoadingProducts,
    showResults,
    setShowResults,
    warehouses,
    suppliers,
    adjustmentType,
    changeAdjustmentType,
    warehouseId,
    setWarehouseId,
    targetWarehouseId,
    setTargetWarehouseId,
    transferTarget,
    setTransferTarget,
    changeTransferTarget,
    maxQuantityFor,
    sourceShelfId,
    setSourceShelfId,
    targetShelfId,
    setTargetShelfId,
    shelfLocations,
    supplierId,
    setSupplierId,
    referenceNo,
    setReferenceNo,
    note,
    setNote,
    adjustments,
    isProcessing,
    showExpirationColumn,
    applyExpirationToAll,
    mobileView,
    setMobileView,
    showMobileSearch,
    setShowMobileSearch,
    filteredProducts,
    addProduct,
    removeAdjustment,
    updateAdjustment,
    handleProcessAdjustments,
    hasNegativeStock,
    addCount,
    removeCount,
    transferCount,
  };
}
