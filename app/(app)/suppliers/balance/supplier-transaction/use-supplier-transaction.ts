'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { getSupplierTransactions, SupplierTransaction } from '../../actions';
import { printSupplierSOA, SOASupplierInfo } from '@/lib/print-supplier-soa';
import { getApiUrl, authFetch } from '@/lib/api-config';

export const PAGE_SIZE = 5;

export function useSupplierTransaction(
  supplierId: string,
  supplierName: string,
  isOpen: boolean,
  supplierInfo?: SOASupplierInfo,
) {
  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await getSupplierTransactions(supplierId);
      setTransactions(data);
    } catch (e) {
      console.error('Failed to load transactions', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTransactions();
      setCurrentPage(1);
    }
  }, [isOpen, supplierId]);

  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = !searchTerm ||
      txn.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.description.toLowerCase().includes(searchTerm.toLowerCase());
    const txnDate = new Date(txn.date);
    const matchesStart = !startDate || txnDate >= new Date(startDate);
    const matchesEnd = !endDate || txnDate <= new Date(endDate);
    return matchesSearch && matchesStart && matchesEnd;
  });

  const totalPages = Math.ceil(filteredTransactions.length / PAGE_SIZE);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const summary = filteredTransactions.reduce(
    (acc, txn) => {
      if (txn.type === 'PURCHASE') {
        acc.totalPurchases += txn.amount;
        acc.totalPaid += txn.paidAmount || 0;
      } else {
        acc.totalPaid += txn.amount;
      }
      return acc;
    },
    { totalPurchases: 0, totalPaid: 0 },
  );

  const currentBalance = summary.totalPurchases - summary.totalPaid;

  const handleExportCSV = () => {
    if (!transactions.length) return;
    const headers = ['PO Reference', 'PO Total', 'Date', 'Type', 'Description', 'Amount', 'Reference'];
    const rows: string[][] = [];
    transactions.forEach(txn => {
      rows.push([
        txn.reference || '',
        txn.type === 'PURCHASE' ? txn.amount.toFixed(2) : '',
        format(new Date(txn.date), 'yyyy-MM-dd'),
        txn.type,
        `"${txn.description.replace(/"/g, '""')}"`,
        txn.amount.toFixed(2),
        txn.reference || '',
      ]);
      txn.payments?.forEach(pay => {
        rows.push([
          txn.reference || '',
          '',
          format(new Date(pay.date), 'yyyy-MM-dd'),
          'ALLOCATED PAYMENT',
          `"Payment via ${pay.paymentMethod}"`,
          pay.amount.toFixed(2),
          pay.reference || '',
        ]);
      });
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${supplierName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    if (!transactions.length) return;
    const fmtN = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head>
        <title>Transaction History - ${supplierName}</title>
        <style>
          body{font-family:sans-serif;padding:20px}h1{margin-bottom:5px}p{color:#666;margin-bottom:20px}
          table{width:100%;border-collapse:collapse;margin-top:20px}
          th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:11px}
          th{background-color:#f2f2f2}.text-right{text-align:right}
          .po-row{background-color:#f9fafb;font-weight:bold}
          .payment-row{color:#666;font-style:italic}
        </style>
      </head><body>
        <h1>${supplierName}</h1>
        <p>Transaction History - Printed on ${format(new Date(), 'MMM dd, yyyy HH:mm')}</p>
        <table><thead><tr>
          <th>Date</th><th>Reference</th><th>Description</th>
          <th class="text-right">Total</th><th class="text-right">Paid</th><th class="text-right">Balance</th>
        </tr></thead><tbody>
          ${transactions.map(txn => `
            <tr class="po-row">
              <td>${format(new Date(txn.date), 'MMM dd, yyyy')}</td>
              <td>${txn.type === 'PURCHASE' ? txn.reference : (txn.reference || '-')}</td>
              <td>${txn.description}</td>
              <td class="text-right">₱${fmtN(txn.amount)}</td>
              <td class="text-right">₱${fmtN(txn.paidAmount || 0)}</td>
              <td class="text-right">₱${fmtN(txn.balance || 0)}</td>
            </tr>
            ${txn.payments?.map(pay => `
              <tr class="payment-row">
                <td style="padding-left:20px">${format(new Date(pay.date), 'MMM dd, yyyy')}</td>
                <td>${pay.reference || '-'}</td>
                <td>Allocation: ${pay.paymentMethod}</td>
                <td class="text-right">-</td>
                <td class="text-right">₱${fmtN(pay.amount)}</td>
                <td class="text-right">-</td>
              </tr>`).join('') || ''}
          `).join('')}
        </tbody></table>
        <script>window.onload=function(){window.print()}</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const handlePrintSOA = async () => {
    if (!filteredTransactions.length) return;
    try {
      const res = await authFetch(getApiUrl('/pos-settings'));
      const json = res.ok ? await res.json() : null;
      const biz = json?.data ?? {};

      printSupplierSOA({
        supplier: supplierInfo ?? { id: supplierId, name: supplierName },
        transactions: filteredTransactions,
        period: { from: startDate || undefined, to: endDate || undefined },
        business: {
          businessName: biz.businessName || supplierName,
          address: biz.address,
          contactNumber: biz.contactNumber,
          tin: biz.tin,
        },
      });
    } catch (err) {
      console.error('Failed to load POS settings for SOA:', err);
      // Fallback: print without business info
      printSupplierSOA({
        supplier: supplierInfo ?? { id: supplierId, name: supplierName },
        transactions: filteredTransactions,
        period: { from: startDate || undefined, to: endDate || undefined },
        business: { businessName: supplierName },
      });
    }
  };

  return {
    transactions, loading,
    searchTerm, setSearchTerm,
    startDate, setStartDate,
    endDate, setEndDate,
    currentPage, setCurrentPage,
    filteredTransactions, totalPages, paginatedTransactions,
    summary, currentBalance,
    handleExportCSV, handlePrint, handlePrintSOA,
  };
}
