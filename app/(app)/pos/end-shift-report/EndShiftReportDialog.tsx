'use client';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Files, BookOpen } from 'lucide-react';
import type { EndShiftReportDialogProps } from './end-shift-report-types';

export function EndShiftReportDialog({
  open,
  onOpenChange,
  onOpenOverallReading,
  onOpenXReading,
  onOpenZReadingWarning,
}: EndShiftReportDialogProps) {
  const openThen = (action: () => void) => () => {
    onOpenChange(false);
    // Deferred: the target dialog is also built on @radix-ui/react-dialog
    // (AlertDialog/Dialog/Sheet all share it), so opening it in the same
    // tick as this AlertDialog's close races the shared scroll-lock/focus-
    // trap singleton and can leave the new dialog unable to receive clicks.
    setTimeout(action, 0);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <AlertDialogTitle>Shift Ended Successfully</AlertDialogTitle>
              <AlertDialogDescription>
                Choose a report to view, or close this and view them later from the footer actions.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="grid grid-cols-3 gap-3 py-2">
          <button type="button" className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[18px] h-auto flex-col gap-2 py-4" onClick={openThen(onOpenOverallReading)}>
            <Files className="h-5 w-5 text-purple-600" />
            <span className="text-xs font-semibold">Overall</span>
          </button>
          <button type="button" className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[18px] h-auto flex-col gap-2 py-4" onClick={openThen(onOpenXReading)}>
            <BookOpen className="h-5 w-5 text-purple-600" />
            <span className="text-xs font-semibold">X-Reading</span>
          </button>
          <button type="button" className="inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[18px] h-auto flex-col gap-2 py-4" onClick={openThen(onOpenZReadingWarning)}>
            <BookOpen className="h-5 w-5 text-purple-600" />
            <span className="text-xs font-semibold">Z-Reading</span>
          </button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
