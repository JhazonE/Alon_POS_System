'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Form } from '@/components/ui/form';
import { FormPageShell } from '@/components/form-page/form-page-shell';
import { DetailsToggleButton, useDetailsCollapse } from '@/components/form-page/details-toggle';
import { BarFigure, FormActionBar } from '@/components/form-page/form-action-bar';
import type { Sale } from '@/lib/types';
import { useAddOrderData } from './use-add-order-data';
import { useAddOrderForm } from './use-add-order-form';
import { AddOrderProductSelector } from './AddOrderProductSelector';
import { AddOrderFormHeader } from './AddOrderFormHeader';
import { AddOrderItemsTable } from './AddOrderItemsTable';

interface SalesOrderFormProps {
  /** Editing an existing order; omit for a new one. */
  initialData?: Sale;
  /** Navigates away after a save or a confirmed Cancel. */
  onLeave: () => void;
}

/** The New / Edit Sales Order form, rendered as a page body (/sales/orders/new, /sales/orders/[id]/edit). */
export function SalesOrderForm({ initialData, onLeave }: SalesOrderFormProps) {
  const queryClient = useQueryClient();
  const data = useAddOrderData({ isOpen: true });
  const formHook = useAddOrderForm({
    paymentMethods: data.paymentMethods,
    salesPersons: data.salesPersons,
    customers: data.customers,
    initialData,
    isOpen: true,
    onClose: onLeave,
    // Without an onSuccess the hook reloads the whole page; the list just needs a refetch.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salesOrders'] }),
  });
  const { form, fields } = formHook;

  const { detailsOpen, setDetailsOpen, toggleDetails } = useDetailsCollapse('so-details-collapsed');

  // New order: unsaved work is items or touched fields (the generated values the
  // hook sets itself don't count). Edit starts from reset() values, so isDirty is accurate.
  const isDirty = initialData
    ? form.formState.isDirty
    : fields.length > 0 || Object.keys(form.formState.dirtyFields).length > 0;

  const shipping = Number(form.watch('shipping') || 0);
  const peso = (n: number) => `₱${n.toFixed(2)}`;

  return (
    <FormPageShell
      title={initialData ? 'Edit Sales Order' : 'New Sales Order'}
      subtitle={
        <>
          {/* On a new order the number is allocated by the server at save time,
              so there is nothing to show yet. */}
          Reference:{' '}
          <span className="font-mono font-medium text-primary">
            {form.watch('reference') || 'assigned on save'}
          </span>
        </>
      }
      isDirty={isDirty}
      onLeave={onLeave}
      backLabel="Back to sales orders"
      discardTitle="Discard this sales order?"
    >
      {({ requestLeave }) => (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(formHook.onSubmit, (errors) => {
              setDetailsOpen(true);
              formHook.onInvalid(errors);
            })}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
              <AddOrderFormHeader
                hidden={!detailsOpen}
                form={form}
                customers={data.customers}
                refetchCustomers={data.refetchCustomers}
                warehouses={data.warehouses}
                paymentMethods={data.paymentMethods}
                salesPersons={data.salesPersons}
                isReferenceRequired={formHook.isReferenceRequired}
                fetchWarehouses={data.fetchWarehouses}
                fetchPaymentMethods={data.fetchPaymentMethods}
                fetchSalesPersons={data.fetchSalesPersons}
              />

              {/* `isolate` keeps the z-indexes below local, so they can't paint over portalled drawers. */}
              <div className="isolate flex-1 flex flex-col overflow-hidden bg-muted/5 px-4 pt-2 pb-0 relative">
                <div className="mb-2 relative z-[60] flex items-start gap-3">
                  <div className="max-w-3xl flex-1">
                    <AddOrderProductSelector
                      onSelectProduct={formHook.handleAddProduct}
                      warehouseId={form.watch('warehouse')}
                    />
                  </div>
                  <DetailsToggleButton
                    open={detailsOpen}
                    onToggle={toggleDetails}
                    summary={`${form.watch('customer.name') || 'No customer'} · ${form.watch('orderDate')}`}
                  />
                </div>

                <AddOrderItemsTable form={form} fields={fields} remove={formHook.remove} />

                <FormActionBar
                  itemCount={fields.length}
                  onCancel={requestLeave}
                  submitLabel={initialData ? 'Update Order' : 'Create Order'}
                  isSubmitting={formHook.isSubmitting}
                  submitDisabled={fields.length === 0}
                >
                  <BarFigure label="Subtotal" value={peso(formHook.total - shipping)} />
                  <BarFigure label="Shipping" value={peso(shipping)} />
                  <BarFigure emphasis label="Total" value={peso(formHook.total)} />
                </FormActionBar>
              </div>
            </div>
          </form>
        </Form>
      )}
    </FormPageShell>
  );
}
