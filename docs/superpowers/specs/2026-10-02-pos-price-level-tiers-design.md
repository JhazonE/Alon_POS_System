# POS Price Levels & Quantity Tiers — Design

**Date:** 2026-10-02
**Status:** Approved for implementation

## Problem

Price levels exist in the system and the POS already resolves one per sale, but
the feature does not actually work end to end:

1. A minimum quantity entered against a selling unit never reaches the POS.
2. A quantity tier belonging to one price level is applied to customers on a
   *different* level, silently discounting sales.
3. A price level priced *above* the base price is ignored; the customer pays
   the base price.

The goal is for a declared price level to apply correctly at the POS, both as a
per-customer level and as a quantity-triggered tier.

## Current architecture (verified 2026-10-02)

Two tables hold per-level prices, bridged by a dual-write:

```
Selling Units tab  ──►  product_selling_unit_prices  (has min_quantity)
                              │
                              │  writeBaseUnitPriceLevels()
                              ▼
                        product_price_levels         (has min_quantity)
                              │
                              │  MySqlProductRepository → /api/products
                              ▼
                        POS calculateEffectivePrice()
```

- `writeSellingUnits()` (`app/(app)/products/actions.ts`) **already persists**
  `min_quantity` into `product_selling_unit_prices` correctly.
- `sellingUnitSchema` (`app/(app)/products/add-product/product-schema.ts:20-23`)
  **already carries** `prices[levelId].minQuantity`.
- The POS reads products through `/api/products` →
  `MySqlProductRepository.findAll()`, **not** the `getProducts()` server action.
  Both populate `priceLevels` from `product_price_levels`.
- The POS cart is keyed on `product.id` and has **no selling-unit concept**
  (verified: zero occurrences of `sellingUnit` under `app/(app)/pos/` or
  `app/api/pos/`).

### The three breaks

**Break 1 — no min-qty UI.** The Selling Units tab renders only a price input
per level (`selling-units-tab.tsx`, the `priceLevels.map(...)` block). Nothing
can populate `minQuantity`, so the schema field is always `undefined`.

**Break 2 — the bridge drops min qty.** `writeBaseUnitPriceLevels()`
(`app/(app)/products/actions.ts:665-687`) writes:

```sql
INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity)
VALUES (?, ?, ?, 0)
ON DUPLICATE KEY UPDATE price = VALUES(price)
```

`min_quantity` is hardcoded to `0` on insert and never updated. Only the base
unit is mirrored.

**Break 3 — tiers are not scoped to a level.** `lib/pricing.ts:43`:

```ts
const isTierHit = minQty > 1 && qty >= minQty;
```

No check that the tier's `levelId` matches the active level. Combined with the
closing `Math.min(...)` over all candidates, this leaks tier prices across
levels.

### Observed behaviour (measured by executing `calculateEffectivePrice`)

| Scenario | Active level | Qty | Result | Correct? |
|---|---|---|---|---|
| Retail ₱100 / Wholesale ₱90, both minQty 0 | retail | 1 | ₱100 | ✅ |
| same | wholesale | 1 | ₱90 | ✅ |
| Premium ₱120 vs base ₱100 | premium | 1 | **₱100** | ❌ should be ₱120 |
| Retail ₱100 + Wholesale tier ₱70 @ minQty 10 | retail | 10 | **₱70** | ❌ leak |

The ₱70 leak is the money-losing defect. It does not bite in production *today*
only because Break 2 flattens every `min_quantity` to 0 — fixing Break 2 without
Break 3 would activate it.

## Decisions

Confirmed with the product owner:

- **D1 — Scope: base unit only.** The POS stays product-level. Per-selling-unit
  checkout (selling a 250g sachet as its own POS line) is explicitly **out of
  scope**; it would require changing the cart model, checkout API, stock
  deduction, receipts and BIR invoice lines.
- **D2 — Tiers are scoped to their level.** A tier applies only when its
  `levelId` equals the active level. (Resolves the ₱70 leak.)
- **D3 — Strict level isolation.** A customer on Wholesale sees only Wholesale
  rows; Retail tiers do not apply to them, even when cheaper.
- **D4 — Honour levels above base.** A Premium customer on a ₱120 level pays
  ₱120, not the ₱100 base. (Removes the `Math.min` ceiling.)
- **D5 — Cashier visibility.** The POS cart line shows which level was used and
  whether a quantity tier fired, e.g. `Wholesale · 10+`.

## Target pricing rule

Replacing `Math.min` over all candidates with explicit resolution:

1. Collect rows for the **active level**. Among those with
   `minQuantity <= quantity`, take the one with the **highest** `minQuantity`
   (the most specific tier the quantity earns). Use its price.
2. If the active level has no qualifying row, fall back to the **default
   level**, by the same highest-qualifying-tier rule.
3. If neither has a qualifying row, use the product's **base price**.

The base price is a fallback, never a competing candidate — this is what makes
D4 work. `minQuantity` of `0`, `null` or `1` all mean "no minimum" and are
treated as the level's base row.

Ties on `minQuantity` within a level (possible only via direct DB writes, since
the PK is `(product_id, price_level_id)`) resolve to the lowest price, for
determinism.

## Scope of change

**In scope**
- Min-qty input per price level on the base unit row of the Selling Units tab.
- Bridge propagates `min_quantity` to `product_price_levels`.
- New level-scoped tier resolution in `lib/pricing.ts`.
- POS cart line badge showing the active level and tier.

**Out of scope**
- Per-selling-unit POS lines (D1).
- Changes to `price_levels` table shape. Min qty stays per-product-per-level;
  it is **not** a property of the level definition. (`PriceLevel.minQuantity`
  in `lib/types.ts:91` is vestigial — no DB column backs it. Left alone.)
- Purchase orders, bulk price update, family sync — they write
  `product_price_levels` directly and keep working unchanged.

## Compatibility

- `calculateEffectivePrice()` keeps its exact signature, so its five call sites
  need no change.
- Existing rows all have `min_quantity` of `0` or `null`, which the new rule
  treats as base rows — behaviour for them is unchanged except where D4 applies
  (a level above base price now wins, which is the fix).
- No migration. Both tables already have the `min_quantity` column.

## Error handling

- A min-qty of `0`, blank or `1` is stored as "no minimum" (`0`), not rejected.
- Negative or non-numeric min-qty is rejected at the form schema.
- A tier row whose price is blank is skipped entirely (existing `validPrice`).
- Deleting a level's price in the tab removes its tier too, via the existing
  `removedLevelIds` path.
