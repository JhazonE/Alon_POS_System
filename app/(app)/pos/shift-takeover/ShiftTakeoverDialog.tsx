'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertCircle, History, Play } from 'lucide-react';
import type { ShiftTakeoverDialogProps } from './shift-takeover-types';

export function ShiftTakeoverDialog({
  isOpen,
  onContinue,
  onStartNew,
  previousCashierName,
}: ShiftTakeoverDialogProps) {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertCircle className="h-6 w-6 text-yellow-500" />
            Active Session Found
          </DialogTitle>
          <DialogDescription className="pt-2 text-base">
            An active shift from <span className="font-bold text-foreground">{previousCashierName}</span> is still running on this terminal.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-4">
             <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                Would you like to continue the existing transaction or start a fresh shift?
             </div>
        </div>

        <DialogFooter className="flex flex-col gap-3 sm:flex-col">
          <button
            type="button"
            className="gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 w-full h-16 text-lg flex items-center justify-between px-6 bg-primary hover:bg-primary/90"
            onClick={onContinue}
          >
            <div className="flex items-center gap-3">
              <History className="h-5 w-5" />
              <div className="text-left">
                <div className="font-bold">Continue Transaction</div>
                <div className="text-xs font-normal opacity-90">Resume {previousCashierName}'s session</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring w-full h-16 text-lg flex items-center justify-between px-6 border-2"
            onClick={onStartNew}
          >
            <div className="flex items-center gap-3">
              <Play className="h-5 w-5" />
              <div className="text-left">
                <div className="font-bold">Start New Shift</div>
                <div className="text-xs font-normal text-muted-foreground">End current session and start fresh</div>
              </div>
            </div>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
