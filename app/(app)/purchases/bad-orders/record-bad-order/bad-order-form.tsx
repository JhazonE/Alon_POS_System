'use client';

import { useQueryClient } from '@tanstack/react-query';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Search, Trash2 } from 'lucide-react';
import { FormPageShell } from '@/components/form-page/form-page-shell';
import { DetailsToggleButton, useDetailsCollapse } from '@/components/form-page/details-toggle';
import { BarFigure, FormActionBar } from '@/components/form-page/form-action-bar';
import { cn, formatQuantity } from '@/lib/utils';

import { useRecordBadOrder } from './use-record-bad-order';
import { ProductSelector } from './product-selector';
import { CurrencyInput } from './currency-input';

/** Column widths (px) in table order; the `0` (Description) column flexes to fill. */
const COLUMN_WIDTHS = [240, 70, 130, 90, 110, 0, 120, 56];
/** Sticky `left` offsets of the frozen columns (Product .. Qty): the running sum of the widths before each. */
const FROZEN_LEFT = { product: 0, stock: 240, reason: 310, qty: 440 };

const money = (n: number) =>
  `₱${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The Record Bad Order form, rendered as a page body (/purchases/bad-orders/new). */
export function BadOrderForm({ onLeave }: { onLeave: () => void }) {
  const queryClient = useQueryClient();
  const {
    isSubmitting,
    isConfirmOpen, setIsConfirmOpen,
    supplierChangeConfirm,
    form,
    fields, remove,
    suppliers,
    warehouses,
    shelfLocations,
    total,
    handleAddProduct,
    handleSupplierChange,
    confirmSupplierChange,
    cancelSupplierChange,
    handleFinalSubmit,
    onSubmit,
  } = useRecordBadOrder({
    onClose: onLeave,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['badOrders'] }),
  });

  const { detailsOpen, setDetailsOpen, toggleDetails } = useDetailsCollapse('bo-details-collapsed');

  // Unsaved work is items or fields the user touched (Reported By is pre-filled by the hook).
  const isDirty = fields.length > 0 || Object.keys(form.formState.dirtyFields).length > 0;

  return (
    <FormPageShell
      title="Record Bad Order"
      subtitle={
        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          Items recorded here will be deducted from active inventory.
        </span>
      }
      isDirty={isDirty}
      onLeave={onLeave}
      backLabel="Back to bad orders"
      discardTitle="Discard this bad order report?"
      after={
        <>
          <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Bad Order Report</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to record these {fields.length} items as bad orders?
                  This will deduct them from active inventory and potentially submit for multi-level approval.
                  Total value: {money(total)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleFinalSubmit}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Confirm & Record
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={!!supplierChangeConfirm}
            onOpenChange={(o) => { if (!o) cancelSupplierChange(); }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Change supplier?</AlertDialogTitle>
                <AlertDialogDescription>
                  {supplierChangeConfirm?.mismatchedNames.length} item(s) are not carried by{' '}
                  <span className="font-medium">{supplierChangeConfirm?.supplierName}</span> and will be
                  removed from this bad order:
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm">
                <ul className="list-disc pl-4 space-y-1">
                  {supplierChangeConfirm?.mismatchedNames.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelSupplierChange}>Keep current supplier</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmSupplierChange}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove items &amp; change
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    >
      {({ requestLeave }) => (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, () => setDetailsOpen(true))}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
              {/* HEADER FIELDS */}
              <div className={cn('bg-background border-b px-4 py-2 grid grid-cols-4 gap-x-4 gap-y-1 shrink-0', !detailsOpen && 'hidden')}>
                <FormField
                  control={form.control}
                  name="reportedBy"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Reported By</FormLabel>
                      </div>
                      <FormControl>
                        <Input className="h-8 bg-background text-xs" placeholder="Jane Doe" {...field} />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Supplier (Optional)</FormLabel>
                      </div>
                      <Select onValueChange={handleSupplierChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger className="h-8 bg-background text-xs">
                            <SelectValue placeholder="Select supplier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {suppliers.map((supplier) => (
                            <SelectItem key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="warehouseId"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Warehouse</FormLabel>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger className="h-8 bg-background text-xs">
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {warehouses.map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shelfId"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">Shelf / Area</FormLabel>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <FormControl>
                          <SelectTrigger className="h-8 bg-background text-xs">
                            <SelectValue placeholder="Select shelf" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {shelfLocations.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-4 space-y-1">
                      <div className="h-4 flex items-center">
                        <FormLabel className="text-xs font-semibold text-muted-foreground">General Notes</FormLabel>
                      </div>
                      <FormControl>
                        <Textarea
                          rows={1}
                          placeholder="Additional details about this bad order report..."
                          className="min-h-8 h-8 resize-y bg-background py-1.5 text-xs"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* ITEMS TABLE */}
              {/* `isolate` keeps the z-indexes below local, so they can't paint over portalled drawers. */}
              <div className="isolate flex-1 flex flex-col overflow-hidden bg-muted/5 px-4 pt-2 pb-0 relative">
                <div className="mb-2 relative z-[60] flex items-start gap-3">
                  <div className="max-w-3xl flex-1">
                    <ProductSelector
                      onSelectProduct={handleAddProduct}
                      supplierId={form.watch('supplierId')}
                    />
                  </div>
                  <DetailsToggleButton
                    open={detailsOpen}
                    onToggle={toggleDetails}
                    summary={`${form.watch('supplierName') || 'No supplier'} · ${form.watch('reportedBy') || 'No reporter'}`}
                  />
                </div>

                <div className="flex-1 min-h-0 rounded-lg border bg-background shadow-sm overflow-hidden flex flex-col relative">
                  <div className="overflow-auto flex-1 h-full relative">
                    <table className="w-full min-w-[1040px] table-fixed caption-bottom text-sm text-left border-separate border-spacing-0">
                      {/* Fixed widths: the frozen columns' sticky `left` offsets are the running sum of the widths before them. */}
                      <colgroup>
                        {COLUMN_WIDTHS.map((w, i) => (
                          <col key={i} style={w ? { width: w } : undefined} />
                        ))}
                      </colgroup>
                      <TableHeader className="sticky top-0 bg-background z-50 shadow-sm">
                        <TableRow className="hover:bg-transparent [&>th]:border-b">
                          <TableHead style={{ left: FROZEN_LEFT.product }} className="z-30 pl-4 pr-2 h-10">Product</TableHead>
                          <TableHead style={{ left: FROZEN_LEFT.stock }} className="z-30 px-2 text-center h-10">Stock</TableHead>
                          <TableHead style={{ left: FROZEN_LEFT.reason }} className="z-30 px-2 text-left h-10">Reason</TableHead>
                          <TableHead style={{ left: FROZEN_LEFT.qty }} className="z-30 px-2 text-center h-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]">Qty</TableHead>
                          <TableHead className="px-2 text-right h-10">Cost</TableHead>
                          <TableHead className="px-2 text-left h-10">Description</TableHead>
                          <TableHead className="px-2 text-right pr-4 h-10">Total</TableHead>
                          <TableHead className="h-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="h-[40vh] min-h-[200px] text-center text-muted-foreground border-none">
                              <div className="flex flex-col items-center justify-center">
                                <div className="bg-muted p-4 rounded-full mb-4">
                                  <Search className="h-8 w-8 opacity-20" />
                                </div>
                                <p className="font-medium">No items added</p>
                                <p className="text-xs text-muted-foreground">Search or scan products to record.</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : (
                          fields.map((field, index) => (
                            <TableRow key={field.id} className="group bg-background hover:bg-muted/5 [&>td]:border-b">
                              <TableCell
                                style={{ left: FROZEN_LEFT.product }}
                                className="sticky z-10 bg-background font-medium pl-4 pr-2 py-1 border-r"
                              >
                                <div className="truncate text-sm font-bold leading-tight" title={field.productName}>
                                  {field.productName}
                                </div>
                                <div className="truncate font-mono text-[11px] font-bold leading-tight text-muted-foreground">
                                  {field.barcode || '-'}
                                </div>
                              </TableCell>

                              <TableCell
                                style={{ left: FROZEN_LEFT.stock }}
                                className="sticky z-10 bg-background px-2 py-1 text-center border-r font-mono text-xs"
                              >
                                <span className={(field.currentStock || 0) <= 0 ? 'text-destructive font-bold' : 'text-muted-foreground'}>
                                  {formatQuantity(field.currentStock || 0)}
                                </span>
                              </TableCell>

                              <TableCell
                                style={{ left: FROZEN_LEFT.reason }}
                                className="sticky z-10 bg-background px-2 py-1 border-r"
                              >
                                <FormField
                                  control={form.control}
                                  name={`items.${index}.reason`}
                                  render={({ field }) => (
                                    <FormItem className="space-y-0">
                                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                          <SelectTrigger className="h-8 text-xs bg-background border-transparent hover:border-input focus:border-input">
                                            <SelectValue placeholder="Reason" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="Damaged">Damaged</SelectItem>
                                          <SelectItem value="Defective">Defective</SelectItem>
                                          <SelectItem value="Expired">Expired</SelectItem>
                                          <SelectItem value="Wrong Item">Wrong Item</SelectItem>
                                          <SelectItem value="Missing">Missing</SelectItem>
                                          <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </FormItem>
                                  )}
                                />
                              </TableCell>

                              <TableCell
                                style={{ left: FROZEN_LEFT.qty }}
                                className="sticky z-10 bg-background px-2 py-1 border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.18)]"
                              >
                                <FormField
                                  control={form.control}
                                  name={`items.${index}.quantity`}
                                  render={({ field }) => (
                                    <FormItem className="space-y-0 mx-auto w-full max-w-[80px]">
                                      <FormControl>
                                        <Input
                                          type="number"
                                          className="h-8 w-full text-center bg-background border-transparent hover:border-input focus:border-input text-xs"
                                          {...field}
                                          onFocus={(e) => e.target.select()}
                                        />
                                      </FormControl>
                                      <FormMessage className="text-[10px]" />
                                    </FormItem>
                                  )}
                                />
                              </TableCell>

                              <TableCell className="px-2 py-1 text-right border-r">
                                <FormField
                                  control={form.control}
                                  name={`items.${index}.cost`}
                                  render={({ field }) => (
                                    <FormItem className="space-y-0">
                                      <FormControl>
                                        <CurrencyInput
                                          className="h-8 w-full text-right ml-auto border-transparent hover:border-input focus:border-input bg-background px-2 font-mono text-xs"
                                          placeholder="0.00"
                                          {...field}
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </TableCell>

                              <TableCell className="px-2 py-1 text-left border-r">
                                <FormField
                                  control={form.control}
                                  name={`items.${index}.description`}
                                  render={({ field }) => (
                                    <FormItem className="space-y-0">
                                      <FormControl>
                                        <Input
                                          className="h-8 w-full border-transparent hover:border-input focus:border-input bg-background px-2 text-xs"
                                          placeholder="Notes..."
                                          {...field}
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                              </TableCell>

                              <TableCell className="text-right px-2 py-1 pr-4 font-mono font-medium">
                                {(() => {
                                  const cost = parseFloat(form.watch(`items.${index}.cost`) as any) || 0;
                                  const qty = parseFloat(form.watch(`items.${index}.quantity`) as any) || 0;
                                  return money(cost * qty);
                                })()}
                              </TableCell>

                              <TableCell className="px-2 py-1">
                                <div className="flex items-center justify-end">
                                  <button
                                    type="button"
                                    aria-label="Remove item"
                                    className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                    onClick={() => remove(index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </table>
                  </div>
                </div>

                <FormActionBar
                  itemCount={fields.length}
                  onCancel={requestLeave}
                  submitLabel="Record Bad Order"
                  submitIcon={<AlertTriangle className="ml-2 h-4 w-4" />}
                  isSubmitting={isSubmitting}
                  submitDisabled={fields.length === 0}
                >
                  <BarFigure emphasis tone="destructive" label="Total Lost Value" value={money(total)} />
                </FormActionBar>
              </div>
            </div>
          </form>
        </Form>
      )}
    </FormPageShell>
  );
}
