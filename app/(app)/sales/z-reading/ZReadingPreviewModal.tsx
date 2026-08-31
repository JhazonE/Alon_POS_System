'use client';

import { RefObject } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { ZReadingPreview, ZReadingData, BusinessSettings } from './z-reading-preview';
import type { PrinterFormat } from './use-z-reading-page';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedReading: ZReadingData;
  printerFormat: PrinterFormat;
  setPrinterFormat: (format: PrinterFormat) => void;
  businessSettings: BusinessSettings | null | undefined;
  previewRef: RefObject<HTMLDivElement>;
  onPrint: () => void;
}

export function ZReadingPreviewModal({ isOpen, onClose, selectedReading, printerFormat, setPrinterFormat, businessSettings, previewRef, onPrint }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl max-h-[90vh] flex flex-col rounded shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-medium text-gray-700">Z-READING</h2>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-gray-500 hover:text-gray-700" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 p-4 flex justify-center">
          <div ref={previewRef} className="bg-white shadow-sm h-fit">
            <ZReadingPreview data={selectedReading} printerFormat={printerFormat} businessSettings={businessSettings ?? null} />
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Format:</span>
            <Select value={printerFormat} onValueChange={(value) => setPrinterFormat(value as PrinterFormat)}>
              <SelectTrigger className="w-[90px] h-8 text-xs bg-white text-gray-900">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent className="bg-white text-gray-900">
                <SelectItem value="58mm" className="text-gray-900 focus:bg-gray-100 focus:text-gray-900">58mm</SelectItem>
                <SelectItem value="80mm" className="text-gray-900 focus:bg-gray-100 focus:text-gray-900">80mm</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] bg-white text-gray-900 hover:bg-gray-100 hover:text-gray-900">Close</button>
            <button onClick={onPrint} disabled={!selectedReading} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] bg-[#008CCB] hover:bg-[#007cb3] text-white">
              POS Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
