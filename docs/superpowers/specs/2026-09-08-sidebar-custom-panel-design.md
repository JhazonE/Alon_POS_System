# Sidebar: Custom Panel, No shadcn — Design

**Date:** 2026-09-08
**Area:** `components/ui/sidebar.tsx` and its three consumers
**Goal:** Replace shadcn's sidebar with a hand-built panel in a new visual direction ("Segmented cards"), removing `components/ui/sidebar.tsx` entirely.

## Context

This continues the plain-Tailwind migration begun in
`2026-08-25-button-plain-tailwind-migration-design.md`, which deleted the shared
`Button` component. That spec tiered the remaining shadcn surface: Tier 1
presentational, Tier 2 simple interactive (including Collapsible), Tier 3
portal/behaviour-heavy. The sidebar was not tiered there — it spans all three,
since it owns layout, state, a Radix `Collapsible`-style accordion, and (on
mobile) a Radix Dialog.

Unlike the Button migration, this is **not** a like-for-like replacement. The
user reviewed three visual directions on a design canvas and chose **B —
Segmented cards**, so the look changes at the same time the dependency goes.

Canvas: https://claude.ai/code/artifact/bdd7c0b3-4945-462c-9bbb-27e3d7d15fd3

## Goals

- Delete `components/ui/sidebar.tsx`.
- Ship the Segmented-cards design.
- Preserve every behaviour the current sidebar has: collapse, its cookie, Ctrl+B,
  a mobile drawer, and the single-open accordion added in `93c65aa`.
- Leave the rest of the app untouched.

## Non-goals

- **Not** a broader Radix or shadcn removal. `Sheet`, `Tooltip`, `Separator` and
  `Skeleton` all stay — they are used far beyond the sidebar (counts below) and
  removing them is separate work.
- Not a change to what the nav *links to*. The routes and `lib/page-registry.ts`
  are settled by the four preceding commits and are not revisited here.
- Not a redesign of the app header, breadcrumbs, or page content.

## Current state (verified against the codebase)

`components/ui/sidebar.tsx` is **777 lines** exporting **24** symbols. Only
**14** are used anywhere; these **10 are already dead** and go without
replacement:

`SidebarRail`, `SidebarTrigger`, `SidebarInput`, `SidebarSeparator`,
`SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuSkeleton`,
`SidebarGroupAction`, `SidebarGroupContent`, `SidebarMenuSubItem`.

**Three** files import it:

| File | Uses |
|---|---|
| `app/(app)/AppSidebar.tsx` | the panel and all menu primitives, `useSidebar` |
| `app/(app)/layout.tsx` | `SidebarProvider`, `SidebarInset` |
| `components/AnimatedSidebarTrigger.tsx` | `useSidebar` only (`toggleSidebar`, `state`) |

Its shadcn/Radix dependencies, and whether removing the sidebar frees them:

| Dependency | Used by the sidebar for | Files importing it elsewhere | Freed? |
|---|---|---|---|
| `@radix-ui/react-slot` | `asChild` on menu buttons | — | yes |
| `Sheet` (Radix Dialog) | the mobile drawer | **35** | no |
| `Tooltip` (Radix) | labels when collapsed | **6** | no |
| `Separator` | only the dead `SidebarSeparator` | **10** | no |
| `Skeleton` | only the dead `SidebarMenuSkeleton` | **34** | no |

Constants that are part of the contract with existing installs:

- cookie `sidebar_state`, values `"true"`/`"false"`, `max-age` `60*60*24*7`
- widths `16rem` expanded, `3rem` icon, `18rem` mobile
- keyboard shortcut `b` with meta/ctrl
- mobile breakpoint **768px** (`hooks/use-mobile.tsx`)

`app/(app)/layout.tsx` seeds the initial state itself by reading that cookie
with `document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/)`, defaulting
to open. **The new provider must keep writing that exact cookie name and
values** or a collapsed sidebar silently springs open for every existing user on
their next reload.

## Visual design (approved)

Direction B from the canvas, drawn in the app's real tokens — no new colours:

| Token | Value | Role |
|---|---|---|
| `--sidebar-background` | `185 61% 11%` (`#0B2A2D`) | panel |
| `--sidebar-foreground` | `177 46% 83%` (`#C0E8E6`) | text |
| `--sidebar-primary` | `185 81% 29%` (`#0E7C86`) | active row fill |
| `--sidebar-accent` | `185 50% 16%` (`#143A3D`) | open-section row |
| `--sidebar-border` | `185 50% 18%` (`#174145`) | panel border |
| `--brand-amber` | `36 88% 59%` (`#F2A93A`) | the approvals badge |

Type is Inter, matching `tailwind.config.ts`.

Anatomy: a floating 280px panel inset 10px with a 16px radius and a 1px border.
Inside it, a header (logo mark, wordmark, `ENTERPRISE`), a filled search box
carrying a `⌘K` chip, then a stack of **group cards** — each a `#0F3336` surface
with a 1px `#17403F` border, a 12px radius, and its group label set inside it at
8px/0.15em. Rows are 32px with the icon in a 22px tinted square.

Row states, which supersede the plain-rows treatment of `7335b1e`:

- **rest** — `rgba(192,232,230,0.66)`, weight 400
- **hover** — background `#143A3D`
- **active** — background `#0E7C86`, text `#FFFFFF`, weight 600, icon square
  `rgba(255,255,255,0.18)`
- **open accordion parent** — background `#143A3D`, icon tinted `#4FC3C9`,
  chevron rotated

Sub-items indent 19px behind a 1px `#1F5155` rail, 28px tall, 12px text.

## Architecture

One 777-line file becomes four focused ones. The split follows the boundary that
actually exists: state, shell, and the repeated group card.

```
components/sidebar/
  sidebar-context.tsx   provider, useSidebar, cookie, Ctrl+B, breakpoint
  sidebar-shell.tsx     panel frame: expanded / collapsed rail / mobile drawer
  nav-card.tsx          one group card: label, rows, single-open accordion
app/(app)/AppSidebar.tsx   composes the above from layout-nav-config
```

`AppSidebar.tsx` keeps its current job — turning `layout-nav-config` plus
permissions into markup — and keeps the `openSection` accordion state added in
`93c65aa`. It stops knowing anything about how a panel is built.

### sidebar-context.tsx

Plain React, no Radix. Exposes exactly what the three consumers use today:

```ts
type SidebarState = {
  open: boolean;                   // expanded on desktop
  setOpen: (v: boolean) => void;
  toggle: () => void;              // what Ctrl+B and the trigger call
  state: 'expanded' | 'collapsed'; // AnimatedSidebarTrigger reads this
  isMobile: boolean;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};
```

`toggle()` switches `mobileOpen` when `isMobile`, `open` otherwise — matching
current behaviour. Every `setOpen` writes the `sidebar_state` cookie with the
constants above. The Ctrl+B listener is one `useEffect` on `window`.

`AnimatedSidebarTrigger` needs only a rename of `toggleSidebar` → `toggle`; its
markup is already a plain button and does not otherwise change.

### sidebar-shell.tsx

Three presentations off the same children:

1. **Expanded (desktop)** — 280px floating panel, `position: sticky`, full height.
2. **Collapsed rail (desktop)** — 56px. Each group card shrinks to a rounded
   block holding only its rows' icon squares, so the grouping still reads
   vertically. Labels appear on hover from a **hand-rolled** tooltip: an
   absolutely-positioned span, shown on `mouseenter`/`focus`, no Radix, no
   portal. It is decoration over an already-labelled link, so it needs no focus
   trap; the accessible name stays on the link via `aria-label`.
3. **Mobile drawer (<768px)** — a fixed panel plus a backdrop, hand-rolled.
   Closes on backdrop click and on Escape; focus returns to the trigger on
   close; the backdrop gets `aria-hidden`, the panel `role="dialog"` and
   `aria-modal="true"`. Body scroll locks while open. No Radix Dialog.

Collapsing is a width transition on the panel and its inset sibling.

### nav-card.tsx

One group card. Props: `label`, `items`, `pathname`, plus the `openSection` /
`onOpenChange` pair so single-open accordion behaviour is unchanged. An item is
either a link row or an accordion parent with children. Rows are plain
`<Link>`/`<button>`; there is no `asChild`, no `Slot`, and no cva — state
classes are written directly, as the Button migration established.

## Nav config changes

`app/(app)/layout-nav-config.ts` gains two groupings the design introduced:

- **OPERATIONS** — a new label over Inventory and Customers, which are currently
  rendered with no heading at all.
- **INSIGHTS & ADMIN** — Reports joins Approvals Board, User Management and
  Settings in one card, replacing two separate groups.

`OVERVIEW`, `SELL` and `PURCHASING` keep their current membership. No route
changes; permission gating per group is unchanged.

## Approvals badge

The card design carries a badge slot on the right of a row. Wire the Approvals
Board row to the real pending count.

`GET /api/approvals/queue?status=Pending` already exists but is unsuitable — it
returns full rows and runs several follow-up queries for products, warehouses
and shelves. Add a dedicated endpoint:

```
GET /api/approvals/queue/count?status=Pending  ->  { count: number }
```

backed by a single `SELECT COUNT(*) FROM approval_queue WHERE status = ?`.

The sidebar fetches it once on mount and refetches on route change. It is a
convenience indicator, not a source of truth: **on any error, or a zero count,
render no badge at all** — a nav item must never fail to render because a count
failed. This is its own task in the plan, sequenced after the sidebar renders.

## What is explicitly not touched

`Sheet`, `Tooltip`, `Separator`, `Skeleton` and every other `components/ui/*`
file; `hooks/use-mobile.tsx` (the sidebar keeps consuming it); all routes;
`lib/page-registry.ts`; `lib/report-catalog.ts`; the app header and breadcrumbs.

## Testing and verification

The preceding four commits established the method and it applies here:

1. **Behaviour, before and after.** The existing browser checks must still pass:
   clicking Sales then Inventory then Customers leaves exactly one section open;
   re-clicking the open one closes it; navigating to `/inventory/stock-counts`
   auto-opens Inventory. These run against the new implementation unchanged.
2. **Collapse contract.** Set the cookie to `false`, reload, assert the sidebar
   comes back collapsed; toggle with Ctrl+B and assert the cookie flips. This is
   the regression most likely to slip past a visual check.
3. **Mobile drawer.** At 375px: trigger opens it, backdrop click closes it,
   Escape closes it, focus lands back on the trigger.
4. **Computed styles, not class names.** Assert the active row's background is
   the brand teal and a resting row's is transparent — the lesson from `7335b1e`,
   where the class list looked right while the base cva still painted a pill.
5. **`npm run typecheck`** must stay at the 10 pre-existing errors. No new ones.

There is no MySQL in the working environment, so the badge's count is verified
against a stubbed response plus a direct check of the new endpoint's SQL.

## Risks

- **The cookie is the sharp edge.** Changing its name, values, or max-age
  silently resets every user's collapsed preference. Task 1 pins it with a test.
- **The collapsed rail is new design surface.** The canvas shows it only as a
  sketch; it may need a second look once real icons are in it.
- **Scope creep toward a full shadcn purge.** `Sheet` and friends are staying.
  Any task that starts editing `components/ui/*` beyond deleting `sidebar.tsx`
  is out of scope.
