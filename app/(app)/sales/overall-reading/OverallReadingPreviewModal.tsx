'use client';

import { RefObject } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OverallReadingPreview } from './overall-reading-preview';
import type { OverallReadingData, PrinterFormat } from './overall-reading-types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  readingData: OverallReadingData;
  printerFormat: PrinterFormat;
  setPrinterFormat: (format: PrinterFormat) => void;
  modalMode: 'view' | 'print';
  previewRef: RefObject<HTMLDivElement>;
  handlePrint: () => void;
}

export function OverallReadingPreviewModal({ isOpen, onClose, readingData, printerFormat, setPrinterFormat, modalMode, previewRef, handlePrint }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={cn(
        'bg-white w-full max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden border border-slate-100 transition-all duration-300',
        printerFormat === '58mm' && 'max-w-[350px]',
        printerFormat === '80mm' && 'max-w-[450px]',
        printerFormat === 'A4' && 'max-w-[900px]'
      )}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Overall Reading Receipt</h2>
            <p className="text-xs text-slate-500 mt-0.5">Preview of the printed report</p>
          </div>
          <button className="inline-flex items-center justify-center gap-2 text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-slate-400 hover:text-slate-600 rounded-full" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100/50 p-6 flex justify-center">
          <div ref={previewRef} className="printable-area bg-white shadow-sm h-fit rounded-lg overflow-hidden border border-slate-200/60">
            <OverallReadingPreview data={readingData} printerFormat={printerFormat} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
          {modalMode === 'print' ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Format:</span>
                <Select value={printerFormat} onValueChange={(value) => setPrinterFormat(value as PrinterFormat)}>
                  <SelectTrigger className="w-[100px] h-8 text-xs bg-white border-slate-200">
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
                <button onClick={onClose} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 bg-white border-slate-200 hover:bg-slate-50 text-slate-700">
                  Close
                </button>
                <button onClick={handlePrint} disabled={!readingData} className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg bg-primary hover:bg-primary/90 text-white gap-2">
                  <Printer className="h-4 w-4" />
                  Print Now
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-end w-full">
              <button onClick={onClose} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 bg-white border-slate-200 hover:bg-slate-50 text-slate-700">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
