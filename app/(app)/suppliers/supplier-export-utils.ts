import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

export async function exportToCSV(data: any[], fileName: string) {
  const csvData = data.map(s => ({
    'Name': s.name,
    'Company': s.company || '-',
    'TIN': s.tin || '-',
    'Contact No': s.contactNumber || '-',
    'Email': s.email || '-',
    'Address': s.address || '-',
    'Payment Terms': s.paymentTerms || '-',
    'Order Schedule': s.orderSchedule || '-',
    'Total Purchases': s.totalPurchases.toFixed(2),
    'Total Payments': s.totalPayments.toFixed(2),
    'Balance': s.balance.toFixed(2)
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
  const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
  
  // Header
  doc.setFontSize(18);
  doc.text(profile?.businessName || 'ALON POS SYSTEM', 14, 20);
  doc.setFontSize(12);
  doc.text('Suppliers List Report', 14, 30);
  doc.setFontSize(10);
  doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 38);
  
  // Table Header
  const startY = 50;
  doc.setFont('helvetica', 'bold');
  doc.text('Name', 14, startY);
  doc.text('Company', 60, startY);
  doc.text('Contact No', 110, startY);
  doc.text('Terms', 150, startY);
  doc.text('Purchases', 190, startY);
  doc.text('Payments', 230, startY);
  doc.text('Balance', 270, startY);
  doc.line(14, startY + 2, 285, startY + 2);
  
  // Table Rows
  doc.setFont('helvetica', 'normal');
  let currentY = startY + 10;
  const rowHeight = 8;
  const pageHeight = doc.internal.pageSize.height;

  data.forEach((s) => {
    if (currentY > pageHeight - 20) {
      doc.addPage();
      currentY = 20;
      // Header on new page
      doc.setFont('helvetica', 'bold');
      doc.text('Name', 14, currentY);
      doc.text('Company', 60, currentY);
      doc.text('Contact No', 110, currentY);
      doc.text('Terms', 150, currentY);
      doc.text('Purchases', 190, currentY);
      doc.text('Payments', 230, currentY);
      doc.text('Balance', 270, currentY);
      doc.line(14, currentY + 2, 285, currentY + 2);
      doc.setFont('helvetica', 'normal');
      currentY += 10;
    }
    
    doc.text(s.name.substring(0, 25), 14, currentY);
    doc.text((s.company || '-').substring(0, 25), 60, currentY);
    doc.text(s.contactNumber || '-', 110, currentY);
    doc.text(s.paymentTerms || '-', 150, currentY);
    doc.text(`${s.totalPurchases.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 190, currentY);
    doc.text(`${s.totalPayments.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 230, currentY);
    doc.text(`${s.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 270, currentY);
    
    currentY += rowHeight;
  });

  doc.save(`${fileName}.pdf`);
}
