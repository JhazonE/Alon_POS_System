import { type SVGAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends SVGAttributes<SVGSVGElement> {
  className?: string;
}

/**
 * Brand loading indicator — a quarter arc rotating over a faint track.
 * Drop-in replacement for `<Loader2 className="... animate-spin" />`.
 *
 * The arc paints with `currentColor`, so it inherits the text colour it sits
 * in — white on a solid primary button, the surrounding text colour inline.
 * Pass a text colour in `className` (e.g. `text-primary`) to set it.
 */
export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-20" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
