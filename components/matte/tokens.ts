/**
 * Class recipes for the matte card system.
 *
 * These live in their own module rather than in `card.tsx` because `stat.tsx`
 * needs the icon-box and label recipes too -- importing them from `card.tsx`
 * would couple the two components for no reason. Same arrangement as
 * `app/(app)/header-tokens.ts`.
 *
 * Matte rules these encode: solid fills (no backdrop-blur, no surface alpha)
 * and no shadows. Separation comes from `--matte-line` alone.
 */

export const MATTE_SURFACE =
  'rounded-2xl border border-[rgb(var(--matte-line))] bg-[rgb(var(--matte-surface))]';

export const MATTE_INSET = 'rounded-xl bg-[rgb(var(--matte-inset))]';

/** The sidebar's 22px tinted icon square, on the matte accent. */
export const MATTE_ICON_BOX =
  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md '
  + 'bg-[rgb(var(--matte-accent)/0.10)] text-[rgb(var(--matte-accent))]';

export const MATTE_LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.08em] text-[rgb(var(--matte-label))]';

/**
 * `tabular-nums` is deliberate: these are currency figures that re-render on
 * every refetch, and proportional digits make them jitter as values change.
 */
export const MATTE_VALUE =
  'font-semibold tabular-nums text-[rgb(var(--matte-value))]';

/** Pulsing placeholder used while a value is loading. */
export const MATTE_SKELETON =
  'animate-pulse rounded-md bg-[rgb(var(--matte-line))]';
