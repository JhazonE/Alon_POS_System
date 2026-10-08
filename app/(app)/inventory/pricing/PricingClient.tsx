'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, PackageSearch, Search, SlidersHorizontal, Tag, Upload } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getProductOptions } from '@/app/(app)/products/actions';
import { useBulkPriceUpdate, type TargetField } from './use-bulk-price-update';
import { downloadPriceListTemplate } from './price-list-template';
import { UploadPriceListDialog } from './UploadPriceListDialog';
import { Spinner } from '@/components/ui/spinner';

interface Props {
  onUpdated?: () => void;
}

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';
const BTN_OUTLINE = `${BTN_BASE} border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5`;
const BTN_PRIMARY = `${BTN_BASE} bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]`;

const FIELD_LABELS: Record<TargetField, string> = {
  price: 'Selling Price',
  cost: 'Cost',
  markup: 'Markup %',
  priceLevel: 'Price Level',
};

function getCurrentUserId(): string {
  try {
    const raw = localStorage.getItem('mock-user-session');
    return raw ? JSON.parse(raw).uid : 'system';
  } catch {
    return 'system';
  }
}

function describeAdjustment(targetField: TargetField, adjustmentType: string, value: number): string {
  if (targetField === 'markup') return `to ${value}% markup`;
  if (adjustmentType === 'percentage') return `${value >= 0 ? '+' : ''}${value}%`;
  if (adjustmentType === 'fixed') return `${value >= 0 ? '+' : '-'}₱${Math.abs(value).toFixed(2)}`;
  return `set to ₱${value.toFixed(2)}`;
}

function PaneHeader({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="p-3 border-b shrink-0 flex items-center justify-between gap-2">
      <h2 className="font-bold text-sm flex items-center gap-1.5 truncate">
        {icon} {title}
      </h2>
      {children}
    </div>
  );
}

export function PricingClient({ onUpdated }: Props) {
  const bp = useBulkPriceUpdate(onUpdated);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const { data: productOptions, isLoading: isLoadingOptions } = useQuery({
    queryKey: ['productOptions'],
    queryFn: () => getProductOptions(),
  });

  if (isLoadingOptions || !productOptions) {
    return (
      <div className="p-10 text-center">
        <Spinner className="h-6 w-6 mx-auto text-muted-foreground" />
      </div>
    );
  }

  const previewById = new Map(bp.preview.map(item => [item.productId, item]));
  const allSelected = bp.products.length > 0 && bp.selectedIds.size === bp.products.length;
  const warehouseName = productOptions.warehouses?.find(w => w.id === bp.warehouseId)?.name || 'warehouse';

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(320px,380px),1fr] h-full min-h-0">
      {/* Left: what to change */}
      <div className="border rounded-2xl shadow-sm bg-background flex flex-col lg:min-h-0 lg:overflow-hidden">
        <PaneHeader icon={<SlidersHorizontal className="h-4 w-4" />} title="Price Changes" />
        <div className="p-4 space-y-4 lg:flex-1 lg:overflow-y-auto">
          <div className="grid gap-2">
            <Label>Warehouse</Label>
            <Select value={bp.warehouseId} onValueChange={bp.setWarehouseId}>
              <SelectTrigger><SelectValue placeholder="Select a warehouse" /></SelectTrigger>
              <SelectContent>
                {productOptions.warehouses?.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {bp.warehouseId && (
            <>
              <div className="grid gap-2">
                <Label>Target Field</Label>
                <Select value={bp.targetField} onValueChange={(v: any) => bp.setTargetField(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price">Selling Price</SelectItem>
                    <SelectItem value="cost">Cost</SelectItem>
                    <SelectItem value="markup">Recalculate from Markup %</SelectItem>
                    <SelectItem value="priceLevel">Price Level</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {bp.targetField === 'priceLevel' && (
                <div className="grid gap-2">
                  <Label>Price Level</Label>
                  <Select value={bp.priceLevelId} onValueChange={(id) => {
                    bp.setPriceLevelId(id);
                    bp.setPriceLevelName(productOptions.priceLevels?.find(pl => pl.id === id)?.name || '');
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select a price level" /></SelectTrigger>
                    <SelectContent>
                      {productOptions.priceLevels?.map(pl => (
                        <SelectItem key={pl.id} value={pl.id}>{pl.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-2">
                <Label>Adjustment Type</Label>
                <Select
                  value={bp.targetField === 'markup' ? 'markup' : bp.adjustmentType}
                  onValueChange={(v: any) => bp.setAdjustmentType(v)}
                  disabled={bp.targetField === 'markup'}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (₱)</SelectItem>
                    <SelectItem value="exact">Set Exact Value</SelectItem>
                    {bp.targetField === 'markup' && <SelectItem value="markup">Markup %</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>{bp.targetField === 'markup' ? 'Target Markup %' : 'Value'}</Label>
                <Input
                  type="number"
                  value={bp.adjustmentValue}
                  onChange={(e) => bp.setAdjustmentValue(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Prefer a spreadsheet?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadPriceListTemplate(
                      bp.products.slice(0, 3).map((p: any) => ({
                        sku: p.sku, barcode: p.barcode || '', name: p.name,
                        brand: p.brand || '', category: p.category || '', unitOfMeasure: p.unitOfMeasure || '',
                        price: Number(p.price), cost: Number(p.cost || 0),
                      })),
                      warehouseName,
                    )}
                    className={BTN_OUTLINE}
                  >
                    <Download /> Download Template
                  </button>
                  <button type="button" onClick={() => setIsUploadOpen(true)} className={BTN_OUTLINE}>
                    <Upload /> Upload Excel
                  </button>
                </div>
              </div>
              <UploadPriceListDialog
                open={isUploadOpen}
                onOpenChange={setIsUploadOpen}
                warehouseId={bp.warehouseId}
                onUpdated={onUpdated}
              />
            </>
          )}
        </div>
      </div>

      {/* Right: which products, and the result */}
      <div className="border rounded-2xl shadow-sm bg-background flex flex-col lg:min-h-0 lg:overflow-hidden">
        <PaneHeader icon={<Tag className="h-4 w-4" />} title="Products">
          {bp.warehouseId && (
            <span className="text-xs text-muted-foreground">
              {bp.selectedIds.size} of {bp.products.length} selected
            </span>
          )}
        </PaneHeader>

        {!bp.warehouseId ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-muted-foreground min-h-48 lg:flex-1">
            <PackageSearch className="h-8 w-8" />
            <p className="text-sm">Choose a warehouse to load its products.</p>
          </div>
        ) : (
          <>
            <div className="p-3 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search products by SKU, barcode, or name..."
                  className="pl-9 h-9"
                  value={bp.searchTerm}
                  onChange={(e) => bp.setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto lg:max-h-none lg:flex-1 lg:min-h-0">
              <Table wrapperClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(c) => c ? bp.selectAll(bp.products.map((p: any) => p.id)) : bp.clearSelection()}
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Old</TableHead>
                    <TableHead className="text-right">New</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bp.products.map((p: any) => {
                    const item = previewById.get(p.id);
                    return (
                      <TableRow key={p.id} data-state={bp.selectedIds.has(p.id) ? 'selected' : undefined}>
                        <TableCell><Checkbox checked={bp.selectedIds.has(p.id)} onCheckedChange={() => bp.toggleSelected(p.id)} /></TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.barcode || '—'}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item ? `₱${item.oldValue.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {item ? `₱${item.newValue.toFixed(2)}` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!bp.isLoading && bp.products.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                        No products found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <div className="sticky bottom-0 lg:static p-3 border-t bg-background shrink-0 flex items-center justify-between gap-3 rounded-b-2xl">
          <p className="text-xs text-muted-foreground truncate">
            {bp.preview.length > 0
              ? `${bp.preview.length} selected · ${FIELD_LABELS[bp.targetField]} ${describeAdjustment(bp.targetField, bp.adjustmentType, bp.adjustmentValue)}`
              : 'Select products to preview the new prices.'}
          </p>
          <button
            disabled={bp.preview.length === 0 || bp.isSubmitting}
            onClick={() => bp.submit(getCurrentUserId())}
            className={BTN_PRIMARY}
          >
            {bp.isSubmitting ? 'Submitting...' : `Update ${bp.preview.length} Product(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
