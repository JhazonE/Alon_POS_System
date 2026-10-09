'use client';

import { useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Printer, ArrowLeft } from 'lucide-react';
import { XReadingPreview } from '../../sales/x-reading/x-reading-preview';
import { AdminAuthDialog } from '../admin-auth/AdminAuthDialog';
import { useXReadingReport } from './use-x-reading-report';
import type { XReadingDialogProps } from './x-reading-report-types';
import { Spinner } from '@/components/ui/spinner';

export function XReadingDialog({ isOpen, onOpenChange, shiftId, autoShow = false, terminalName, printMode }: XReadingDialogProps) {
  const {
    isAuthDialogOpen, setIsAuthDialogOpen,
    showReport,
    reportData, businessSettings, loading,
    isPrinting,
    handlePrint, loadReportData, handleAdminAuthSuccess,
  } = useXReadingReport({ isOpen, shiftId, autoShow, terminalName, printMode });

  const authSucceededRef = useRef(false);

  return (
    <>
      {/* Rendered as a sibling, not nested inside SheetContent: Radix Dialog
          and Sheet share the same portal primitive, and a Dialog portaled
          inside a Sheet's portal content causes the Sheet's outside-click
          detection to treat the nested Dialog as "outside" and dismiss
          itself, closing the report the instant auth succeeds. */}
      <AdminAuthDialog
        isOpen={isAuthDialogOpen}
        onOpenChange={(open) => {
          setIsAuthDialogOpen(open);
          // useAdminAuth calls onSuccess() then onOpenChange(false) as part
          // of the same authenticate flow; the setShowReport(true) inside
          // handleAdminAuthSuccess hasn't landed in this closure's showReport
          // yet, so without this guard the stale `false` wrongly closes the
          // whole dialog instead of just the auth step.
          if (!open && !showReport && !authSucceededRef.current) onOpenChange(false);
          authSucceededRef.current = false;
        }}
        title="X-Reading Authorization"
        description="Admin password is required to generate the report preview."
        onSuccess={() => { authSucceededRef.current = true; handleAdminAuthSuccess(); }}
      />

      <Sheet open={isOpen && showReport} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl h-full overflow-hidden flex flex-col p-0 gap-0 [&>button]:hidden">
          <SheetHeader className="px-4 py-3 border-b flex-none flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <SheetTitle>X-READING REPORT</SheetTitle>
            </div>
            <SheetDescription className="hidden">Report Details</SheetDescription>
            <button onClick={handlePrint} disabled={loading || isPrinting || !reportData} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
              {isPrinting ? <Spinner className="mr-2 h-4 w-4" /> : <Printer className="mr-2 h-4 w-4" />}
              Print
            </button>
          </SheetHeader>

          <div className="flex-1 overflow-auto bg-muted/20 p-4 flex justify-center">
            {loading ? (
              <div className="p-8 text-center flex flex-col items-center gap-2">
                <Spinner className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading report...</p>
              </div>
            ) : reportData ? (
              <div className="bg-white shadow-lg h-fit max-w-[400px] w-full">
                <XReadingPreview data={{ ...reportData, terminalName }} businessSettings={businessSettings} />
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-gray-500">
                <p>No data available.</p>
                <button onClick={loadReportData} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5 mt-2 text-foreground">
                  Retry
                </button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
