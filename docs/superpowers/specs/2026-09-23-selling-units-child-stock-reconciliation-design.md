# Selling Units — Child Stock & Batch Reconciliation Design

**Date:** 2026-09-23
**Status:** Approved for planning
**Supersedes:** the deferred I1/I2 follow-up noted in `docs/superpowers/plans/2026-09-21-selling-product-units-schema-migration.md`'s final-review ledger (`.superpowers/sdd/2026-09-21-selling-product-units-schema-migration/progress.md`)

## Summary

Migration 120 (`scripts/migrations/120_migrate_parent_child_to_selling_units.ts`) currently refuses to merge any parent/child family where the child still carries its own `products.stock` or its own `inventory_batches` — a preflight guard added after the previous design pass found that blindly re-pointing a child's batches to its root without converting quantity/cost would either silently lose inventory or silently corrupt the root's FIFO cost ledger. That guard blocks 16 of the 18 real child products in this repo's own production-shaped backup dump, so the migration cannot currently run against real data.

This design replaces the guard with an actual reconciliation: convert the child's stock counter and every one of its `inventory_batches` rows into root-equivalent (base-unit) quantities and costs, using the same `qty_base` conversion factor the migration's pure planner (`lib/selling-units-migration.ts`) already computes for that child's selling unit, then merge them into the root in place.

## Why this change

- Today, a parent and its children are separate `products` rows, each with its own `stock` and its own `inventory_batches`. `lib/family-sync.ts` tries to keep them numerically mirrored, but the original spec (`docs/superpowers/specs/2026-09-11-selling-product-units-design.md`) documents this cascade as unreliable: two independently-written, behaviorally-divergent copies exist, and a unit that's never purchased directly ends up with zero batches of its own. So a child's stock/batches are not a guaranteed clean mirror of the root — they can hold genuinely independent, real inventory value that a naive merge would destroy.
- The project's own final whole-branch review of this migration (see the ledger cited above) validated the planner against the real backup dump and found this gap (I1/I2) as a hard blocker, not a cosmetic one: the current preflight guard is working as designed (fail loudly), but it means the migration cannot ship until this reconciliation exists.

## Scope

This touches only:
- `lib/selling-units-migration.ts` — two new pure, DB-free conversion helpers, unit-tested the same way as the existing `computeSellingUnitsPlan`.
- `scripts/migrations/120_migrate_parent_child_to_selling_units.ts` — `up()` gains the conversion logic in place of the blind re-point; `down()` gains the matching reversal.

No runtime application code changes. `lib/family-sync.ts`, checkout, and the Add/Edit Product UI stay exactly as they are today — those are Plan 2–4 territory per the original spec's Decisions table. This design assumes a single production cutover (Plans 1–5 ship together); it does not need to keep the old child products independently sellable during any gap period.

## Decisions

| Question | Decision |
|---|---|
| How to merge a child's `inventory_batches` into the root | **Convert each batch row in place and re-point it** (not a lump-sum adjustment batch). Preserves per-batch cost layers and `received_date`, so FIFO ordering against the root's own pre-existing batches stays correct with no re-sort needed. |
| How to merge `products.stock` | **Additive, independent of the batch merge.** `products.stock` and `inventory_batches` are two separately-maintained signals elsewhere in this codebase (confirmed in `lib/stock-movements.ts` — e.g. `sale` movements don't route through the same batch-sync branch as `adjustment`/`transfer`/`return`), so this migration treats them the same way: `root.stock += childStock × qty_base`, computed independently of the batch conversion, not derived from it. |
| Negative child stock (3 real products in the backup dump) | **Merge mechanically regardless of sign.** This migration's job is to preserve whatever numbers exist, not to fix unrelated pre-existing data-quality bugs (same posture already taken toward the real SUGAR-family `conversion_factors` bug documented in the prior review — flagged, not fixed, here). |
| Preflight guard | **Narrowed, not removed.** Still aborts (before any write) if a child's `qty_base` is `<= 0` — dividing a cost by zero or a negative factor is not a safe mechanical conversion, and this only happens on the same class of pre-existing bad conversion-factor data already flagged as out of scope. No longer aborts merely because a child has nonzero stock or batches — that is now the expected, handled case. |
| Rollback | **Fully reversible**, using the same data `down()` already backs up. The batch and stock conversions are inverted using the child's `qty_base` (looked up from `product_selling_units` before it is deleted at the end of `down()`) and the child's original `stock` value (already stored in `migration_120_backup.product_json`). |

## Conversion math

For a child selling unit with computed `qty_base` (how many root base-units one child-unit equals — already computed by `computeSellingUnitsPlan`, root-stays-base per the prior ruling):

**Stock:**
```
root.stock += childStock × qtyBase
```

**Each of the child's `inventory_batches` rows**, converted and re-pointed in one statement:
```sql
UPDATE inventory_batches
SET product_id = ?, selling_unit_id = ?,
    quantity_in = quantity_in * ?,
    quantity_remaining = quantity_remaining * ?,
    unit_cost = unit_cost / ?
WHERE product_id = ?
```
(`?` = `qtyBase`, bound for both quantity columns and once more, inverted, for `unit_cost`.) This preserves each batch's `id` and `received_date` (FIFO order is unaffected) and preserves total peso value: `qty × unitCost` before conversion equals `(qty × qtyBase) × (unitCost / qtyBase)` after.

**Rollback**, per restored child (run before `product_selling_units` rows are deleted, so `qty_base` is still resolvable by `selling_unit_id`):
```sql
UPDATE inventory_batches
SET product_id = ?, selling_unit_id = NULL,
    quantity_in = quantity_in / ?,
    quantity_remaining = quantity_remaining / ?,
    unit_cost = unit_cost * ?
WHERE product_id = ? AND selling_unit_id = ?
```
```
root.stock -= backedUpChildStock × qtyBase
```

## New pure helpers (`lib/selling-units-migration.ts`)

Two small, DB-free functions, unit-tested alongside the existing `computeSellingUnitsPlan` tests:

```ts
export function convertChildQuantityToBase(quantity: number, qtyBase: number): number {
  return quantity * qtyBase;
}

export function convertChildUnitCostToBase(unitCost: number, qtyBase: number): number {
  if (qtyBase <= 0) throw new Error(`Cannot convert unit cost with qty_base <= 0 (got ${qtyBase})`);
  return unitCost / qtyBase;
}
```

The migration script calls these for clarity/testability at the call sites that build the SQL parameters, even though the actual scaling happens in the `UPDATE` statement itself (both must agree — the unit tests are the guarantee they do).

## Testing

- **Unit (pure, no DB):** `convertChildQuantityToBase` / `convertChildUnitCostToBase` — a normal fraction (`qtyBase = 1/12`), a very small fraction, and the `qtyBase <= 0` throw case.
- **Migration-level, against the real production-shaped backup dump** (`backups/backup-stock_pilot-2026-04-27T06-28-09-187Z.sql`, the same fixture the prior final review used):
  - The preflight no longer blocks any of the 18 real child products (only a synthetic `qty_base <= 0` fixture should still block).
  - After `up()`, each root's `stock` equals its pre-migration stock plus the sum of its merged children's converted stock.
  - After `up()`, each family's total inventory value (`Σ quantity_remaining × unit_cost` across all its batches, root's own plus every merged child's) is unchanged before vs. after, within rounding tolerance.
  - After `up()`, FIFO order is unaffected: a `deductFromBatches` call against a merged root still consumes oldest `received_date` first, spanning both the root's original batches and the newly-merged child batches.
  - `down()` restores every original per-product `stock` value and every original batch's `quantity_in`/`quantity_remaining`/`unit_cost`/`product_id` exactly (round-trip test).

## Out of scope (YAGNI)

- Any change to `lib/family-sync.ts`, checkout, POS, or the Add/Edit Product UI — those are Plans 2–4.
- Fixing pre-existing, unrelated data-quality bugs surfaced during investigation (the real SUGAR-family inverted `conversion_factors` row, negative child stock) — preserved mechanically, not corrected.
- A `--dry-run` mode or other tooling improvements (carried forward as a non-blocking minor from the prior review, still not part of this design).
- Backfilling `product_selling_unit_prices` from `product_price_levels` (I3) — separate, already-deferred follow-up, unrelated to stock/batch reconciliation.
