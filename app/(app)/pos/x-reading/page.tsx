'use client';

import { Dialog } from '@/components/ui/dialog';
import { RefreshCw } from 'lucide-react';
import { AdminAuthDialog } from '../admin-auth/AdminAuthDialog';
import { XReadingReportView } from './XReadingReportView';
import { useXReading } from './use-x-reading';

export default function XReadingPage() {
  const {
    isAuthDialogOpen, setIsAuthDialogOpen,
    showReport, xReadingData, businessSettings, loading,
    handleAdminAuthSuccess,
    loadXReadingData,
    handlePrint,
  } = useXReading();

  if (!showReport) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <AdminAuthDialog
          isOpen={isAuthDialogOpen}
          onOpenChange={setIsAuthDialogOpen}
          onSuccess={handleAdminAuthSuccess}
        />
      </div>
    );
  }

  return (
    <>
      {loading ? (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Loading X-Reading data...</span>
          </div>
        </div>
      ) : xReadingData ? (
        <XReadingReportView data={xReadingData} businessSettings={businessSettings} onPrint={handlePrint} />
      ) : (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">No Active Cashier Shift</h2>
            <p className="text-muted-foreground">There is currently no active cashier shift to generate an X-Reading report for.</p>
            <button onClick={loadXReadingData} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </button>
          </div>
        </div>
      )}
      <Dialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen}>
        <AdminAuthDialog
          isOpen={isAuthDialogOpen}
          onOpenChange={setIsAuthDialogOpen}
          onSuccess={handleAdminAuthSuccess}
        />
      </Dialog>
    </>
  );
}
