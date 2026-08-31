
'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Form } from '@/components/ui/form';
import { PlusCircle, Loader2, ArrowRight } from 'lucide-react';
import type { Sale } from '@/lib/types';
import { useAddOrderData } from './use-add-order-data';
import { useAddOrderForm } from './use-add-order-form';
import { AddOrderProductSelector } from './AddOrderProductSelector';
import { AddOrderFormHeader } from './AddOrderFormHeader';
import { AddOrderItemsTable } from './AddOrderItemsTable';

interface AddSalesOrderDialogProps {
  initialData?: Sale;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
  hideTrigger?: boolean;
}

export function AddSalesOrderDialog({ initialData, isOpen: controlledIsOpen, onOpenChange: setControlledIsOpen, onSuccess, hideTrigger }: AddSalesOrderDialogProps = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = setControlledIsOpen || setInternalIsOpen;

  const data = useAddOrderData({ isOpen });
  const formHook = useAddOrderForm({
    paymentMethods: data.paymentMethods,
    salesPersons: data.salesPersons,
    customers: data.customers,
    initialData,
    isOpen,
    onClose: () => setIsOpen(false),
    onSuccess,
  });

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {!initialData && !hideTrigger && (
        <SheetTrigger asChild>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Sales Order
          </button>
        </SheetTrigger>
      )}
      <SheetContent side="top" className="h-screen w-full flex flex-col p-0 gap-0 bg-background border-none rounded-none shadow-none">
        <SheetHeader className="px-6 py-4 border-b bg-background space-y-1.5">
          <SheetTitle>New Sales Order</SheetTitle>
          <SheetDescription>
            {/* On a new order the number is allocated by the server at save
                time, so there is nothing to show yet. Editing an existing
                order still displays its assigned number. */}
            Create a sales transaction. Reference:{' '}
            <span className="font-mono font-medium text-primary">
              {formHook.form.watch('reference') || 'assigned on save'}
            </span>
          </SheetDescription>
        </SheetHeader>

        <Form {...formHook.form}>
          <form onSubmit={formHook.form.handleSubmit(formHook.onSubmit, formHook.onInvalid)} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">

              <AddOrderFormHeader
                form={formHook.form}
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

              <div className="flex-1 flex flex-col overflow-hidden bg-muted/5 p-4 relative">
                <div className="max-w-2xl mb-4 z-10">
                  <AddOrderProductSelector
                    onSelectProduct={formHook.handleAddProduct}
                    warehouseId={formHook.form.watch('warehouse')}
                  />
                </div>
                <AddOrderItemsTable
                  form={formHook.form}
                  fields={formHook.fields}
                  remove={formHook.remove}
                  total={formHook.total}
                />
              </div>
            </div>

            <SheetFooter className="p-4 bg-background border-t">
              <div className="flex items-center text-xs text-muted-foreground mr-auto">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Ready to process
                </span>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                Cancel
              </button>
              <button type="submit" disabled={formHook.isSubmitting || formHook.fields.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] w-40 font-semibold shadow-lg shadow-primary/20">
                {formHook.isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <>{initialData ? 'Update Order' : 'Create Order'} <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
