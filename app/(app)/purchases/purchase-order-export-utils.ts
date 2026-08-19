import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

export async function exportToCSV(data: any[], fileName: string) {
  const csvData = data.map(order => ({
    'Reference No': order.referenceNumber || order.id.substring(0, 8),
    'Supplier': order.supplierName,
    'Date': format(new Date(order.date), 'yyyy-MM-dd'),
    'Total': order.total.toFixed(2),
    'Shipping': order.shippingFee.toFixed(2),
    'VAT': order.vatAmount.toFixed(2),
    'Grand Total': (order.total + order.shippingFee + order.vatAmount).toFixed(2),
    'Status': order.status,
    'Ordered By': order.orderedBy || '-',
  }));

  const csv = Papa.unparse(csvData);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportToPDF(data: any[], fileName: string, profile: any) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(18);
  doc.text(profile?.businessName || 'ALON POS SYSTEM', 14, 20);
  doc.setFontSize(12);
  doc.text('Purchase Orders Report', 14, 30);
  doc.setFontSize(10);
  doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 38);
  
  // Simple Table Header
  const startY = 50;
  doc.setFont('helvetica', 'bold');
  doc.text('Ref No', 14, startY);
  doc.text('Supplier', 40, startY);
  doc.text('Date', 90, startY);
  doc.text('Total', 130, startY);
  doc.text('Status', 170, startY);
  doc.line(14, startY + 2, 196, startY + 2);
  
  // Table Rows
  doc.setFont('helvetica', 'normal');
  let currentY = startY + 10;
  const rowHeight = 8;
  const pageHeight = doc.internal.pageSize.height;

  data.forEach((order, index) => {
    if (currentY > pageHeight - 20) {
      doc.addPage();
      currentY = 20;
      // Repeat Header on new page if needed
    }
    
    doc.text(order.referenceNumber || order.id.substring(0, 8), 14, currentY);
    doc.text(order.supplierName.substring(0, 20), 40, currentY);
    doc.text(format(new Date(order.date), 'yyyy-MM-dd'), 90, currentY);
    doc.text(`P${order.total.toFixed(2)}`, 130, currentY);
    doc.text(order.status, 170, currentY);
    
    currentY += rowHeight;
  });

  doc.save(`${fileName}.pdf`);
}
