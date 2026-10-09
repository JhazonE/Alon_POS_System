'use client';

import { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { InlineWarehouseSelect } from '@/app/(app)/components/inline-selects/inline-warehouse-select';
import { InlinePaymentMethodSelect } from '@/app/(app)/components/inline-selects/inline-payment-method-select';
import { CustomerSelectionField } from '../customer-selection/customer-selection-field';
import type { SalesInvoiceFormValues } from './add-invoice-types';
import type { Customer, PaymentMethod, Warehouse } from '@/lib/types';

type Props = {
  form: UseFormReturn<SalesInvoiceFormValues>;
  customers: Customer[];
  refetchCustomers: () => void;
  warehouses: Warehouse[];
  paymentMethods: PaymentMethod[];
  isReferenceRequired: boolean;
  fetchWarehouses: () => void;
  fetchPaymentMethods: () => void;
  /** Fold the fields away (kept mounted so values and validation survive). */
  hidden?: boolean;
};

export function AddInvoiceFormHeader({
  form, customers, refetchCustomers,
  warehouses, paymentMethods, isReferenceRequired,
  fetchWarehouses, fetchPaymentMethods, hidden,
}: Props) {
  return (
    <div className={cn('bg-background border-b px-4 py-2 grid grid-cols-4 gap-x-4 gap-y-1 shrink-0', hidden && 'hidden')}>

      {/* Column 1: Customer & Address */}
      <div className="space-y-1.5">
        <CustomerSelectionField
          control={form.control}
          customerList={customers}
          className="bg-background h-8 text-xs"
          formItemClassName="space-y-1"
          onCustomerAdded={refetchCustomers}
          labelClassName="text-xs font-semibold text-muted-foreground"
        />
        <FormField
          control={form.control}
          name="deliveryAddress"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-center justify-between h-4">
                <FormLabel className="text-xs font-semibold text-muted-foreground">Address</FormLabel>
              </div>
              <FormControl>
                <Input className="h-8 bg-background text-xs" placeholder="Deliver to..." {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      {/* Column 2: Dates & Warehouse */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          <FormField
            control={form.control}
            name="invoiceDate"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center justify-between h-4">
                  <FormLabel className="text-xs font-semibold text-muted-foreground">Invoice Date</FormLabel>
                </div>
                <FormControl><Input type="date" className="h-8 bg-background text-xs" {...field} /></FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dueDate"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <div className="flex items-center justify-between h-4">
                  <FormLabel className="text-xs font-semibold text-muted-foreground">Due Date</FormLabel>
                </div>
                <FormControl><Input type="date" className="h-8 bg-background text-xs" {...field} /></FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="warehouse"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-center h-4">
                <FormLabel className="text-xs font-semibold text-muted-foreground">Warehouse</FormLabel>
              </div>
              <InlineWarehouseSelect
                warehouses={warehouses}
                value={field.value || ''}
                onChange={field.onChange}
                onListChange={fetchWarehouses}
                placeholder="Select warehouse"
                triggerClassName="h-8 bg-background text-xs"
                itemClassName="text-xs"
              />
            </FormItem>
          )}
        />
      </div>

      {/* Column 3: Payment & Shipping */}
      <div className="space-y-1.5">
        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-center h-4">
                <FormLabel className="text-xs font-semibold text-muted-foreground">Payment Method</FormLabel>
              </div>
              <InlinePaymentMethodSelect
                paymentMethods={paymentMethods}
                value={field.value || ''}
                onChange={field.onChange}
                onListChange={fetchPaymentMethods}
                placeholder="Select method"
                triggerClassName="h-8 bg-background text-xs"
                itemClassName="text-xs"
              />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="shipping"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-center justify-between h-4">
                <FormLabel className="text-xs font-semibold text-muted-foreground">Shipping</FormLabel>
              </div>
              <FormControl><Input type="number" step="0.01" className="h-8 bg-background text-xs" {...field} /></FormControl>
            </FormItem>
          )}
        />
      </div>

      {/* Column 4: Reference & Notes */}
      <div className="space-y-1.5">
        <FormField
          control={form.control}
          name="paymentReference"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-center justify-between h-4">
                <FormLabel className="text-xs font-semibold text-muted-foreground">
                  Reference {isReferenceRequired && <span className="text-destructive">*</span>}
                </FormLabel>
              </div>
              <FormControl>
                <Input
                  className="h-8 bg-background text-xs"
                  placeholder={isReferenceRequired ? 'Reference required...' : 'Optional reference...'}
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex items-center justify-between h-4">
                <FormLabel className="text-xs font-semibold text-muted-foreground">Notes</FormLabel>
              </div>
              <FormControl>
                <Input className="h-8 bg-background text-xs" placeholder="Brief notes..." {...field} value={field.value || ''} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

    </div>
  );
}
