# POS Selling Units — Search, Cart & Checkout Design

**Date:** 2026-10-07
**Status:** Approved for planning

## Summary

Selling units exist in the database and in the Add/Edit Product UI, but the POS
cannot see them. A product with a Case unit shows only its base Piece row in
product search, scanning the Case barcode finds nothing, and a checkout has no
way to record which unit was sold. This design surfaces selling units in POS
search and scan, gives each unit its own cart line, and carries
`selling_unit_id` + `qty_base` through checkout into FIFO batch deduction and
`sale_items` — and back out again through the void and return paths, which
restore stock from that same quantity column.

This implements the POS checkout portion of
[`2026-09-11-selling-product-units-design.md`](2026-09-11-selling-product-units-design.md)
(its "Plan 2–4" territory). That spec's Plan 1 — migration 120, which collapsed
parent/child families into flat selling units — has shipped. This design
deliberately does **not** implement that spec's pricing re-point or its removal
of `lib/family-sync.ts`; see Deviations below.

## Why this change

Three gaps, each independently sufficient to hide the feature:

1. `src/infrastructure/repositories/MySqlProductRepository.ts`'s `findAll`
   never queries `product_selling_units`, so `product.sellingUnits` is always
   `undefined` on every POS code path. Only
   `app/(app)/products/actions.ts` hydrates it, and that serves the Edit
   Product form.
2. That repository's search clause matches `products.name/sku/barcode` only. A
   selling unit's own barcode — `UNIQUE` since migration 115 — is unreachable,
   so a cashier scanning a Case finds nothing.
3. `app/api/pos/checkout/route.ts` has no `selling_unit_id` handling at all,
   even though migration 117 added the column to `sale_items` in September.

Gap 3 is the dangerous one. Without it, surfacing units in search would let a
cashier sell 3 Cases of 24 and have the system deduct 3 base units instead of
72 — silent inventory and FIFO cost corruption.

## Decisions

| Question | Decision |
|---|---|
| Server vs client expansion | **Server, behind an opt-in flag.** `MySqlProductRepository.findAll` returns one synthetic row per selling unit when `expandSellingUnits` is set. The POS passes it; every other `useProducts` consumer (10 non-POS call sites — purchase orders, bad orders, purchases list, view purchase order) is untouched and keeps seeing one row per product. |
| Search UI shape | **One row per selling unit**, each with its own price, barcode and converted stock. This **supersedes** the original spec's "one row per product + unit picker" (line 102 there) — chosen for the cashier: no extra click per sale. The original spec is amended, not silently contradicted. |
| Stock shown per unit row | **Converted to that unit, floored.** 60 base units at `qty_base = 24` shows `2`. The cashier's question is "how many Cases can I still sell", not "what is the base count". The base figure is carried alongside as `baseStock` for oversell checks. |
| Cart line identity | **A new `lineId` field; `id` stays the product id.** `lineId = id + '::' + sellingUnitId`, falling back to `id` when there is no unit. Making `id` itself composite would push `"prod::psu"` into `sale_items.product_id`, which is an FK to `products`. |
| Non-base unit pricing | **The unit's own `psu.price`, with no price-level tier applied.** `product_price_levels` rows are the *base* unit's prices; applying a ₱23 Piece wholesale tier to a Case would quote a sachet's price for 24. Base units and unit-less products keep today's full `resolvePriceLevel` tier behaviour untouched. |
| `qty_base` trust | **Resolved server-side from the DB, never read from the request.** A client-supplied multiplier directly scales a stock deduction. The lookup is scoped `AND psu.product_id = p.id`, so a unit id belonging to another product resolves to `NULL` and falls back to `1` rather than deducting by a foreign factor. |
| `sale_items.quantity` semantics | **Units sold, not base units.** 1 Case stores `quantity = 1`, `selling_unit_qty_base = 24`. Storing 24 would make receipts read "24 Case". `cost_at_sale` stays per-base-unit from FIFO, so a line's cost is `cost_at_sale × quantity × qty_base`. |
| `lib/family-sync.ts` | **Left in place, fed `baseQty`.** Removing it is the original spec's Plan 4/5 and touches 62 call sites across 16 files — inventory adjustments, voids, returns, sales orders, stock counts, bad orders, break pack and consolidation — out of scope here. |

## Deviations from the September 11 spec

Two parts of that spec are intentionally **not** implemented here. Both are
recorded so a later reader does not mistake them for oversights.

**1. Pricing is not re-pointed to `product_selling_unit_prices`.** That spec
(line 103) calls for `calculateEffectivePrice` to read
`product_selling_unit_prices` and for `product_price_levels` to be dropped.
Since then, [`2026-10-02-pos-price-level-tiers-design.md`](2026-10-02-pos-price-level-tiers-design.md)
built a quantity-tier system in `lib/pricing.ts`'s `resolvePriceLevel` on top of
`product.priceLevels` (i.e. `product_price_levels`), and commits `88df5f1`,
`564327a` and `70edf81` added a dual-write bridge between the two tables. The
pricing model therefore currently sits between the two designs. Reconciling it
is real work with its own blast radius and belongs in its own design pass. This
change reads `psu.price` for the unit's own price and leaves both pricing paths
exactly as they are.

**2. `lib/family-sync.ts` is not removed.** That spec deletes all four exports
on the grounds that "there is no cascade anymore". The cascade is indeed inert
in practice — migration 120 has run and `SELECT COUNT(*) FROM products WHERE
parent_id IS NOT NULL` returns 0 on the development database — but the code
remains, with 62 call sites across 16 files (including `void-transaction`,
`sales/returns`, `sales/orders/[id]/deliver`, `stock-adjustments`,
`bad-order-actions`, `purchase-actions` and `CompleteStockCountUseCase`).

**The double-deduction hazard this leaves.** Checkout will now pass `baseQty`
into `deductFamilyStock`. With zero `parent_id` rows, `findUltimateRoot`
returns `{ rootId: self, factorToRoot: 1 }` and the call deducts `baseQty`
once, correctly. But if a product ever again carries **both** a `parent_id` and
a non-base selling unit, the `qty_base` multiplier and the family cascade would
compound — a Case of 24 under a family factor of 12 would deduct 288. Note the
E2E database still seeds `PERISHABLE_FAMILY_PARENT` with a real `parent_id`, so
this combination is constructible in tests today even though production data no
longer has it. The implementation must carry an explicit comment at the
`deductFamilyStock` call site stating that `baseQty` already includes the unit
conversion and that a `parent_id` product with non-base units would
double-count. Closing it properly means finishing the original spec's
family-sync removal.

## Server-side expansion

`GetProductsFilters` gains `expandSellingUnits?: boolean`, passed through from
`?expandSellingUnits=true` on `GET /api/products`.

### Search

When the flag is set, the search clause gains a fourth alternative:

```sql
AND (products.name LIKE ? OR products.sku LIKE ? OR products.barcode LIKE ?
     OR EXISTS (SELECT 1 FROM product_selling_units psu
                 WHERE psu.product_id = products.id AND psu.barcode LIKE ?))
```

`EXISTS`, not a `JOIN`. The query applies `LIMIT ? OFFSET ?` to product rows
(`MySqlProductRepository.ts:78`) and the hook hard-codes `limit=100`
(`hooks/use-api.ts:37`); joining would make that limit count unit rows and drop
whole products off the end of the page.

### Expansion

Expansion happens **after** pagination, in the same post-processing block that
already hydrates `priceLevels` (`MySqlProductRepository.ts:83–100`), via one
additional `WHERE product_id IN (?)` query — the pattern that block already
uses. Each product with units becomes N rows:

| Field | Value |
|---|---|
| `id` | `products.id`, unchanged — stock, batches and loyalty all key off it |
| `sellingUnitId` | `psu.id` |
| `isBaseUnit` | `psu.is_base` |
| `name` | `"<product> <unit>"`, with no suffix for the base unit |
| `price` | `psu.price` |
| `barcode` | `psu.barcode` |
| `qtyBase` | `psu.qty_base` |
| `stock` | `floor(products.stock / qty_base)` |
| `baseStock` | `products.stock` |
| `unitOfMeasure` | `psu.unit_name` |

A product with no selling-unit rows yields exactly one row, identical to
today's output. Products are never dropped by expansion.

## Cart line identity

`SaleItem` gains `lineId`, `sellingUnitId`, `qtyBase` and `isBaseUnit`. `id`
keeps its present meaning: the product id.

Cart lookups in `app/(app)/pos/pos-content/use-pos.ts` move from `item.id` to
`item.lineId` — `handleAddItem` (lines 595, 613, 616), `updateQuantity` (690),
`selectedItem` (211), item removal, `handleVoidLine`, the discount handler
(837), and the arrow-key navigation (518, 528). Two things deliberately keep
using the product id: the `products?.find(p => p.id === productId)` lookup at
line 691, which is genuinely a product lookup, and the checkout payload's
`item.id`, which becomes `sale_items.product_id`.

For a product with no selling units `lineId === id`, so single-unit behaviour
is byte-for-byte what it is today.

## Pricing

All POS pricing funnels through one callback, `priceLine`
(`use-pos.ts:569`) — add, quantity change, level switch and `repriceCartLines`
all call it. One early return covers the whole feature:

```ts
const priceLine = useCallback((product: any, qty: number) => {
  // A non-base selling unit carries its own price. The rows in
  // product_price_levels are the BASE unit's prices, so applying a Piece's
  // wholesale tier to a Case would quote a sachet's price for 24.
  if (product.sellingUnitId && !product.isBaseUnit) {
    return { price: product.price, priceLevelLabel: undefined };
  }
  const resolved = resolvePriceLevel(product, qty, activeLevelId, defaultLevelId);
  return { price: resolved.price, priceLevelLabel: priceLevelLabel(resolved, priceLevels) };
}, [activeLevelId, defaultLevelId, priceLevels]);
```

Base units and unit-less products take the existing path unchanged, so the
October 2 tier work does not regress.

## Scan resolution

`findExactCodeMatch` (`use-pos.ts:668`) needs no new lookup logic: because the
server expands rows, a Case's barcode is already `row.barcode` on its own row.
The existing exact-match-then-server-fallback sequence resolves it as-is. Same
for `rankMatches` (640) and `getSearchSuggestions` (655).

This is the simplification the original spec predicted — a unique
`product_selling_units.barcode` resolves one unit directly, with no "which of
these N product rows did you scan" ambiguity.

## Checkout

`app/api/pos/checkout/route.ts` receives `sellingUnitId` per line.

The existing `soldProd` query (line 202) — already the single query serving
loyalty, service detection and family sync — gains:

```sql
LEFT JOIN product_selling_units psu
       ON psu.id = ? AND psu.product_id = p.id
```

The `AND psu.product_id = p.id` is the trust boundary: a unit id from another
product yields `NULL`, so `qtyBase` falls back to `1`.

```ts
const qtyBase = soldProd?.psu_qty_base ? parseFloat(soldProd.psu_qty_base) : 1;
const baseQty = item.quantity * qtyBase;
```

`baseQty` then replaces `item.quantity` in exactly three places:

1. `deductFromBatches(item.id, baseQty, ...)` — line 229. The function itself
   is untouched; FIFO order, oversell handling and
   `pos_settings.batch_costing_oversell_block` all keep working.
2. `deductFamilyStock(..., baseQty, ...)` — lines 302 and 310, both branches,
   with the hazard comment described in Deviations.
3. The `sale_items` insert (line 247), which gains the three columns migration
   117 already created:

```sql
INSERT INTO sale_items (
  id, sale_id, product_id, product_name, quantity, price, cost_at_sale,
  batch_source, selling_unit_id, selling_unit_name, selling_unit_qty_base,
  created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
```

`quantity` stays `item.quantity`. `selling_unit_name` and
`selling_unit_qty_base` are snapshots, so a later rename or re-ratio of the
unit cannot retroactively change a historical receipt.

Services are unaffected: the `itemIsService` branch (line 218) skips batch
costing and stock entirely, and a service has no selling units.

## Void and return paths must convert too

Storing `quantity` as units sold rather than base units has a consequence the
reverse paths cannot ignore, because they restore stock by reading that column
back:

- `app/api/pos/void-transaction/route.ts:83–94` reads
  `SELECT product_id, product_name, quantity FROM sale_items` and passes
  `item.quantity` straight into `addFamilyStock`.
- `app/api/sales/invoices/[id]/void/route.ts:25–35` does the same from
  `sales_invoice_items`.
- `app/api/sales/returns/route.ts:81–94` writes negative `item.quantity` from
  a client-supplied list.

Voiding a sale of 1 Case (`quantity = 1`, `qty_base = 24`) would restore **1**
base unit instead of 24, destroying 23 units of real inventory on an operation
cashiers perform routinely. A void is not an edge case, so this is in scope, not
deferred.

The POS void path selects `selling_unit_qty_base` alongside `quantity` and
restores `quantity × COALESCE(selling_unit_qty_base, 1)`. The `COALESCE` keeps
every historical row — all of which have `NULL` there — restoring exactly as it
does today. `sale_items` has had that column since migration 117.

**`sales_invoice_items` needs a new migration.** Migration 122 added only
`selling_unit_id` to that table, not the `selling_unit_name` /
`selling_unit_qty_base` snapshot pair that 117 gave `sale_items`. So the invoice
void cannot convert from the row alone. Rather than resolve `qty_base` through a
join to `product_selling_units` — which would read the unit's *current* ratio
and so restore the wrong quantity for any unit re-ratioed after the sale — this
change adds migration 128 giving `sales_invoice_items` the same two snapshot
columns, and checkout's `sales_invoice_items` insert
(`app/api/pos/checkout/route.ts:461`) populates all three. The invoice void then
uses the identical `COALESCE` expression. A snapshot is the whole reason 117
carries one; the invoice table should not be the exception.

For `app/api/sales/returns/route.ts` the quantity arrives from the client, so it
resolves `qty_base` server-side from `sellingUnitId` using the same scoped
lookup checkout uses, and writes the same three snapshot columns onto the
negative `sale_items` row it creates.

An E2E test covers the round trip: sell 1 Case, void it, and assert the batch
and `products.stock` return to their exact pre-sale values.

## Error handling

- **Missing or unknown `sellingUnitId`** — `qtyBase` falls back to `1` and the
  three snapshot columns are written `NULL`. This is exactly today's behaviour,
  so a client that never sends the field keeps working.
- **`qty_base` of `0`, negative or non-finite** — `toBaseQty` returns the raw
  quantity (multiplier `1`). A zero multiplier would deduct nothing and leak
  stock; a negative one would *add* stock on a sale. Migration 120's preflight
  already rejects `qty_base <= 0`, so this is defence in depth.
- **Oversell** — unchanged. `deductFromBatches` sees `baseQty` and applies the
  existing `batch_costing_oversell_block` setting, which means oversell is now
  evaluated against the true base quantity rather than the unit count.
- **Expansion query failure** — the repository logs and returns unexpanded
  rows rather than failing the request, matching how the existing `priceLevels`
  hydration degrades. The POS then shows base rows only: the pre-change
  behaviour, not an error screen.

## Testing

**Unit, pure, no DB** — a new `lib/selling-unit-qty.ts` holds the conversion
math so it is testable in isolation:

- `toBaseQty(qty, qtyBase)` — `3 × 24 = 72`; `null`/`0`/negative/`NaN`
  `qtyBase` all fall back to multiplier `1`.
- `toUnitStock(baseStock, qtyBase)` — `floor(60 / 24) = 2`; guards division by
  zero; a negative base stock stays negative rather than flooring toward a
  misleading `0`.
- `buildLineId(productId, sellingUnitId)` — composite when a unit is given,
  exactly `productId` when it is not.

**E2E (Playwright)** — `tests/e2e/fixtures/test-data.ts` already seeds
`SELLING_UNITS_PRODUCT` (Piece base ₱25, Case `qtyBase: 24` ₱580, barcode
`5200000000021`, stock 60). It needs `inventory_batches` rows added to
`prepare-test-db.ts`, which currently seeds none, so FIFO deduction is
observable:

- Searching the product shows a Piece row and a Case row, priced ₱25 and ₱580,
  with stock `60` and `2`.
- Scanning `5200000000021` adds a Case line at ₱580 without a picker.
- Adding a Case and a Piece yields **two** cart lines, not one collided line.
- Checking out 1 Case deducts **24** from the oldest batch, and writes
  `sale_items` with `quantity = 1`, `selling_unit_qty_base = 24`,
  `selling_unit_name = 'Case'`.
- Voiding that Case sale restores the batch and `products.stock` to their exact
  pre-sale values (the round trip from the void section above).
- Voiding a sale made of base units only, and a historical row with
  `selling_unit_qty_base IS NULL`, both restore exactly as they do today.
- A product with no selling units behaves exactly as before, including its
  price-level tiers.
- With the flag absent, `GET /api/products` returns one row per product.

**Migration 128** — `up()` adds both snapshot columns to
`sales_invoice_items`; `down()` removes them and the round trip leaves the table
definition unchanged. It follows 117's `columnExists` idempotency guard so a
re-run is a no-op.

## Out of scope

- Re-pointing pricing to `product_selling_unit_prices`, and reconciling it with
  the October 2 tier system (see Deviations).
- Removing `lib/family-sync.ts` and its 20+ callers (see Deviations).
- Purchase-order receiving in selling units. Migration 118 added the columns;
  `lib/purchase-actions.ts` is a separate change.
- Populating the remaining `selling_unit_id` columns from migrations 121, 123–127
  (stock movements, POS transaction items, stock adjustments, bad orders, sales
  orders, stock counts). This change writes `sale_items` (117) and
  `sales_invoice_items` (122 + the new 128); the rest keep writing `NULL`.
- Reports and receipts that aggregate `sale_items.quantity` across mixed units.
  They will sum unit counts, which is wrong for a mixed-unit total, and need
  their own pass once units are actually in use.
- Backfilling `selling_unit_id` on historical `sale_items` rows.
