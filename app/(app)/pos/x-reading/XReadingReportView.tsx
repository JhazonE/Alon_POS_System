'use client';
import { Printer } from 'lucide-react';
import { XReadingPreview, XReadingData } from '../../sales/x-reading/x-reading-preview';
import type { BusinessSettings } from '../../sales/z-reading/z-reading-preview';

interface XReadingReportViewProps {
  data: XReadingData;
  businessSettings: BusinessSettings | null;
  onPrint: () => Promise<void>;
}

export function XReadingReportView({ data, businessSettings, onPrint }: XReadingReportViewProps) {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 flex flex-col items-center">
      <div style={{ width: '220px' }} className="bg-white shadow-lg p-2 rounded-lg">
        <XReadingPreview data={data} printerFormat="58mm" businessSettings={businessSettings} />
      </div>
      <div className="flex justify-center space-x-4 print:hidden">
        <button onClick={onPrint} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-[46px] px-6 text-[15px]">
          <Printer className="mr-2 h-5 w-5" /> Print X-Reading
        </button>
      </div>
    </div>
  );
}
