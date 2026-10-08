'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Trash2, Search, Wand2 } from 'lucide-react';

import { FormPageShell } from '@/components/form-page/form-page-shell';
import { DetailsToggleButton, useDetailsCollapse } from '@/components/form-page/details-toggle';
import { BarFigure, FormActionBar } from '@/components/form-page/form-action-bar';

import { InlineWarehouseSelect } from '../../components/inline-selects/inline-warehouse-select';
import { InlinePaymentMethodSelect } from '../../components/inline-selects/inline-payment-method-select';
import { InlineSupplierSelect } from '../../components/inline-selects/inline-supplier-select';
import { AddProductDialog } from '../../products/add-product/add-product-dialog';

import { calculateMarkupPercentage, calculateSuggestedPrice } from '@/lib/purchase-utils';
import { formatQuantity, cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

import { useAddPurchaseOrder, type UseAddPurchaseOrderProps } from './use-add-purchase-order';
import { ProductSelector } from './product-selector';
import { CurrencyInput } from './currency-input';
import { Spinner } from '@/components/ui/spinner';

/**
 * The New / Edit Purchase Order form, rendered as a page body. The page that
 * hosts it pins `open` to true and navigates away from `onOpenChange(false)`
 * (fired after a successful save or a confirmed Cancel).
 */
/** Column widths (px) in table order; the trailing `0` column flexes to fill. */
const PO_COLUMN_WIDTHS = [260, 80, 80, 100, 100, 130, 140, 56, 140, 110, 120, 0];
/** Sticky `left` offsets of the frozen columns (Product .. Sell Price): the running sum of the widths before each. */
const FROZEN_LEFT = { product: 0, remaining: 260, qty: 340, cost: 420, sell: 520 };

export function PurchaseOrderForm(hookProps: UseAddPurchaseOrderProps) {
  const controller = useAddPurchaseOrder(hookProps);
  const {
    isOpen, setOpen,
    isSubmitting,
    isConfirmOpen, setIsConfirmOpen,
    confirmValues,
    form,
    fields, remove,
    warehouses,
    suppliers,
    paymentMethods,
    priceLevels,
    categories, brands, subcategories,
    activeTaxRate,
    systemSettings,
    total, vatTotal, purchaseResults,
    handleAddProduct,
    handleNewProductAdded,
    fetchSuppliers,
    fetchWarehouses,
    refetchPaymentMethods,
    onSubmit,
    processSubmit,
  } = controller;

  const { toast } = useToast();

  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');

  // The header fields can be folded away to give the items table the room.
  // Remembered per browser; failed validation re-opens them so the error shows.
  const { detailsOpen, setDetailsOpen, toggleDetails } = useDetailsCollapse('po-details-collapsed');

  // `formState.isDirty` is not usable for a new order: the hook sets the
  // generated Ref # with setValue() after init, which already differs from the
  // defaults. A new order has unsaved work once it has items or a touched
  // field; Edit / Reorder start from reset() values, so isDirty is accurate.
  const isDirty =
    hookProps.editOrder || hookProps.reorderData
      ? form.formState.isDirty
      : fields.length > 0 || Object.keys(form.formState.dirtyFields).length > 0;

  // Same query key as the Products page, so the options are shared when cached.
  const { data: productOptions, refetch: refetchProductOptions } = useQuery({
    queryKey: ['productOptions'],
    queryFn: async () => {
      const { getProductOptions } = await import('../../products/actions');
      return getProductOptions();
    },
    enabled: isOpen,
  });

  return (
    <FormPageShell
      title={`${hookProps.editOrder ? 'Edit' : 'New'} Purchase Order`}
      subtitle={
        <>
          Reference: <span className="font-mono font-medium text-primary">{form.watch('reference')}</span>
        </>
      }
      isDirty={isDirty}
      onLeave={() => setOpen(false)}
      backLabel="Back to purchase orders"
      discardTitle="Discard this purchase order?"
      after={
        <>
      {/* Rendered outside the order <form>: React bubbles the Add Product form's
          submit event through the portal to the nearest ancestor <form>, which
          would otherwise submit the purchase order too. */}
      <AddProductDialog
        hideTrigger
        lockStandard
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        defaultName={newProductName}
        defaultSupplierId={form.watch('supplierId') || undefined}
        productOptions={productOptions}
        onOptionsRefresh={refetchProductOptions}
        onProductAdded={handleNewProductAdded}
      />


      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {hookProps.editOrder ? 'update' : 'create'} this purchase order for{' '}
              <strong>{suppliers.find((s) => s.id === form.watch('supplierId'))?.name || 'the selected supplier'}</strong>?
              Total Amount: <strong>₱{total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmValues && processSubmit(confirmValues)}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Spinner className="h-4 w-4 mr-2" /> : null}
              Confirm & Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      }
    >
      {({ requestLeave }) => (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, () => setDetailsOpen(true))} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">

              {/* HEADER FIELDS */}
              <div className={cn('bg-background border-b px-4 py-2 grid grid-cols-5 gap-x-4 gap-y-1 shrink-0', !detailsOpen && 'hidden')}>

                {/* ROW 1 */}
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="flex items-center h-4">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Supplier</FormLabel>
                      </div>
                      <InlineSupplierSelect
                        suppliers={suppliers}
                        value={field.value || ''}
                        onChange={field.onChange}
                        onListChange={fetchSuppliers}
                        triggerClassName="h-8 bg-background text-xs"
                        itemClassName="text-xs"
                      />
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="issueDate"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Issue Date</FormLabel>
                      </div>
                      <FormControl>
                        <Input type="date" className="h-8 bg-background text-xs" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deliveryDate"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Due Date</FormLabel>
                      </div>
                      <FormControl>
                        <Input type="date" className="h-8 bg-background text-xs" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Payment Method</FormLabel>
                      </div>
                      <InlinePaymentMethodSelect
                        paymentMethods={paymentMethods}
                        value={field.value || ''}
                        onChange={field.onChange}
                        onListChange={refetchPaymentMethods}
                        triggerClassName="h-8 bg-background text-xs"
                        itemClassName="text-xs"
                      />
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Address</FormLabel>
                      </div>
                      <FormControl>
                        <Input className="h-8 bg-background text-xs" placeholder="Deliver to..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* ROW 2 */}
                <FormField
                  control={form.control}
                  name="purchaseType"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Type</FormLabel>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 bg-background text-xs">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Order" className="text-xs">Order</SelectItem>
                          <SelectItem value="Receive" className="text-xs">Receive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reference"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Ref #</FormLabel>
                      </div>
                      <FormControl>
                        <Input className="h-8 bg-background text-xs" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="receiveToWarehouse"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Receive To</FormLabel>
                      </div>
                      <InlineWarehouseSelect
                        warehouses={warehouses}
                        value={field.value || ''}
                        onChange={field.onChange}
                        onListChange={fetchWarehouses}
                        triggerClassName="h-8 bg-background text-xs"
                        itemClassName="text-xs"
                      />
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shipping"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Shipping Cost</FormLabel>
                      </div>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 bg-background text-xs"
                          placeholder="0.00"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Notes/Payment Reference</FormLabel>
                      </div>
                      <FormControl>
                        <Input
                          className="h-8 bg-background text-xs"
                          placeholder="Notes/Payment..."
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* ITEMS TABLE */}
              {/* `isolate` keeps every z-index below local to this section. Without it the
                  z-[60] search row and the sticky table cells compete with the portalled
                  drawers (Add New Product, z-50) and paint on top of them. */}
              <div className="isolate flex-1 flex flex-col overflow-hidden bg-muted/5 px-4 pt-2 pb-0 relative">
                {/* z-[60]: the suggestion dropdown must sit above the sticky table header (z-50). */}
                <div className="mb-2 relative z-[60] flex items-start gap-3">
                  <div className="max-w-3xl flex-1">
                    <ProductSelector
                      onSelectProduct={handleAddProduct}
                      onAddNewProduct={(name) => {
                        setNewProductName(name ?? '');
                        setNewProductOpen(true);
                      }}
                      supplierId={form.watch('supplierId')}
                    />
                  </div>
                  <DetailsToggleButton
                    open={detailsOpen}
                    onToggle={toggleDetails}
                    summary={`${suppliers.find((sup) => sup.id === form.watch('supplierId'))?.name || 'No supplier'} · ${form.watch('issueDate')} · ${form.watch('reference')}`}
                  />
                </div>

                <div className="flex-1 rounded-lg border bg-background shadow-sm overflow-hidden flex flex-col relative">
                  <div className="overflow-auto flex-1 h-full relative">
                    <table className="w-full min-w-[1400px] table-fixed caption-bottom text-sm text-left border-separate border-spacing-0">
                      {/* Fixed widths: the frozen columns' sticky `left` offsets are the running sum of the widths before them. The last column is flexible and absorbs extra width. */}
                      <colgroup>
                        {PO_COLUMN_WIDTHS.map((w, i) => (
                          <col key={i} style={w ? { width: w } : undefined} />
                        ))}
                      </colgroup>
                      <TableHeader className="sticky top-0 bg-background z-50 shadow-sm">
                        <TableRow className="hover:bg-transparent [&>th]:border-b">
                          <TableHead style={{ left: FROZEN_LEFT.product }} className="z-30 pl-4 pr-2 h-10 leading-tight">Product</TableHead>
                          <TableHead style={{ left: FROZEN_LEFT.remaining }} className="z-30 px-2 text-center h-10 leading-tight">Remaining QTY</TableHead>
                          <TableHead style={{ left: FROZEN_LEFT.qty }} className="z-30 px-2 text-center h-10">Qty</TableHead>
                          <TableHead style={{ left: FROZEN_LEFT.cost }} className="z-30 px-2 text-right h-10">Cost</TableHead>
                          <TableHead style={{ left: FROZEN_LEFT.sell }} className="z-30 px-2 text-right h-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]">Sell Price</TableHead>
                          <TableHead className="px-2 text-right h-10 italic text-blue-600">Suggested</TableHead>
                          <TableHead className="px-2 text-center h-10">Discount</TableHead>
                          <TableHead className="px-2 text-center h-10">VAT</TableHead>
                          <TableHead className="px-2 text-left h-10">Expiry</TableHead>
                          <TableHead className="px-2 text-right h-10 italic text-muted-foreground">Landed Cost</TableHead>
                          <TableHead className="px-2 text-right pr-4 h-10">Line Total</TableHead>
                          <TableHead className="h-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={12} className="h-[40vh] min-h-[200px] text-center text-muted-foreground flex flex-col items-center justify-center border-none">
                              <div className="bg-muted p-4 rounded-full mb-4">
                                <Search className="h-8 w-8 text-muted-foreground opacity-50" />
                              </div>
                              <p className="font-bold text-lg">No items added</p>
                              <p className="text-xs text-muted-foreground font-medium">Scan barcode or search above to add products.</p>
                            </TableCell>
                          </TableRow>
                        ) : (
                          fields.map((field, index) => {
                            const { markup, source } = calculateMarkupPercentage(
                              {
                                category: controller.products.find((p) => p.id === field.productId)?.category,
                                subcategory: controller.products.find((p) => p.id === field.productId)?.subcategory,
                                brand: controller.products.find((p) => p.id === field.productId)?.brand,
                                supplierId: form.watch('supplierId'),
                              },
                              systemSettings,
                              categories,
                              subcategories,
                              brands,
                              suppliers,
                            );

                            const itemResult = purchaseResults?.items[index];
                            const baseCost = itemResult?.cost || 0;
                            const shippingPerUnit =
                              itemResult?.quantity > 0
                                ? itemResult.shippingAllocation / itemResult.quantity
                                : 0;
                            const landedCostPerUnit = baseCost + shippingPerUnit;
                            const defaultLevel = priceLevels.find((l) => l.isDefault) || priceLevels[0];
                            const suggestedPrice = calculateSuggestedPrice(baseCost, markup, shippingPerUnit, defaultLevel);

                            return (
                              <TableRow key={field.id} className="group bg-background hover:bg-muted/5 [&>td]:border-b">
                                <TableCell style={{ left: FROZEN_LEFT.product }} className="sticky z-10 bg-background font-medium pl-4 pr-2 py-1 border-r">
                                  <div className="truncate font-bold text-sm leading-tight text-foreground" title={field.productName}>{field.productName}</div>
                                  <div className="truncate font-mono text-[11px] font-bold leading-tight text-muted-foreground">{field.barcode || '-'}</div>
                                </TableCell>

                                <TableCell style={{ left: FROZEN_LEFT.remaining }} className="sticky z-10 bg-background px-2 py-1 text-center border-r font-mono text-sm">
                                  <span className={(field.currentStock || 0) <= 0 ? 'text-destructive font-black' : 'text-muted-foreground font-bold'}>
                                    {formatQuantity(field.currentStock || 0)}
                                  </span>
                                </TableCell>

                                <TableCell style={{ left: FROZEN_LEFT.qty }} className="sticky z-10 bg-background px-2 py-1 border-r">
                                  <div className="flex justify-center flex-col items-center">
                                    <FormField
                                      control={form.control}
                                      name={`items.${index}.quantity`}
                                      render={({ field }) => (
                                        <Input
                                          type="number"
                                          className="h-8 w-full max-w-[5rem] text-center bg-background text-sm"
                                          {...field}
                                          onFocus={(e) => e.target.select()}
                                        />
                                      )}
                                    />
                                  </div>
                                </TableCell>

                                <TableCell style={{ left: FROZEN_LEFT.cost }} className="sticky z-10 bg-background px-2 py-1 text-right border-r">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.cost`}
                                    render={({ field }) => (
                                      <CurrencyInput
                                        className="h-8 w-full text-right ml-auto border-transparent hover:border-input focus:border-input bg-background px-2 font-mono text-sm"
                                        placeholder="0.00"
                                        {...field}
                                      />
                                    )}
                                  />
                                </TableCell>

                                <TableCell style={{ left: FROZEN_LEFT.sell }} className="sticky z-10 bg-background px-2 py-1 text-right border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.sellingPrice`}
                                    render={({ field }) => (
                                      <CurrencyInput
                                        className="h-8 w-full text-right ml-auto border-transparent hover:border-input focus:border-input bg-background px-2 font-mono text-sm"
                                        placeholder="0.00"
                                        {...field}
                                      />
                                    )}
                                  />
                                </TableCell>

                                <TableCell className="px-2 py-1 text-right border-r bg-blue-50/10">
                                  <div className="flex flex-col items-end justify-center">
                                    <div className="flex items-center gap-1" title={`Markup: ${markup}% from ${source}`}>
                                      <span className="text-sm font-bold text-blue-600 font-mono">
                                        ₱{suggestedPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                      <button
                                        type="button"
                                        className="inline-flex items-center justify-center gap-2 text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-6 w-6 text-blue-600 hover:text-blue-700 hover:bg-blue-100/50 rounded-full"
                                        onClick={() => {
                                          form.setValue(`items.${index}.sellingPrice`, parseFloat(suggestedPrice.toFixed(2)));
                                          toast({
                                            title: 'Price Updated',
                                            description: `Suggested price of ₱${suggestedPrice.toFixed(2)} applied to ${field.productName}`,
                                          });
                                        }}
                                        title={`Apply suggested price (Markup: ${markup}% from ${source})`}
                                      >
                                        <Wand2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                </TableCell>

                                <TableCell className="px-2 py-1 text-right border-r">
                                  <div className="flex items-center gap-1 justify-center">
                                    <FormField
                                      control={form.control}
                                      name={`items.${index}.discountType`}
                                      render={({ field }) => (
                                        <FormItem className="space-y-0 text-center">
                                          <Select onValueChange={field.onChange} defaultValue={field.value || 'amount'}>
                                            <FormControl>
                                              <SelectTrigger className="h-8 w-[48px] px-1 text-sm bg-background border-transparent hover:border-input focus:border-input">
                                                <SelectValue />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              <SelectItem value="amount">₱</SelectItem>
                                              <SelectItem value="percentage">%</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name={`items.${index}.discount`}
                                      render={({ field }) => (
                                        <FormItem className="space-y-0">
                                          <FormControl>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              className="h-8 w-20 text-right border-transparent hover:border-input focus:border-input bg-background px-2 text-sm"
                                              {...field}
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </div>
                                </TableCell>

                                <TableCell className="px-2 py-1 text-center border-r">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.vatSubject`}
                                    render={({ field }) => (
                                      <div className="flex justify-center">
                                        <input
                                          type="checkbox"
                                          className="h-5 w-5"
                                          checked={field.value}
                                          onChange={field.onChange}
                                        />
                                      </div>
                                    )}
                                  />
                                </TableCell>

                                <TableCell className="px-2 py-1 border-r">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.expirationDate`}
                                    render={({ field }) => (
                                      <Input
                                        type="date"
                                        className="h-8 w-full border-transparent hover:border-input focus:border-input bg-background text-sm px-2"
                                        {...field}
                                      />
                                    )}
                                  />
                                </TableCell>

                                <TableCell className="text-right px-2 py-1 text-sm font-mono text-muted-foreground font-bold italic bg-muted/50 border-r">
                                  ₱{landedCostPerUnit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>

                                <TableCell className="text-right px-2 py-1 pr-4 font-mono font-medium border-r">
                                  ₱{(purchaseResults?.items[index]?.lineTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>

                                <TableCell className="px-2 py-1 text-center h-8">
                                  <div className="flex items-center gap-1 justify-center">
                                    {(() => {
                                      const rop = fields[index].reorderPoint || 0;
                                      const hasRop = rop > 0;
                                      return (
                                        <button
                                          type="button"
                                          className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 w-10 p-0", `h-8 w-8 transition-colors ${hasRop ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground'}`)}
                                          title={hasRop ? `Suggest Order Qty: ${rop}` : 'No Reorder Point set'}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (!hasRop || rop <= 0) {
                                              toast({
                                                title: 'No Suggestion Available',
                                                description: 'Please set a Reorder Point for this product in settings to use auto-fill.',
                                                variant: 'destructive',
                                              });
                                              return;
                                            }
                                            form.setValue(`items.${index}.quantity`, rop, {
                                              shouldValidate: true,
                                              shouldDirty: true,
                                              shouldTouch: true,
                                            });
                                            toast({
                                              title: 'Quantity Updated',
                                              description: `Set quantity to ${rop} (based on Reorder Point).`,
                                            });
                                          }}
                                        >
                                          <Wand2 className="h-4 w-4" />
                                        </button>
                                      );
                                    })()}
                                    <button
                                      className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => remove(index)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </table>
                  </div>
                </div>

                {/* SUMMARY BAR */}
                <FormActionBar
                  itemCount={fields.length}
                  onCancel={requestLeave}
                  submitLabel={hookProps.editOrder ? 'Update Order' : 'Create Order'}
                  isSubmitting={isSubmitting}
                  submitDisabled={fields.length === 0}
                >
                  <BarFigure label="Subtotal" value={`₱${(total - (form.watch('shipping') || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                  <BarFigure label="Shipping" value={`₱${(form.watch('shipping') || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                  <BarFigure label={`VAT ${activeTaxRate ? `(${activeTaxRate.rate}%)` : ''}`.trim()} value={`₱${vatTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                  <BarFigure emphasis label="Total Payable" value={`₱${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                </FormActionBar>
              </div>
            </div>
          </form>
        </Form>
      )}
    </FormPageShell>
  );
}
