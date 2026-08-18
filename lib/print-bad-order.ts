import { format } from 'date-fns';
import { BadOrder } from './types';

export const printBadOrder = (data: BadOrder) => {
  const printWindow = window.open('', '', 'height=800,width=800');
  if (!printWindow) return;

  const reportDate = new Date(data.reportDate);

  printWindow.document.write('<html><head><title>Bad Order Report - ' + data.id.substring(0, 8).toUpperCase() + '</title>');
  printWindow.document.write('<style>');
  printWindow.document.write(`
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 40px; color: #333; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
    .company-info h1 { margin: 0; font-size: 24px; color: #000; letter-spacing: -0.025em; }
    .company-info p { margin: 5px 0 0; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.05em; }
    .report-title { text-align: right; }
    .report-title h2 { margin: 0; font-size: 20px; color: #e11d48; }
    .report-title p { margin: 5px 0 0; font-size: 14px; font-weight: bold; font-family: monospace; }
    
    .info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .info-box { border: 1px solid #e5e7eb; padding: 15px; border-radius: 8px; background-color: #f9fafb; }
    .info-item { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
    .info-label { font-weight: 600; color: #4b5563; }
    
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .items-table th { background-color: #f3f4f6; text-align: left; padding: 12px 10px; border: 1px solid #e5e7eb; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #4b5563; }
    .items-table td { padding: 12px 10px; border: 1px solid #e5e7eb; font-size: 12px; vertical-align: top; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .badge-destructive { background-color: #fee2e2; color: #b91c1c; }
    .badge-secondary { background-color: #f3f4f6; color: #1f2937; }
    .badge-default { background-color: #dcfce7; color: #15803d; }
    
    .total-section { margin-left: auto; width: 300px; margin-top: 20px; }
    .total-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .total-row.grand-total { border-bottom: 2px solid #333; font-weight: bold; font-size: 18px; color: #e11d48; }
    
    .notes-section { margin-top: 30px; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .notes-title { font-size: 12px; font-weight: 600; color: #4b5563; margin-bottom: 8px; text-transform: uppercase; }
    .notes-content { font-size: 13px; color: #374151; white-space: pre-wrap; }
    
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; margin-top: 80px; }
    .signature-line { border-top: 1px solid #9ca3af; text-align: center; padding-top: 10px; font-size: 11px; color: #6b7280; }
    
    .footer { margin-top: 60px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 20px; }
    
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
      .info-box { background-color: transparent !important; }
    }
  `);
  printWindow.document.write('</style></head><body>');

  const reasonBadgeClass = (reason: string) => {
    switch (reason) {
      case 'Damaged':
      case 'Defective':
        return 'badge badge-destructive';
      case 'Expired':
        return 'badge badge-secondary';
      default:
        return 'badge badge-default';
    }
  };

  printWindow.document.write(`
    <div class="header">
      <div class="company-info">
        <h1>ALON POS SYSTEM</h1>
        <p>Bad Order & Inventory Control</p>
      </div>
      <div class="report-title">
        <h2>BAD ORDER REPORT</h2>
        <p>#${data.id.toUpperCase()}</p>
      </div>
    </div>

    <div class="info-section">
      <div class="info-box">
        <div class="info-item">
          <span class="info-label">Supplier:</span>
          <span>${data.supplierName || 'Internal / Not Specified'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Report Date:</span>
          <span>${format(reportDate, 'MMMM dd, yyyy')}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Status:</span>
          <span>${data.status}</span>
        </div>
      </div>
      <div class="info-box">
        <div class="info-item">
          <span class="info-label">Reported By:</span>
          <span>${data.reportedBy || '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Purchase Order:</span>
          <span>${data.purchaseOrderId || 'N/A'}</span>
        </div>
        <div class="info-item" style="opacity: 0;">-</div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Product Name</th>
          <th class="text-center">Qty</th>
          <th class="text-right">Unit Cost</th>
          <th class="text-right">Total Cost</th>
          <th class="text-center">Reason</th>
          <th>Description / Notes</th>
        </tr>
      </thead>
      <tbody>
        ${data.items.map(item => `
          <tr>
            <td>
              <div style="font-weight: 600;">${item.productName}</div>
              <div style="font-size: 10px; color: #6b7280; font-family: monospace;">ID: ${item.productId}</div>
            </td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-right">₱${item.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="text-right">₱${(item.quantity * item.cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td class="text-center">
              <span class="${reasonBadgeClass(item.reason)}">${item.reason}</span>
            </td>
            <td>${item.description || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="total-section">
      <div class="total-row grand-total">
        <span>TOTAL VALUE:</span>
        <span>₱${data.totalAffectedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>

    ${data.notes ? `
      <div class="notes-section">
        <div class="notes-title">General Notes</div>
        <div class="notes-content">${data.notes}</div>
      </div>
    ` : ''}

    ${data.resolutionNotes ? `
      <div class="notes-section" style="border-color: #d1d5db; background-color: #f3f4f6;">
        <div class="notes-title">Resolution / Action Taken</div>
        <div class="notes-content">${data.resolutionNotes}</div>
      </div>
    ` : ''}

    <div class="signatures">
      <div class="signature-line">
        <div style="margin-bottom: 40px;"></div>
        Prepared By
      </div>
      <div class="signature-line">
        <div style="margin-bottom: 40px;"></div>
        Quality Control / Manager
      </div>
      <div class="signature-line">
        <div style="margin-bottom: 40px;"></div>
        Supplier Representative / Date
      </div>
    </div>

    <div class="footer">
      This is an official control document for inventory adjustments and supplier returns.<br>
      Printed on ${format(new Date(), 'MMMM dd, yyyy h:mm a')}
    </div>
  `);

  printWindow.document.write('</body></html>');
  printWindow.document.close();
  
  setTimeout(() => {
    printWindow.print();
  }, 500);
};
