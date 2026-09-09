/**
 * Shared class recipes for the floating header card.
 *
 * These live in their own module rather than in `AppHeader.tsx` because the
 * header renders `NotificationsBell`, which needs the button recipe -- importing
 * it back from `AppHeader` would close an import cycle.
 */

/**
 * The sidebar's 22px tinted icon square (`components/sidebar/nav-card.tsx`)
 * grown to a 34px touch target. Teal is hardcoded for the same reason it is in
 * the sidebar: the app's `.dark` tokens are a blue-slate ramp, so semantic
 * tokens would drift away from the panel in dark mode instead of matching it.
 */
export const HEADER_ICON_BUTTON =
  'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] '
  + 'bg-[rgba(45,165,176,0.10)] text-[#0E7C86] transition-colors '
  + 'hover:bg-[rgba(45,165,176,0.20)] '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E7C86]/40 '
  + 'dark:bg-[rgba(45,165,176,0.13)] dark:text-[#4FC3C9] dark:hover:bg-[rgba(45,165,176,0.24)]';
