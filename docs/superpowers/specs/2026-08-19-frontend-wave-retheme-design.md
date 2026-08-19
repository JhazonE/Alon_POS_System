# Frontend Retheme: "Wave" (Alon-branded) — Design

## Goal

Replace the current "Premium Slate/Indigo" shadcn theme — the generic
blue/slate look shared by countless AI-scaffolded apps — with a distinct,
brand-appropriate visual identity for Alon POS, without replacing the
underlying component library.

Approved via brainstorming session (visual companion mockups) on 2026-08-19.
Direction: **Wave** — a teal/aqua base (nods to "Alon" = wave) with a warm
amber accent, soft teal-tinted shadows, and slightly rounded shape language.

## Non-Goals

- **Not a component library swap.** Radix primitives + shadcn's structural
  code (`components/ui/*.tsx`) stay. Only visual treatment (color, radius,
  shadow, a few spacing tweaks) changes. Accessibility, keyboard nav, and
  form behavior are untouched.
- **No dark mode work.** The `.dark` block in `globals.css` is left as-is
  (not deleted, just not redesigned) — light mode is the only themed target
  of this pass. If dark mode is switched on somewhere it will look stale,
  but nothing currently forces dark mode on, so this is not a regression.
- **The 143-file hardcoded-color sweep is out of scope.** Files using literal
  Tailwind palette classes (`bg-blue-500`, `text-slate-600`, etc. — mostly
  one-off status text and chart annotations) bypass the CSS-variable token
  system and will not visually update from this pass. They are not part of
  the primary chrome (nav, buttons, cards, tables, dialogs, inputs) so the
  app will look cohesively re-themed even before they're touched. Follow-up
  pass, tracked separately.
- **Print/receipt output is untouched.** `lib/receipt-generator.ts` and
  friends build raw ESC/POS byte buffers and HTML print views independent
  of shadcn/Tailwind tokens — out of scope by construction, not a decision
  made here.
- **No typeface change.** Inter stays. It reads well in dense tables and
  receipts; the "generic" feel was about color/shape, not the font.

## Design Tokens

All values replace the corresponding CSS custom properties in
`app/globals.css` under `:root` (the `.dark` block is left untouched per
Non-Goals). HSL triplets match the file's existing `H S% L%` format so
`hsl(var(--x))` usage elsewhere needs no changes.

| Token | New value (HSL) | Hex reference | Notes |
|---|---|---|---|
| `--background` | `180 37% 97%` | `#F4FAFA` | page background |
| `--foreground` | `185 61% 11%` | `#0B2B2E` | body text |
| `--card` | `0 0% 100%` | `#FFFFFF` | unchanged |
| `--card-foreground` | `185 61% 11%` | `#0B2B2E` | |
| `--popover` | `0 0% 100%` | `#FFFFFF` | unchanged |
| `--popover-foreground` | `185 61% 11%` | `#0B2B2E` | |
| `--primary` | `185 81% 29%` | `#0E7C86` | buttons, active nav, links, focus ring |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | |
| `--secondary` | `180 33% 92%` | `#E3F1F1` | secondary buttons/pills bg |
| `--secondary-foreground` | `185 61% 11%` | `#0B2B2E` | |
| `--muted` | `180 33% 92%` | `#E3F1F1` | same as secondary |
| `--muted-foreground` | `182 25% 33%` | `#3F6869` | labels, secondary text (darkened from the original 39% for WCAG AA contrast — see ledger) |
| `--accent` | `36 88% 59%` | `#F2A93B` | warm amber — highlights, brand mark |
| `--accent-foreground` | `185 61% 11%` | `#0B2B2E` | dark text on amber for contrast |
| `--destructive` | `9 73% 41%` | `#B4321C` | delete/void |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | |
| `--border` | `180 33% 92%` | `#E3F1F1` | |
| `--input` | `180 33% 92%` | `#E3F1F1` | same as border |
| `--ring` | `185 81% 29%` | `#0E7C86` | same as primary |
| `--radius` | `0.75rem` | — | unchanged; cards/panels/dialogs |

New tokens (not in current shadcn set, additive — used by status pills that
today hardcode green/amber/red text; not a required migration in this pass,
but available for any component touched during implementation):

| Token | New value (HSL) | Hex reference |
|---|---|---|
| `--success` | `153 78% 27%` | `#0F7A4A` |
| `--success-bg` | `150 45% 91%` | `#DFF3E9` |
| `--warning` | `42 87% 31%` | `#946B0A` |
| `--warning-bg` | `43 95% 92%` | `#FEF3D8` |

Chart palette (`--chart-1..5`, used by `components/ui/chart.tsx` and report
pages) — kept coherent with the new base instead of the old blue/indigo set:

| Token | New value (HSL) |
|---|---|
| `--chart-1` | `185 81% 29%` (primary teal) |
| `--chart-2` | `36 88% 59%` (amber) |
| `--chart-3` | `153 78% 27%` (success green) |
| `--chart-4` | `217 60% 55%` (soft blue, for a 4th series) |
| `--chart-5` | `9 73% 55%` (warm coral) |

Sidebar tokens (`--sidebar-*`, consumed by `components/ui/sidebar.tsx` and
`app/(app)/AppSidebar.tsx`) — dark teal-slate chrome instead of the old
navy, so the persistent nav itself carries the brand color:

| Token | New value (HSL) | Hex reference |
|---|---|---|
| `--sidebar-background` | `185 61% 11%` | `#0B2B2E` |
| `--sidebar-foreground` | `177 46% 83%` | `#BFE7E5` |
| `--sidebar-primary` (active item bg) | `185 81% 29%` | `#0E7C86` |
| `--sidebar-primary-foreground` | `0 0% 100%` | `#FFFFFF` |
| `--sidebar-accent` (hover state) | `185 50% 16%` | — |
| `--sidebar-accent-foreground` | `177 46% 83%` | `#BFE7E5` |
| `--sidebar-border` | `185 50% 18%` | — |
| `--sidebar-ring` | `185 81% 29%` | `#0E7C86` |

## Shape & Shadow

- Small controls (buttons, inputs, badges, select triggers): use Tailwind's
  `rounded-md` (`calc(var(--radius) - 2px)` ≈ `0.5rem` off the existing
  `--radius: 0.75rem`). Containers (cards, panels, dialogs, sheets, popovers):
  use `rounded-lg` (`var(--radius)`, `0.75rem`). No new radius token —
  `tailwind.config.ts` already computes both steps off `--radius`; the work
  is normalizing each component to the correct one of the two existing
  classes, not inventing a third.
- Shadows: replace the flat gray `shadow-sm` used on `Card` and similar
  surfaces with a soft teal-tinted shadow (`0 1px 3px rgba(14,124,134,.10)`
  for resting cards, `0 4px 20px rgba(14,124,134,.10)` for elevated
  surfaces like dialogs/sheets). Implemented as Tailwind `boxShadow` entries
  in `tailwind.config.ts` (e.g. `shadow-brand`, `shadow-brand-lg`) so
  component files reference a class name, not inline styles.

## Implementation Scope

1. **`app/globals.css`** — replace the `:root` token block with the values
   above. Leave `.dark` block untouched (Non-Goals). Leave the `@media
   print`, `.glass`/`.glass-card` utilities, and dialog animation keyframes
   untouched — orthogonal to color/shape.
2. **`tailwind.config.ts`** — add `shadow-brand`/`shadow-brand-lg` box-shadow
   entries; verify `borderRadius` scale still maps correctly off `--radius`.
3. **`components/ui/*.tsx`** — pass over files with visible chrome to
   normalize radius/shadow class usage against the new scale:
   `button.tsx`, `card.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`,
   `badge.tsx`, `dialog.tsx`, `sheet.tsx`, `popover.tsx`, `dropdown-menu.tsx`,
   `tabs.tsx`, `table.tsx`, `alert.tsx`, `alert-dialog.tsx`, `command.tsx`,
   `calendar.tsx`, `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`,
   `tooltip.tsx`, `progress.tsx`, `sidebar.tsx`. (Not every file needs a
   change — most inherit correctly from tokens alone; this list is the
   candidates to check, not a guaranteed edit list.)
4. **`app/(app)/AppSidebar.tsx`** and **`components/logo.tsx`** — verify the
   nav chrome and brand mark read correctly against the new sidebar tokens
   (these already went through the Verdix→Alon POS rebrand, so only color
   token consumption should need checking, not text/asset changes).
5. **Spot-check, not rewrite:** dashboard (`app/(app)/dashboard`), POS
   checkout (`app/(app)/pos`), a data-table-heavy page (e.g. inventory or
   sales orders list), and a dialog/form flow (e.g. add product) — visually
   verify these render correctly under the new tokens since they're the
   highest-traffic screens. No code changes expected here beyond what falls
   out of steps 1-4, since these pages consume `components/ui` primitives
   rather than hardcoding shadcn's old colors.

## Verification

- `npm run dev`, visually check: dashboard, POS terminal, a list/table page,
  a dialog (e.g. add/edit product), the sidebar nav in both expanded and any
  collapsed state it supports.
- `npm run typecheck` and `npm run lint` — token/class changes should not
  affect types, but confirms no stray syntax errors from the edit pass.
- No `npm run test:e2e` changes expected/required — these tests assert
  behavior and DOM structure, not visual styling, so they should be
  unaffected. Run once after the pass as a regression check.

## Risks

- **Contrast regressions:** the new light teal `background`/`muted` tones
  are close in lightness to `secondary`/`border` — verify text on muted
  surfaces (e.g. disabled states, table zebra striping if any) stays
  readable. Spot-check during verification rather than computing contrast
  ratios for every pairing up front.
- **Sidebar dark chrome vs. rest-of-app light chrome:** intentional (matches
  the approved mockup), but flagging since it's a bigger visual break from
  the current all-light-slate sidebar than the rest of the retheme.
