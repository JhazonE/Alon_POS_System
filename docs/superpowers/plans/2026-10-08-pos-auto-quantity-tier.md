# Automatic Quantity Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the POS toggle is ON, raising a cart line to a declared tier's minimum automatically applies that tier's price even though it lives on another price level — so a walk-in who buys 10 gets the wholesale price without being assigned a customer.

**Architecture:** One new optional step inside `resolvePriceLevel` in `lib/pricing.ts`, running *after* the existing active-level → default-level → base-price chain, so it can only lower a price the current rules already settled. The step is off unless its caller passes `{ autoQuantityTiers: true }`, which `use-pos.ts` derives from the existing `enablePriceLevelSwitch` setting plus "this sale has no declared level".

**Tech Stack:** TypeScript, raw `mysql2` (no ORM), Node's built-in `node:assert/strict` run by `tests/unit/run.ts` via `tsx`.

**Spec:** [docs/superpowers/specs/2026-10-08-pos-auto-quantity-tier-design.md](../specs/2026-10-08-pos-auto-quantity-tier-design.md)

## Global Constraints

- `resolvePriceLevel` and `calculateEffectivePrice` **keep their current signatures**; the new input is an optional trailing `options` argument. Omitting it must reproduce today's behaviour bit-for-bit.
- Only rows with `min_quantity >= 2` are eligible for the automatic step. `0`, `null` and `1` all mean "no minimum" and must never leak across levels — this is the guard against the "₱70 leak".
- The automatic step may **only lower** the price, never raise it above what steps 1–2 produced.
- The automatic step applies **only** when the active level is the default level AND the customer declared no level of their own.
- Default OFF: `enable_price_level_switch` already defaults to FALSE, so no existing store changes behaviour until an operator opts in.
- No DB schema change. `product_price_levels`' PK stays `(product_id, price_level_id)`.
- Every new unit test file must be registered in `tests/unit/run.ts` or it does not run.

## Review Focus

These inputs are implied by the spec but owned by no single behaviour above. Each line's test is added to the task that owns the code.

1. **A non-default active level with no customer** — a cashier's manual pick must suppress the automatic step, or the switcher silently stops meaning anything (Task 1).
2. **Two tiers qualifying at the same quantity on different levels** — cheapest must win deterministically, not whichever the row order happens to yield (Task 1).
3. **A markup-only tier (Premium ₱250 @ min 10) with no cheaper row** — must leave a walk-in at the base price, never raise it (Task 1).
4. **`minQuantity` arriving as a string** (`"10"`) — mysql2 returns DECIMAL/INT inconsistently across drivers and the repository parses with `parseInt`, so a string must still compare as a number (Task 1).
5. **A product whose `priceLevels` is absent or `[]`** — must fall through to the base price rather than throw, since the products feed can degrade (Task 1).

---

### Task 1: Automatic cross-level tier resolution in `lib/pricing.ts`

**Files:**
- Modify: `lib/pricing.ts:68-87` (`resolvePriceLevel`), `lib/pricing.ts:94-101` (`calculateEffectivePrice`)
- Test: `tests/unit/auto-quantity-tier.test.ts` (create)
- Modify: `tests/unit/run.ts` (register the new test file)

**Interfaces:**
- Consumes: the existing `ResolvedPrice` interface and `bestRowForLevel`/`normaliseMinQty` helpers already in `lib/pricing.ts`.
- Produces:
  ```ts
  export interface ResolveOptions { autoQuantityTiers?: boolean }

  export function resolvePriceLevel(
    product: Product, quantity: number,
    activeLevelId?: string, defaultLevelId?: string,
    options?: ResolveOptions,
  ): ResolvedPrice

  export function calculateEffectivePrice(
    product: Product, quantity: number,
    activeLevelId?: string, defaultLevelId?: string,
    options?: ResolveOptions,
  ): number
  ```
  Task 2 calls `resolvePriceLevel` with the fifth argument.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/auto-quantity-tier.test.ts`:

```ts
import assert from 'node:assert/strict';
import { resolvePriceLevel } from '../../lib/pricing';

const DEFAULT = 'retail-level';
const WHOLESALE = 'pl_wholesale';
const PREMIUM = 'pl_premium';
const DEALER = 'pl_dealer';
const AUTO = { autoQuantityTiers: true };

// REBISCO CRACKERS as configured in production: base P200, Retail P200 flat,
// Wholesale P110 at a minimum of 10.
const rebisco: any = {
  id: 'rebisco', price: 200,
  priceLevels: [
    { levelId: WHOLESALE, price: 110, minQuantity: 10 },
    { levelId: DEFAULT, price: 200, minQuantity: 1 },
  ],
};

// --- Toggle OFF: today's behaviour, preserved exactly (regression guard) ---
for (const qty of [1, 9, 10, 20]) {
  assert.equal(
    resolvePriceLevel(rebisco, qty, DEFAULT, DEFAULT).price, 200,
    `toggle OFF: walk-in at qty ${qty} stays at the retail price`,
  );
}
assert.equal(
  resolvePriceLevel(rebisco, 10, WHOLESALE, DEFAULT).price, 110,
  'toggle OFF: a declared Wholesale customer still earns the tier',
);

// --- Toggle ON: the walk-in earns the tier automatically ---
assert.equal(resolvePriceLevel(rebisco, 1, DEFAULT, DEFAULT, AUTO).price, 200, 'qty 1 earns nothing');
assert.equal(resolvePriceLevel(rebisco, 9, DEFAULT, DEFAULT, AUTO).price, 200, 'qty 9 has not reached the minimum');

const hit = resolvePriceLevel(rebisco, 10, DEFAULT, DEFAULT, AUTO);
assert.equal(hit.price, 110, 'qty 10 automatically earns the Wholesale tier');
assert.equal(hit.levelId, WHOLESALE, 'the badge names the level that set the price');
assert.equal(hit.minQuantity, 10, 'the badge reports the minimum that fired');

// --- Review Focus 1: a manual pick (non-default active level) suppresses it ---
assert.equal(
  resolvePriceLevel(rebisco, 10, PREMIUM, DEFAULT, AUTO).price, 200,
  'a non-default active level suppresses the automatic step (falls back to the default row)',
);

// --- Review Focus 2: cheapest wins when two levels qualify at the same qty ---
const twoTiers: any = {
  id: 'two', price: 200,
  priceLevels: [
    { levelId: WHOLESALE, price: 110, minQuantity: 10 },
    { levelId: DEALER, price: 105, minQuantity: 10 },
  ],
};
const cheapest = resolvePriceLevel(twoTiers, 10, DEFAULT, DEFAULT, AUTO);
assert.equal(cheapest.price, 105, 'the cheapest qualifying tier wins');
assert.equal(cheapest.levelId, DEALER, 'and the badge names that level');

// --- Review Focus 3: a markup-only tier never raises the price ---
const markupOnly: any = {
  id: 'markup', price: 200,
  priceLevels: [{ levelId: PREMIUM, price: 250, minQuantity: 10 }],
};
assert.equal(
  resolvePriceLevel(markupOnly, 10, DEFAULT, DEFAULT, AUTO).price, 200,
  'an automatic tier never raises the price above the base',
);

// --- The P70 leak guard: a FLAT row on another level never leaks ---
const flatOtherLevel: any = {
  id: 'leak', price: 200,
  priceLevels: [
    { levelId: WHOLESALE, price: 70, minQuantity: 0 },
    { levelId: DEFAULT, price: 200, minQuantity: 1 },
  ],
};
for (const qty of [1, 10, 50]) {
  assert.equal(
    resolvePriceLevel(flatOtherLevel, qty, DEFAULT, DEFAULT, AUTO).price, 200,
    `a flat row on another level never leaks (qty ${qty})`,
  );
}
assert.equal(
  resolvePriceLevel(
    { id: 'one', price: 200, priceLevels: [{ levelId: WHOLESALE, price: 70, minQuantity: 1 }] } as any,
    10, DEFAULT, DEFAULT, AUTO,
  ).price,
  200,
  'minQuantity of 1 means "no minimum" and is not an eligible tier',
);

// --- Review Focus 4: a string minQuantity still compares as a number ---
assert.equal(
  resolvePriceLevel(
    { id: 's', price: 200, priceLevels: [{ levelId: WHOLESALE, price: 110, minQuantity: '10' }] } as any,
    10, DEFAULT, DEFAULT, AUTO,
  ).price,
  110,
  'a string minimum from the driver is coerced before comparing',
);

// --- Review Focus 5: absent or empty priceLevels fall through, never throw ---
assert.equal(
  resolvePriceLevel({ id: 'n', price: 200 } as any, 10, DEFAULT, DEFAULT, AUTO).price, 200,
  'a product with no priceLevels array falls through to the base price',
);
assert.equal(
  resolvePriceLevel({ id: 'e', price: 200, priceLevels: [] } as any, 10, DEFAULT, DEFAULT, AUTO).price, 200,
  'an empty priceLevels array falls through to the base price',
);

console.log('auto-quantity-tier: all assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx tests/unit/auto-quantity-tier.test.ts`
Expected: FAIL. The first toggle-ON assertion at qty 10 reports `200 !== 110`, because the fifth argument is currently ignored.

- [ ] **Step 3: Write the minimal implementation**

In `lib/pricing.ts`, add the options type and the helper above `resolvePriceLevel`:

```ts
/** Opt-in behaviour for one price resolution. */
export interface ResolveOptions {
  /**
   * Let a tier declared on ANOTHER level apply to this sale. Gated by the
   * POS setting `enable_price_level_switch` and only ever passed when the
   * sale carries no declared level of its own (see the 2026-10-08 spec).
   */
  autoQuantityTiers?: boolean;
}

/**
 * The cheapest tier the quantity earns, from ANY level.
 *
 * Only rows with a real minimum (2 or more) are eligible: a flat row on
 * another level is not a tier, and treating it as one is exactly the "P70
 * leak" the 2026-10-02 spec removed. Returns null when nothing qualifies.
 */
function cheapestAutoTier(
  product: Product,
  quantity: number,
): ResolvedPrice | null {
  let best: ResolvedPrice | null = null;

  for (const pl of product.priceLevels || []) {
    if ((pl.price as unknown) == null || (pl.price as any) === '') continue;
    const price = Number(pl.price);
    if (!Number.isFinite(price)) continue;

    // A real minimum only. normaliseMinQty flattens 0, null and 1 to 0.
    const minQty = normaliseMinQty(pl.minQuantity);
    if (minQty < 2 || quantity < minQty) continue;

    if (best === null || price < best.price) {
      best = { price, levelId: pl.levelId, minQuantity: minQty };
    }
  }

  return best;
}
```

Then replace the body of `resolvePriceLevel` (keeping steps 1–3 as they are) so the new step runs last:

```ts
export function resolvePriceLevel(
  product: Product,
  quantity: number,
  activeLevelId?: string,
  defaultLevelId: string = 'retail-level',
  options: ResolveOptions = {},
): ResolvedPrice {
  const qty = Number(quantity) || 0;

  let settled: ResolvedPrice | null = null;

  if (activeLevelId) {
    settled = bestRowForLevel(product, qty, activeLevelId);
  }

  if (!settled && defaultLevelId && defaultLevelId !== activeLevelId) {
    settled = bestRowForLevel(product, qty, defaultLevelId);
  }

  const base: ResolvedPrice = settled
    ?? { price: Number(product.price) || 0, levelId: null, minQuantity: 0 };

  // Automatic cross-level tier. Runs LAST and only ever lowers the price, so
  // it cannot regress a price the rules above already settled. Suppressed
  // unless the sale is on the default level: a declared customer level or a
  // cashier's manual pick must win (spec A2, preserving D4).
  if (options.autoQuantityTiers && (!activeLevelId || activeLevelId === defaultLevelId)) {
    const auto = cheapestAutoTier(product, qty);
    if (auto && auto.price < base.price) return auto;
  }

  return base;
}
```

And thread the option through `calculateEffectivePrice`:

```ts
export function calculateEffectivePrice(
  product: Product,
  quantity: number,
  activeLevelId?: string,
  defaultLevelId: string = 'retail-level',
  options: ResolveOptions = {},
): number {
  return resolvePriceLevel(product, quantity, activeLevelId, defaultLevelId, options).price;
}
```

- [ ] **Step 4: Register the test file**

In `tests/unit/run.ts`, add `'auto-quantity-tier.test',` immediately after the existing `'pos-active-price-level.test',` entry.

- [ ] **Step 5: Run the new test and the whole suite**

Run: `npx tsx tests/unit/auto-quantity-tier.test.ts`
Expected: PASS, printing `auto-quantity-tier: all assertions passed`.

Run: `npm run test:unit`
Expected: PASS. All test files pass. `effective-price`, `price-level-badge` and `cart-reprice` must still pass untouched — they call `resolvePriceLevel` with four arguments and prove the default-off path is unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/pricing.ts tests/unit/auto-quantity-tier.test.ts tests/unit/run.ts
git commit -m "feat(pos): apply the cheapest earned quantity tier across levels

Behind an opt-in option, so omitting it preserves strict level isolation
exactly. Only rows with a real minimum (>= 2) are eligible and the step
can only lower the price, which is what separates it from the P70 leak.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Pass the option from the POS cart

**Files:**
- Modify: `app/(app)/pos/pos-content/use-pos.ts:582-590` (the `priceLine` callback)
- Test: `tests/unit/pos-auto-tier-gate.test.ts` (create)
- Modify: `tests/unit/run.ts` (register the new test file)

**Interfaces:**
- Consumes: `resolvePriceLevel(product, qty, activeLevelId, defaultLevelId, options)` from Task 1; `enablePriceLevelSwitch` (already on the hook, added 2026-10-08); `resolveActivePriceLevelId` from `lib/pos-active-price-level.ts`.
- Produces: `shouldAutoApplyTiers(enabled, customerLevelId, manualLevelId): boolean` exported from `lib/pos-active-price-level.ts`, used only by `use-pos.ts`.

The gate lives in the pure module rather than inline in the hook so it is testable without React — `use-pos.ts` imports React and the toast provider, which this project's unit runner cannot load.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pos-auto-tier-gate.test.ts`:

```ts
import assert from 'node:assert/strict';
import { shouldAutoApplyTiers } from '../../lib/pos-active-price-level';

// The toggle is the master switch.
assert.equal(shouldAutoApplyTiers(false, undefined, ''), false, 'OFF: never applies');
assert.equal(shouldAutoApplyTiers(false, undefined, 'pl_wholesale'), false, 'OFF: a pick does not enable it');

// ON + walk-in with no pick: the case the feature exists for.
assert.equal(shouldAutoApplyTiers(true, undefined, ''), true, 'ON + walk-in, no pick: applies');
assert.equal(shouldAutoApplyTiers(true, null, null), true, 'ON + null customer level and null pick: applies');
assert.equal(shouldAutoApplyTiers(true, '', ''), true, 'ON + empty customer level: treated as unassigned');

// A declared customer level must win, so the automatic step is suppressed.
assert.equal(
  shouldAutoApplyTiers(true, 'pl_premium', ''), false,
  "a customer's declared level suppresses the automatic step",
);

// A cashier's manual pick is deliberate and must also win.
assert.equal(
  shouldAutoApplyTiers(true, undefined, 'pl_wholesale'), false,
  'a manual pick suppresses the automatic step',
);

console.log('pos-auto-tier-gate: all assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx tests/unit/pos-auto-tier-gate.test.ts`
Expected: FAIL with a message about `shouldAutoApplyTiers` not being exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `lib/pos-active-price-level.ts`:

```ts
/**
 * Whether this sale may take a tier declared on another price level.
 *
 * Only for a sale with no declared level: a customer's own level is contract
 * pricing and a cashier's manual pick is deliberate, so both suppress it (spec
 * A2). `enabled` is the POS setting `enable_price_level_switch`.
 */
export function shouldAutoApplyTiers(
  enabled: boolean,
  customerLevelId: string | null | undefined,
  manualLevelId: string | null | undefined,
): boolean {
  if (!enabled) return false;
  return !isSet(customerLevelId) && !isSet(manualLevelId);
}
```

In `app/(app)/pos/pos-content/use-pos.ts`, extend the import:

```ts
import { resolveActivePriceLevelId, manualPickAfterCustomerChange, shouldAutoApplyTiers } from '@/lib/pos-active-price-level';
```

Then replace the `priceLine` callback so it passes the option:

```ts
  // Price + badge for one line, so the cashier can see which level and tier
  // produced the price.
  const autoQuantityTiers = useMemo(
    () => shouldAutoApplyTiers(enablePriceLevelSwitch, selectedCustomer?.priceLevelId, selectedPriceLevelId),
    [enablePriceLevelSwitch, selectedCustomer, selectedPriceLevelId],
  );

  const priceLine = useCallback((product: any, qty: number) => {
    return priceLineForProduct(product, qty, (p, q) => {
      const resolved = resolvePriceLevel(p, q, activeLevelId, defaultLevelId, { autoQuantityTiers });
      return { price: resolved.price, priceLevelLabel: priceLevelLabel(resolved, priceLevels) };
    });
  }, [activeLevelId, defaultLevelId, priceLevels, autoQuantityTiers]);
```

- [ ] **Step 4: Add the reprice trigger**

`priceLine` is already a dependency of nothing that re-runs on `autoQuantityTiers` alone, so a cart sitting on screen when the setting loads would keep stale prices. Extend the existing level-switch reprice effect (immediately below `priceLine`) to also fire when the gate changes:

```ts
  // Re-price items when the price level, or the automatic-tier gate, changes
  useEffect(() => {
    if (!activeLevelId) return;
    setItems(currentItems => (currentItems.length === 0 ? currentItems : repriceCartLines(currentItems, priceLine)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevelId, autoQuantityTiers]);
```

- [ ] **Step 5: Register the test file**

In `tests/unit/run.ts`, add `'pos-auto-tier-gate.test',` immediately after the `'auto-quantity-tier.test',` entry from Task 1.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx tsx tests/unit/pos-auto-tier-gate.test.ts`
Expected: PASS, printing `pos-auto-tier-gate: all assertions passed`.

Run: `npm run test:unit`
Expected: PASS, all test files.

Run: `npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"`
Expected: no output. (This repo has 10 pre-existing errors in generated `.next/types` files; the grep excludes them. A non-empty result is a real regression.)

- [ ] **Step 7: Commit**

```bash
git add lib/pos-active-price-level.ts app/\(app\)/pos/pos-content/use-pos.ts tests/unit/pos-auto-tier-gate.test.ts tests/unit/run.ts
git commit -m "feat(pos): auto-apply earned quantity tiers for sales with no declared level

The cart passes the new option only when the POS toggle is on and the sale
carries neither a customer level nor a manual pick, so contract pricing and
a cashier's deliberate choice both still win.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Update the setting's label, and verify in the running app

**Files:**
- Modify: `app/(app)/settings/pos-setup/GeneralSettingsCard.tsx` (the `enablePriceLevelSwitch` row's label and description)

**Interfaces:**
- Consumes: nothing new. This task only changes user-facing copy and then verifies the whole feature end to end.

The toggle now controls two behaviours — the manual switcher and automatic tiers — so its copy must say so or an operator cannot know what they are enabling.

- [ ] **Step 1: Update the copy**

In `app/(app)/settings/pos-setup/GeneralSettingsCard.tsx`, replace the `enablePriceLevelSwitch` row's label and description with:

```tsx
            <Label htmlFor="enablePriceLevelSwitch">Automatic Quantity Pricing &amp; Price Level Switching</Label>
            <p className="text-sm text-muted-foreground">Apply the best quantity discount automatically once a line reaches a declared minimum, and let the cashier change the price level from the POS. Customers with their own price level always keep it.</p>
```

- [ ] **Step 2: Enable the setting for verification**

```bash
cd /d/Project_0/Alon_POS_System && cat > _verify.ts <<'EOF'
import { query } from './lib/mysql';
(async () => {
  await query(`UPDATE pos_settings SET enable_price_level_switch = 1`);
  console.log('toggle:', await query(`SELECT enable_price_level_switch e FROM pos_settings LIMIT 1`));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
EOF
npx tsx _verify.ts; rm -f _verify.ts
```

Expected: `toggle: [ { e: 1 } ]`.

- [ ] **Step 3: Verify the live behaviour against production data**

With the dev server running on port 3000 (`npm run dev` if it is not):

```bash
cd /d/Project_0/Alon_POS_System && cat > _verify.ts <<'EOF'
import { resolvePriceLevel } from './lib/pricing';
import { shouldAutoApplyTiers } from './lib/pos-active-price-level';
const DEF = 'retail-level';
const rebisco: any = { id: 'r', price: 200, priceLevels: [
  { levelId: 'pl_1790250228708', price: 110, minQuantity: 10 },
  { levelId: DEF, price: 200, minQuantity: 1 },
]};
const gate = shouldAutoApplyTiers(true, undefined, '');
console.log('walk-in, toggle ON, gate =', gate);
for (const q of [1, 9, 10, 24]) {
  const r = resolvePriceLevel(rebisco, q, DEF, DEF, { autoQuantityTiers: gate });
  console.log(`  qty ${q}: P${r.price}  level=${r.levelId} min=${r.minQuantity}`);
}
process.exit(0);
EOF
npx tsx _verify.ts; rm -f _verify.ts
```

Expected exactly:
```
walk-in, toggle ON, gate = true
  qty 1: P200  level=retail-level min=0
  qty 9: P200  level=retail-level min=0
  qty 10: P110  level=pl_1790250228708 min=10
  qty 24: P110  level=pl_1790250228708 min=10
```

Then confirm the pages still compile:

```bash
curl -s -o /dev/null -w "pos=%{http_code}\n" http://localhost:3000/pos --max-time 90
curl -s -o /dev/null -w "settings=%{http_code}\n" http://localhost:3000/settings/pos-setup --max-time 90
```

Expected: `pos=200` and `settings=200`.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/settings/pos-setup/GeneralSettingsCard.tsx
git commit -m "feat(pos): say that the toggle also enables automatic quantity pricing

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Notes for the implementer

**`app/(app)/pos/edit-item/` is dead code.** The 2026-10-08 spec lists `use-edit-item.ts` as in scope because it re-prices on quantity change (`use-edit-item.ts:39`). A search of the whole app for `EditItemDialog` and `useEditItem` finds references only inside that directory — nothing renders it. It is therefore **deliberately excluded** from this plan: changing code nothing runs adds risk without benefit. Do not "fix" it as part of this work. If the dialog is ever wired up, it must pass the same option as Task 2 or it will disagree with the cart.

**Read-only price displays stay at qty 1.** `ProductSearchDialog.tsx:291` and `PriceInquiryDialog.tsx:142` call `calculateEffectivePrice(product, 1, ...)`. No tier can fire at quantity 1, so they need no change and must not be given the option — showing a tier price on a search row the cashier has not yet earned would mislead.

**Checkout does not re-price.** `POST /api/pos/checkout` trusts the line price the client sends; it contains no call to `resolvePriceLevel`. That is pre-existing behaviour, noted in the spec, and out of scope here.
