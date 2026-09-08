/**
 * Persistence contract for the sidebar's open state.
 *
 * These values are NOT free to change. app/(app)/layout.tsx seeds the
 * provider by parsing this cookie itself on mount, and existing installs
 * already carry it. A different name, value spelling or max-age silently
 * resets every user's collapsed preference on their next reload.
 */
export const SIDEBAR_COOKIE_NAME = 'sidebar_state';
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 604800 — one week

/** Column widths, for tests to assert against. Tailwind classes stay literal. */
export const SIDEBAR_WIDTH = 300;
export const SIDEBAR_WIDTH_ICON = 56;
export const SIDEBAR_MOBILE_BREAKPOINT = 768;
export const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

/** Parse the persisted open state out of a document.cookie string. */
export function readSidebarStateCookie(cookie: string): boolean {
  const match = cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
  return match ? match[1] === 'true' : true;
}

/** Serialize the cookie exactly as layout.tsx expects to read it back. */
export function sidebarStateCookie(open: boolean): string {
  return `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
}
