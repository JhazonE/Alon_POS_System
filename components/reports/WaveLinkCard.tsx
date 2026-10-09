import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The report-catalog tile on /reports, also used by the /settings hub. Same
 * wave-accent shell as WaveStatCard, but a clickable icon+title+description
 * link instead of a label+value readout. The icon keeps its own per-category
 * colour (`iconClassName`) rather than the shared teal -- that colour is how
 * people tell categories apart at a glance, so only the card shell gets the
 * wave treatment.
 *
 * A `disabled` card renders as an inert <div> rather than a <Link>: it is for
 * pages that are listed but not built yet, so there is no href to navigate to
 * and no hover affordance promising one.
 */
export function WaveLinkCard({
  href,
  title,
  description,
  icon: Icon,
  iconClassName,
  className,
  disabled,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName?: string;
  className?: string;
  disabled?: boolean;
  badge?: string;
}) {
  const shell = cn(
    'group relative block h-full overflow-hidden rounded-2xl border border-border bg-card p-4 transition-colors',
    disabled ? 'cursor-not-allowed opacity-70' : 'hover:bg-muted/50',
    className,
  );

  const Shell = disabled
    ? ({ children }: { children: React.ReactNode }) => (
        <div data-report="link-card" aria-disabled className={shell}>
          {children}
        </div>
      )
    : ({ children }: { children: React.ReactNode }) => (
        <Link href={href} data-report="link-card" className={shell}>
          {children}
        </Link>
      );

  return (
    <Shell>
      <svg
        aria-hidden
        viewBox="0 0 200 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-1.5 -right-2.5 h-[60px] w-[110px]"
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

      <div className="relative">
        <div className="flex items-center gap-2 text-base font-semibold leading-none text-foreground">
          <Icon className={cn('h-5 w-5 shrink-0', iconClassName)} />
          {title}
          {badge && (
            <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </Shell>
  );
}
