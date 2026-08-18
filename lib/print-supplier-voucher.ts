import { format } from 'date-fns';

export interface SupplierVoucherData {
  id: string;
  supplierName: string;
  date: Date | string;
  amount: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  allocations?: {
    purchaseOrderId: string;
    amount: number;
    referenceNumber?: string;
  }[];
}

export const printSupplierVoucher = (data: SupplierVoucherData) => {
  const printWindow = window.open('', '', 'height=800,width=800');
  if (!printWindow) return;

  const paymentDate = new Date(data.date);

  printWindow.document.write('<html><head><title>Payment Voucher - ' + data.supplierName + '</title>');
  printWindow.document.write('<style>');
  printWindow.document.write(`
    body { font-family: sans-serif; padding: 40px; color: #333; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .company-info h1 { margin: 0; font-size: 24px; color: #000; }
    .company-info p { margin: 5px 0 0; font-size: 12px; color: #666; }
    .voucher-title { text-align: right; }
    .voucher-title h2 { margin: 0; font-size: 20px; color: #666; }
    .voucher-title p { margin: 5px 0 0; font-size: 14px; font-weight: bold; }
    
    .info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .info-box { border: 1px solid #ddd; padding: 15px; border-radius: 4px; }
    .info-item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
    .info-label { font-weight: bold; color: #555; }
    
    .allocation-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .allocation-table th { background-color: #f5f5f5; text-align: left; padding: 10px; border: 1px solid #ddd; font-size: 12px; }
    .allocation-table td { padding: 10px; border: 1px solid #ddd; font-size: 12px; }
    .text-right { text-align: right; }
    
    .total-section { margin-left: auto; width: 250px; margin-top: 20px; }
    .total-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .total-row.grand-total { border-bottom: 2px solid #333; font-weight: bold; font-size: 16px; }
    
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 60px; }
    .signature-line { border-top: 1px solid #333; text-align: center; padding-top: 10px; font-size: 12px; }
    
    .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #999; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  `);
  printWindow.document.write('</style></head><body>');

  printWindow.document.write(`
    <div class="header">
      <div class="company-info">
        <h1>ALON POS SYSTEM</h1>
        <p>Advanced Inventory & POS System</p>
      </div>
      <div class="voucher-title">
        <h2>PAYMENT VOUCHER</h2>
        <p>No: ${data.reference || data.id}</p>
      </div>
    </div>

    <div class="info-section">
      <div class="info-box">
        <div class="info-item">
          <span class="info-label">Paid To:</span>
          <span>${data.supplierName}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Date:</span>
          <span>${format(paymentDate, 'MMMM dd, yyyy')}</span>
        </div>
      </div>
      <div class="info-box">
        <div class="info-item">
          <span class="info-label">Payment Method:</span>
          <span>${data.paymentMethod}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Reference:</span>
          <span>${data.reference || '-'}</span>
        </div>
      </div>
    </div>

    ${data.allocations && data.allocations.length > 0 ? `
      <h3>Allocations</h3>
      <table class="allocation-table">
        <thead>
          <tr>
            <th>PO Reference</th>
            <th class="text-right">Allocated Amount</th>
          </tr>
        </thead>
        <tbody>
          ${data.allocations.map(alloc => `
            <tr>
              <td>${alloc.referenceNumber || alloc.purchaseOrderId}</td>
              <td class="text-right">₱${alloc.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : `
      <div style="margin-bottom: 30px; padding: 20px; border: 1px dashed #ccc; text-align: center; color: #666;">
        Lump sum payment - No specific PO allocations.
      </div>
    `}

    <div class="total-section">
      <div class="total-row grand-total">
        <span>TOTAL PAID:</span>
        <span>₱${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>

    ${data.notes ? `
      <div style="margin-top: 20px;">
        <span class="info-label" style="font-size: 12px;">Notes:</span>
        <p style="font-size: 12px; margin-top: 5px;">${data.notes}</p>
      </div>
    ` : ''}

    <div class="signatures">
      <div class="signature-line">Prepared By</div>
      <div class="signature-line">Received By / Date</div>
    </div>

    <div class="footer">
      System generated document. Printed on ${format(new Date(), 'PP p')}
    </div>
  `);

  printWindow.document.write('</body></html>');
  printWindow.document.close();
  
  // Wait for content to load before printing
  setTimeout(() => {
    printWindow.print();
  }, 500);
};
