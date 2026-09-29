'use client';

import * as React from 'react';
import { useSidebar } from './sidebar-context';

/**
 * The floating panel. Three presentations share these children; this task
 * ships expanded and a collapsed state that simply hides the panel. Task 3
 * replaces the hidden state with the 56px icon rail and Task 4 adds the
 * mobile drawer.
 */
export function SidebarPanel({ children }: { children: React.ReactNode }) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <aside
      data-sidebar="panel"
      data-state={state}
      className={[
        'non-printable shrink-0 overflow-hidden transition-[width] duration-200',
        collapsed ? 'w-0' : 'w-[300px]',
      ].join(' ')}
    >
      <div className="sticky top-0 flex h-svh w-[300px] p-[10px]">
        <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-[#1a3b6e] bg-[#0a2145]">
          {children}
        </div>
      </div>
    </aside>
  );
}

export function SidebarInset({ children }: { children: React.ReactNode }) {
  return <main className="flex min-w-0 flex-1 flex-col">{children}</main>;
}
