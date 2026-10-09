'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Open / folded state of a form's header fields, remembered per browser under
 * `storageKey`. Folding them gives the items table the room.
 */
export function useDetailsCollapse(storageKey: string) {
  const [detailsOpen, setDetailsOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === '1') setDetailsOpen(false);
    } catch {}
  }, [storageKey]);

  const toggleDetails = () => {
    const next = !detailsOpen;
    setDetailsOpen(next);
    try {
      localStorage.setItem(storageKey, next ? '0' : '1');
    } catch {}
  };

  return { detailsOpen, setDetailsOpen, toggleDetails };
}

export function DetailsToggleButton({
  open,
  onToggle,
  summary,
}: {
  open: boolean;
  onToggle: () => void;
  /** One-line recap shown while the details are folded. */
  summary?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="ml-auto inline-flex h-10 min-w-0 items-center gap-2 rounded-xl border border-input bg-background px-3 text-xs font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="shrink-0">Order details</span>
      {!open && summary && (
        <span className="max-w-[28rem] truncate font-normal text-muted-foreground">{summary}</span>
      )}
      <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
    </button>
  );
}
