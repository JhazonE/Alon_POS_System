'use client';

import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Printer, X, Download, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';

interface ApprovalItem {
  id: string;
  transaction_type: string;
  transaction_data: any;
  status: 'Pending' | 'Approved' | 'Rejected';
  current_step: number;
  created_by: string;
  requester_name: string;
  requester_email: string;
  created_at: string;
  updated_at: string;
  currentStepRole: string;
  currentStepRoleId: string | null;
  history: any[];
  workflow: any[];
}

interface PrintPreviewDialogProps {
  item: ApprovalItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrintPreviewDialog({ item, open, onOpenChange }: PrintPreviewDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!item) return null;

  const PRINT_STYLES = `
    @page { size: portrait; margin: 15mm; }
    body { font-family: "Inter", "Segoe UI", Helvetica, Arial, sans-serif; color: #000; line-height: 1.4; font-size: 11pt; margin: 0; padding: 20px; }
    .document-container { max-width: 800px; margin: 0 auto; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .company-title { margin: 0; font-size: 20pt; font-weight: 800; text-transform: uppercase; }
    .doc-type { margin: 0; font-size: 14pt; font-weight: 600; color: #444; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 25px; }
    .meta-table { width: 100%; border-collapse: collapse; }
    .meta-table td { padding: 4px 0; vertical-align: top; }
    .label { font-weight: 600; font-size: 9pt; color: #555; text-transform: uppercase; width: 130px; }
    .value { font-weight: 500; }
    .id-value { font-family: monospace; font-weight: 700; font-size: 10pt; }
    .section-title { font-size: 10pt; font-weight: 700; text-transform: uppercase; border-bottom: 1pt solid #000; padding-bottom: 5px; margin: 25px 0 12px 0; }
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .data-table th { text-align: left; padding: 8px; border-bottom: 1.5pt solid #000; font-size: 9pt; text-transform: uppercase; font-weight: 700; }
    .data-table td { padding: 8px; border-bottom: 0.5pt solid #eee; }
    .audit-trail { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .audit-trail th { text-align: left; padding: 4px 8px; border-bottom: 1pt solid #000; font-size: 8pt; color: #666; text-transform: uppercase; }
    .audit-trail td { padding: 6px 8px; border-bottom: 0.5pt solid #f5f5f5; font-size: 9pt; }
    .numeric { text-align: right; font-family: monospace; }
    .signatures-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; page-break-inside: avoid; }
    .sig-item { display: flex; flex-direction: column; }
    .sig-name { font-size: 10pt; min-height: 45px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 5px; border-bottom: 1.5pt solid #000; font-weight: 700; text-align: center; }
    .sig-label { font-size: 8pt; color: #555; text-align: center; margin-top: 5px; text-transform: uppercase; font-weight: 600; }
    .footer { border-top: 0.5pt solid #eee; padding-top: 10px; font-size: 8pt; color: #999; text-align: center; margin-top: 50px; }
    .barcode-value { font-family: monospace; font-size: 13pt; font-weight: 700; color: #000; margin-top: 2px; display: block; }
    @media print {
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
  `;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><title>Print</title><style>${PRINT_STYLES}</style></head><body>${printContent.innerHTML}</body></html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 2000);
    }, 600);
  };

  const formattedType = item.transaction_type.replace(/_/g, ' ');
  const createdAt = new Date(item.created_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-fit min-w-[300px] max-w-[95vw] md:max-w-[950px] max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white text-black">
        <DialogHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0 bg-secondary/10">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            Print Preview
          </DialogTitle>
          <DialogDescription className="sr-only">Preview and print the approval transaction document</DialogDescription>
          <div className="flex items-center gap-2 pr-6">
            <button onClick={handlePrint} className="inline-flex items-center justify-center rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-2 font-bold border-primary/20 text-primary hover:bg-primary/5">
              <Printer className="h-4 w-4" />
              Print Document
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 md:p-8 bg-zinc-100/50">
          <div 
            ref={printRef}
            className="bg-white shadow-2xl mx-auto p-[15mm] min-h-[297mm] w-[210mm] document-container text-black scale-[0.9] origin-top lg:scale-100 shrink-0"
            style={{ 
              fontFamily: '"Inter", "Segoe UI", Helvetica, Arial, sans-serif',
              lineHeight: '1.4'
            }}
          >
            {/* Header */}
            <div className="doc-header flex justify-between items-end border-b-2 border-black pb-2 mb-5">
              <div>
                <h1 className="company-title m-0 text-3xl font-black uppercase tracking-tighter">Alon POS</h1>
              </div>
              <div>
                <h2 className="doc-type m-0 text-xl font-semibold text-zinc-600">TRANSACTION AUTHORIZATION</h2>
              </div>
            </div>

            {/* Meta Grid */}
            <div className="meta-grid grid grid-cols-2 gap-10 mb-6">
              <table className="meta-table w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1">Reference ID</td>
                    <td className="value id-value font-mono font-bold text-[10pt] py-1">{item.id.toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1">Transaction</td>
                    <td className="value font-medium py-1">{formattedType}</td>
                  </tr>
                  <tr>
                    <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1">Status</td>
                    <td className="value py-1">
                        <span className="font-bold uppercase text-[8pt] border border-black px-1.5 py-0.5">
                            {item.status.toUpperCase()}
                        </span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table className="meta-table w-full border-collapse">
                <tbody>
                  <tr>
                    <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1">Date Requested</td>
                    <td className="value font-medium py-1">{format(createdAt, 'yyyy-MM-dd HH:mm')}</td>
                  </tr>
                  <tr>
                    <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1">Requester</td>
                    <td className="value font-medium py-1">{item.requester_name || 'SYSTEM ADMIN'}</td>
                  </tr>
                  <tr>
                    <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1">Contact</td>
                    <td className="value font-medium py-1 text-zinc-600 text-[9pt]">{item.requester_email || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="section-title text-[10pt] font-bold uppercase border-b border-zinc-300 pb-1 mb-3 mt-6">Record Details</div>
            
            {/* Transaction Specific Tables */}
            {item.transaction_type === 'BAD_ORDER' && (
              <>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="p-3 bg-red-50/30 border border-red-200 rounded-lg">
                    <div className="text-[8pt] font-bold text-red-800 uppercase mb-1">Source Warehouse</div>
                    <div className="text-[10pt] font-bold">{item.transaction_data.warehouse_name || item.transaction_data.warehouseName || 'Main Warehouse'}</div>
                  </div>
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                    <div className="text-[8pt] font-bold text-zinc-500 uppercase mb-1">Shelf Location</div>
                    <div className="text-[10pt] font-bold">{item.transaction_data.shelf_name || item.transaction_data.shelfName || 'General Shelf'}</div>
                  </div>
                </div>

                <table className="data-table w-full border-collapse mb-5">
                  <thead>
                    <tr className="border-b-2 border-black text-left">
                      <th className="p-2 text-[9pt] font-bold uppercase w-[40%]">Product</th>
                      <th className="p-2 text-[9pt] font-bold uppercase">SKU / Barcode</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Qty</th>
                      <th className="p-2 text-[9pt] font-bold uppercase">Reason</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(item.transaction_data.items && item.transaction_data.items.length > 0) ? (
                      item.transaction_data.items.map((it: any, idx: number) => (
                        <tr key={idx} className="border-b border-zinc-100">
                          <td className="p-2">
                            <div className="text-[10pt] font-bold">{it.productName || 'Unknown Product'}</div>
                            <div className="text-[8pt] text-zinc-500 italic">{it.unitOfMeasure || ''}</div>
                          </td>
                          <td className="p-2">
                            <div className="font-mono text-[8pt] text-zinc-600">{it.productSku || it.sku || '-'}</div>
                            <div className="font-mono font-bold text-[10pt]">{it.productBarcode || it.barcode || '-'}</div>
                          </td>
                          <td className="p-2 text-[11pt] font-black text-right text-red-600">{it.quantity}</td>
                          <td className="p-2 text-[9pt] text-zinc-600">{it.reason || '-'}</td>
                          <td className="p-2 text-[10pt] font-mono text-right">₱{(Number(it.cost) || 0).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-b border-zinc-100">
                        <td className="p-2">
                          <div className="text-[10pt] font-bold">{item.transaction_data.productName || 'Unknown Product'}</div>
                          <div className="text-[8pt] text-zinc-500 italic">{item.transaction_data.unitOfMeasure || ''}</div>
                        </td>
                        <td className="p-2">
                          <div className="font-mono text-[8pt] text-zinc-600">{item.transaction_data.productSku || '-'}</div>
                          <div className="font-mono font-bold text-[10pt]">{item.transaction_data.productBarcode || '-'}</div>
                        </td>
                        <td className="p-2 text-[11pt] font-black text-right text-red-600">{item.transaction_data.quantity}</td>
                        <td className="p-2 text-[9pt] text-zinc-600">{item.transaction_data.reason || '-'}</td>
                        <td className="p-2 text-[10pt] font-mono text-right">₱{(Number(item.transaction_data.cost) || 0).toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {item.transaction_data.notes && (
                  <div className="remarks p-3 bg-zinc-50 border border-zinc-200 rounded text-[9pt] mb-4">
                    <div className="font-bold uppercase text-[7pt] text-zinc-500 mb-1">Notes</div>
                    <div className="italic">{item.transaction_data.notes}</div>
                  </div>
                )}
                <div className="flex justify-end mt-4">
                  <div className="text-right">
                    <div className="text-[8pt] font-bold text-zinc-400 uppercase">Estimated Loss Value</div>
                    <div className="text-lg font-black">₱{(Number(item.transaction_data.totalAffectedValue) || 0).toLocaleString()}</div>
                  </div>
                </div>
              </>
            )}

            {item.transaction_type === 'STOCK_ADJUSTMENT' && (
              <>
                <table className="data-table w-full border-collapse mb-5">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="text-left p-2 text-[9pt] font-bold uppercase w-[35%]">Product Name</th>
                      <th className="text-left p-2 text-[9pt] font-bold uppercase">SKU / Barcode</th>
                      <th className="text-right p-2 text-[9pt] font-bold uppercase">Change</th>
                      <th className="text-right p-2 text-[9pt] font-bold uppercase">Prev Bal</th>
                      <th className="text-right p-2 text-[9pt] font-bold uppercase">New Bal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-zinc-100">
                      <td className="p-2 text-[10pt] font-medium">{item.transaction_data.productName || item.transaction_data.name || 'Unknown Product'}</td>
                      <td className="p-2 text-[10pt]">
                        <div className="font-mono font-bold text-slate-600 text-[9pt]">
                          {item.transaction_data.productSku || item.transaction_data.sku || '-'}
                        </div>
                        <div className="barcode-value font-mono font-bold text-black text-[12pt] mt-1">
                          {item.transaction_data.productBarcode || item.transaction_data.barcode || '-'}
                        </div>
                      </td>
                      <td className="p-2 text-[10pt] font-mono text-right font-bold">
                        {(Number(item.transaction_data.quantity) || 0) > 0 ? '+' : ''}{item.transaction_data.quantity || 0}
                      </td>
                      <td className="p-2 text-[10pt] font-mono text-right">{item.transaction_data.currentStock ?? '-'}</td>
                      <td className="p-2 text-[10pt] font-mono text-right font-bold text-blue-700">
                        {item.transaction_data.currentStock !== undefined 
                            ? (Number(item.transaction_data.currentStock) + Number(item.transaction_data.quantity || 0)) 
                            : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="remarks italic text-zinc-700 text-[10pt]">
                    <strong>Reason for Adjustment:</strong> {item.transaction_data.reason || 'Not documented'}
                </div>
              </>
            )}

            {item.transaction_type === 'STOCK_TRANSFER' && (
              <>
                <div className="flex gap-4 mb-6">
                  <div className="flex-1 p-3 bg-amber-50/30 border border-amber-200 rounded-lg">
                    <div className="text-[8pt] font-bold text-amber-800 uppercase mb-1">Source Warehouse</div>
                    <div className="text-[11pt] font-black">{item.transaction_data.fromWarehouseName || item.transaction_data.sourceWarehouseId || 'N/A'}</div>
                  </div>
                  <div className="flex items-center">
                    <ArrowRight className="h-5 w-5 text-zinc-400" />
                  </div>
                  <div className="flex-1 p-3 bg-emerald-50/30 border border-emerald-200 rounded-lg text-right">
                    <div className="text-[8pt] font-bold text-emerald-800 uppercase mb-1">Destination Warehouse</div>
                    <div className="text-[11pt] font-black">{item.transaction_data.toWarehouseName || item.transaction_data.targetWarehouseId || 'N/A'}</div>
                  </div>
                </div>

                <table className="data-table w-full border-collapse mb-5">
                  <thead>
                    <tr className="border-b-2 border-black text-left">
                      <th className="p-2 text-[9pt] font-bold uppercase w-[45%]">Product Information</th>
                      <th className="p-2 text-[9pt] font-bold uppercase">SKU / Barcode</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.transaction_data.items ? (
                      item.transaction_data.items.map((it: any, idx: number) => (
                        <tr key={idx} className="border-b border-zinc-100">
                          <td className="p-2">
                            <div className="text-[10pt] font-bold">{it.productName || it.name}</div>
                            <div className="text-[8pt] text-zinc-500 italic">{it.unitOfMeasure || it.uom || ''}</div>
                          </td>
                          <td className="p-2">
                            <div className="font-mono text-[8pt] text-zinc-600">{it.sku || it.productSku || '-'}</div>
                            <div className="font-mono font-bold text-[10pt]">{it.barcode || it.productBarcode || '-'}</div>
                          </td>
                          <td className="p-2 text-[11pt] font-black text-right">{it.quantity}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-b border-zinc-100">
                        <td className="p-2">
                          <div className="text-[10pt] font-bold">{item.transaction_data.productName}</div>
                          <div className="text-[8pt] text-zinc-500 italic">{item.transaction_data.unitOfMeasure || ''}</div>
                        </td>
                        <td className="p-2">
                          <div className="font-mono text-[8pt] text-zinc-600">{item.transaction_data.productSku || item.transaction_data.sku || '-'}</div>
                          <div className="font-mono font-bold text-[10pt]">{item.transaction_data.productBarcode || item.transaction_data.barcode || '-'}</div>
                        </td>
                        <td className="p-2 text-[11pt] font-black text-right">{item.transaction_data.quantity}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {item.transaction_data.notes && (
                  <div className="p-3 bg-zinc-50 border-l-4 border-zinc-300 italic text-zinc-700 text-[9pt]">
                    <strong>Transfer Notes:</strong> {item.transaction_data.notes}
                  </div>
                )}
              </>
            )}

            {item.transaction_type === 'STOCK_COUNT' && (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-indigo-50/30 border border-indigo-200 rounded-lg">
                    <div className="text-[8pt] font-bold text-indigo-800 uppercase mb-1">Inventory Count Reference</div>
                    <div className="text-[10pt] font-bold">{item.transaction_data.name}</div>
                  </div>
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                    <div className="text-[8pt] font-bold text-zinc-500 uppercase mb-1">Warehouse / Shelf</div>
                    <div className="text-[10pt] font-bold">
                      {item.transaction_data.warehouseName || 'All Warehouses'} 
                      {item.transaction_data.shelfName ? ` / ${item.transaction_data.shelfName}` : ' / All Shelves'}
                    </div>
                  </div>
                </div>
                <table className="data-table w-full border-collapse mb-5">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="p-2 text-[9pt] font-bold uppercase w-[35%]">Product Name</th>
                      <th className="p-2 text-[9pt] font-bold uppercase">SKU / Barcode</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Expected</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Counted</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Variance</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(item.transaction_data.items || []).map((it: any, idx: number) => {
                      const variance = (Number(it.counted_quantity) || 0) - (Number(it.snapshot_quantity) || 0);
                      return (
                        <tr key={idx} className="border-b border-zinc-100">
                          <td className="p-2 text-[10pt] font-medium">{it.productName || it.name}</td>
                          <td className="p-2 text-[10pt]">
                            <div className="font-mono font-bold text-slate-600 text-[8pt]">{it.productSku || it.sku || '-'}</div>
                            <div className="barcode-value font-mono font-bold text-black text-[11pt] mt-0.5">{it.productBarcode || it.barcode || '-'}</div>
                          </td>
                          <td className="p-2 text-[10pt] text-right">{it.snapshot_quantity}</td>
                          <td className="p-2 text-[10pt] text-right font-bold">{it.counted_quantity}</td>
                          <td className={`p-2 text-[10pt] text-right font-bold ${variance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {variance > 0 ? `+${variance}` : variance}
                          </td>
                          <td className={`p-2 text-[10pt] text-right font-bold ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-emerald-600' : ''}`}>
                            {formatCurrency(variance * (Number(it.product_cost) || 0))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(() => {
                  const totalVarianceValue = (item.transaction_data.items || []).reduce((sum: number, it: any) => {
                    const v = (Number(it.counted_quantity) || 0) - (Number(it.snapshot_quantity) || 0);
                    return sum + v * (Number(it.product_cost) || 0);
                  }, 0);
                  return (
                    <div className="flex justify-end mb-5">
                      <div className="text-right">
                        <div className="text-[8pt] font-bold text-zinc-500 uppercase">Total Variance Value</div>
                        <div className={`text-[12pt] font-bold ${totalVarianceValue < 0 ? 'text-red-600' : totalVarianceValue > 0 ? 'text-emerald-600' : ''}`}>
                          {formatCurrency(totalVarianceValue)}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {item.transaction_type.toUpperCase() === 'PURCHASE_ORDER' && (
              <>
                <table className="meta-table w-full border-collapse mb-4 p-3 bg-zinc-50 border border-zinc-200 rounded">
                  <tbody>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Supplier</td>
                      <td className="value font-bold py-1">{item.transaction_data.supplierName || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">PO Reference</td>
                      <td className="value font-mono font-bold py-1">
                        {item.transaction_data.reference || item.transaction_data.referenceNumber || 'N/A'}
                      </td>
                    </tr>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Warehouse</td>
                      <td className="value font-bold py-1">
                        {item.transaction_data.warehouseName || item.transaction_data.receiveToWarehouseName || 'N/A'}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <table className="data-table w-full border-collapse mb-5">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="p-2 text-[9pt] font-bold uppercase w-[35%]">Product Name</th>
                      <th className="p-2 text-[9pt] font-bold uppercase">SKU / Barcode</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Qty</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Unit Cost</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Extended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(item.transaction_data.items || []).map((it: any, idx: number) => (
                      <tr key={idx} className="border-b border-zinc-100">
                        <td className="p-2 text-[10pt] font-medium">{it.productName || it.name || it.productId}</td>
                        <td className="p-2 text-[10pt]">
                          <div className="font-mono font-bold text-slate-600 text-[8pt]">{it.productSku || it.sku || '-'}</div>
                          <div className="barcode-value font-mono font-bold text-black text-[11pt] mt-0.5">{it.productBarcode || it.barcode || '-'}</div>
                        </td>
                        <td className="p-2 text-[10pt] font-mono text-right font-bold text-blue-700">{it.quantity}</td>
                        <td className="p-2 text-[10pt] font-mono text-right">₱{(it.cost || 0).toLocaleString()}</td>
                        <td className="p-2 text-[10pt] font-mono text-right font-bold">₱{(it.subtotal || (it.cost * it.quantity) || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end font-bold text-[11pt] mt-3 uppercase tracking-tight">
                  <span>Grand Total: ₱{(Number(item.transaction_data.total || item.transaction_data.grandTotal) || 0).toLocaleString()}</span>
                </div>
              </>
            )}

            {item.transaction_type.toUpperCase() === 'RECEIVE_PO' && (
              <>
                <table className="meta-table w-full border-collapse mb-4 p-3 bg-zinc-50 border border-zinc-200 rounded">
                  <tbody>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Supplier</td>
                      <td className="value font-bold py-1">{item.transaction_data.supplierName || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">PO Reference</td>
                      <td className="value font-mono font-bold py-1">
                        {item.transaction_data.referenceNumber || item.transaction_data.id || item.transaction_data.purchaseOrderId}
                      </td>
                    </tr>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Warehouse</td>
                      <td className="value font-bold py-1">
                        {item.transaction_data.warehouseName || item.transaction_data.receiveToWarehouseName || 'N/A'}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <table className="data-table w-full border-collapse mb-5">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="p-2 text-[9pt] font-bold uppercase w-[35%]">Product Name</th>
                      <th className="p-2 text-[9pt] font-bold uppercase">SKU / Barcode</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Qty</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Unit Cost</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Extended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(item.transaction_data.receivedItems || []).map((it: any, idx: number) => (
                      <tr key={idx} className="border-b border-zinc-100">
                        <td className="p-2 text-[10pt] font-medium">{it.productName || it.name || it.productId}</td>
                        <td className="p-2 text-[10pt]">
                          <div className="font-mono font-bold text-slate-600 text-[8pt]">{it.productSku || it.sku || '-'}</div>
                          <div className="barcode-value font-mono font-bold text-black text-[11pt] mt-0.5">{it.productBarcode || it.barcode || it.barcode || '-'}</div>
                        </td>
                        <td className="p-2 text-[10pt] font-mono text-right font-bold text-blue-700">{it.quantity}</td>
                        <td className="p-2 text-[10pt] font-mono text-right">₱{(it.cost || 0).toLocaleString()}</td>
                        <td className="p-2 text-[10pt] font-mono text-right font-bold">₱{(it.subtotal || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end font-bold text-[11pt] mt-3 uppercase tracking-tight">
                  <span>Received Total: ₱{(Number(item.transaction_data.receivedTotal || item.transaction_data.total || item.transaction_data.grandTotal) || 0).toLocaleString()}</span>
                </div>
              </>
            )}

            {item.transaction_type.toUpperCase() === 'REPACKAGING' && (
              <>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div className="p-3 bg-teal-50/30 border border-teal-200 rounded-lg">
                    <div className="text-[8pt] font-bold text-teal-800 uppercase mb-1">Source Product</div>
                    <div className="text-[10pt] font-bold">{item.transaction_data.sourceProductName || item.transaction_data.productName || '—'}</div>
                  </div>
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                    <div className="text-[8pt] font-bold text-zinc-500 uppercase mb-1">Target Product</div>
                    <div className="text-[10pt] font-bold">{item.transaction_data.targetProductName || '—'}</div>
                  </div>
                </div>
                <table className="meta-table w-full border-collapse mb-4 p-3 bg-zinc-50 border border-zinc-200 rounded">
                  <tbody>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Warehouse</td>
                      <td className="value font-bold py-1">{item.transaction_data.warehouseName || '—'}</td>
                    </tr>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Quantity</td>
                      <td className="value font-bold py-1">{item.transaction_data.quantity || item.transaction_data.quantityToBreak || item.transaction_data.packQtyUsed || '—'}</td>
                    </tr>
                    <tr>
                      <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Reason</td>
                      <td className="value py-1">{item.transaction_data.reason || (item.transaction_data.quantityToBreak ? 'Break Pack' : item.transaction_data.packQtyUsed ? 'Consolidate Pack' : 'Repackaging')}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {item.transaction_type.toUpperCase() === 'SHELF_TRANSFER' && (
              <>
                {(item.transaction_data.items || item.transaction_data.updates) ? (
                  <>
                    <div className="p-3 bg-orange-50/30 border border-orange-200 rounded-lg mb-4">
                      <div className="text-[8pt] font-bold text-orange-800 uppercase mb-1">Batch Shelf Transfer</div>
                      <div className="text-[10pt] font-bold">{(item.transaction_data.items || item.transaction_data.updates).length} item(s)</div>
                    </div>
                    <table className="data-table w-full border-collapse mb-5">
                      <thead>
                        <tr className="border-b-2 border-black text-left">
                          <th className="p-2 text-[9pt] font-bold uppercase w-[30%]">Product</th>
                          <th className="p-2 text-[9pt] font-bold uppercase">Barcode</th>
                          <th className="p-2 text-[9pt] font-bold uppercase">From Shelf</th>
                          <th className="p-2 text-[9pt] font-bold uppercase">To Shelf</th>
                          <th className="p-2 text-[9pt] font-bold uppercase text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(item.transaction_data.items || item.transaction_data.updates || []).map((it: any, idx: number) => (
                          <tr key={idx} className="border-b border-zinc-100">
                            <td className="p-2 text-[10pt] font-medium">{it.productName || it.name || '—'}</td>
                            <td className="p-2 font-mono text-[9pt]">{it.barcode || it.productBarcode || '—'}</td>
                            <td className="p-2 text-[9pt]">{it.sourceShelfName || it.sourceShelf || it.fromShelfName || 'Unassigned'}</td>
                            <td className="p-2 text-[9pt]">{it.targetShelfName || it.targetShelf || it.toShelfName || 'Unassigned'}</td>
                            <td className="p-2 text-[10pt] font-mono text-right font-bold">{it.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <table className="meta-table w-full border-collapse mb-4 p-3 bg-zinc-50 border border-zinc-200 rounded">
                    <tbody>
                      <tr>
                        <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Product</td>
                        <td className="value font-bold py-1">{item.transaction_data.productName || item.transaction_data.name || '—'}</td>
                      </tr>
                      <tr>
                        <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Barcode</td>
                        <td className="value font-mono font-bold py-1">{item.transaction_data.barcode || item.transaction_data.productBarcode || '—'}</td>
                      </tr>
                      <tr>
                        <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">From Shelf</td>
                        <td className="value font-bold py-1">{item.transaction_data.fromShelfName || item.transaction_data.fromShelf || item.transaction_data.sourceShelf || 'Unassigned'}</td>
                      </tr>
                      <tr>
                        <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">To Shelf</td>
                        <td className="value font-bold py-1">{item.transaction_data.toShelfName || item.transaction_data.toShelf || item.transaction_data.targetShelf || 'Unassigned'}</td>
                      </tr>
                      <tr>
                        <td className="label font-semibold text-[9pt] text-zinc-500 uppercase w-[130px] py-1 pl-2">Quantity</td>
                        <td className="value font-bold py-1">{item.transaction_data.quantity || '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </>
            )}

            {item.transaction_data.items && !['STOCK_COUNT', 'STOCK_TRANSFER', 'STOCK_ADJUSTMENT', 'RECEIVE_PO', 'PURCHASE_ORDER', 'BAD_ORDER', 'REPACKAGING', 'SHELF_TRANSFER'].includes(item.transaction_type.toUpperCase()) && (
              <>
                <table className="data-table w-full border-collapse mb-2 text-left">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="p-2 text-[9pt] font-bold uppercase w-[35%]">Item Description</th>
                      <th className="p-2 text-[9pt] font-bold uppercase">SKU / Barcode</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right w-[60px]">Qty</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Unit Rate</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right">Extended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.transaction_data.items.map((it: any, idx: number) => (
                      <tr key={idx} className="border-b border-zinc-100">
                        <td className="p-2 text-[10pt] font-medium">{it.productName || it.name}</td>
                        <td className="p-2 text-[10pt]">
                           <div className="font-mono font-bold text-slate-600 text-[8pt]">{it.productSku || it.sku || '-'}</div>
                           <div className="barcode-value font-mono font-bold text-black text-[11pt] mt-0.5">{it.productBarcode || it.barcode || '-'}</div>
                        </td>
                        <td className="p-2 text-[10pt] font-mono text-right">{it.quantity}</td>
                        <td className="p-2 text-[10pt] font-mono text-right">
                            {it.cost ? it.cost.toLocaleString() : it.price ? it.price.toLocaleString() : '-'}
                        </td>
                        <td className="p-2 text-[10pt] font-mono text-right font-bold">
                            {(it.cost || it.price) ? ((it.cost || it.price) * it.quantity).toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end font-bold text-[11pt] mt-3 uppercase tracking-tight">
                    <span>Grand Total: ₱{(Number(item.transaction_data.total || item.transaction_data.grandTotal || item.transaction_data.total_amount) || 0).toLocaleString()}</span>
                </div>
              </>
            )}

            {/* General items for Stock related types that don't have their own detailed table yet */}
            {item.transaction_data.items && ['STOCK_TRANSFER', 'STOCK_ADJUSTMENT'].includes(item.transaction_type.toUpperCase()) && (
              <>
                <table className="data-table w-full border-collapse mb-2 text-left">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="p-2 text-[9pt] font-bold uppercase w-[40%]">Item Description</th>
                      <th className="p-2 text-[9pt] font-bold uppercase w-[40%]">SKU / Barcode</th>
                      <th className="p-2 text-[9pt] font-bold uppercase text-right w-[20%]">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.transaction_data.items.map((it: any, idx: number) => (
                      <tr key={idx} className="border-b border-zinc-100">
                        <td className="p-2 text-[10pt] font-medium">{it.productName || it.name}</td>
                        <td className="p-2 text-[10pt]">
                           <div className="font-mono font-bold text-slate-600 text-[8pt]">{it.productSku || it.sku || '-'}</div>
                           <div className="barcode-value font-mono font-bold text-black text-[11pt] mt-0.5">{it.productBarcode || it.barcode || '-'}</div>
                        </td>
                        <td className="p-2 text-[10pt] font-mono text-right">{it.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="section-title text-[10pt] font-bold uppercase border-b border-zinc-300 pb-1 mb-3 mt-8">Approval Audit Trail</div>
            <table className="audit-trail w-full border-collapse mb-5">
              <thead>
                <tr className="text-left">
                  <th className="p-2 text-[8pt] text-zinc-500 uppercase w-[10%]">Step</th>
                  <th className="p-2 text-[8pt] text-zinc-500 uppercase w-[20%]">Level</th>
                  <th className="p-2 text-[8pt] text-zinc-500 uppercase w-[40%]">Action / Authorized By</th>
                  <th className="p-2 text-[8pt] text-zinc-500 uppercase w-[30%] text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {item.workflow.map((step, idx) => {
                  const historyItem = item.history.find(h => h.step_number === step.step_order);
                  const isCurrent = item.status === 'Pending' && item.current_step === step.step_order;
                  return (
                    <tr key={idx} className="border-b border-zinc-50">
                      <td className="p-2 text-[9pt]">{step.step_order}</td>
                      <td className="p-2 text-[9pt] font-semibold">{step.role_name}</td>
                      <td className="p-2 text-[9pt]">
                        {historyItem ? (
                          <>
                            <span className="font-bold uppercase text-[8pt] inline-block mr-2">{historyItem.action}</span>
                            <span>{historyItem.userName || 'Authorized Signature'}</span>
                            {historyItem.notes && (
                                <div className="text-[8pt] text-zinc-500 mt-0.5 italic">Note: {historyItem.notes}</div>
                            )}
                          </>
                        ) : isCurrent ? (
                          <em className="text-zinc-400">CURRENTLY PENDING</em>
                        ) : (
                          <span className="text-zinc-200">AWAITING PREVIOUS</span>
                        )}
                      </td>
                      <td className="p-2 text-[9pt] text-right text-zinc-500">
                        {historyItem ? format(new Date(historyItem.created_at), 'yyyy-MM-dd HH:mm') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Signatures */}
            <div className="signatures-grid grid grid-cols-2 gap-12 mt-16">
              <div className="sig-item">
                <div className="sig-name min-h-[45px] border-b border-black flex items-end justify-center font-bold text-[10pt] pb-1">
                    {item.requester_name.toUpperCase()}
                </div>
                <div className="sig-label text-center text-[8pt] text-zinc-500 mt-1 uppercase font-semibold">Prepared By / Requester Signature</div>
              </div>
              
              {item.workflow.map((step, idx) => {
                const approver = item.history.find(h => h.step_number === step.step_order && h.action === 'Approved');
                return (
                  <div key={idx} className="sig-item">
                    <div className="sig-name min-h-[45px] border-b border-black flex items-end justify-center font-bold text-[10pt] pb-1">
                        {approver ? approver.userName.toUpperCase() : ''}
                    </div>
                    <div className="sig-label text-center text-[8pt] text-zinc-500 mt-1 uppercase font-semibold">
                        {step.role_name.toUpperCase()} / Authorized Signature
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="footer mt-12 pt-4 border-t border-zinc-100 text-[8pt] text-zinc-400 text-center">
                OFFICIAL DOCUMENT - ALON POS ERP SYSTEM - REF: {item.id}<br />
                Printed: {format(new Date(), 'yyyy-MM-dd HH:mm:ss')} (EST)
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t bg-secondary/5">
          <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 px-[18px]">Close Preview</button>
          <button onClick={handlePrint} className="inline-flex items-center justify-center rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 gap-2 font-bold px-8">
            <Printer className="h-4 w-4" />
            Print Now
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
