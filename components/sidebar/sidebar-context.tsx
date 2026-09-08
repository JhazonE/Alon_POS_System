'use client';

import * as React from 'react';
import {
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_MOBILE_BREAKPOINT,
  sidebarStateCookie,
} from './sidebar-cookie';

type SidebarContextValue = {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
  state: 'expanded' | 'collapsed';
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used inside <SidebarProvider>');
  return ctx;
}

export function SidebarProvider({
  defaultOpen = true,
  children,
}: {
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpenState] = React.useState(defaultOpen);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // Starts false so server and first client render agree; the effect below
  // corrects it before paint on a narrow viewport.
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SIDEBAR_MOBILE_BREAKPOINT - 1}px)`);
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    document.cookie = sidebarStateCookie(value);
  }, []);

  const toggle = React.useCallback(() => {
    if (isMobile) setMobileOpen(v => !v);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const value = React.useMemo<SidebarContextValue>(() => ({
    open,
    setOpen,
    toggle,
    state: open ? 'expanded' : 'collapsed',
    isMobile,
    mobileOpen,
    setMobileOpen,
  }), [open, setOpen, toggle, isMobile, mobileOpen]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}
