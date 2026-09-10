'use client';

import type { ComponentType } from 'react';

export type RailAction = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  action: () => void;
  tint?: string;
  /** Count bubble on the button's top-right corner; hidden when 0 or undefined. */
  badge?: number;
  badgeTint?: string;
  /** Violet-tinted treatment used to make a mode-specific action stand out. */
  highlight?: boolean;
};

type Props = {
  actions: RailAction[];
  side: 'left' | 'right';
};

/**
 * A vertical column of POS action buttons flanking the cart. Sixteen buttons
 * across both rails need ~500px of height, which is more than a 768px terminal
 * has left over after the header and summary footer — hence the scroll.
 */
export function PosActionRail({ actions, side }: Props) {
  return (
    <div
      className={`flex w-[5.5rem] shrink-0 flex-col gap-1.5 overflow-y-auto bg-background/60 p-2 ${side === 'left' ? 'border-r' : 'border-l'}`}
    >
      {actions.map(({ icon: Icon, label, shortcut, action, tint, badge, badgeTint, highlight }) => (
        <button
          key={label}
          onClick={action}
          className={`group relative flex h-14 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-xs font-medium tracking-[-0.005em] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            highlight
              ? 'border-violet-400/60 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/30 dark:hover:bg-violet-900/40'
              : 'border-border/60 bg-background hover:border-primary/30 hover:bg-muted/50'
          }`}
        >
          <Icon className={`h-5 w-5 transition-transform group-hover:scale-110 ${tint ?? ''}`} />
          <span className="w-full truncate text-center text-[10px] font-medium leading-none text-foreground">{label}</span>
          {shortcut && (
            <kbd className="rounded bg-muted px-1 py-px font-mono text-[8px] font-semibold leading-none text-muted-foreground">
              {shortcut}
            </kbd>
          )}
          {badge !== undefined && badge > 0 && (
            <span
              className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm ring-2 ring-background ${badgeTint ?? 'bg-blue-600'}`}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
