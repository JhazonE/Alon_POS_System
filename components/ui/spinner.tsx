import { useId, type SVGAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends SVGAttributes<SVGSVGElement> {
  className?: string;
}

/**
 * Brand loading indicator — a primary-to-amber gradient arc ring.
 * Drop-in replacement for `<Loader2 className="... animate-spin" />`.
 */
export function Spinner({ className, ...props }: SpinnerProps) {
  const gradientId = useId();

  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="hsl(var(--brand-amber))" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-15" />
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={`url(#${gradientId})`}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="34 100"
      />
    </svg>
  );
}
