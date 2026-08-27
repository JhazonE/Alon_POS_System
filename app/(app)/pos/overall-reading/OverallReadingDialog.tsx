'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Printer, Loader2, ArrowLeft } from 'lucide-react';
import { OverallReadingPreview } from '../../sales/overall-reading/overall-reading-preview';
import { useOverallReading } from './use-overall-reading';
import type { OverallReadingDialogProps } from './overall-reading-types';

export function OverallReadingDialog({ isOpen, onOpenChange, terminalId, terminalName, printMode }: OverallReadingDialogProps) {
  const { reportData, loading, isPrinting, handlePrint, loadReportData } = useOverallReading({
    isOpen, terminalId, terminalName, printMode,
  });

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl h-full overflow-hidden flex flex-col p-0 gap-0 [&>button]:hidden">
        <SheetHeader className="px-4 py-3 border-b flex-none flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <SheetTitle>OVERALL TERMINAL READING</SheetTitle>
          </div>
          <button onClick={handlePrint} disabled={loading || isPrinting || !reportData} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
            {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
            Print
          </button>
        </SheetHeader>

        <div className="flex-1 overflow-auto bg-muted/20 p-4 flex justify-center">
          {loading ? (
            <div className="p-8 text-center flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Generating overall reading...</p>
            </div>
          ) : reportData ? (
            <div className="bg-white shadow-lg h-fit max-w-[400px] w-full">
              <OverallReadingPreview data={reportData} printerFormat="80mm" />
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-gray-500">
              <p>No data available for this terminal since last Z-reading.</p>
              <button onClick={loadReportData} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 mt-4">Retry</button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

