import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The summary card used at the top of report pages. Uses the app's regular
 * shadcn surface tokens (bg-card/border-border/text-foreground) so it tracks
 * light/dark automatically, plus a wave-shaped flourish tinted from
 * --matte-accent -- the same teal accent the sidebar/header/dashboard use,
 * defined in globals.css for both themes.
 */
export function WaveStatCard({
  label,
  value,
  icon: Icon,
  sub,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div
      data-report="stat"
      className="relative rounded-2xl border border-border bg-card p-4"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <svg
          viewBox="0 0 200 100"
          preserveAspectRatio="none"
          className="absolute -bottom-1.5 -right-2.5 h-[60px] w-[110px]"
        >
          <path
            d="M0,60 C40,90 80,20 120,50 C150,72 180,40 200,55 L200,100 L0,100 Z"
            fill="rgb(var(--matte-accent))"
            opacity="0.14"
          />
          <path
            d="M20,75 C60,100 100,40 140,65 C165,80 190,55 200,68 L200,100 L0,100 Z"
            fill="rgb(var(--matte-accent))"
            opacity="0.22"
          />
        </svg>
      </div>

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {Icon ? <Icon className="h-4 w-4 text-[rgb(var(--matte-accent))]" /> : null}
        </div>
        <div className={cn('mt-1.5 text-2xl font-extrabold leading-tight break-words text-foreground', valueClassName)}>
          {value}
        </div>
        {sub ? (
          <p className="mt-1.5 text-[11px] text-[rgb(var(--matte-accent))]">{sub}</p>
        ) : null}
      </div>
    </div>
  );
}
