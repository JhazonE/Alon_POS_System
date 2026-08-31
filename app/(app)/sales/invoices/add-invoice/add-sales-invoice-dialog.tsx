'use client';
import {
  Sheet, SheetContent, SheetDescription,
  SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { Form } from '@/components/ui/form';
import { PlusCircle, Loader2, ArrowRight } from 'lucide-react';
import { useAddInvoice } from './use-add-invoice';
import { AddInvoiceFormHeader } from './AddInvoiceFormHeader';
import { AddInvoiceItemsTable } from './AddInvoiceItemsTable';

interface AddSalesInvoiceDialogProps { onSuccess?: () => void }

export function AddSalesInvoiceDialog({ onSuccess }: AddSalesInvoiceDialogProps = {}) {
  const {
    isOpen, setIsOpen,
    customers, refetchCustomers,
    warehouses, fetchWarehouses,
    paymentMethods, fetchPaymentMethods,
    form, fields, remove,
    total, isSubmitting, isReferenceRequired,
    handleAddProduct, onSubmit,
  } = useAddInvoice({ onSuccess });

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
          <PlusCircle className="mr-2 h-4 w-4" />
          New Sales Invoice
        </button>
      </SheetTrigger>
      <SheetContent side="top" className="h-screen w-full flex flex-col p-0 gap-0 bg-background border-none rounded-none shadow-none">
        <SheetHeader className="px-6 py-4 border-b bg-background space-y-1.5">
          <SheetTitle>New Sales Invoice</SheetTitle>
          <SheetDescription>
            Create a transaction. Reference: <span className="font-mono font-medium text-primary">Auto-generated</span>
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">

              <AddInvoiceFormHeader
                form={form}
                customers={customers}
                refetchCustomers={refetchCustomers}
                warehouses={warehouses}
                paymentMethods={paymentMethods}
                isReferenceRequired={isReferenceRequired}
                fetchWarehouses={fetchWarehouses}
                fetchPaymentMethods={fetchPaymentMethods}
              />

              <AddInvoiceItemsTable
                form={form}
                fields={fields}
                remove={remove}
                total={total}
                handleAddProduct={handleAddProduct}
              />

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
              <button
                type="submit"
                disabled={isSubmitting || fields.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] w-40 font-semibold shadow-lg shadow-primary/20"
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
                ) : (
                  <>Create Invoice <ArrowRight className="ml-2 h-4 w-4" /></>
                )}
              </button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
