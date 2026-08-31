'use client';

import { useState, useRef, useMemo } from 'react';
import {
  ColumnDef, SortingState, VisibilityState,
  getCoreRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, Printer, FileText, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { getApiUrl } from '@/lib/api-config';
import { ZReadingData, BusinessSettings } from './z-reading-preview';

export type PrinterFormat = '58mm' | '80mm';

export function useZReadingPage() {
  const { toast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);

  const initFrom = new Date();
  initFrom.setDate(initFrom.getDate() - 30);
  const initTo = new Date();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({ from: initFrom, to: initTo });
  const [terminal, setTerminal] = useState<string>('all');
  const [queryParams, setQueryParams] = useState<{ from: string; to: string; terminalId: string } | null>({
    from: format(initFrom, 'yyyy-MM-dd'),
    to: format(initTo, 'yyyy-MM-dd'),
    terminalId: 'all',
  });
  const [printerFormat, setPrinterFormat] = useState<PrinterFormat>('80mm');
  const [selectedReading, setSelectedReading] = useState<ZReadingData | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const { data: businessSettings } = useQuery<BusinessSettings | null>({
    queryKey: ['posSettings'],
    queryFn: async () => {
      const res = await fetch(getApiUrl('/pos-settings'));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const result = await res.json();
      return result.success ? result.data : null;
    },
  });

  const { data: zReadings = [], isLoading } = useQuery<ZReadingData[]>({
    queryKey: ['zReadings', queryParams],
    queryFn: async () => {
      if (!queryParams) return [];
      const params = new URLSearchParams();
      params.append('startDate', queryParams.from);
      params.append('endDate', queryParams.to);
      if (queryParams.terminalId) params.append('terminalId', queryParams.terminalId);
      const res = await fetch(getApiUrl(`/sales/z-reading?${params.toString()}`));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const result = await res.json();
      if (!result.success) return [];
      if (result.data.length === 1 && queryParams.from === queryParams.to) {
        setSelectedReading(result.data[0]);
        setIsPreviewOpen(true);
      }
      return result.data;
    },
    enabled: !!queryParams,
  });

  const handleShowReport = () => {
    if (!dateRange?.from) {
      toast({ title: 'Error', description: 'Please select a date range', variant: 'destructive' });
      return;
    }
    setQueryParams({
      from: format(dateRange.from, 'yyyy-MM-dd'),
      to: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : format(dateRange.from, 'yyyy-MM-dd'),
      terminalId: terminal,
    });
  };

  const handleView = (reading: ZReadingData) => {
    setSelectedReading(reading);
    setIsPreviewOpen(true);
  };

  const handleReactToPrintFn = useReactToPrint({
    contentRef: previewRef,
    documentTitle: 'Z-Reading-Report',
    pageStyle: `@page { size: ${printerFormat === '58mm' ? '58mm' : '80mm'} auto; margin: 0; } @media print { body { visibility: visible !important; -webkit-print-color-adjust: exact; } * { visibility: visible !important; } }`,
  });

  const handlePrint = (reading?: ZReadingData) => {
    if (reading) {
      setSelectedReading(reading);
      setIsPreviewOpen(true);
      setTimeout(() => handleReactToPrintFn(), 500);
    } else if (selectedReading) {
      handleReactToPrintFn();
    }
  };

  const handleExportPDF = async (reading: ZReadingData) => {
    try {
      setSelectedReading(reading);
      setIsPreviewOpen(true);
      setTimeout(async () => {
        if (previewRef.current) {
          const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          const pdfWidth = printerFormat === '58mm' ? 58 : 80;
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, 297] });
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`Z-Reading-${reading.id}.pdf`);
          toast({ title: 'Success', description: 'Z-Reading exported as PDF' });
        }
      }, 500);
    } catch {
      toast({ title: 'Error', description: 'Failed to export PDF', variant: 'destructive' });
    }
  };

  const handleExportImage = async (reading: ZReadingData) => {
    try {
      setSelectedReading(reading);
      setIsPreviewOpen(true);
      setTimeout(async () => {
        if (previewRef.current) {
          const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#ffffff' });
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `Z-Reading-${reading.id}.png`;
              link.click();
              URL.revokeObjectURL(url);
              toast({ title: 'Success', description: 'Z-Reading exported as image' });
            }
          });
        }
      }, 500);
    } catch {
      toast({ title: 'Error', description: 'Failed to export image', variant: 'destructive' });
    }
  };

  const columns = useMemo<ColumnDef<ZReadingData>[]>(() => [
    {
      accessorKey: 'id',
      header: 'Z-Reading ID',
      cell: ({ row }) => <span className="font-medium font-mono">{row.getValue('id')}</span>,
    },
    {
      accessorKey: 'date',
      header: ({ column }) => (
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Date
          {column.getIsSorted() === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : column.getIsSorted() === 'desc' ? <ArrowDown className="ml-2 h-4 w-4" /> : <ArrowUpDown className="ml-2 h-4 w-4" />}
        </button>
      ),
      cell: ({ row }) => format(new Date(row.getValue('date')), 'PP'),
    },
    {
      accessorKey: 'terminalId',
      header: 'Terminal',
      cell: ({ row }) => row.original.terminalId || 'N/A',
    },
    {
      accessorKey: 'cashierName',
      header: 'Cashier',
      cell: ({ row }) => row.original.cashierName || 'N/A',
    },
    {
      accessorKey: 'transactionCount',
      header: ({ column }) => (
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 text-right" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Transactions
          {column.getIsSorted() === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : column.getIsSorted() === 'desc' ? <ArrowDown className="ml-2 h-4 w-4" /> : <ArrowUpDown className="ml-2 h-4 w-4" />}
        </button>
      ),
      cell: ({ row }) => <div className="text-right">{row.getValue('transactionCount')}</div>,
    },
    {
      accessorKey: 'netSales',
      header: ({ column }) => (
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring px-[13px] text-xs rounded-lg gap-1.5 -ml-3 h-8 text-right" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Net Sales
          {column.getIsSorted() === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : column.getIsSorted() === 'desc' ? <ArrowDown className="ml-2 h-4 w-4" /> : <ArrowUpDown className="ml-2 h-4 w-4" />}
        </button>
      ),
      cell: ({ row }) => <div className="text-right font-mono">₱{(row.getValue('netSales') as number).toFixed(2)}</div>,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const reading = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => handleView(reading)} title="View" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0"><Eye className="h-4 w-4" /></button>
            <button onClick={() => handlePrint(reading)} title="Print" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0"><Printer className="h-4 w-4" /></button>
            <button onClick={() => handleExportPDF(reading)} title="Export PDF" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0"><FileText className="h-4 w-4" /></button>
            <button onClick={() => handleExportImage(reading)} title="Export Image" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0"><ImageIcon className="h-4 w-4" /></button>
          </div>
        );
      },
    },
  ], [handleView, handlePrint, handleExportPDF, handleExportImage]);

  const table = useReactTable({
    data: zReadings,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return {
    dateRange, setDateRange,
    terminal, setTerminal,
    queryParams,
    printerFormat, setPrinterFormat,
    selectedReading,
    isPreviewOpen, setIsPreviewOpen,
    businessSettings,
    zReadings, isLoading,
    previewRef,
    table, columns,
    handleShowReport,
    handleView,
    handlePrint,
    handleExportPDF,
    handleExportImage,
    handleReactToPrintFn,
  };
}
