'use client';

import { ArrowRight } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

const CANCEL_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-9 px-[18px]';
const SUBMIT_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-9 px-[18px] w-40 font-semibold shadow-lg shadow-primary/20';

/** A labelled money figure for the bar, e.g. Subtotal / Shipping / VAT. */
export function BarFigure({
  label,
  value,
  emphasis,
  tone = 'primary',
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  /** Colour of an emphasised figure; `destructive` for losses. */
  tone?: 'primary' | 'destructive';
}) {
  const accent = tone === 'destructive' ? 'text-destructive' : 'text-primary';
  return (
    <div className={emphasis ? 'flex flex-col items-end border-l pl-8' : 'flex flex-col items-end'}>
      <span
        className={
          emphasis
            ? `text-[10px] uppercase tracking-wider font-black ${accent}`
            : 'text-[10px] uppercase tracking-wider text-muted-foreground font-bold'
        }
      >
        {label}
      </span>
      <span className={emphasis ? `font-mono text-xl font-black ${accent}` : 'font-mono text-sm font-bold text-foreground'}>
        {value}
      </span>
    </div>
  );
}

interface FormActionBarProps {
  itemCount: number;
  /** The totals, as <BarFigure/>s. */
  children?: React.ReactNode;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  submitDisabled?: boolean;
  /** Icon after the submit label; defaults to an arrow. */
  submitIcon?: React.ReactNode;
}

/**
 * Slim bottom bar of the order pages: item count, totals, Cancel and the
 * submit button. Place it inside a `px-4` container; it bleeds to the edges.
 */
export function FormActionBar({
  itemCount,
  children,
  onCancel,
  submitLabel,
  isSubmitting,
  submitDisabled,
  submitIcon,
}: FormActionBarProps) {
  return (
    <div className="bg-background border-t -mx-4 px-4 py-2 flex justify-between items-center gap-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 shrink-0">
      <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
        <span>
          <span className="font-black text-foreground">{itemCount}</span> items added.
        </span>
        <span className="flex items-center gap-1 font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-600" /> Ready to process
        </span>
      </div>
      <div className="flex items-center gap-8">
        {children}
        <div className="flex items-center gap-2 border-l pl-8">
          <button type="button" onClick={onCancel} className={CANCEL_CLASS}>
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting || submitDisabled} className={SUBMIT_CLASS}>
            {isSubmitting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Processing...
              </>
            ) : (
              <>
                {submitLabel}
                {submitIcon ?? <ArrowRight className="ml-2 h-4 w-4" />}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
