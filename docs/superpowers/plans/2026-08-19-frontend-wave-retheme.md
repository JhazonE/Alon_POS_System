# Frontend Wave Retheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "Premium Slate/Indigo" shadcn theme with the approved "Wave" (Alon-branded teal/amber) palette, by re-theming CSS design tokens and normalizing shadow/radius usage in the small number of components that don't already inherit purely from tokens — without touching Radix primitives, component structure, or any page-level code.

**Architecture:** shadcn here is CSS-variable driven (`hsl(var(--primary))` etc. in `tailwind.config.ts`, consumed by ~420 files). Changing the `:root` token values in `app/globals.css` cascades the new palette to all of them for free. A second, smaller pass fixes the handful of `components/ui/*.tsx` files that hardcode a shadow/radius utility class instead of inheriting one, so the new "soft teal shadow" shape language is consistent everywhere. Verification is visual (no automated visual-regression tooling exists in this repo) plus the existing typecheck/lint/e2e suite as a behavior-regression safety net.

**Tech Stack:** Next.js 16, Tailwind CSS 3.4, shadcn/ui + Radix UI, class-variance-authority.

**Spec:** `docs/superpowers/specs/2026-08-19-frontend-wave-retheme-design.md`

## Global Constraints

- No dark-mode work — the `.dark` block in `app/globals.css` is left untouched.
- No changes to `components/ui/*.tsx` structure, props, or Radix usage — only Tailwind utility class values (color/shadow/radius) inside existing `cva`/`cn` calls.
- No typeface change — Inter stays.
- Hardcoded Tailwind palette classes outside `components/ui/` (e.g. `bg-blue-500`) are out of scope for this plan — flagged in the spec as a separate follow-up pass, not to be swept here.
- Print/receipt code (`lib/receipt-generator.ts` and friends) is untouched — it doesn't consume these tokens.

## Components Checked, No Change Needed

The spec's candidate list (`components/ui/*.tsx` with visible chrome, plus
`AppSidebar.tsx`/`logo.tsx`) was audited file-by-file before writing the
tasks below. These are **entirely token-driven already** (`bg-primary`,
`bg-sidebar`, `hsl(var(--sidebar-border))`, etc., no hardcoded hex or
Tailwind palette classes) and their existing radius/shadow classes already
match the spec's scale — they need zero edits and will pick up the new
palette automatically once Task 1 lands:

`button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx` (trigger only —
its dropdown content IS touched in Task 3), `badge.tsx`, `alert.tsx`,
`table.tsx`, `checkbox.tsx`, `radio-group.tsx`, `progress.tsx`,
`calendar.tsx`, `sidebar.tsx`, `app/(app)/AppSidebar.tsx`,
`components/logo.tsx`, `components/ui/chart.tsx` (its `#ccc`/`#fff`
references are Recharts CSS attribute-selectors matching Recharts' own
inline styles, not app colors).

If Task 5's manual sweep finds one of these actually needs a tweak, treat
it as a scope addition to Task 5 Step 5, not a sign this audit was wrong —
visual review of live pages catches things static grep can't.

---

## Task 1: Retheme CSS design tokens

**Files:**
- Modify: `app/globals.css:6-53` (the `:root` block only — `.dark` block at line 55+ is untouched)

**Interfaces:**
- Produces: new HSL values for `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--sidebar-*` (8 vars), plus 4 new vars: `--success`, `--success-bg`, `--warning`, `--warning-bg`. Every later task and every existing `hsl(var(--x))` consumer in the app relies on these names being unchanged — only the values change.

- [ ] **Step 1: Replace the `:root` token block**

Open `app/globals.css`. Replace the entire `:root { ... }` block (currently lines 6-53, from `/* Premium Slate/Indigo Palette - Light Mode */` through the closing `}` before `.dark {`) with:

```css
  :root {
    /* Wave Palette (Alon-branded) - Light Mode */
    --background: 180 37% 97%;      /* Very light teal-white */
    --foreground: 185 61% 11%;      /* Deep teal-slate for text */

    --card: 0 0% 100%;
    --card-foreground: 185 61% 11%;

    --popover: 0 0% 100%;
    --popover-foreground: 185 61% 11%;

    --primary: 185 81% 29%;         /* Deep teal */
    --primary-foreground: 0 0% 100%;

    --secondary: 180 33% 92%;
    --secondary-foreground: 185 61% 11%;

    --muted: 180 33% 92%;
    --muted-foreground: 182 25% 39%;

    --accent: 36 88% 59%;           /* Warm amber */
    --accent-foreground: 185 61% 11%;

    --destructive: 9 73% 41%;
    --destructive-foreground: 0 0% 100%;

    --border: 180 33% 92%;
    --input: 180 33% 92%;
    --ring: 185 81% 29%;

    --radius: 0.75rem;

    --success: 153 78% 27%;
    --success-bg: 150 45% 91%;
    --warning: 42 87% 31%;
    --warning-bg: 43 95% 92%;

    --chart-1: 185 81% 29%;
    --chart-2: 36 88% 59%;
    --chart-3: 153 78% 27%;
    --chart-4: 217 60% 55%;
    --chart-5: 9 73% 55%;

    /* Sidebar - Deep Teal-Slate */
    --sidebar-background: 185 61% 11%;
    --sidebar-foreground: 177 46% 83%;
    --sidebar-primary: 185 81% 29%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 185 50% 16%;
    --sidebar-accent-foreground: 177 46% 83%;
    --sidebar-border: 185 50% 18%;
    --sidebar-ring: 185 81% 29%;
  }
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, open `http://localhost:3000/dashboard` in a browser. Expected: page background is a very light aqua tint, sidebar is dark teal (not navy), the active sidebar nav item and primary buttons are deep teal, not blue. Text should remain clearly readable (dark teal-slate on light backgrounds, light teal on the dark sidebar).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: retheme CSS design tokens to Wave (Alon-branded) palette"
```

---

## Task 2: Add brand shadow tokens to Tailwind config

**Files:**
- Modify: `tailwind.config.ts:73-78` (insert a new `boxShadow` block as a sibling of the existing `borderRadius` block, inside `theme.extend`)

**Interfaces:**
- Consumes: nothing new (reads the same `--primary` HSL numbers already in `globals.css`, hardcoded as an rgba shadow color since Tailwind's `boxShadow` can't reference `hsl(var(--x))` with alpha compositing the same way `colors` can).
- Produces: two new Tailwind utility classes, `shadow-brand` and `shadow-brand-lg`, consumed by Task 3 and Task 4.

- [ ] **Step 1: Add the `boxShadow` block**

In `tailwind.config.ts`, inside `theme.extend`, add a `boxShadow` key as a sibling to `borderRadius`:

```ts
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		boxShadow: {
  			brand: '0 1px 3px rgba(14,124,134,.10)',
  			'brand-lg': '0 4px 20px rgba(14,124,134,.10)'
  		},
```

(The rgba values are the `--primary` teal `#0E7C86` at 10% opacity — matches the approved mockup. These are intentionally hardcoded rather than derived from the CSS variable: Tailwind's `boxShadow` scale is resolved at build time and can't do runtime `hsl(var(--x) / 10%)` composition the way the `colors` scale does.)

- [ ] **Step 2: Manual verification**

Run `npm run dev` (restart if it was already running, so Tailwind picks up the config change). No visual difference is expected yet — `shadow-brand`/`shadow-brand-lg` aren't used anywhere until Task 3/4. Confirm the dev server starts without a Tailwind config error (a malformed `boxShadow` block fails the build immediately).

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "style: add shadow-brand/shadow-brand-lg utilities for the Wave retheme"
```

---

## Task 3: Apply brand shadow + normalize radius on elevated/overlay surfaces

**Files:**
- Modify: `components/ui/dialog.tsx:41`
- Modify: `components/ui/sheet.tsx:34`
- Modify: `components/ui/alert-dialog.tsx:39`
- Modify: `components/ui/popover.tsx:22`
- Modify: `components/ui/dropdown-menu.tsx:50,68`
- Modify: `components/ui/select.tsx:78`
- Modify: `components/ui/tooltip.tsx:22`
- Modify: `components/ui/command.tsx:29`

**Interfaces:**
- Consumes: `shadow-brand-lg` (from Task 2).
- Produces: nothing new — this is a pure class-value swap, no prop/API changes. Every consumer of `Dialog`, `Sheet`, `AlertDialog`, `Popover`, `DropdownMenu`, `Select`, `Tooltip`, and `Command` across the app is affected automatically with no per-caller changes.

- [ ] **Step 1: `components/ui/dialog.tsx`**

Find (line 41):
```
        "fixed inset-0 z-[100] grid w-[calc(100vw-2rem)] sm:max-w-lg h-fit max-h-[90vh] m-auto gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out rounded-3xl overflow-y-auto",
```
Replace with:
```
        "fixed inset-0 z-[100] grid w-[calc(100vw-2rem)] sm:max-w-lg h-fit max-h-[90vh] m-auto gap-4 border bg-background p-6 shadow-brand-lg duration-200 data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out rounded-lg overflow-y-auto",
```
(Two changes: `shadow-lg` → `shadow-brand-lg`, and `rounded-3xl` → `rounded-lg` — the old value was a one-off oversized radius inconsistent with every other container in the app; the spec's container radius is `rounded-lg`.)

- [ ] **Step 2: `components/ui/sheet.tsx`**

Find (line 34):
```
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
```
Replace `shadow-lg` with `shadow-brand-lg` (rest of the string unchanged).

- [ ] **Step 3: `components/ui/alert-dialog.tsx`**

Find (line 39):
```
        "fixed left-[50%] top-[50%] z-[110] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
```
Replace `shadow-lg` with `shadow-brand-lg` (radius is already `sm:rounded-lg`, correct — leave as-is).

- [ ] **Step 4: `components/ui/popover.tsx`**

Find (line 22):
```
        "z-[150] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
```
Replace `shadow-md` with `shadow-brand-lg`.

- [ ] **Step 5: `components/ui/dropdown-menu.tsx`**

Two separate class strings need the same swap — `DropdownMenuContent` (line 50) and `DropdownMenuSubContent` or similar (line 68). Find (line 50):
```
      "z-[150] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
```
Replace `shadow-lg` with `shadow-brand-lg`.

Find (line 68):
```
        "z-[150] max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
```
Replace `shadow-md` with `shadow-brand-lg`.

- [ ] **Step 6: `components/ui/select.tsx`**

Find (line 78):
```
      "relative z-[150] max-h-[--radix-select-content-available-height] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-select-content-transform-origin]",
```
Replace `shadow-md` with `shadow-brand-lg`.

- [ ] **Step 7: `components/ui/tooltip.tsx`**

Find (line 22):
```
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-tooltip-content-transform-origin]",
```
Replace `shadow-md` with `shadow-brand-lg`.

- [ ] **Step 8: `components/ui/command.tsx`**

Find (line 29):
```
      <DialogContent className="overflow-hidden p-0 shadow-lg">
```
Replace with:
```
      <DialogContent className="overflow-hidden p-0 shadow-brand-lg">
```

- [ ] **Step 9: Manual verification**

Run `npm run dev`. Open `http://localhost:3000/products` (or any list page). Trigger, in turn: a dialog (e.g. "Add Product"), a dropdown menu, a select dropdown, and a tooltip (hover an icon button). Expected for each: soft teal-tinted shadow instead of flat gray, and — specifically for the dialog — visibly smaller corner radius than before (matching cards, not an exaggerated pill shape).

- [ ] **Step 10: Commit**

```bash
git add components/ui/dialog.tsx components/ui/sheet.tsx components/ui/alert-dialog.tsx components/ui/popover.tsx components/ui/dropdown-menu.tsx components/ui/select.tsx components/ui/tooltip.tsx components/ui/command.tsx
git commit -m "style: apply brand shadow + normalize dialog radius on overlay components"
```

---

## Task 4: Apply brand shadow to resting surfaces (Card, Switch)

**Files:**
- Modify: `components/ui/card.tsx:12`
- Modify: `components/ui/switch.tsx:22`

**Interfaces:**
- Consumes: `shadow-brand` (from Task 2).
- Produces: nothing new — class-value swap only.

- [ ] **Step 1: `components/ui/card.tsx`**

Find (line 12):
```
      "rounded-lg border bg-card text-card-foreground shadow-sm",
```
Replace with:
```
      "rounded-lg border bg-card text-card-foreground shadow-brand",
```

- [ ] **Step 2: `components/ui/switch.tsx`**

Find (line 22):
```
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
```
Replace `shadow-lg` with `shadow-brand` (the toggle knob is a small resting element, not an elevated overlay).

- [ ] **Step 3: Manual verification**

Run `npm run dev`. Open `http://localhost:3000/dashboard` — every KPI/summary `Card` should show the soft teal-tinted shadow instead of flat gray. Open a settings page with a toggle (e.g. Settings → any boolean switch) and confirm the switch knob still looks correct (subtle shadow, not the harsh default).

- [ ] **Step 4: Commit**

```bash
git add components/ui/card.tsx components/ui/switch.tsx
git commit -m "style: apply brand shadow to Card and Switch"
```

---

## Task 5: Full regression pass

**Files:** none (verification only)

**Interfaces:** none — this task consumes the completed retheme from Tasks 1-4 and confirms nothing broke.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Class-string edits don't affect TypeScript types; this catches any accidental syntax slip introduced while editing.)

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: E2E regression**

Run: `npm run test:e2e`
Expected: all tests pass. These assert behavior and DOM structure, not visual styling, so they should be unaffected by this plan — a failure here means a class-string edit accidentally broke a selector or interaction, not styling.

- [ ] **Step 4: Manual visual sweep**

With `npm run dev` running, visit each of the following and confirm the Wave palette (teal/amber, not blue/slate) reads consistently and nothing is illegible:
- `/dashboard` — KPI cards, charts (chart colors should be teal/amber/green-based, not blue/indigo)
- `/pos` — the POS checkout terminal (highest-traffic screen for cashiers)
- `/products` or `/inventory` — a dense data table page
- Any add/edit dialog (e.g. Add Product) — dialog shadow/radius, form inputs, select dropdowns
- The sidebar in both its default and any collapsed/icon-only state it supports

Specifically watch for the two risks called out in the spec: (1) text on
muted/secondary surfaces (disabled states, table zebra striping if any)
staying readable against the new light-teal `background`/`muted` tones,
since they're close in lightness to `border`; (2) the dark-teal sidebar
against the light-teal rest of the app reading as intentional brand
contrast, not a bug.

- [ ] **Step 5: Commit (if manual sweep required fixes)**

If Step 4 surfaces an issue, fix it in the relevant `components/ui/*.tsx` file (following the same class-swap pattern as Tasks 3-4), re-run Steps 1-4, then:

```bash
git add -A
git commit -m "style: fix visual regression found in Wave retheme sweep"
```

If Step 4 finds no issues, no commit is needed for this task.
