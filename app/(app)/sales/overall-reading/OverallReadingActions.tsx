'use client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, FileText, Printer } from 'lucide-react';
import type { PrinterFormat } from './overall-reading-types';

interface Props {
  printerFormat: PrinterFormat;
  setPrinterFormat: (format: PrinterFormat) => void;
  setModalMode: (mode: 'view' | 'print') => void;
  setIsPreviewOpen: (open: boolean) => void;
  handleExportPDF: () => void;
}

export function OverallReadingActions({ printerFormat, setPrinterFormat, setModalMode, setIsPreviewOpen, handleExportPDF }: Props) {
  return (
    <div className="flex justify-between items-center bg-card p-4 rounded-xl shadow-sm border border-border">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Print Format:</span>
        <Select value={printerFormat} onValueChange={(value) => setPrinterFormat(value as PrinterFormat)}>
          <SelectTrigger className="w-[100px] h-8 text-xs bg-muted border-none">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="58mm">58mm</SelectItem>
            <SelectItem value="80mm">80mm</SelectItem>
            <SelectItem value="A4">A4 (Simple)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-3">
        <button onClick={() => { setModalMode('view'); setIsPreviewOpen(true); }} className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          View Receipt
        </button>
        <button onClick={handleExportPDF} className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Export PDF
        </button>
        <button onClick={() => { setModalMode('print'); setIsPreviewOpen(true); }} className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-2 bg-primary hover:bg-primary/90 text-white">
          <Printer className="h-4 w-4" />
          Print Report
        </button>
      </div>
    </div>
  );
}
