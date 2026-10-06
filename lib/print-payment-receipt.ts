import { format } from 'date-fns';
import { getApiUrl, authFetch } from '@/lib/api-config';

// Fetch the configured business name from POS settings so the receipt
// header reflects the actual business instead of a hardcoded value.
const fetchBusinessName = async (): Promise<string> => {
  try {
    const res = await authFetch(getApiUrl('/pos-settings'));
    if (!res.ok) return 'BUSINESS NAME';
    const settings = await res.json();
    const name = settings?.data?.businessName?.trim();
    return name || 'BUSINESS NAME';
  } catch {
    return 'BUSINESS NAME';
  }
};

export const printPaymentReceipt = async (
  payment: {
    id: string; // or reference
    customerName: string;
    date: Date | string;
    amount: number;
    paymentMethod: string;
    reference?: string;
  }
) => {
  // Open the window synchronously (within the click handler) to avoid popup blockers.
  const printWindow = window.open('', '', 'height=800,width=800');
  if (!printWindow) return;

  // Show a brief placeholder while we load the business name.
  printWindow.document.write('<html><head><title>Payment Receipt</title></head><body style="font-family: sans-serif; padding: 40px;">Preparing receipt…</body></html>');

  const businessName = await fetchBusinessName();
  const paymentDate = new Date(payment.date);

  printWindow.document.open();
  printWindow.document.write('<html><head><title>Payment Receipt ' + (payment.reference || payment.id) + '</title>');
  printWindow.document.write('<style>');
  printWindow.document.write(`
    body { font-family: sans-serif; padding: 40px; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 1px solid #ddd; padding-bottom: 20px; }
    .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
    .subtitle { color: #666; font-size: 14px; }
    .content { margin-bottom: 30px; font-size: 16px; line-height: 1.6; }
    .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .label { font-weight: bold; color: #555; }
    .value { text-align: right; }
    .amount { font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; border: 2px solid #000; padding: 10px; border-radius: 8px; }
    .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #888; }
  `);
  printWindow.document.write('</style></head><body>');

  printWindow.document.write(`
    <div class="header">
      <div class="title">OFFICIAL RECEIPT</div>
      <div class="subtitle">${businessName}</div>
    </div>

    <div class="content">
      <div class="row">
        <span class="label">Reference No:</span>
        <span class="value">${payment.reference || payment.id}</span>
      </div>
      <div class="row">
        <span class="label">Received From:</span>
        <span class="value">${payment.customerName}</span>
      </div>
       <div class="row">
        <span class="label">Date:</span>
        <span class="value">${format(paymentDate, 'PP p')}</span>
      </div>
      <div class="row">
        <span class="label">Payment Method:</span>
        <span class="value">${payment.paymentMethod}</span>
      </div>

      <div class="amount">
        <div style="font-size: 14px; color: #666; font-weight: normal; text-transform: uppercase; margin-bottom: 5px;">Amount Paid</div>
        ₱${payment.amount.toFixed(2)}
      </div>
    </div>

    <div class="footer">
      This is a system generated receipt.
    </div>
  `);

  printWindow.document.write('</body></html>');
  printWindow.document.close();
  printWindow.print();
};
