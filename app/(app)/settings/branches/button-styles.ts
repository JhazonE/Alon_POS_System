/**
 * The settings pages style their buttons with one shared class string rather
 * than a Button component (see settings/pos-terminals). These are those same
 * strings, named once so the branch page does not repeat them 12 times.
 */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

export const primaryButton = `${BASE} bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]`;

export const outlineButton = `${BASE} border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]`;

export const smallOutlineButton = `${BASE} border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-3`;

export const smallDestructiveButton = `${BASE} border border-destructive/20 bg-background text-destructive hover:bg-destructive/10 focus-visible:ring-ring h-8 px-3`;
