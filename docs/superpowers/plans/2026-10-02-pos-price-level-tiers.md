# POS Price Levels & Quantity Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make declared price levels and their per-product quantity tiers apply correctly at the POS, scoped to the customer's active level.

**Architecture:** Three breaks are repaired along one existing pipeline: a min-qty input is added to the Selling Units tab (base unit row only), the dual-write bridge stops flattening `min_quantity` to `0`, and `calculateEffectivePrice` is rewritten from a `Math.min` over all candidates to explicit level-scoped tier resolution. The POS cart then shows which level and tier produced the price. No schema migration — both tables already carry `min_quantity`.

**Tech Stack:** Next.js 16, TypeScript, raw `mysql2/promise`, Zod + react-hook-form, Node `assert/strict` unit tests via `npm run test:unit`, Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-10-02-pos-price-level-tiers-design.md`

## Global Constraints

- **Base unit only.** The POS stays product-level; do not add a selling-unit concept to the cart, checkout, or receipts (spec D1).
- **`calculateEffectivePrice` keeps its exact signature** — `(product, quantity, activeLevelId?, defaultLevelId = 'retail-level') => number`. Its five call sites must not change.
- **No migration.** `product_price_levels.min_quantity` and `product_selling_unit_prices.min_quantity` both already exist.
- **`minQuantity` of `0`, `null`, `undefined` or `1` all mean "no minimum"** and identify a level's base row.
- **Do not change the `price_levels` table shape.** Min qty is per-product-per-level, never a property of the level definition.
- **Unit tests** use `node:assert/strict`, self-execute on import, end with a `console.log('<name>: all assertions passed')`, and must be registered in `tests/unit/run.ts`.
- **Commits** are authored as JhazonE with no Claude attribution trailer.

## Review Focus

Input classes the spec implies that no single task's happy path exercises. Each has its test assigned to the task that owns the code.

1. **A level row priced above the base price** must win rather than being capped at base — the old `Math.min` ceiling. (Task 2)
2. **A tier belonging to a non-active level** must never apply, even when it is the cheapest row available — the ₱70 leak. (Task 2)
3. **An active level with a tier but no base row** (only a `minQty 10` row, no `minQty 0` row) must fall back to the default level below that quantity, not to the tier. (Task 2)
4. **`minQuantity` arriving as a string** (`"10"` from a form or an unparsed DB decimal) must compare numerically, not lexically — `"9" >= "10"` is true as strings. (Task 2)
5. **A blank min-qty on an existing tier row** must clear the stored tier back to `0`, not silently preserve the old value. (Task 3)

---

### Task 1: Min-quantity input on the Selling Units tab

Adds a Min Qty field beside each price level input, on the **base unit row only** (spec D1: only the base row reaches the POS, so a min qty on a non-base row would be collected and silently ignored).

**Files:**
- Modify: `app/(app)/products/add-product/product-schema.ts:20-23`
- Modify: `app/(app)/products/edit-product/tabs/selling-units-tab.tsx` (the `priceLevels.map(...)` block, around lines 230-258)
- Modify: `app/(app)/products/add-product/tabs/selling-units-tab.tsx` (same block)
- Test: `tests/unit/selling-unit-min-qty-schema.test.ts` (create)
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: form values carry `sellingUnits[i].prices[levelId].minQuantity?: number` populated from the UI for the base row. Task 3 reads this shape from `ProductFormData`.

- [ ] **Step 1: Write the failing schema test**

Create `tests/unit/selling-unit-min-qty-schema.test.ts`:

```ts
import assert from 'node:assert/strict';
import { sellingUnitSchema } from '../../app/(app)/products/add-product/product-schema';

const base = {
  unitName: 'Piece',
  qtyBase: 1,
  barcode: '123',
  isBase: true,
};

// a valid min quantity is accepted and coerced to a number
const ok = sellingUnitSchema.safeParse({
  ...base,
  prices: { 'retail-level': { price: 100, minQuantity: 10 } },
});
assert.equal(ok.success, true, 'accepts a positive min quantity');
assert.equal(ok.success && ok.data.prices['retail-level'].minQuantity, 10, 'min quantity survives parsing as a number');

// a string from a form input is coerced, not rejected
const coerced = sellingUnitSchema.safeParse({
  ...base,
  prices: { 'retail-level': { price: 100, minQuantity: '10' } },
});
assert.equal(coerced.success, true, 'coerces a string min quantity from a form input');
assert.equal(coerced.success && coerced.data.prices['retail-level'].minQuantity, 10, 'coerced min quantity is the number 10');

// omitted min quantity stays optional
const omitted = sellingUnitSchema.safeParse({
  ...base,
  prices: { 'retail-level': { price: 100 } },
});
assert.equal(omitted.success, true, 'min quantity is optional');
assert.equal(omitted.success && omitted.data.prices['retail-level'].minQuantity, undefined, 'omitted min quantity stays undefined');

// a negative min quantity is rejected
const negative = sellingUnitSchema.safeParse({
  ...base,
  prices: { 'retail-level': { price: 100, minQuantity: -1 } },
});
assert.equal(negative.success, false, 'rejects a negative min quantity');

console.log('selling-unit-min-qty-schema: all assertions passed');
```

Register it in `tests/unit/run.ts` by adding this line after the existing `import './price-level-calc.test';`:

```ts
import './selling-unit-min-qty-schema.test';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — the string-coercion assertion throws, because `minQuantity` is currently `z.number()` (not `z.coerce.number()`) and rejects `'10'`.

- [ ] **Step 3: Make the schema coerce min quantity**

In `app/(app)/products/add-product/product-schema.ts`, change the `prices` record (lines 20-23) from:

```ts
  prices: z.record(z.string(), z.object({
    price: z.coerce.number().min(0),
    minQuantity: z.number().min(0).optional(),
  })),
```

to:

```ts
  prices: z.record(z.string(), z.object({
    price: z.coerce.number().min(0),
    // Coerced like `price`: the tab's number inputs hand back strings.
    minQuantity: z.coerce.number().min(0).optional(),
  })),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `selling-unit-min-qty-schema: all assertions passed`.

- [ ] **Step 5: Add the Min Qty input to the edit tab**

In `app/(app)/products/edit-product/tabs/selling-units-tab.tsx`, find the `priceLevels.map((level: any) => (...))` block that renders one `FormField` per level. Wrap each level's price field and a new min-qty field together. Replace the whole `<FormField ... name={`sellingUnits.${index}.prices.${level.id}.price`} ... />` element with:

```tsx
<div key={level.id} className="contents">
  <FormField
    control={form.control}
    name={`sellingUnits.${index}.prices.${level.id}.price` as any}
    render={({ field }) => (
      <FormItem>
        <FormLabel className="text-xs truncate" title={level.name}>
          {level.name} (₱)
        </FormLabel>
        <FormControl>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={field.value ?? ''}
            onChange={(e) => {
              const next = e.target.value === '' ? undefined : parseFloat(e.target.value);
              const prevBaseRetail = getRetail(form.getValues(`sellingUnits.${baseUnitIndex}` as any));
              field.onChange(next);
              if (level.id === defaultLevel?.id && next !== undefined) {
                onRetailChange(index, next, prevBaseRetail);
              }
            }}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
  {/* Min Qty is base-unit only: the POS prices the base unit, so a minimum
      on another row would be collected and never applied. */}
  {index === baseUnitIndex && (
    <FormField
      control={form.control}
      name={`sellingUnits.${index}.prices.${level.id}.minQuantity` as any}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-xs truncate" title={`${level.name} minimum quantity`}>
            {level.name} Min Qty
          </FormLabel>
          <FormControl>
            <Input
              type="number"
              step="1"
              min="0"
              placeholder="0"
              value={field.value ?? ''}
              onChange={(e) =>
                field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))
              }
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )}
</div>
```

Remove the now-duplicated `key={level.id}` from the inner price `FormField` (the wrapping `div` carries it).

- [ ] **Step 6: Apply the identical change to the add tab**

Make the exact same replacement in `app/(app)/products/add-product/tabs/selling-units-tab.tsx`. The two tabs keep separate files by convention; the block is the same.

- [ ] **Step 7: Verify it typechecks and builds**

Run: `npm run typecheck && npm run lint`
Expected: PASS, no new errors.

- [ ] **Step 7b: Confirm the existing read-only display now shows real values**

`app/(app)/products/components/selling-units-panel.tsx:122` already renders a
**Min Qty** column in the products-table expandable panel, reading
`entry.minQuantity` — it currently always shows `—` because nothing ever
populated the field. No change is needed there; it is a free end-to-end check.

Run `npm run dev`, save a product with a Min Qty of `10` on a level, then expand
that product's selling-units panel in the products table.
Expected: the Min Qty column shows `10` instead of `—`. This confirms the value
reached `product_selling_unit_prices` and came back out.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/products/add-product/product-schema.ts" \
        "app/(app)/products/edit-product/tabs/selling-units-tab.tsx" \
        "app/(app)/products/add-product/tabs/selling-units-tab.tsx" \
        tests/unit/selling-unit-min-qty-schema.test.ts \
        tests/unit/run.ts
git commit -m "feat(products): min quantity per price level on the base selling unit"
```

---

### Task 2: Level-scoped tier resolution in `calculateEffectivePrice`

Replaces the `Math.min` over all candidates with explicit resolution: active level → default level → base price, taking the highest qualifying tier within a level. This is the task that fixes the cross-level leak and the above-base ceiling.

**Files:**
- Modify: `lib/pricing.ts` (whole file)
- Test: `tests/unit/effective-price.test.ts` (create)
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (Task 1 fills the data, this prices it).
- Produces: `calculateEffectivePrice(product, quantity, activeLevelId?, defaultLevelId?) => number` — unchanged signature. Also exports `resolvePriceLevel(product, quantity, activeLevelId?, defaultLevelId?) => { price: number; levelId: string | null; minQuantity: number }`, which Task 4 uses for the cart badge.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/effective-price.test.ts`:

```ts
import assert from 'node:assert/strict';
import { calculateEffectivePrice, resolvePriceLevel } from '../../lib/pricing';

const RETAIL = 'retail-level';
const WHOLESALE = 'wholesale-level';
const PREMIUM = 'premium-level';

const p = (price: number, priceLevels: any[] = []) => ({ price, priceLevels }) as any;

// --- base behaviour: no level rows at all ---
assert.equal(calculateEffectivePrice(p(100), 1, RETAIL, RETAIL), 100, 'falls back to base price with no level rows');

// --- active level wins over default ---
const twoLevels = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: WHOLESALE, price: 90, minQuantity: 0 },
]);
assert.equal(calculateEffectivePrice(twoLevels, 1, RETAIL, RETAIL), 100, 'retail customer pays retail');
assert.equal(calculateEffectivePrice(twoLevels, 1, WHOLESALE, RETAIL), 90, 'wholesale customer pays wholesale');

// --- Review Focus 1: a level priced ABOVE base must win, not be capped ---
const premium = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: PREMIUM, price: 120, minQuantity: 0 },
]);
assert.equal(calculateEffectivePrice(premium, 1, PREMIUM, RETAIL), 120, 'a level above base price is honoured, not capped at base');

// --- quantity tiers within the active level ---
const tiered = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: RETAIL, price: 85, minQuantity: 10 },
  { levelId: RETAIL, price: 75, minQuantity: 50 },
]);
assert.equal(calculateEffectivePrice(tiered, 1, RETAIL, RETAIL), 100, 'below the first tier, the base row applies');
assert.equal(calculateEffectivePrice(tiered, 9, RETAIL, RETAIL), 100, 'one short of the tier, the base row still applies');
assert.equal(calculateEffectivePrice(tiered, 10, RETAIL, RETAIL), 85, 'exactly at the tier, the tier applies');
assert.equal(calculateEffectivePrice(tiered, 49, RETAIL, RETAIL), 85, 'between tiers, the lower tier applies');
assert.equal(calculateEffectivePrice(tiered, 50, RETAIL, RETAIL), 75, 'the highest qualifying tier wins');
assert.equal(calculateEffectivePrice(tiered, 999, RETAIL, RETAIL), 75, 'above the top tier, the top tier applies');

// --- Review Focus 2: a tier on a NON-active level must never leak ---
const leak = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: WHOLESALE, price: 70, minQuantity: 10 },
]);
assert.equal(calculateEffectivePrice(leak, 10, RETAIL, RETAIL), 100, 'a wholesale tier does not apply to a retail customer');
assert.equal(calculateEffectivePrice(leak, 10, WHOLESALE, RETAIL), 70, 'the wholesale tier does apply to a wholesale customer');

// --- spec D3: strict isolation, no cross-level bargain hunting ---
const isolation = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: RETAIL, price: 85, minQuantity: 10 },
  { levelId: WHOLESALE, price: 90, minQuantity: 0 },
]);
assert.equal(calculateEffectivePrice(isolation, 10, WHOLESALE, RETAIL), 90, 'a wholesale customer keeps wholesale even when a retail tier is cheaper');

// --- Review Focus 3: active level has a tier but no base row ---
const tierOnly = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: 0 },
  { levelId: WHOLESALE, price: 70, minQuantity: 10 },
]);
assert.equal(calculateEffectivePrice(tierOnly, 1, WHOLESALE, RETAIL), 100, 'below its only tier, an active level falls back to the default level');
assert.equal(calculateEffectivePrice(tierOnly, 10, WHOLESALE, RETAIL), 70, 'at its tier, the active level applies');

// --- Review Focus 4: numeric comparison, not lexical ---
const stringy = p(100, [
  { levelId: RETAIL, price: 100, minQuantity: '0' },
  { levelId: RETAIL, price: 85, minQuantity: '10' },
] as any);
assert.equal(calculateEffectivePrice(stringy, 9, RETAIL, RETAIL), 100, 'string "10" compares numerically: 9 does not reach it');
assert.equal(calculateEffectivePrice(stringy, 10, RETAIL, RETAIL), 85, 'string "10" compares numerically: 10 reaches it');

// --- minQuantity of 1 and null mean "no minimum" ---
const loose = p(100, [
  { levelId: WHOLESALE, price: 90, minQuantity: 1 },
  { levelId: PREMIUM, price: 110, minQuantity: null },
] as any);
assert.equal(calculateEffectivePrice(loose, 1, WHOLESALE, RETAIL), 90, 'minQuantity 1 is a base row');
assert.equal(calculateEffectivePrice(loose, 1, PREMIUM, RETAIL), 110, 'minQuantity null is a base row');

// --- no active level given: default level applies ---
assert.equal(calculateEffectivePrice(twoLevels, 1, undefined, RETAIL), 100, 'with no active level, the default level applies');

// --- a blank/invalid price row is ignored ---
const blank = p(100, [
  { levelId: RETAIL, price: NaN, minQuantity: 0 },
] as any);
assert.equal(calculateEffectivePrice(blank, 1, RETAIL, RETAIL), 100, 'a non-numeric level price is ignored, base price applies');

// --- ties on minQuantity resolve to the lower price, deterministically ---
const tie = p(100, [
  { levelId: RETAIL, price: 95, minQuantity: 10 },
  { levelId: RETAIL, price: 85, minQuantity: 10 },
]);
assert.equal(calculateEffectivePrice(tie, 10, RETAIL, RETAIL), 85, 'a tie on minQuantity resolves to the lower price');

// --- resolvePriceLevel reports what was used (for the POS badge) ---
const r1 = resolvePriceLevel(tiered, 10, RETAIL, RETAIL);
assert.equal(r1.price, 85, 'resolvePriceLevel returns the tier price');
assert.equal(r1.levelId, RETAIL, 'resolvePriceLevel reports the level used');
assert.equal(r1.minQuantity, 10, 'resolvePriceLevel reports the tier minimum that fired');

const r2 = resolvePriceLevel(p(100), 1, RETAIL, RETAIL);
assert.equal(r2.price, 100, 'resolvePriceLevel falls back to base price');
assert.equal(r2.levelId, null, 'resolvePriceLevel reports no level for a base-price fallback');
assert.equal(r2.minQuantity, 0, 'resolvePriceLevel reports no tier for a base-price fallback');

console.log('effective-price: all assertions passed');
```

Register it in `tests/unit/run.ts`, after the line added in Task 1:

```ts
import './effective-price.test';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — the first failure is the Review Focus 1 assertion (`a level above base price is honoured`), which returns `100` under the current `Math.min`. The import of `resolvePriceLevel` also fails, as it does not exist yet.

- [ ] **Step 3: Rewrite `lib/pricing.ts`**

Replace the entire contents of `lib/pricing.ts` with:

```ts
import { Product } from './types';

/** A level row's minimum, normalised. 0, null, undefined and 1 all mean "no minimum". */
function normaliseMinQty(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 1) return 0;
  return n;
}

/** The outcome of pricing one cart line: what it costs and why. */
export interface ResolvedPrice {
  price: number;
  /** The level whose row set the price, or null when the base price was used. */
  levelId: string | null;
  /** The tier minimum that fired, or 0 when no tier applied. */
  minQuantity: number;
}

/**
 * The best row for one level at one quantity: among the rows whose minimum the
 * quantity reaches, the one with the HIGHEST minimum (the most specific tier
 * earned). Ties on the minimum resolve to the lower price, for determinism.
 * Returns null when the level has no qualifying row.
 */
function bestRowForLevel(
  product: Product,
  quantity: number,
  levelId: string,
): ResolvedPrice | null {
  let best: ResolvedPrice | null = null;

  for (const pl of product.priceLevels || []) {
    if (pl.levelId !== levelId) continue;

    const price = Number(pl.price);
    if (!Number.isFinite(price)) continue;

    const minQty = normaliseMinQty(pl.minQuantity);
    if (quantity < minQty) continue;

    if (
      best === null ||
      minQty > best.minQuantity ||
      (minQty === best.minQuantity && price < best.price)
    ) {
      best = { price, levelId, minQuantity: minQty };
    }
  }

  return best;
}

/**
 * Resolves the price for a cart line, and reports which level and tier produced
 * it so the POS can show the cashier why.
 *
 * Resolution order (see docs/superpowers/specs/2026-10-02-pos-price-level-tiers-design.md):
 *   1. The ACTIVE level's best qualifying row.
 *   2. The DEFAULT level's best qualifying row.
 *   3. The product's base price.
 *
 * Levels are strictly isolated: a tier belonging to a level the customer is not
 * on never applies, even when it is cheaper. The base price is a fallback, not
 * a competing candidate — so a level priced ABOVE the base price wins, which is
 * what makes markup levels (e.g. Premium) work.
 */
export function resolvePriceLevel(
  product: Product,
  quantity: number,
  activeLevelId?: string,
  defaultLevelId: string = 'retail-level',
): ResolvedPrice {
  const qty = Number(quantity) || 0;

  if (activeLevelId) {
    const active = bestRowForLevel(product, qty, activeLevelId);
    if (active) return active;
  }

  if (defaultLevelId && defaultLevelId !== activeLevelId) {
    const fallback = bestRowForLevel(product, qty, defaultLevelId);
    if (fallback) return fallback;
  }

  return { price: Number(product.price) || 0, levelId: null, minQuantity: 0 };
}

/**
 * The effective unit price for a cart line. Thin wrapper over
 * `resolvePriceLevel` — kept with this exact signature because the POS calls it
 * from five places.
 */
export function calculateEffectivePrice(
  product: Product,
  quantity: number,
  activeLevelId?: string,
  defaultLevelId: string = 'retail-level',
): number {
  return resolvePriceLevel(product, quantity, activeLevelId, defaultLevelId).price;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `effective-price: all assertions passed`, and every previously passing unit test still passes.

- [ ] **Step 5: Verify the call sites still typecheck**

Run: `npm run typecheck`
Expected: PASS. The five `calculateEffectivePrice` callers (`use-pos.ts` ×4, `use-edit-item.ts`, `PriceInquiryDialog.tsx`, `ProductSearchDialog.tsx`) are unchanged because the signature is unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/pricing.ts tests/unit/effective-price.test.ts tests/unit/run.ts
git commit -m "fix(pos): scope quantity tiers to the active price level

A tier belonging to one level applied to customers on any other level,
silently discounting sales, and a level priced above the base price was
capped at base by a Math.min over all candidates.

Resolution is now explicit: active level, then default level, then base
price, taking the highest qualifying tier within a level."
```

---

### Task 3: Propagate min quantity through the dual-write bridge

`writeBaseUnitPriceLevels()` hardcodes `min_quantity` to `0` and never updates it, so a minimum entered in Task 1 never reaches the table the POS reads.

**Files:**
- Modify: `app/(app)/products/actions.ts:665-687` (`writeBaseUnitPriceLevels`)
- Test: `tests/unit/base-unit-price-level-rows.test.ts` (create)
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `sellingUnits[i].prices[levelId].minQuantity` from Task 1.
- Produces: `product_price_levels` rows carrying the real `min_quantity`, which Task 2's resolver reads via `MySqlProductRepository`.

- [ ] **Step 1: Write the failing test**

The bridge is an inline SQL loop, so extract its row-building into a pure function and test that. Create `tests/unit/base-unit-price-level-rows.test.ts`:

```ts
import assert from 'node:assert/strict';
import { baseUnitPriceLevelRows } from '../../lib/base-unit-price-level-rows';

// a price with an explicit minimum carries it through
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: 10 } }),
  [{ levelId: 'retail-level', price: 100, minQuantity: 10 }],
  'an explicit minimum is carried through',
);

// Review Focus 5: a blank minimum clears the tier back to 0 rather than preserving a stale one
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100 } }),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'an omitted minimum becomes 0, so a stored tier is cleared not preserved',
);
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: undefined } }),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'an undefined minimum becomes 0',
);

// a blank price is skipped entirely (matches the existing validPrice rule)
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: undefined, minQuantity: 10 } } as any),
  [],
  'a row with no price is skipped',
);
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: '', minQuantity: 10 } } as any),
  [],
  'a row with a blank price is skipped',
);

// strings from the form are coerced
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: '100', minQuantity: '10' } } as any),
  [{ levelId: 'retail-level', price: 100, minQuantity: 10 }],
  'string price and minimum are coerced to numbers',
);

// a non-numeric minimum degrades to 0 rather than writing NaN
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: 'abc' } } as any),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'a non-numeric minimum becomes 0, never NaN',
);

// a negative minimum is floored at 0
assert.deepEqual(
  baseUnitPriceLevelRows({ 'retail-level': { price: 100, minQuantity: -5 } } as any),
  [{ levelId: 'retail-level', price: 100, minQuantity: 0 }],
  'a negative minimum is floored at 0',
);

// several levels come back in a stable order
assert.deepEqual(
  baseUnitPriceLevelRows({
    'retail-level': { price: 100 },
    'wholesale-level': { price: 90, minQuantity: 10 },
  }),
  [
    { levelId: 'retail-level', price: 100, minQuantity: 0 },
    { levelId: 'wholesale-level', price: 90, minQuantity: 10 },
  ],
  'several levels are returned in insertion order',
);

// no prices at all
assert.deepEqual(baseUnitPriceLevelRows({}), [], 'an empty prices map yields no rows');
assert.deepEqual(baseUnitPriceLevelRows(undefined), [], 'an absent prices map yields no rows');

console.log('base-unit-price-level-rows: all assertions passed');
```

Register it in `tests/unit/run.ts`:

```ts
import './base-unit-price-level-rows.test';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../../lib/base-unit-price-level-rows'`.

- [ ] **Step 3: Create the pure row builder**

Create `lib/base-unit-price-level-rows.ts`:

```ts
/**
 * Turns the base selling unit's submitted `prices` map into the rows the
 * legacy `product_price_levels` table needs.
 *
 * A row with no usable price is skipped (the tab writes `undefined` for a
 * blank field). A missing, blank, negative or non-numeric minimum becomes 0,
 * which the POS treats as "no minimum" — writing 0 rather than omitting the
 * field is deliberate: it clears a tier the user blanked out instead of
 * leaving the stored one in place.
 */
export interface BaseUnitPriceLevelRow {
  levelId: string;
  price: number;
  minQuantity: number;
}

export function baseUnitPriceLevelRows(
  prices: Record<string, { price?: unknown; minQuantity?: unknown }> | undefined,
): BaseUnitPriceLevelRow[] {
  const rows: BaseUnitPriceLevelRow[] = [];

  for (const [levelId, entry] of Object.entries(prices || {})) {
    if (entry == null || entry.price == null || entry.price === '') continue;
    const price = Number(entry.price);
    if (!Number.isFinite(price)) continue;

    const rawMin = Number(entry.minQuantity);
    const minQuantity = Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0;

    rows.push({ levelId, price, minQuantity });
  }

  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `base-unit-price-level-rows: all assertions passed`.

- [ ] **Step 5: Use the builder in the bridge**

In `app/(app)/products/actions.ts`, add the import alongside the other `lib` imports at the top of the file:

```ts
import { baseUnitPriceLevelRows } from '@/lib/base-unit-price-level-rows';
```

Then replace the body of `writeBaseUnitPriceLevels` (the `for (const [levelId, entry] of Object.entries(baseUnit.prices || {}))` loop) with:

```ts
  for (const row of baseUnitPriceLevelRows(baseUnit.prices as any)) {
    await connection.query(
      `INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), min_quantity = VALUES(min_quantity)`,
      [productId, row.levelId, row.price, row.minQuantity],
    );
  }
```

Leave the `removedLevelIds` deletion loop below it exactly as it is.

- [ ] **Step 6: Update the function's doc comment**

The existing comment above `writeBaseUnitPriceLevels` claims min_quantity is preserved because the tab cannot edit it. That is no longer true. Replace the sentence:

```
 * On conflict only `price` changes, so an existing row's min_quantity (which
 * the tab cannot display or edit) is preserved; new rows get 0.
```

with:

```
 * On conflict both `price` and `min_quantity` are written, so clearing a
 * minimum in the tab clears the stored tier. A level with no minimum stores 0,
 * which the POS reads as "no minimum".
```

- [ ] **Step 7: Verify**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/base-unit-price-level-rows.ts \
        "app/(app)/products/actions.ts" \
        tests/unit/base-unit-price-level-rows.test.ts \
        tests/unit/run.ts
git commit -m "fix(products): carry min quantity through the price-level bridge

The bridge hardcoded min_quantity to 0 on insert and never updated it, so
a minimum entered on the Selling Units tab never reached the POS."
```

---

### Task 4: Show the active level and tier on the POS cart line

The cashier needs to see why a line is priced the way it is (spec D5).

**Files:**
- Modify: `app/(app)/pos/pos-content/use-pos.ts` (around lines 570, 601-607, 678)
- Modify: `app/(app)/pos/pos-content/pos-types.ts` (the `SaleItem` type, line 27)
- Test: `tests/unit/price-level-badge.test.ts` (create)
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Consumes: `resolvePriceLevel` from Task 2.
- Produces: `priceLevelLabel?: string` on the POS `SaleItem` (`app/(app)/pos/pos-content/pos-types.ts`) — a short label like `Wholesale · 10+`, or absent when the base price was used.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/price-level-badge.test.ts`:

```ts
import assert from 'node:assert/strict';
import { priceLevelLabel } from '../../lib/price-level-badge';

const levels = [
  { id: 'retail-level', name: 'Retail', isDefault: true },
  { id: 'wholesale-level', name: 'Wholesale', isDefault: false },
];

// a plain level row shows just the level name
assert.equal(
  priceLevelLabel({ price: 90, levelId: 'wholesale-level', minQuantity: 0 }, levels),
  'Wholesale',
  'a level with no tier shows just its name',
);

// a tier shows the minimum that fired
assert.equal(
  priceLevelLabel({ price: 85, levelId: 'retail-level', minQuantity: 10 }, levels),
  'Retail · 10+',
  'a tier shows the level name and the minimum that fired',
);

// a base-price fallback has no badge
assert.equal(
  priceLevelLabel({ price: 100, levelId: null, minQuantity: 0 }, levels),
  undefined,
  'a base-price fallback produces no badge',
);

// an unknown level id degrades gracefully rather than showing a raw id
assert.equal(
  priceLevelLabel({ price: 50, levelId: 'ghost-level', minQuantity: 0 }, levels),
  undefined,
  'an unknown level id produces no badge rather than a raw id',
);

// a fractional minimum is shown as entered, not rounded away
assert.equal(
  priceLevelLabel({ price: 85, levelId: 'retail-level', minQuantity: 2.5 }, levels),
  'Retail · 2.5+',
  'a fractional minimum is shown as entered',
);

// an empty level list degrades gracefully
assert.equal(
  priceLevelLabel({ price: 90, levelId: 'wholesale-level', minQuantity: 0 }, []),
  undefined,
  'no badge when the level list has not loaded yet',
);

console.log('price-level-badge: all assertions passed');
```

Register it in `tests/unit/run.ts`:

```ts
import './price-level-badge.test';
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '../../lib/price-level-badge'`.

- [ ] **Step 3: Create the label helper**

Create `lib/price-level-badge.ts`:

```ts
import type { ResolvedPrice } from './pricing';

/**
 * The short badge shown on a POS cart line so the cashier can see why the line
 * is priced as it is — e.g. `Wholesale · 10+`.
 *
 * Returns undefined when there is nothing worth showing: the product's base
 * price was used, or the level list has not loaded (showing a raw level id
 * would be worse than showing nothing).
 */
export function priceLevelLabel(
  resolved: Pick<ResolvedPrice, 'levelId' | 'minQuantity'>,
  priceLevels: { id: string; name: string }[],
): string | undefined {
  if (!resolved.levelId) return undefined;

  const level = (priceLevels || []).find((l) => l.id === resolved.levelId);
  if (!level) return undefined;

  return resolved.minQuantity > 0 ? `${level.name} · ${resolved.minQuantity}+` : level.name;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit`
Expected: PASS — `price-level-badge: all assertions passed`.

- [ ] **Step 5: Add the field to the POS `SaleItem`**

The POS has its own `SaleItem` (`export type SaleItem = Product & { ... }` at
`app/(app)/pos/pos-content/pos-types.ts:27`) — **not** the `SaleItem` interface
in `lib/types.ts`, which is the back-office sales type and must be left alone.

In `app/(app)/pos/pos-content/pos-types.ts`, add to the `SaleItem` intersection:

```ts
  /** Short badge showing which price level and tier set this line's price. */
  priceLevelLabel?: string;
```

- [ ] **Step 6: Populate the label in the POS**

In `app/(app)/pos/pos-content/use-pos.ts`, add `resolvePriceLevel` to the existing import and bring in the badge helper:

```ts
import { calculateEffectivePrice, resolvePriceLevel } from '@/lib/pricing';
import { priceLevelLabel } from '@/lib/price-level-badge';
```

Add this helper just after the `activeLevelName` memo (around line 563), so all four pricing sites share it:

```ts
  // Price + badge for one line, so the cashier can see which level and tier
  // produced the price.
  const priceLine = useCallback((product: any, qty: number) => {
    const resolved = resolvePriceLevel(product, qty, activeLevelId, defaultLevelId);
    return { price: resolved.price, priceLevelLabel: priceLevelLabel(resolved, priceLevels) };
  }, [activeLevelId, defaultLevelId, priceLevels]);
```

Then update the four pricing sites to spread it:

At the reprice-all effect (around line 570), replace:

```ts
      const updated = currentItems.map(item => ({ ...item, price: calculateEffectivePrice(item, item.quantity, activeLevelId, defaultLevelId) }));
```

with:

```ts
      const updated = currentItems.map(item => ({ ...item, ...priceLine(item, item.quantity) }));
```

At the quantity bump in `addToCart` (around line 601), replace:

```ts
          const newPrice = calculateEffectivePrice(product, newQty, activeLevelId, defaultLevelId);
          return prevItems.map(item => item.id === product.id ? { ...item, quantity: newQty, price: newPrice } : item);
```

with:

```ts
          return prevItems.map(item => item.id === product.id ? { ...item, quantity: newQty, ...priceLine(product, newQty) } : item);
```

At the new-line branch (around line 606), replace:

```ts
            price: calculateEffectivePrice(product, 1, activeLevelId, defaultLevelId),
```

with:

```ts
            ...priceLine(product, 1),
```

At the quantity-change handler (around line 678), replace:

```ts
          return { ...item, quantity: newQuantity, price: calculateEffectivePrice(original || item, newQuantity, activeLevelId, defaultLevelId) };
```

with:

```ts
          return { ...item, quantity: newQuantity, ...priceLine(original || item, newQuantity) };
```

Note: `...priceLine(...)` must come **after** `quantity:` in each object literal so the spread's `price` is not overwritten.

If `calculateEffectivePrice` is now unused in this file, remove it from the import to keep lint clean.

- [ ] **Step 7: Render the badge on the cart line**

Find the component that renders a cart line's name (the sale items table under `app/(app)/pos/`). Locate the element showing `item.name` and add directly beneath it:

```tsx
{item.priceLevelLabel && (
  <span className="text-[10px] text-muted-foreground">{item.priceLevelLabel}</span>
)}
```

Match the surrounding markup — if the name sits in a flex column, this is a sibling; if not, wrap both in a `<div className="flex flex-col">`.

- [ ] **Step 8: Verify**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/price-level-badge.ts \
        "app/(app)/pos/pos-content/pos-types.ts" \
        "app/(app)/pos/pos-content/use-pos.ts" \
        tests/unit/price-level-badge.test.ts \
        tests/unit/run.ts
git commit -m "feat(pos): show the active price level and tier on each cart line"
```

---

### Task 5: End-to-end verification against a real database

The unit tests pin the pure logic. This task proves the whole pipeline — tab → `product_selling_unit_prices` → bridge → `product_price_levels` → `/api/products` → POS — actually carries a minimum.

**Files:**
- Test: `tests/e2e/price-level-tiers.spec.ts` (create)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing downstream.

- [ ] **Step 1: Read the existing E2E conventions**

E2E specs live flat in `tests/e2e/`, not in subdirectories. Read in full:
- `tests/e2e/pricing.spec.ts` — the closest existing pricing coverage
- `tests/e2e/selling-units.spec.ts` — drives the Selling Units tab
- `tests/e2e/pos-sale.spec.ts` — drives the POS cart
- `tests/e2e/helpers/product-form.ts` — the shared product-form helper
- `tests/e2e/setup/global-setup.ts` — DB seeding

Follow their login helper, selectors and teardown exactly rather than inventing new ones. Tests run sequentially (`workers: 1`) against `alon_pos_test` on port 3100.

- [ ] **Step 2: Write the failing E2E test**

Create `tests/e2e/price-level-tiers.spec.ts`, reusing the helpers read in Step 1. The test must:

1. Create a product with a base selling unit, Retail price `100`.
2. On the Retail level, set Min Qty to `10` — leave a second row at Retail `85`/min `10` if the tab supports multiple rows per level; otherwise set Wholesale to `85` with Min Qty `10`.
3. Save, then reopen the product and assert the Min Qty field still shows `10` (proves the round trip through both tables).
4. Open `/pos`, add the product, assert the unit price is `100` at quantity 1.
5. Raise the quantity to `10` and assert the price becomes `85` and the cart line shows the tier badge.
6. Assert that a customer on a *different* level does not get the `85` — the leak guard from Review Focus 2, at the integration level.

- [ ] **Step 3: Run it to verify it fails if the pipeline regresses**

Run: `npm run test:e2e -- price-level-tiers`
Expected: PASS once Tasks 1-4 are in. If it fails, the failure identifies which link in the pipeline is broken — fix that rather than weakening the test.

- [ ] **Step 4: Run the full suites**

Run: `npm run test:unit && npm run typecheck && npm run lint && npm run test:e2e`
Expected: all PASS, with no regressions in the existing `pricing.spec.ts`, `selling-units.spec.ts` or `pos-sale.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/price-level-tiers.spec.ts
git commit -m "test(products): e2e coverage for price level quantity tiers at the POS"
```

---

## Notes for the implementer

- **The code in Tasks 1-4 was executed against its own tests while this plan
  was written**, in a throwaway directory: the Task 2 resolver passes all 25
  assertions (including every Review Focus case), and the Task 1 schema, Task 3
  row builder and Task 4 badge helper each pass theirs. The snippets are
  working code, not sketches. What remains unproven is the wiring — the two tab
  edits, the four `use-pos.ts` call sites, the cart-line markup and the E2E
  pipeline.

- **Do not "fix" `PriceLevel.minQuantity` in `lib/types.ts:91`.** It is vestigial — no DB column backs it, and nothing reads it. Removing it is a separate cleanup.
- **Purchase orders, bulk price update and family sync** write `product_price_levels` directly (`lib/purchase-actions.ts:241`, `lib/family-sync.ts:340`). They are unchanged by this work and must stay that way.
- **The POS reads `/api/products` → `MySqlProductRepository.findAll()`**, not the `getProducts()` server action. If a price looks stale at the POS, that repository is the place to check.
- **`MySqlProductRepository.findAll()` overwrites `product.price`** with the default level's lowest-minimum row (lines 115-123). That stays correct under the new rule: it is the default level's base row, which is exactly what step 3 of the resolution order should fall back to.
