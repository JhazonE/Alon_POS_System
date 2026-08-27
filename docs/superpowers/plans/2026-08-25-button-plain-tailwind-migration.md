# Button: Plain-Tailwind Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete `components/ui/button.tsx` and replace every one of its 1000 JSX usages (307 files) with a raw `<button className="...">` carrying the approved plain-Tailwind design, with zero shared component and zero Radix dependency for Button specifically.

**Architecture:** A one-off ts-morph codemod (`scripts/codemods/migrate-button.ts`) does the mechanical rewrite per batch (grouped by app module, smallest first). 24 usages with a dynamic `variant={expr}` are excluded from the codemod and hand-fixed per batch. `components/ui/button.tsx` stays in place — and still compiles against any not-yet-migrated file — until the very last task, so nothing breaks mid-migration; its deletion plus a full `typecheck` is the proof the migration is complete.

**Tech Stack:** ts-morph (new devDependency) driving the TypeScript compiler API against real `.tsx` ASTs; Playwright (already a devDependency) for visual spot-checks against the running dev server, same method already used for the Sheet/drawer migration earlier in this project.

**Spec:** `docs/superpowers/specs/2026-08-25-button-plain-tailwind-migration-design.md`

## Global Constraints

- Visual output for **every existing usage** must match the approved design exactly — variant/size class recipes are fixed by the spec's tables, not to be improvised per file.
- `components/ui/button.tsx` is not deleted, and its `Button` import must keep compiling, until Task 13 (the last task).
- The `link` variant never carries size classes (no `h-*`/`px-*` from the size table) — mixing them risks the exact class-cascade-order bug already hit and fixed in the Sheet/drawer conversion.
- **The same cascade hazard applies to every pre-existing `className`, not just `link`.** Appending the old value after the computed classes expresses intent but does not enforce it: without `tailwind-merge`, the generated CSS order decides which of `h-10` (recipe) and `h-8` (pre-existing) wins, and it is not the string order. The codemod therefore resolves the merge statically — when a pre-existing class competes with a recipe class on the same utility group (`h-`, `w-`, `p-`/`px-`, `rounded`, `gap-`, `font-`, `tracking-`, `bg-`, `shadow`, text-size, display), the **recipe class is dropped from the output** so the page-specific class stands alone. Every such override is printed per run under "Recipe classes overridden by a pre-existing className" and must be eyeballed as part of that batch's review.
- `components/ui/carousel.tsx` is out of scope (unused, not imported anywhere under `app/`) — do not touch it in this plan.
- After each batch task: `npm run typecheck` must show no NEW errors introduced by that batch (pre-existing unrelated errors, e.g. in `add-product/tabs/*.tsx`, are not this plan's concern and are not to be fixed here).
- Every batch commit is its own commit — do not squash batches together.

---

## Task 1: Build and verify the Button codemod

**Files:**
- Create: `scripts/codemods/migrate-button.ts`
- Modify: `package.json` (add `ts-morph` devDependency)

**Interfaces:**
- Produces: a CLI script invoked as `npx tsx scripts/codemods/migrate-button.ts <glob...>`. Prints a summary (`migrated: N, skipped (dynamic variant): M`) and a list of skipped `file:line` locations to stdout. Exits 0 always (skips are expected and handled by later tasks, not failures).

- [ ] **Step 1: Install ts-morph**

Run: `npm install --save-dev ts-morph`

Expected: `package.json` gains a `"ts-morph"` entry under `devDependencies`; `package-lock.json` updates.

- [ ] **Step 2: Write the codemod script**

Create `scripts/codemods/migrate-button.ts`. The sketch below is the starting point; the committed script is the source of truth and diverges from it in two ways found during Step 3's dry-run:

1. `computeClassName` drops recipe classes that a pre-existing `className` overrides, instead of appending blindly (see Global Constraints) — the dry-run file's `size="icon"` + `className="h-8 w-8"` button proved the blind append renders the wrong size.
2. An existing `className` attribute is rewritten in place rather than removed and re-added, so it keeps its position in the prop list and the diff stays reviewable.

It also reports overridden recipe classes and merged dynamic `className` expressions, so each batch's review has something concrete to check.

```ts
/**
 * One-off codemod: migrates `<Button variant=.. size=.. className=..>` JSX
 * to a raw `<button className="...">` per the recipes in
 * docs/superpowers/specs/2026-08-25-button-plain-tailwind-migration-design.md
 *
 * Usage: npx tsx scripts/codemods/migrate-button.ts "app/(app)/purchases/**/*.tsx"
 *
 * Usages whose `variant` is not a plain string literal are left untouched
 * and reported at the end for manual fixing.
 */
import { Project, SyntaxKind, JsxAttribute, JsxOpeningElement, JsxSelfClosingElement, Node } from "ts-morph";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold " +
  "tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] " +
  "active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const VARIANTS: Record<string, string> = {
  default:
    "bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] " +
    "hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring",
  outline:
    "border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring",
  ghost: "hover:bg-accent focus-visible:ring-ring",
  destructive:
    "bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] " +
    "hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55",
  link:
    "text-primary underline-offset-4 decoration-primary/35 hover:decoration-primary h-auto px-0 focus-visible:ring-ring",
};

const SIZES: Record<string, string> = {
  default: "h-10 px-[18px]",
  sm: "h-8 px-[13px] text-xs rounded-lg gap-1.5",
  lg: "h-[46px] px-6 text-[15px]",
  icon: "h-10 w-10 p-0",
};

function computeClassName(variant: string, size: string, existing: string | null): string {
  const parts = [BASE, VARIANTS[variant]];
  if (variant !== "link") parts.push(SIZES[size]);
  if (existing) parts.push(existing);
  return parts.filter(Boolean).join(" ");
}

/** Reads a JsxAttribute's value as a plain string, only if it's a static
 * string literal (`x="y"` or `x={"y"}`). Returns undefined if the attribute
 * doesn't exist, null if it exists but is dynamic (not a string literal). */
function readStaticString(attr: JsxAttribute | undefined): string | null | undefined {
  if (!attr) return undefined;
  const init = attr.getInitializer();
  if (!init) return null;
  if (Node.isStringLiteral(init)) return init.getLiteralText();
  if (Node.isJsxExpression(init)) {
    const expr = init.getExpression();
    if (expr && Node.isStringLiteral(expr)) return expr.getLiteralText();
    return null; // dynamic expression
  }
  return null;
}

/** Reads an existing className's source text to splice into the new value:
 * a string literal's raw text (no quotes), or a dynamic expression's full
 * source text (to be re-wrapped in a template literal). */
function readClassNameSource(attr: JsxAttribute | undefined): { text: string; dynamic: boolean } | null {
  if (!attr) return null;
  const init = attr.getInitializer();
  if (!init) return null;
  if (Node.isStringLiteral(init)) return { text: init.getLiteralText(), dynamic: false };
  if (Node.isJsxExpression(init)) {
    const expr = init.getExpression();
    if (expr && Node.isStringLiteral(expr)) return { text: expr.getLiteralText(), dynamic: false };
    if (expr) return { text: expr.getText(), dynamic: true };
  }
  return null;
}

function findAttr(el: JsxOpeningElement | JsxSelfClosingElement, name: string): JsxAttribute | undefined {
  return el
    .getAttributes()
    .filter((a): a is JsxAttribute => Node.isJsxAttribute(a))
    .find((a) => a.getNameNode().getText() === name);
}

function main() {
  const patterns = process.argv.slice(2);
  if (patterns.length === 0) {
    console.error("Usage: npx tsx scripts/codemods/migrate-button.ts <glob...>");
    process.exit(1);
  }

  const project = new Project({ tsConfigFilePath: "tsconfig.json" });
  const sourceFiles = project.addSourceFilesAtPaths(patterns);

  let migrated = 0;
  const skipped: string[] = [];

  for (const sf of sourceFiles) {
    if (!sf.getFullText().includes("<Button")) continue;

    const elements: (JsxOpeningElement | JsxSelfClosingElement)[] = [
      ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ].filter((el) => el.getTagNameNode().getText() === "Button");

    for (const el of elements) {
      const variantAttr = findAttr(el, "variant");
      const sizeAttr = findAttr(el, "size");
      const classNameAttr = findAttr(el, "className");
      const asChildAttr = findAttr(el, "asChild");

      const variantRaw = readStaticString(variantAttr);
      const sizeRaw = readStaticString(sizeAttr);
      const variant = variantRaw === undefined ? "default" : variantRaw;
      const size = sizeRaw === undefined ? "default" : sizeRaw;

      if (asChildAttr || variant === null || size === null || !(variant in VARIANTS) || !(size in SIZES)) {
        const { line } = sf.getLineAndColumnAtPos(el.getStart());
        skipped.push(`${sf.getFilePath()}:${line}`);
        continue;
      }

      const existing = readClassNameSource(classNameAttr);
      const existingForCompute = existing ? (existing.dynamic ? null : existing.text) : null;
      const staticClasses = computeClassName(variant, size, existingForCompute);

      if (variantAttr) variantAttr.remove();
      if (sizeAttr) sizeAttr.remove();

      if (existing?.dynamic) {
        if (classNameAttr) classNameAttr.remove();
        el.addAttribute({ name: "className", initializer: `{\`${staticClasses} \${${existing.text}}\`}` });
      } else {
        if (classNameAttr) classNameAttr.remove();
        el.addAttribute({ name: "className", initializer: JSON.stringify(staticClasses) });
      }

      el.getTagNameNode().replaceWithText("button");
      const jsxElementParent = el.getParentIfKind(SyntaxKind.JsxElement);
      if (jsxElementParent) {
        jsxElementParent.getClosingElement().getTagNameNode().replaceWithText("button");
      }

      migrated++;
    }

    // Drop the Button import if nothing in the file still references it.
    const stillUsed = sf
      .getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
      .concat(sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement))
      .some((el) => el.getTagNameNode().getText() === "Button");

    if (!stillUsed) {
      const importDecl = sf
        .getImportDeclarations()
        .find((d) => d.getModuleSpecifierValue() === "@/components/ui/button");
      if (importDecl) {
        const named = importDecl.getNamedImports().find((ni) => ni.getName() === "Button");
        named?.remove();
        if (importDecl.getNamedImports().length === 0 && !importDecl.getDefaultImport()) {
          importDecl.remove();
        }
      }
    }
  }

  project.saveSync();

  console.log(`migrated: ${migrated}, skipped (dynamic variant/size/asChild): ${skipped.length}`);
  if (skipped.length) {
    console.log("Skipped locations (fix by hand):");
    skipped.forEach((s) => console.log("  " + s));
  }
}

main();
```

- [ ] **Step 3: Dry-run against one real file and inspect the diff**

Run:
```bash
git status --short   # confirm clean tree before running
npx tsx scripts/codemods/migrate-button.ts "app/(app)/purchases/bad-orders/record-bad-order/record-bad-order-dialog.tsx"
git diff "app/(app)/purchases/bad-orders/record-bad-order/record-bad-order-dialog.tsx"
```

Expected in the diff: every `<Button ...>` becomes `<button className="...">` (or stays `<Button>` only if it hit a skip condition — this file has none), the `import { Button } from '@/components/ui/button';` line is removed if `Button` is no longer referenced, `variant`/`size` props are gone, and any pre-existing `className` (e.g. `"w-48 font-semibold shadow-lg shadow-destructive/20"` on the submit button) appears at the end of the new class string, after the computed classes.

Manually read every changed line. If the output is wrong (bad ts-morph API usage, wrong class string, mis-handled className), fix `migrate-button.ts` and re-run against a fresh copy of the file (`git checkout -- <file>` first) until the diff is exactly right.

- [ ] **Step 4: Revert the dry-run file**

Run: `git checkout -- "app/(app)/purchases/bad-orders/record-bad-order/record-bad-order-dialog.tsx"`

Expected: `git status --short` shows no changes — Task 2 runs the real migration for this file as part of its batch.

- [ ] **Step 5: Commit the codemod**

```bash
git add package.json package-lock.json scripts/codemods/migrate-button.ts
git commit -m "chore: add Button-to-plain-Tailwind codemod

Verified against a single real file; batches applied in follow-up commits."
```

---

## Task 2: Migrate `purchases` batch

**Files:**
- Modify: all `.tsx` files under `app/(app)/purchases/` that import `Button` (11 files)

**Interfaces:**
- Consumes: `scripts/codemods/migrate-button.ts` from Task 1.

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/purchases/**/*.tsx"`

Expected: summary line reports `skipped: 0` (no dynamic-variant Button usages live under `purchases/` per the spec's exact list).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: no new errors under `app/(app)/purchases/`. (Pre-existing unrelated errors elsewhere are not this task's concern.)

- [ ] **Step 3: Visual spot-check**

With the dev server running on port 3000 (`npm run dev` if not already running), open `http://localhost:3000/purchases` and `http://localhost:3000/purchases/bad-orders` in a browser (or via the Playwright pattern used earlier in this project — `chromium.launch()`, seed `mock-user-session` in localStorage, screenshot). Confirm: the "Add New Purchase Order" and "Record Bad Order" buttons render with the new rounded-xl, teal-shadow look, hover/press states work, and the drawers they open still function (this batch does not touch the drawers themselves, only the buttons inside them).

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/purchases
git commit -m "refactor: migrate purchases module buttons to plain Tailwind"
```

---

## Task 3: Migrate `suppliers` batch

**Files:**
- Modify: all `.tsx` files under the top-level `app/(app)/suppliers/` that import `Button` (12 files)

Note: there is a *separate*, nested `app/(app)/products/suppliers/` folder (3 files) — that one is part of the `products` module's own file count and is handled in Task 8, not here. Don't glob it in this task; the two `suppliers` paths are unrelated folders that happen to share a name.

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/suppliers/**/*.tsx"`

Expected: `skipped: 0`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — expect no new errors under `app/(app)/suppliers/`.

- [ ] **Step 3: Visual spot-check**

Open `http://localhost:3000/suppliers` (or wherever the module's list page lives) and confirm button rendering and click behavior.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/suppliers
git commit -m "refactor: migrate suppliers module buttons to plain Tailwind"
```

---

## Task 4: Migrate `dashboard` + `restock` + `developer` + `user-management` + top-level odds and ends batch

**Files:**
- Modify: all `.tsx` files under `app/(app)/dashboard/`, `app/(app)/restock/`, `app/(app)/developer/`, `app/(app)/user-management/` that import `Button` (13 files), plus `app/(app)/NotificationsBell.tsx` (1 file, sits directly under `app/(app)/` — not part of any module folder) — 14 files total

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/dashboard/**/*.tsx" "app/(app)/restock/**/*.tsx" "app/(app)/developer/**/*.tsx" "app/(app)/user-management/**/*.tsx" "app/(app)/NotificationsBell.tsx"`

Expected: `skipped: 0`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — expect no new errors under any of these paths.

- [ ] **Step 3: Visual spot-check**

Open `http://localhost:3000/dashboard` and `http://localhost:3000/user-management`; confirm buttons render and work. Click the notifications bell icon in the app header/sidebar (rendered by `NotificationsBell.tsx`) and confirm it still opens correctly.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/dashboard app/\(app\)/restock app/\(app\)/developer app/\(app\)/user-management "app/(app)/NotificationsBell.tsx"
git commit -m "refactor: migrate dashboard/restock/developer/user-management/NotificationsBell buttons to plain Tailwind"
```

---

## Task 5: Migrate `customer` batch

**Files:**
- Modify: all `.tsx` files under `app/(app)/customer/` that import `Button` (19 files)

**Interfaces:**
- Consumes: `scripts/codemods/migrate-button.ts`. This batch has no dynamic-variant `Button` usages of its own (the dynamic `variant={...}` cases found in `customer/loyalty/points-history-dialog.tsx` and `customer/payment/*.tsx` during spec research are all on `Badge`, not `Button` — verified via the Task 1 script's own AST-accurate detection, which only flags `Button` elements).

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/customer/**/*.tsx"`

Expected: `skipped: 0`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — expect no new errors under `app/(app)/customer/`.

- [ ] **Step 3: Visual spot-check**

Open `http://localhost:3000/customer/list` and `http://localhost:3000/customer/payment`; confirm buttons render and work, including the ones inside `add-payment-dialog.tsx`'s Sheet (already a drawer from the earlier migration — this task only touches the buttons inside it).

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/customer
git commit -m "refactor: migrate customer module buttons to plain Tailwind"
```

---

## Task 6: Migrate `inventory` batch (includes 7 hand-fixed dynamic-variant usages)

**Files:**
- Modify: all `.tsx` files under `app/(app)/inventory/` that import `Button` (28 files)
- Modify by hand after the codemod:
  - `app/(app)/inventory/repackaging/consolidation-form.tsx:182,190`
  - `app/(app)/inventory/repackaging/repackaging-form.tsx:166,174`
  - `app/(app)/inventory/stock-adjustment-dialog/StockAdjustmentDialog.tsx:267`
  - `app/(app)/inventory/[productId]/serials/add-serial-number-dialog.tsx:56,64`

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/inventory/**/*.tsx"`

Expected: summary reports `skipped: 7`, listing exactly the 7 locations above (2 in `consolidation-form.tsx` + 2 in `repackaging-form.tsx` + 1 in `StockAdjustmentDialog.tsx` + 2 in `add-serial-number-dialog.tsx` = 7 total). If the count or locations differ from this list, stop and re-read the diff before continuing — it means the file has changed since the spec was written.

- [ ] **Step 2: Hand-fix `consolidation-form.tsx`**

Read the two `<Button variant={targetType === 'search' ? 'secondary' : 'ghost'} ...>` elements at lines 182 and 190. Replace each with a `<button>` using a template-literal className that switches between the `secondary` and `ghost` recipes:

```tsx
<button
  type="button"
  className={`inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-[18px] ${targetType === 'search' ? 'bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring' : 'hover:bg-accent focus-visible:ring-ring'}`}
  onClick={() => setTargetType('search')}
>
```

(Keep every other prop on the original element — `onClick`, children, etc. — exactly as they were; only `variant`/`size` are replaced by the computed `className`. Repeat for the second button with `setTargetType('create')` and the `'create'` comparison.)

- [ ] **Step 3: Hand-fix `repackaging-form.tsx`**

Same pattern as Step 2 — identical `targetType === 'search' ? 'secondary' : 'ghost'` toggle at lines 166 and 174.

- [ ] **Step 4: Hand-fix `StockAdjustmentDialog.tsx:267`**

The toggle is `adjustmentType === 'add' ? 'default' : 'destructive'`. Use the `default` and `destructive` recipes from the spec table in the same template-literal pattern as Step 2.

- [ ] **Step 5: Hand-fix `add-serial-number-dialog.tsx:56,64`**

The toggle is `mode === 'single' ? 'default' : 'outline'` (line 56) and `mode === 'batch' ? 'default' : 'outline'` (line 64). Use the `default` and `outline` recipes.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck` — expect no new errors under `app/(app)/inventory/`.

- [ ] **Step 7: Visual spot-check**

Open `http://localhost:3000/inventory`, the repackaging form, and a stock adjustment dialog. Toggle the search/create and add/remove states on the hand-fixed buttons specifically — confirm the active/inactive class swap still visibly changes the button's look (this is the part a codemod couldn't verify; it must be checked by hand).

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/inventory
git commit -m "refactor: migrate inventory module buttons to plain Tailwind

Includes hand-fixed dynamic-variant toggles in consolidation-form,
repackaging-form, StockAdjustmentDialog, and add-serial-number-dialog."
```

---

## Task 7: Migrate `reports` batch (includes 4 hand-fixed dynamic-variant usages)

**Files:**
- Modify: all `.tsx` files under `app/(app)/reports/` that import `Button` (23 files)
- Modify by hand after the codemod:
  - `app/(app)/reports/sales/returns/page.tsx:418,427`
  - `app/(app)/reports/sales/summary/page.tsx:386,395`

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/reports/**/*.tsx"`

Expected: summary reports `skipped: 4` at exactly the 4 locations above.

- [ ] **Step 2: Hand-fix `reports/sales/returns/page.tsx`**

The toggle at both lines is `viewMode === 'table' ? 'default' : 'ghost'` (line 418) and `viewMode === 'card' ? 'default' : 'ghost'` (line 427) — this is the table/card view switcher. Apply the same template-literal pattern as Task 6 Step 2, using the `default` and `ghost` recipes, keeping the `size="sm"` recipe folded in as a fixed part of the string (both branches use `size="sm"`, so `SIZES.sm` applies unconditionally here — only the variant half of the string needs the ternary):

```tsx
<button
  className={`inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-8 px-[13px] text-xs rounded-lg gap-1.5 ${viewMode === 'table' ? 'bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55' : 'hover:bg-accent focus-visible:ring-ring'} h-8 px-3`}
  onClick={() => setViewMode('table')}
>
```

(The trailing `h-8 px-3` is the original hand-written `className="h-8 px-3"` this element already carried — preserve it verbatim at the end, same ordering rule as the codemod: computed classes first, pre-existing `className` last.)

- [ ] **Step 3: Hand-fix `reports/sales/summary/page.tsx`**

Identical `viewMode === 'table'/'card' ? 'default' : 'ghost'` pattern at lines 386 and 395 — same fix as Step 2.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` — expect no new errors under `app/(app)/reports/`.

- [ ] **Step 5: Visual spot-check**

Open `http://localhost:3000/reports/sales/returns` and `.../reports/sales/summary`; click the table/card toggle on both pages and confirm the active button visibly highlights (primary) while the inactive one stays ghost.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/reports
git commit -m "refactor: migrate reports module buttons to plain Tailwind

Includes hand-fixed table/card view-toggle buttons in
reports/sales/returns and reports/sales/summary."
```

---

## Task 8: Migrate `products` batch

**Files:**
- Modify: all `.tsx` files under `app/(app)/products/` (including the nested `app/(app)/products/suppliers/` — a different folder from the top-level `app/(app)/suppliers/` migrated in Task 3) that import `Button` (45 files total)
- Modify by hand after the codemod:
  - `app/(app)/products/break-pack/break-pack-dialog.tsx:139,147`

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/products/**/*.tsx"`

Expected: summary reports `skipped: 2` at `break-pack-dialog.tsx:139,147`.

- [ ] **Step 2: Hand-fix `break-pack-dialog.tsx`**

Toggle is `targetMode === 'search' ? 'secondary' : 'ghost'` (line 139) and `targetMode === 'create' ? 'secondary' : 'ghost'` (line 147) — identical pattern to Task 6 Step 2's `consolidation-form.tsx` fix, same recipes.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` — expect no new errors under `app/(app)/products/`.

- [ ] **Step 4: Visual spot-check**

Open `http://localhost:3000/products`, open the Add Product drawer (migrated to a Sheet earlier in this project — only its internal buttons change here), and open a Break Pack dialog to check the hand-fixed toggle.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/products
git commit -m "refactor: migrate products module buttons to plain Tailwind

Includes hand-fixed search/create toggle in break-pack-dialog."
```

---

## Task 9: Migrate `settings` batch

**Files:**
- Modify: all `.tsx` files under `app/(app)/settings/` that import `Button` (36 files)

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/settings/**/*.tsx"`

Expected: `skipped: 0` (the only dynamic-variant usage found under `settings/` during spec research, `ApiCard.tsx:38`, is on a `Badge`, not a `Button`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` — expect no new errors under `app/(app)/settings/`.

- [ ] **Step 3: Visual spot-check**

Open `http://localhost:3000/settings` and a couple of its subsections; confirm buttons render and work.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/settings
git commit -m "refactor: migrate settings module buttons to plain Tailwind"
```

---

## Task 10: Migrate `pos` batch (includes 4 hand-fixed dynamic-variant usages)

**Files:**
- Modify: all `.tsx` files under `app/(app)/pos/` that import `Button` (46 files)
- Modify by hand after the codemod:
  - `app/(app)/pos/customer-account/CustomerAccountDialog.tsx:461,472`
  - `app/(app)/pos/membership/MembershipPaymentDialog.tsx:181,184`

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/pos/**/*.tsx"`

Expected: summary reports `skipped: 4` at exactly the locations above.

- [ ] **Step 2: Hand-fix `CustomerAccountDialog.tsx`**

Toggle is `overpaymentMode === 'change' ? 'default' : 'outline'` (line 461) and `overpaymentMode === 'credit' ? 'default' : 'outline'` (line 472) — same pattern as Task 6 Step 5, `default`/`outline` recipes.

- [ ] **Step 3: Hand-fix `MembershipPaymentDialog.tsx`**

Toggle is `paymentMethod === 'cash' ? 'default' : 'outline'` (line 181) and `paymentMethod === 'card' ? 'default' : 'outline'` (line 184). This element also carries an existing `className="h-auto py-2"` — preserve it appended at the end, same as Task 7 Step 2's trailing-className handling.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` — expect no new errors under `app/(app)/pos/`.

- [ ] **Step 5: Visual spot-check**

This is the highest-traffic module (checkout flow) — open `http://localhost:3000/pos`, run through opening a sale, adding an item, and reaching Tender. Separately open the Customer Account dialog and Membership Payment dialog to check the two hand-fixed toggles.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/pos
git commit -m "refactor: migrate pos module buttons to plain Tailwind

Includes hand-fixed toggles in CustomerAccountDialog and
MembershipPaymentDialog."
```

---

## Task 11: Migrate `sales` batch (includes 5 hand-fixed dynamic-variant usages)

**Files:**
- Modify: all `.tsx` files under `app/(app)/sales/` that import `Button` (57 files)
- Modify by hand after the codemod:
  - `app/(app)/sales/details/DetailsPagination.tsx:54`
  - `app/(app)/sales/returns/ReturnsDataSection.tsx:84,88`
  - `app/(app)/sales/voids/VoidsDataSection.tsx:82,86`

- [ ] **Step 1: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "app/(app)/sales/**/*.tsx"`

Expected: summary reports `skipped: 5` at exactly the locations above (`DetailsPagination.tsx` has one, the other two files have two each = 5 total).

- [ ] **Step 2: Hand-fix `DetailsPagination.tsx:54`**

Toggle is `p === currentPage ? 'default' : 'outline'` (a pagination page-number button) — `default`/`outline` recipes, same pattern as before, folded with whatever `size` this element already carries.

- [ ] **Step 3: Hand-fix `ReturnsDataSection.tsx` and `VoidsDataSection.tsx`**

Both files have the identical `viewMode === 'table'/'card' ? 'default' : 'ghost'` pattern with a trailing `className="h-8 px-3"`, already worked out in Task 7 Step 2 — apply the same fix (four buttons total across the two files).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` — expect no new errors under `app/(app)/sales/`.

- [ ] **Step 5: Visual spot-check**

Open `http://localhost:3000/sales/orders`, `.../sales/invoices`, `.../sales/details`, `.../sales/returns`, and `.../sales/voids`. Confirm the Add Sales Order / Add Sales Invoice drawer trigger buttons work (drawers themselves were migrated earlier), and check the table/card toggles and pagination buttons specifically.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/sales
git commit -m "refactor: migrate sales module buttons to plain Tailwind

Includes hand-fixed toggles in DetailsPagination, ReturnsDataSection,
and VoidsDataSection."
```

---

## Task 12: Migrate shared components + auth pages batch

**Files:**
- Modify: `.tsx` files under `components/ui/` (6 files, excluding `carousel.tsx`, out of scope), `components/approvals/` (4), `components/theme-toggle.tsx` (1), `components/license-gate.tsx` (1), `components/import-wizard/` (1), `app/login/` (1), `app/signup/` (1), `app/activate/` (1) that import `Button` — 16 files total

**Interfaces:**
- Consumes: `scripts/codemods/migrate-button.ts`. This is the last batch before deletion — every remaining `Button` usage in the whole project must be covered here or in Tasks 2–11.

- [ ] **Step 1: Confirm this is the last batch**

Run: `grep -rl "@/components/ui/button" app components --include="*.tsx"`

Expected: only files under `components/ui/carousel.tsx` (out of scope, skip) and the paths listed above remain. If any other path shows up, stop — it means a file was missed in an earlier batch; migrate it here too before proceeding, and note which batch's file list was incomplete.

- [ ] **Step 2: Run the codemod**

Run: `npx tsx scripts/codemods/migrate-button.ts "components/ui/*.tsx" "components/approvals/**/*.tsx" "components/theme-toggle.tsx" "components/license-gate.tsx" "components/import-wizard/**/*.tsx" "app/login/**/*.tsx" "app/signup/**/*.tsx" "app/activate/**/*.tsx"`

Expected: `skipped: 0` (all dynamic-variant cases were in the `app/(app)/*` modules already handled).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` — expect no new errors.

- [ ] **Step 4: Visual spot-check**

Open `http://localhost:3000/login`; confirm the sign-in button renders and works. Open a page that uses an approval dialog (`components/approvals/`) and confirm its buttons work.

- [ ] **Step 5: Commit**

```bash
git add components app/login app/signup app/activate
git commit -m "refactor: migrate shared components and auth pages buttons to plain Tailwind"
```

---

## Task 12b: Inline the recipes into the three `buttonVariants` consumers

**Files:**
- Modify: `components/ui/alert-dialog.tsx`, `components/ui/pagination.tsx`, `components/ui/calendar.tsx`

**Interfaces:**
- Consumes: the same recipe tables. Produces: three files that no longer import anything from `@/components/ui/button`.

**Why this task exists:** the codemod rewrites `<Button>` *JSX* only. These three files instead call the exported `buttonVariants()` *function* to style a non-button element (`<a>`, react-day-picker's nav slots, `AlertDialogAction`/`Cancel`), so they survive every batch untouched and would break Task 13's `rm`. All three are live and widely imported — none is dead code like `carousel.tsx`. Their host components (Dialog-family, Calendar, Pagination) stay Radix-backed per the spec's "out of scope"; only their dependency on `button.tsx` is removed.

- [ ] **Step 1: `alert-dialog.tsx`**

Both calls are static — `buttonVariants()` at line 107 and `buttonVariants({ variant: "outline" })` at line 120. Replace each with the literal recipe string (base + variant + `default` size) inside the existing `cn(...)`, and drop the `buttonVariants` import.

- [ ] **Step 2: `pagination.tsx`**

`PaginationLink` calls `buttonVariants({ variant: isActive ? "outline" : "ghost", size })` with a *dynamic* size. Add a file-local `const BUTTON_BASE`, `const BUTTON_VARIANT: Record<...>`, and `const BUTTON_SIZE: Record<...>` holding the recipe strings, and build the class list from them. Keep `cn(...)` — this file legitimately needs tailwind-merge because callers pass overriding `className`s (`PaginationPrevious` passes `gap-1 pl-2.5`). Also drop the now-unused `ButtonProps` import, replacing the `size` prop's type with the local size union.

- [ ] **Step 3: `calendar.tsx`**

`buttonVariants({ variant: buttonVariant })` at lines 55 and 60, where `buttonVariant` is a component prop. Same file-local map approach as Step 2. This file also imports `Button` for JSX — that part is already handled by Task 12's codemod run over `components/ui/*.tsx`; this step only removes the remaining `buttonVariants` import.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` — expect no new errors.

- [ ] **Step 5: Visual spot-check**

Open a page with a paginated table (`http://localhost:3000/purchases`), a date-picker popover (`http://localhost:3000/inventory/history`), and a delete confirmation (`customer/list` row actions). Confirm the pagination page numbers, calendar prev/next arrows, and alert-dialog action/cancel buttons all still look like buttons.

- [ ] **Step 6: Commit**

```bash
git add components/ui/alert-dialog.tsx components/ui/pagination.tsx components/ui/calendar.tsx
git commit -m "refactor: inline Button recipes into buttonVariants consumers"
```

---

## Task 13: Delete the Button component

**Files:**
- Delete: `components/ui/button.tsx`

**Interfaces:**
- Consumes: nothing — this is the final verification that Tasks 2–12b covered every usage, of both the `Button` component and its `buttonVariants` export.

- [ ] **Step 1: Confirm zero remaining references**

Run: `grep -rl "@/components/ui/button" app components --include="*.tsx"`

Expected: only `components/ui/carousel.tsx` (explicitly out of scope per the spec) — nothing else. If anything else appears, migrate it by hand first (following the same recipe tables), commit that fix, and re-run this check before continuing.

- [ ] **Step 2: Delete the component file**

Run: `rm components/ui/button.tsx`

- [ ] **Step 3: Full-project typecheck**

Run: `npm run typecheck`

Expected: no errors referencing `components/ui/button` or a missing `Button` export. (Pre-existing unrelated errors from before this migration, e.g. in the product tabs, are still fine — they're untouched by this plan.)

- [ ] **Step 4: Commit**

```bash
git add components/ui/button.tsx
git commit -m "refactor: delete Button component — fully migrated to plain Tailwind

All 1000 usages across 307 files now render raw <button> elements.
components/ui/carousel.tsx keeps its own unused Button usage since
it isn't imported anywhere in the app; it goes through the same
codemod if it's ever wired up."
```

- [ ] **Step 5: Note ts-morph's future use**

No action needed — `ts-morph` stays as a devDependency. It will be reused for the next Tier 1 component's migration spec (Badge, Input, Card, Table, Label, etc.), each following this same plan shape with its own class-recipe table.
