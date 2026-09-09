'use client';

import { Store } from 'lucide-react';
import { AnimatedSidebarTrigger } from '@/components/AnimatedSidebarTrigger';
import { AppBreadcrumbs } from '@/components/app-breadcrumbs';
import { WindowControls } from '@/components/window-controls';
import { NotificationsBell } from './NotificationsBell';

/**
 * The header is a floating card, not a full-bleed bar. It sits in the same
 * 10px gutter as the sidebar panel (`components/sidebar/sidebar-shell.tsx`)
 * with the same 16px radius, so the two read as a matched pair of floating
 * surfaces rather than a dark panel bolted to a generic toolbar.
 *
 * Colours are hardcoded teal the way the sidebar's are, and for the same
 * reason: the app's `.dark` tokens in `globals.css` are a blue-slate ramp, so
 * `bg-card`/`border-border` would drift away from the panel in dark mode
 * rather than partner with it.
 *
 * The outer <header> stays full-width and keeps `window-drag`. That matters in
 * frameless Electron -- the gutter around the card is still draggable, so
 * insetting the card does not shrink the drag region.
 */

type AppUser = { email: string; permissions?: string[]; userType?: string };

export function AppHeader({
  user,
  businessName,
}: {
  user: AppUser;
  businessName?: string | null;
}) {
  return (
    <header className="non-printable window-drag shrink-0 px-[10px] pt-[10px]">
      <div className="window-no-drag flex h-14 items-center gap-3 rounded-2xl border border-[#D9EDEB] bg-white px-3 shadow-sm dark:border-[#17403F] dark:bg-[#0F3336]">
        <AnimatedSidebarTrigger />
        <AppBreadcrumbs />

        <div className="flex-1" />

        {businessName && (
          <>
            <div className="hidden items-center gap-2.5 rounded-xl border border-[#D9EDEB] bg-[#F4FBFA] py-1.5 pl-1.5 pr-3 sm:flex dark:border-[#17403F] dark:bg-[#0B2A2D]">
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[rgba(45,165,176,0.13)] text-[#0E7C86] dark:text-[#4FC3C9]">
                <Store className="h-[13px] w-[13px]" />
              </span>
              <span className="text-[12.5px] font-semibold text-[#0B2A2D] dark:text-[#DCF2F0]">
                {businessName}
              </span>
            </div>
            <div className="hidden h-6 w-px bg-[#D9EDEB] sm:block dark:bg-[#17403F]" />
          </>
        )}

        <NotificationsBell user={user} />
        <WindowControls />
      </div>
    </header>
  );
}
