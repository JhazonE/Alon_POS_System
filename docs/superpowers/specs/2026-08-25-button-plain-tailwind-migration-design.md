# Button: Plain-Tailwind Migration (Tier 1 Pilot) — Design

**Date:** 2026-08-25
**Area:** `components/ui/button.tsx` and its 307 call sites
**Goal:** Remove the shared, cva-driven `Button` component in favor of raw `<button>` JSX with inline Tailwind classes at every call site, as the first proven slice of a larger project to move the app off shadcn/ui.

## Context

The app currently uses shadcn/ui-pattern components throughout: 39 files in `components/ui/`, imported from 434 files total. The user wants to move to plain Tailwind CSS with no shared component layer and, where the component wraps Radix UI (Dialog, Select, Dropdown, etc.), no Radix either.

This is too large for one spec. It decomposes into:

- **Tier 1 — presentational** (Button, Badge, Input, Label, Card, Separator, Skeleton, Textarea, Avatar, Progress, Table): no Radix behavior, pure styling. Lowest risk.
- **Tier 2 — simple interactive** (Tabs, Accordion, Checkbox, Switch, Radio, Tooltip, Collapsible): light state, hand-rollable.
- **Tier 3 — portal/behavior-heavy** (Dialog, Sheet, Select, Dropdown-menu, Command, Calendar, Popover, Menubar): currently Radix-backed (focus trap, keyboard nav, portal, ARIA). Highest risk to hand-roll; out of scope for now.

Rollout is incremental, not big-bang. **This spec covers only Button** — the single most-used component (307 files, 1000 JSX usages) — as the pilot that proves the pattern for the rest of Tier 1. Badge, Input, Card, Table, Label, etc. each get their own follow-up spec once this one ships.

**Note on measurement:** an earlier pass at these numbers used a single-line regex and undercounted (missed `<Button` tags whose attributes span multiple lines, which is most of them). The numbers below come from a TypeScript-compiler-API scan of every `.tsx` file's real JSX AST, which is exact.

**Non-goal / explicit scope boundary:** Tier 2 and Tier 3 components are untouched by this spec. Radix `*Trigger` components (`SheetTrigger`, `DialogTrigger`, `TooltipTrigger`, etc.) continue to wrap a plain `<button>` exactly as they wrapped the old `Button` component today — Radix's `Slot` (used internally by every `*Trigger asChild`) merges the trigger's props onto whatever single child element it's given, not specifically onto our old `Button`. Removing `Button` does not require touching any Tier 3 component, and there is no technical dependency forcing them to move together.

## Current state (verified against the codebase)

- `components/ui/button.tsx`: `cva`-based, 6 variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) × 4 sizes (`default`, `sm`, `lg`, `icon`), plus an `asChild` prop (Radix `Slot`) for rendering the button's classes onto a child element.
- **307 files** import `Button`; **1000** individual `<Button>` JSX usages (AST-accurate count).
- Variant usage: 238 default (no `variant` prop), 463 `outline`, 241 `ghost`, 17 `destructive`, 12 `secondary`, 5 `link`, **24 dynamic** (`variant={someExpr}`, e.g. `variant={viewMode === 'table' ? 'default' : 'ghost'}`) — 22 of these are in live, imported files; the other 2 are in `components/ui/carousel.tsx`, which is unused shadcn boilerplate (not imported anywhere under `app/`) and is excluded from this migration entirely (see Explicitly out of scope).
- Size usage: 516 default, 252 `sm`, 213 `icon`, 17 `lg`, 2 dynamic (both inside the excluded `carousel.tsx`).
- **599 usages (60%) also pass a custom `className`** layering extra width/spacing/shadow on top of the variant (e.g. `className="w-40 font-semibold shadow-lg shadow-primary/20"` from the purchase-order drawer) — 536 of those are a plain string literal, **63 are an expression** (`className={someExpr}`, typically an existing `cn(...)` call or ternary). All must be preserved, not dropped.
- **0 usages of `Button`'s own `asChild`** — confirmed via full AST scan, not just grep. This prop and its Radix `Slot` dependency can be dropped with no replacement needed.

## Visual design (approved)

Design proposal was reviewed and approved as an artifact mockup: same Wave brand tokens the app already defines in `app/globals.css` (`--primary`, `--secondary`, `--destructive`, `--brand-amber`, `--ring`, `--radius`) — no new colors invented. Changes from today's look:

- `rounded-md` (hardcoded 6px) → `rounded-xl`, i.e. the actual `--radius` token (12px), matching the radius already used elsewhere (cards, inputs).
- Press feedback: `active:scale-[0.97]` instead of a plain color swap.
- `primary` and `destructive` gain a soft brand-tinted shadow on rest, deepening on hover (`shadow-brand` / `shadow-brand-lg` pattern already defined in `tailwind.config.ts`).
- New `amber` variant (uses the existing `--brand-amber` token) for rare high-visibility CTAs — not a replacement for any existing variant, additive only.
- Both light and dark mode verified in the mockup against the app's existing token values for each mode.

### Class recipes

**Base (every button):**
```
inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold
tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform]
active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0
```

**Variant** (old `variant` prop value → appended classes):

| old value | new classes |
|---|---|
| `default` (→ renamed `primary` in usage, class-wise unchanged meaning) | `bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55` |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring` |
| `outline` | `border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring` |
| `ghost` | `hover:bg-accent focus-visible:ring-ring` |
| `destructive` | `bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55` |
| `link` | `text-primary underline-offset-4 decoration-primary/35 hover:decoration-primary h-auto px-0` — **special case:** the codemod must skip the size table entirely for `link` (no `h-*`/`px-*` classes from the size row get appended). Static Tailwind class strings don't resolve conflicts the way `cn()`/`tailwind-merge` does — two competing height utilities like `h-10` and `h-auto` in the same string aren't decided by attribute order, only by Tailwind's internal build order, which is not something to rely on (this exact class of bug already bit the Sheet/drawer conversion earlier in this project — see the width-override fix in the purchase-order/sales-order/invoice/bad-order drawers). |
| *(new)* `amber` | `bg-[hsl(var(--brand-amber))] text-[hsl(var(--brand-amber-foreground))] hover:bg-[hsl(var(--brand-amber)/0.9)] focus-visible:ring-[hsl(var(--brand-amber)/0.55)]` |

**Size** (old `size` prop value → classes):

| old value | new classes |
|---|---|
| `default` | `h-10 px-[18px]` |
| `sm` | `h-8 px-[13px] text-xs rounded-lg gap-1.5` |
| `lg` | `h-[46px] px-6 text-[15px]` |
| `icon` | `h-10 w-10 p-0` (or `h-8 w-8` when combined with `size="sm"`) |

Full interactive reference: https://claude.ai/code/artifact/89f24d6c-8be2-4204-8f97-c11a8f4b35db

## Migration mechanics

Given 671 usages, this is not hand-edited file by file. Approach:

1. **AST codemod** (ts-morph script, run locally, not committed) walks each `.tsx` file, finds `<Button ...>` JSX elements, and for each one:
   - Reads `variant` and `size` prop literals (string values only) and looks up the corresponding class fragments from the tables above.
   - Reads any existing `className` and appends it after the computed classes. Of the 599 usages that pass one, 536 are a plain string literal (`className="w-40 ..."`) — appended directly. The remaining **63 use an expression** (`className={someExpr}`) — these are still handled by the codemod, wrapped as a template literal (`` className={`${computed} ${someExpr}`} ``), since JSX only requires the final value be a string and this preserves whatever conditional logic the expression already contains. Either way, computed classes go first and the existing value last, so page-specific overrides like `w-40` still win — but see the `link`-variant caveat below: this ordering trick only works because none of the 599 existing `className` values compete with the base/variant/size classes on the *same* utility (they add spacing/width/shadow, not conflicting height/display utilities). Verify that assumption per-batch rather than trusting it project-wide.
   - Rewrites the JSX tag from `Button` to `button`, drops the `variant`/`size` props, sets the merged `className`, and leaves every other prop (`onClick`, `type`, `disabled`, `ref`, `aria-*`, children) untouched.
   - Removes the `Button` import from the file if no longer referenced.
2. **22 dynamic `variant={expr}` usages** (in live files — the 2 more inside unused `carousel.tsx` are out of scope, see below) are excluded from the codemod and fixed by hand — each becomes a small inline conditional building the class string (the existing `cn()` helper in `@/lib/utils` is fine to keep using for this — `cn` itself has no shadcn/Radix dependency, it's just `clsx` + `tailwind-merge`). Exact locations:
   - `inventory/repackaging/consolidation-form.tsx:182,190`, `inventory/repackaging/repackaging-form.tsx:166,174`, `products/break-pack/break-pack-dialog.tsx:139,147` — all six are the identical `targetType/targetMode === 'search' ? 'secondary' : 'ghost'` pattern.
   - `inventory/stock-adjustment-dialog/StockAdjustmentDialog.tsx:267`, `inventory/[productId]/serials/add-serial-number-dialog.tsx:56,64`, `pos/customer-account/CustomerAccountDialog.tsx:461,472`, `pos/membership/MembershipPaymentDialog.tsx:181,184`, `sales/details/DetailsPagination.tsx:54` — `'default' : 'outline'` (or `: 'destructive'`) two-way toggles.
   - `reports/sales/returns/page.tsx:418,427`, `reports/sales/summary/page.tsx:386,395`, `sales/returns/ReturnsDataSection.tsx:84,88`, `sales/voids/VoidsDataSection.tsx:82,86` — all eight are the identical `viewMode === 'table'/'card' ? 'default' : 'ghost'` view-toggle pattern.
3. `components/ui/button.tsx` and its `buttonVariants` export are **not deleted until every batch below is done** — keeping it in place means a missed usage simply keeps compiling against the old component (visually inconsistent, but never a build break) until it's caught and migrated. The final step deletes the file; `npm run typecheck` immediately after is the proof that nothing still references it.

## Rollout (batches, by module — smallest/lowest-traffic first)

| # | Batch | Files |
|---|---|---|
| 1 | `purchases` | 11 |
| 2 | `suppliers` | 12 |
| 3 | `dashboard` + `restock` + `developer` + `user-management` | 13 |
| 4 | `customer` | 19 |
| 5 | `inventory` | 28 |
| 6 | `reports` | 23 |
| 7 | `products` | 45 |
| 8 | `settings` | 36 |
| 9 | `pos` | 46 |
| 10 | `sales` | 57 |
| 11 | shared: `components/ui`, `components/approvals`, `theme-toggle`, `license-gate`, `import-wizard`, `app/login`, `app/signup`, `app/activate` | ~17 |
| 12 | Delete `components/ui/button.tsx` + `buttonVariants` export; full-project `typecheck` | — |

`pos` and `sales` are deliberately late: highest interaction density (checkout flow, shift management) and the most existing `data-*`/analytics hooks on buttons, so the pattern should already be well-proven by the time they're touched. Batch 11 (shared components) goes right before the final deletion so any shared-component edge cases surface after 290 files' worth of precedent already exists.

Each batch: run codemod → fix the batch's dynamic-variant cases by hand → `npm run typecheck` → spot-check 2–3 pages of that module in the browser (dev server, same Playwright-screenshot approach used for the drawer conversion) → commit.

## Testing / verification

- `npm run typecheck` after every batch — catches prop usages the codemod didn't anticipate (e.g. a ref forwarding pattern).
- No existing automated test covers `Button` rendering directly (no `.test.tsx` under `components/ui`); visual spot-checks via the dev server are the primary safety net, same method already used and proven for the drawer (Sheet) conversion.
- Final batch's `typecheck` after deleting `button.tsx` is the hard proof of 100% migration — any leftover `import { Button }` fails the build immediately.

## Explicitly out of scope

- Badge, Input, Card, Table, Label, Separator, Skeleton, Textarea, Avatar, Progress — remaining Tier 1 components, each gets its own follow-up spec reusing this same pattern.
- Tier 2 (Tabs, Accordion, Checkbox, Switch, Radio, Tooltip, Collapsible) and Tier 3 (Dialog, Sheet, Select, Dropdown-menu, Command, Calendar, Popover, Menubar) — separate, later phases; still Radix-backed for now.
- `Button`'s `asChild` prop — 0 usages found; dropped with no replacement.
- `components/ui/carousel.tsx` — a shadcn component that itself renders two `<Button>`s for its prev/next controls, but is not imported anywhere under `app/`. Left as unmigrated dead code; if it's ever wired up, it goes through the same codemod at that time.
