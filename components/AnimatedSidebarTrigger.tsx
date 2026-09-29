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
        // The tinted square from the sidebar's nav rows, at header size, so the
        // control that opens the panel is visibly of the same family as it.
        'group relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]',
        'bg-[rgba(42,158,205,0.10)] text-[#104885] transition-colors duration-200',
        'hover:bg-[rgba(42,158,205,0.20)]',
        'dark:bg-[rgba(42,158,205,0.13)] dark:text-[#4db4e0] dark:hover:bg-[rgba(42,158,205,0.24)]',
        'active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#104885]/40',
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
