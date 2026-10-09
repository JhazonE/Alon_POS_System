'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface FormPageShellProps {
  title: string;
  /** Shown after the title, e.g. "Reference: PO-123456". */
  subtitle?: React.ReactNode;
  /** True once the user has entered something worth confirming before leaving. */
  isDirty: boolean;
  /** Navigates away; called straight away when clean, or after "Discard". */
  onLeave: () => void;
  discardTitle?: string;
  /** Accessible name of the back arrow. */
  backLabel?: string;
  /** Receives `requestLeave` for the form's own Cancel button. */
  children: (api: { requestLeave: () => void }) => React.ReactNode;
  /** Rendered after the panel, still inside the page root (nested dialogs). */
  after?: React.ReactNode;
}

/**
 * The shared frame of the New / Edit order pages: a one-line title row with a
 * back arrow, and the bordered panel the form lives in. Leaving with unsaved
 * work asks first (and the browser warns on reload / tab close).
 */
export function FormPageShell({
  title,
  subtitle,
  isDirty,
  onLeave,
  discardTitle = 'Discard this form?',
  backLabel = 'Back',
  children,
  after,
}: FormPageShellProps) {
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);

  const requestLeave = () => {
    if (isDirty) setIsDiscardOpen(true);
    else onLeave();
  };

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={requestLeave}
          aria-label={backLabel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-lg font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      <div className="flex flex-1 min-h-[560px] flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
        {children({ requestLeave })}
      </div>

      {after}

      <AlertDialog open={isDiscardOpen} onOpenChange={setIsDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{discardTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. If you leave now they will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onLeave}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
