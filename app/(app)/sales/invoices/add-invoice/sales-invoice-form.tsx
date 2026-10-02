'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Form } from '@/components/ui/form';
import { FormPageShell } from '@/components/form-page/form-page-shell';
import { DetailsToggleButton, useDetailsCollapse } from '@/components/form-page/details-toggle';
import { BarFigure, FormActionBar } from '@/components/form-page/form-action-bar';
import { useAddInvoice } from './use-add-invoice';
import { AddInvoiceFormHeader } from './AddInvoiceFormHeader';
import { AddInvoiceItemsTable } from './AddInvoiceItemsTable';
import { AddInvoiceProductSelector } from './AddInvoiceProductSelector';

/** The New Sales Invoice form, rendered as a page body (/sales/invoices/new). */
export function SalesInvoiceForm({ onLeave }: { onLeave: () => void }) {
  const queryClient = useQueryClient();
  const {
    customers, refetchCustomers,
    warehouses, fetchWarehouses,
    paymentMethods, fetchPaymentMethods,
    form, fields, remove,
    total, isSubmitting, isReferenceRequired,
    handleAddProduct, onSubmit,
  } = useAddInvoice({
    onClose: onLeave,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salesInvoices'] }),
  });

  const { detailsOpen, setDetailsOpen, toggleDetails } = useDetailsCollapse('si-details-collapsed');

  // Unsaved work is items or fields the user touched (the due date is derived by the hook).
  const isDirty = fields.length > 0 || Object.keys(form.formState.dirtyFields).length > 0;

  const shipping = Number(form.watch('shipping') || 0);
  const peso = (n: number) => `₱${n.toFixed(2)}`;

  return (
    <FormPageShell
      title="New Sales Invoice"
      subtitle={
        <>
          Reference: <span className="font-mono font-medium text-primary">Auto-generated</span>
        </>
      }
      isDirty={isDirty}
      onLeave={onLeave}
      backLabel="Back to sales invoices"
      discardTitle="Discard this sales invoice?"
    >
      {({ requestLeave }) => (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, () => setDetailsOpen(true))}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
              <AddInvoiceFormHeader
                hidden={!detailsOpen}
                form={form}
                customers={customers}
                refetchCustomers={refetchCustomers}
                warehouses={warehouses}
                paymentMethods={paymentMethods}
                isReferenceRequired={isReferenceRequired}
                fetchWarehouses={fetchWarehouses}
                fetchPaymentMethods={fetchPaymentMethods}
              />

              {/* `isolate` keeps the z-indexes below local, so they can't paint over portalled drawers. */}
              <div className="isolate flex-1 flex flex-col overflow-hidden bg-muted/5 px-4 pt-2 pb-0 relative">
                <div className="mb-2 relative z-[60] flex items-start gap-3">
                  <div className="max-w-3xl flex-1">
                    <AddInvoiceProductSelector
                      onSelectProduct={handleAddProduct}
                      warehouseId={form.watch('warehouse')}
                    />
                  </div>
                  <DetailsToggleButton
                    open={detailsOpen}
                    onToggle={toggleDetails}
                    summary={`${form.watch('customer')?.name || 'No customer'} · ${form.watch('invoiceDate')}`}
                  />
                </div>

                <AddInvoiceItemsTable form={form} fields={fields} remove={remove} />

                <FormActionBar
                  itemCount={fields.length}
                  onCancel={requestLeave}
                  submitLabel="Create Invoice"
                  isSubmitting={isSubmitting}
                  submitDisabled={fields.length === 0}
                >
                  <BarFigure label="Subtotal" value={peso(Number(total) - shipping)} />
                  <BarFigure label="Shipping" value={peso(shipping)} />
                  <BarFigure emphasis label="Total" value={peso(Number(total))} />
                </FormActionBar>
              </div>
            </div>
          </form>
        </Form>
      )}
    </FormPageShell>
  );
}
