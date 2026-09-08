'use client';

import { cn } from '@/lib/utils';
import { useSidebar } from '@/components/sidebar/sidebar-context';

export function AnimatedSidebarTrigger({ className, onClick, ...props }: React.ComponentProps<'button'>) {
  const { toggle, state } = useSidebar();
  const expanded = state === 'expanded';

  return (
    <button
      type="button"
      aria-label={expanded ? 'Collapse sidebar (Ctrl+B)' : 'Expand sidebar (Ctrl+B)'}
      title={expanded ? 'Collapse (Ctrl+B)' : 'Expand (Ctrl+B)'}
      onClick={(e) => { onClick?.(e); toggle(); }}
      className={cn(
        'group relative flex h-8 w-8 items-center justify-center rounded-md',
        'text-foreground/70 transition-colors duration-200',
        'hover:bg-accent hover:text-foreground',
        'active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      <span className="flex h-4 w-5 flex-col justify-center gap-[3px]" aria-hidden>
        <span className="h-0.5 w-full rounded-full bg-current" />
        <span className="h-0.5 w-full rounded-full bg-current" />
        <span className="h-0.5 w-full rounded-full bg-current" />
      </span>
    </button>
  );
}
