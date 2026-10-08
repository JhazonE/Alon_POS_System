# Automatic quantity tiers across price levels

**Date:** 2026-10-08
**Status:** Awaiting review
**Supersedes (partially):** `2026-10-02-pos-price-level-tiers-design.md` decision **D3**

## Problem

A cashier raises a cart line to 10 and expects the wholesale price to apply.
It does not. Today the only ways a quantity tier can fire are:

1. the customer on the sale carries the tier's level (`customers.price_level_id`), or
2. the cashier switches the sale's level by hand (the `enable_price_level_switch`
   switcher added 2026-10-08).

Both require the tier to live on the *active* level. A walk-in — the common case
at the counter — is priced at the default level, so a tier declared on Wholesale
can never fire for them.

This is not a defect in `lib/pricing.ts`. It is decision **D3** of the
2026-10-02 spec ("strict level isolation"), working as designed. Measured on
production data (`REBISCO CRACKERS`, Retail ₱200 flat, Wholesale ₱110 @ min 10):

| Active level | Qty 1 | Qty 9 | Qty 10 | Qty 20 |
|---|---|---|---|---|
| Retail (walk-in, default) | ₱200 | ₱200 | ₱200 | ₱200 |
| Wholesale (registered customer) | ₱200 | ₱200 | ₱110 | ₱110 |

The product owner wants the first row to reach ₱110 at qty 10 without assigning
a customer and without touching a dropdown.

## Why this needs care

The 2026-10-02 spec calls unscoped tier matching **"the ₱70 leak — the
money-losing defect"**. Before that spec, a tier on *any* level applied to
*every* sale and `Math.min` picked the winner, so a Retail customer silently
received Wholesale pricing. D3 and D4 removed that.

The behaviour requested here uses the same mechanism. The difference is that it
is now intentional, opt-in, and bounded. The bound is what keeps D4 alive: a
registered customer on a markup level (Premium ₱250) must still pay their own
level's price at every quantity, or markup levels stop working.

## Decisions

Confirmed with the product owner (2026-10-08):

- **A1 — Gated by the existing toggle.** `enable_price_level_switch` controls
  this. OFF (the default) preserves today's behaviour exactly: only a registered
  customer's declared level, or a manual pick, applies. ON enables automatic
  cross-level tiers.
- **A2 — Only when the sale has no declared level.** Automatic tiers apply when
  the active level is the *default* level and the customer carries no
  `price_level_id` of their own. A customer with a declared level, or a cashier
  who picked a level by hand, is never overridden. (Preserves D4.)
- **A3 — Cheapest qualifying tier wins.** Across all levels, among rows whose
  `min_quantity <= quantity`, the lowest price wins. Rationale: it is the rule a
  cashier can explain at the counter — "the best tier the quantity earns".
- **A4 — Never above the base price.** An automatic tier may only lower the
  line price. A markup level's row (Premium ₱250 @ min 10) must not raise a
  walk-in's price, which would overcharge silently.
- **A5 — The badge names the level that set the price.** An auto-applied tier
  renders as it does today, e.g. `Wholesale · 10+`, so the cashier and the
  receipt audit trail show where ₱110 came from.

## Target pricing rule

`resolvePriceLevel` gains one optional step. Steps 1-3 are unchanged, so every
existing behaviour is preserved bit-for-bit when the step is disabled.

1. The **active level's** best qualifying row (highest `min_quantity`, ties to
   lowest price).
2. The **default level's** best qualifying row, same rule.
3. **NEW — automatic cross-level tier**, only when *all* of:
   - the feature is enabled (A1), and
   - the active level is the default level and the customer declared no level (A2), and
   - the row's `min_quantity >= 2` — a flat row on another level is not a tier
     and must never leak (this is the ₱70 leak's actual guard), and
   - the resulting price is **below** what steps 1-2 produced (A4).

   Among the rows that pass, take the **lowest price** (A3).
4. The product's **base price**.

Step 3 sits *after* 1-2 deliberately: it can only improve on a price the
existing rules already settled, so it cannot introduce a regression on its own.

### Signature

`resolvePriceLevel` and `calculateEffectivePrice` keep their current
signatures; the new input is an optional trailing options argument:

```ts
resolvePriceLevel(product, quantity, activeLevelId?, defaultLevelId?,
                  options?: { autoQuantityTiers?: boolean })
```

Omitting `options` yields today's behaviour. This matters because six call sites
exist (`use-pos.ts`, `use-edit-item.ts`, `PriceInquiryDialog.tsx`,
`ProductSearchDialog.tsx` ×2 and `cart-reprice` via `priceLine`), and the
read-only display sites (search list, price inquiry) price at qty 1, where no
tier can fire anyway.

## Worked examples

`REBISCO CRACKERS`: base ₱200, Retail ₱200 flat, Wholesale ₱110 @ min 10.

| Toggle | Customer | Qty | Price | Why |
|---|---|---|---|---|
| OFF | walk-in | 10 | ₱200 | unchanged — step 3 disabled |
| ON | walk-in | 1 | ₱200 | no row qualifies at qty 1 |
| ON | walk-in | 9 | ₱200 | min 10 not reached |
| ON | walk-in | 10 | **₱110** | step 3: Wholesale tier earned |
| ON | Wholesale customer | 10 | ₱110 | step 1 — already worked |
| ON | Premium customer (₱250) | 10 | ₱250 | A2: declared level, step 3 skipped |
| ON | walk-in, Premium ₱250 @ min 10 only | 10 | ₱200 | A4: never raises the price |

## Scope of change

**In scope**
- `lib/pricing.ts`: step 3, behind the new option.
- `use-pos.ts`: pass the option, derived from `enablePriceLevelSwitch` plus
  "customer has no declared level and no manual pick".
- `use-edit-item.ts`: same, so the Edit Item dialog's quantity change agrees
  with the cart (it re-prices on qty change and would otherwise disagree).
- Unit tests covering every row of the worked-examples table.

**Out of scope**
- The DB schema. `product_price_levels`' PK stays `(product_id, price_level_id)`;
  this feature needs no second row per level.
- Multiple tiers on one level (e.g. ₱200 flat and ₱180 @ 10 both on Retail).
  That genuinely requires a PK change and a multi-row UI; it is a separate piece
  of work and is **not** what this spec delivers.
- Server-side re-pricing at checkout. `POST /api/pos/checkout` trusts the
  client's line price today and is unchanged — noted as pre-existing, not
  introduced here.
- The `enable_price_level_switch` switcher UI itself, already shipped.

## Compatibility

- Toggle defaults OFF, so an existing store sees no pricing change until an
  operator opts in.
- BIR: line prices still flow to `sales_invoice_items` unchanged; only the
  resolved number differs, and only when opted in. No numbering impact.
- The toggle now controls two related behaviours (the manual switcher and
  automatic tiers). Its label and help text are updated to say so.

## Error handling

- A row with a blank or non-numeric price is skipped (existing `validPrice`).
- `min_quantity` of `0`, `null` or `1` is "no minimum" and is never eligible for
  step 3 — only `>= 2` is a tier.
- A product with no `priceLevels` array falls through to the base price, as today.

## Testing

Unit tests in `tests/unit/` against `resolvePriceLevel`, one assertion per row
of the worked-examples table, plus:
- toggle OFF reproduces the current table exactly (regression guard on the ₱70 leak);
- a markup-only level never raises a walk-in's price (A4);
- a flat (min 0/1) row on a non-active level never leaks (the ₱70 leak guard).
