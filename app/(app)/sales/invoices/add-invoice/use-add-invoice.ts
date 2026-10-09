'use client';

import { useAddInvoiceData } from './use-add-invoice-data';
import { useAddInvoiceForm } from './use-add-invoice-form';

/** Data + form state of the New Sales Invoice page (always "open": it is a page, not a drawer). */
export function useAddInvoice({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const data = useAddInvoiceData({ isOpen: true });
  const formHook = useAddInvoiceForm({ paymentMethods: data.paymentMethods, onClose, onSuccess });

  return {
    ...data,
    ...formHook,
  };
}
