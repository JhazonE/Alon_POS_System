# Selling Units — Child Stock & Batch Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace migration 120's all-or-nothing preflight guard (which blocks any child product family that still has real stock/batches — 16 of 18 real families) with an actual reconciliation: convert each merged child's `products.stock` and `inventory_batches` rows into root-equivalent base units using the `qty_base` factor the planner already computes, so the migration can run against real production-shaped data.

**Architecture:** Two new pure, DB-free conversion helper functions in `lib/selling-units-migration.ts` (unit-tested like the existing `computeSellingUnitsPlan`), consumed by rewritten `up()`/`down()` logic in `scripts/migrations/120_migrate_parent_child_to_selling_units.ts`. The batch merge converts `inventory_batches` rows in place (same `id`/`received_date`, scaled `quantity_in`/`quantity_remaining`/`unit_cost`) instead of blindly re-pointing them; the stock merge is a separate, independent addition to `products.stock`. `down()` gains the exact inverse of both, resolving each child's `qty_base` from `product_selling_units` before that table's rows are deleted at the end of rollback.

**Tech Stack:** TypeScript migrations run via `tsx` (`scripts/migrations/`), raw `mysql2/promise` (`lib/mysql.ts`), Node's built-in `assert/strict` for unit tests (`tests/unit/`, run via `tsx tests/unit/run.ts`).

**Spec:** `docs/superpowers/specs/2026-09-23-selling-units-child-stock-reconciliation-design.md` — this plan implements the "Conversion math", "New pure helpers", and "Testing" sections in full.

## Global Constraints

- This plan modifies only `lib/selling-units-migration.ts` and `scripts/migrations/120_migrate_parent_child_to_selling_units.ts` (plus their test files) — no runtime application code (`lib/family-sync.ts`, checkout, Add/Edit Product UI) changes. That is explicitly out of scope (Plans 2–4).
- `products.stock` and `inventory_batches` are merged as two **independent** additions — the stock merge is never derived from the batch merge or vice versa (per the spec's Decisions table, matching how `lib/stock-movements.ts` already treats them as separate signals elsewhere in this codebase).
- Negative child stock/batch values are merged **mechanically, regardless of sign** — this migration does not attempt to fix pre-existing data-quality bugs (e.g. the real SUGAR-family inverted `conversion_factors` row noted in the prior review).
- The preflight guard aborts (before any write) only when a to-be-merged child's `qty_base <= 0` — it must **not** abort merely because a child has nonzero stock or batches; that is now the expected, handled case.
- Every `inventory_batches` conversion must preserve total peso value: `quantity × unit_cost` before conversion must equal `(quantity × qty_base) × (unit_cost / qty_base)` after, and must keep the same batch `id` and `received_date` so FIFO order is unaffected.

  **Note (post-implementation correction):** this holds exactly for `down()`'s restore (now exact by construction, since it writes back a byte-for-byte pre-migration snapshot rather than re-deriving values). It does NOT hold to unlimited precision for the FORWARD conversion in `up()`: `inventory_batches`' `quantity_in`/`quantity_remaining`/`unit_cost` columns are `DECIMAL(14,4)`, so a quantity that isn't an exact multiple of the conversion factor rounds on the way in, bounding (not eliminating) the value-preservation guarantee to roughly `5e-5 × base_unit_cost` per affected batch row (half the `DECIMAL(14,4)` rounding unit). This was a deliberate, reviewed acceptance — widening `inventory_batches`' schema was judged out of scope for this task — not an oversight; see the corresponding code comment in `scripts/migrations/120_migrate_parent_child_to_selling_units.ts`'s `up()`.
- `down()` must be an exact inverse of `up()`'s conversion, using the child's original `stock` value already captured in `migration_120_backup.product_json` and the merged child's `qty_base` looked up from `product_selling_units` before that table is cleared at the end of rollback.

  **Note (post-implementation correction):** this constraint's mechanism was refined during implementation after review found the originally-planned approach had two independent precision-loss sources (`inventory_batches`' own `DECIMAL(14,4)` rounding on top of `product_selling_units.qty_base`'s `DECIMAL(14,6)` rounding). As shipped: `down()` restores each child's `inventory_batches` rows **verbatim** from a JSON snapshot (`migration_120_backup.batches_json`) captured before `up()`'s conversion, rather than reversing the batch arithmetic. The `stock` scalar reversal still uses arithmetic reversal as originally planned, but resolves `qty_base` from the exact double captured as a string in `migration_120_backup.qty_base_used`, not from `product_selling_units.qty_base` (a second, independently-rounded source). See `docs/superpowers/specs/2026-09-23-selling-units-child-stock-reconciliation-design.md`'s Decisions table for the full corrected description.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/selling-units-migration.ts` | Modified — adds `convertChildQuantityToBase` and `convertChildUnitCostToBase` pure helpers |
| `tests/unit/selling-units-migration.test.ts` | Modified — unit tests for the two new helpers |
| `scripts/migrations/120_migrate_parent_child_to_selling_units.ts` | Modified — `up()`'s preflight guard, stock merge, and batch conversion; `down()`'s matching reversal |

---

### Task 1: Pure conversion helpers (TDD)

**Files:**
- Modify: `lib/selling-units-migration.ts`
- Modify: `tests/unit/selling-units-migration.test.ts`

**Interfaces:**
- Produces: `convertChildQuantityToBase(quantity: number, qtyBase: number): number`, `convertChildUnitCostToBase(unitCost: number, qtyBase: number): number` — consumed by Task 2's `up()`/`down()`.

- [ ] **Step 1: Write the failing tests**

Add to the end of `tests/unit/selling-units-migration.test.ts` (before the final `console.log` line):

```ts
// --- convertChildQuantityToBase: scales a child-unit quantity into base units ---
{
  assertClose(convertChildQuantityToBase(12, 1 / 12), 1, '12 child-units at qty_base=1/12 is 1 base unit');
  assertClose(convertChildQuantityToBase(5, 1 / 144), 5 / 144, 'a very small fraction scales correctly');
  assertClose(convertChildQuantityToBase(-8, 1 / 12), -8 / 12, 'negative quantities are merged mechanically, not blocked');
  assert.equal(convertChildQuantityToBase(0, 1 / 12), 0, 'zero quantity converts to zero');
}

// --- convertChildUnitCostToBase: inverts the scale so total peso value is preserved ---
{
  assertClose(convertChildUnitCostToBase(10, 1 / 12), 120, 'unit_cost divides by qty_base (10 / (1/12) = 120)');
  assertClose(convertChildUnitCostToBase(1, 1 / 144), 144, 'a very small fraction still inverts correctly');
  assert.throws(
    () => convertChildUnitCostToBase(10, 0),
    /qty_base <= 0/,
    'qty_base = 0 throws instead of dividing by zero'
  );
  assert.throws(
    () => convertChildUnitCostToBase(10, -1),
    /qty_base <= 0/,
    'a negative qty_base throws — never a safe conversion factor'
  );
}

// --- round-trip: converting a quantity/cost to base and back recovers the original ---
{
  const qty = 7;
  const unitCost = 25.5;
  const qtyBase = 1 / 12;
  const baseQty = convertChildQuantityToBase(qty, qtyBase);
  const baseCost = convertChildUnitCostToBase(unitCost, qtyBase);
  assertClose(baseQty * baseCost, qty * unitCost, 'total peso value is preserved by the conversion');
  assertClose(baseQty / qtyBase, qty, 'dividing back by qty_base recovers the original quantity (down() reversal)');
  assertClose(baseCost * qtyBase, unitCost, 'multiplying back by qty_base recovers the original unit_cost (down() reversal)');
}
```

Update the import at the top of the file to include the two new names:

```ts
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput, convertChildQuantityToBase, convertChildUnitCostToBase } from '../../lib/selling-units-migration';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx tests/unit/selling-units-migration.test.ts`
Expected: FAIL — `convertChildQuantityToBase is not a function` (or a TypeScript compile error naming the missing export).

- [ ] **Step 3: Write the implementation**

Add to the end of `lib/selling-units-migration.ts`:

```ts
/**
 * Converts a quantity denominated in a child selling unit into root-equivalent
 * base units, using the same qty_base factor computeSellingUnitsPlan already
 * assigns that unit (how many base units one of this unit equals).
 */
export function convertChildQuantityToBase(quantity: number, qtyBase: number): number {
  return quantity * qtyBase;
}

/**
 * Converts a per-unit cost denominated in a child selling unit into a
 * root-equivalent (base-unit) per-unit cost. Inverts qty_base (rather than
 * multiplying, like the quantity conversion above) so that total peso value
 * is preserved: (quantity * qtyBase) * (unitCost / qtyBase) === quantity * unitCost.
 */
export function convertChildUnitCostToBase(unitCost: number, qtyBase: number): number {
  if (qtyBase <= 0) {
    throw new Error(`Cannot convert unit cost with qty_base <= 0 (got ${qtyBase})`);
  }
  return unitCost / qtyBase;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx tests/unit/selling-units-migration.test.ts`
Expected: PASS — final line `selling-units-migration: all assertions passed`.

Run: `npm run test:unit`
Expected: all existing tests still pass, plus these new assertions.

- [ ] **Step 5: Commit**

```bash
git add lib/selling-units-migration.ts tests/unit/selling-units-migration.test.ts
git commit -m "feat: add pure child-stock/batch conversion helpers with unit tests"
```

---

### Task 2: Rewire migration 120's up()/down() to reconcile child stock and batches

**Files:**
- Modify: `scripts/migrations/120_migrate_parent_child_to_selling_units.ts`

**Interfaces:**
- Consumes: `convertChildQuantityToBase`, `convertChildUnitCostToBase` from `lib/selling-units-migration.ts` (Task 1).
- Produces: an `up()` that merges child stock/batches instead of blocking on them; a `down()` that exactly reverses that merge.

- [ ] **Step 1: Update the import**

In `scripts/migrations/120_migrate_parent_child_to_selling_units.ts`, change:

```ts
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput } from '../../lib/selling-units-migration';
```

to:

```ts
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput, convertChildQuantityToBase, convertChildUnitCostToBase } from '../../lib/selling-units-migration';
```

- [ ] **Step 2: Replace the preflight guard**

Find this block (the "Preflight guard: refuse to merge a child that carries its own stock" section, right after `const plan = computeSellingUnitsPlan(...)`):

```ts
      // --- Preflight guard: refuse to merge a child that carries its own stock ---
      //
      // A child being folded into its root may have its own independently
      // tracked products.stock and its own inventory_batches, denominated in
      // the child's unit at the child's own cost. This migration does not yet
      // know how to fold that into the root's single stock/FIFO ledger: not
      // re-pointing those batches silently loses the inventory, and re-pointing
      // them without converting quantity/cost silently corrupts the root's FIFO
      // ledger. Reconciling child stock is a known, deliberately deferred
      // follow-up (review findings I1/I2) that needs its own design pass.
      //
      // Until then, fail loudly BEFORE any write rather than corrupt data. This
      // runs before the INSERT/UPDATE/DELETE loops below, so the throw aborts
      // the transaction with nothing written.
      const blocked: string[] = [];
      for (const deletedId of plan.deletedProductIds) {
        const [[stockRow]]: any = await connection.query(
          'SELECT stock FROM products WHERE id = ?',
          [deletedId]
        );
        const childStock = stockRow?.stock == null ? 0 : toSafeNumber(stockRow.stock);
        const [[batchRow]]: any = await connection.query(
          'SELECT COUNT(*) AS cnt FROM inventory_batches WHERE product_id = ? AND quantity_remaining <> 0',
          [deletedId]
        );
        const batchCount = Number(batchRow?.cnt ?? 0);
        if (childStock !== 0 || batchCount > 0) {
          blocked.push(`${deletedId} (stock=${childStock}, batches with remaining qty=${batchCount})`);
        }
      }
      if (blocked.length > 0) {
        throw new Error(
          `Migration 120 aborted: ${blocked.length} child product(s) to be merged into their root still carry ` +
          `independently tracked stock, which this migration does not yet know how to reconcile into the root's ` +
          `single stock/FIFO ledger (known deferred follow-up — see review findings I1/I2 and the selling-product-units ` +
          `design spec). Nothing was written. Affected products:\n  ${blocked.join('\n  ')}\n` +
          `Zero out or manually reconcile these children's stock and inventory_batches before re-running.`
        );
      }
```

Replace it with:

```ts
      // --- Preflight guard: refuse to merge a child with an unsafe qty_base ---
      //
      // qty_base is used as a divisor when converting a child's inventory_batches
      // unit_cost into root-equivalent terms (see convertChildUnitCostToBase). A
      // qty_base <= 0 only happens on pre-existing bad conversion-factor data
      // (e.g. a missing or inverted conversion_factors row) — fail loudly rather
      // than divide by zero or silently flip a cost's sign. This runs before the
      // INSERT/UPDATE/DELETE loops below, so the throw aborts the transaction
      // with nothing written.
      const unsafeQtyBase: string[] = [];
      for (const unit of plan.sellingUnits) {
        if (!unit.isBase && unit.qtyBase <= 0) {
          unsafeQtyBase.push(`${unit.sourceProductId} (qty_base=${unit.qtyBase})`);
        }
      }
      if (unsafeQtyBase.length > 0) {
        throw new Error(
          `Migration 120 aborted: ${unsafeQtyBase.length} child product(s) have a qty_base <= 0, which cannot be ` +
          `safely used to convert stock/batch cost into root-equivalent terms (likely a bad or missing ` +
          `conversion_factors row). Nothing was written. Affected products:\n  ${unsafeQtyBase.join('\n  ')}\n` +
          `Fix the underlying conversion_factors data before re-running.`
        );
      }

      // Looked up per-reassignment below to convert that child's stock/batches.
      const sellingUnitById = new Map(plan.sellingUnits.map(u => [u.id, u]));
```

- [ ] **Step 3: Merge child stock and convert-and-repoint child batches**

Find the `inventory_batches` re-point line inside the `for (const r of plan.reassignments)` loop:

```ts
        await connection.query(
          `UPDATE inventory_batches SET product_id = ?, selling_unit_id = ? WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, r.fromProductId]
        );
```

Replace it with:

```ts
        const qtyBase = sellingUnitById.get(r.sellingUnitId)!.qtyBase;

        // Merge the child's own stock counter into the root's, converted to
        // base units. products.stock and inventory_batches are independently
        // maintained elsewhere in this codebase (lib/stock-movements.ts), so
        // this addition is separate from the batch conversion below, not
        // derived from it.
        const [[childProductRow]]: any = await connection.query(
          'SELECT stock FROM products WHERE id = ?',
          [r.fromProductId]
        );
        const childStock = childProductRow?.stock == null ? 0 : toSafeNumber(childProductRow.stock);
        await connection.query(
          'UPDATE products SET stock = stock + ? WHERE id = ?',
          [convertChildQuantityToBase(childStock, qtyBase), r.toRootProductId]
        );

        // Convert and re-point the child's inventory_batches in one statement.
        // quantity_in/quantity_remaining scale up by qtyBase; unit_cost scales
        // down by the same factor so total peso value (qty * unit_cost) is
        // preserved. The same batch id + received_date are kept, so FIFO order
        // against the root's own pre-existing batches is unaffected.
        await connection.query(
          `UPDATE inventory_batches
           SET product_id = ?, selling_unit_id = ?,
               quantity_in = quantity_in * ?,
               quantity_remaining = quantity_remaining * ?,
               unit_cost = unit_cost / ?
           WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, qtyBase, qtyBase, qtyBase, r.fromProductId]
        );
```

- [ ] **Step 4: Reverse the merge in `down()`**

Find this line inside `down()`'s restore loop:

```ts
            await connection.query(
              'UPDATE inventory_batches SET product_id = ?, selling_unit_id = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );
```

Replace it with:

```ts
            const [[suRow]]: any = await connection.query(
              'SELECT qty_base FROM product_selling_units WHERE id = ?',
              [row.selling_unit_id]
            );
            const qtyBase = suRow ? toSafeNumber(suRow.qty_base) : 1;

            // Reverse the batch conversion done in up(): divide quantities back
            // down, multiply unit_cost back up, and un-repoint to the restored
            // child. Scoped to (root_product_id, selling_unit_id) so only the
            // batches that came from THIS child are touched, not the root's own
            // or another merged sibling's.
            await connection.query(
              `UPDATE inventory_batches
               SET product_id = ?, selling_unit_id = NULL,
                   quantity_in = quantity_in / ?,
                   quantity_remaining = quantity_remaining / ?,
                   unit_cost = unit_cost * ?
               WHERE product_id = ? AND selling_unit_id = ?`,
              [id, qtyBase, qtyBase, qtyBase, row.root_product_id, row.selling_unit_id]
            );

            // Reverse the stock merge: subtract the same converted amount that
            // up() added, using the child's original stock value already
            // captured in this backup row.
            const backedUpChildStock = productData.stock == null ? 0 : toSafeNumber(productData.stock);
            await connection.query(
              'UPDATE products SET stock = stock - ? WHERE id = ?',
              [convertChildQuantityToBase(backedUpChildStock, qtyBase), row.root_product_id]
            );
```

- [ ] **Step 5: Verify with a synthetic scratch database**

This creates a throwaway database with a hand-built 1-parent/1-child family carrying real stock and batches — exactly the case the old guard used to block — and confirms the merge math end-to-end. Run each block in order (same shell session, so `DB_NAME` stays exported):

```bash
export DB_NAME=alon_pos_migration_scratch
mysql -h 127.0.0.1 -u root -p123700 -e "DROP DATABASE IF EXISTS alon_pos_migration_scratch; CREATE DATABASE alon_pos_migration_scratch;"
mysql -h 127.0.0.1 -u root -p123700 alon_pos_migration_scratch < schema.sql
npx tsx scripts/migrations/index.ts up
```

Expected: all migrations up to and including `120_migrate_parent_child_to_selling_units` run clean against the fresh schema (no data yet, so migration 120 is a no-op on zero products — confirms nothing broke on an empty DB).

```bash
mysql -h 127.0.0.1 -u root -p123700 alon_pos_migration_scratch -e "
INSERT INTO products (id, name, price, stock, unit_of_measure, barcode, cost) VALUES ('ROOT1', 'Sugar Box', 200, 10, 'Box', 'ROOT-BC', 150);
INSERT INTO products (id, name, price, stock, unit_of_measure, parent_id, conversion_factor, barcode, cost) VALUES ('CHILD1', 'Sugar Piece', 20, 30, 'Piece', 'ROOT1', 12, 'CHILD-BC', 15);
INSERT INTO conversion_factors (id, product_id, unit, factor) VALUES ('cf1', 'ROOT1', 'Piece', 12);
INSERT INTO inventory_batches (id, product_id, received_date, quantity_in, quantity_remaining, unit_cost, selling_price) VALUES ('batch-root', 'ROOT1', '2026-01-01', 10, 10, 150, 200);
INSERT INTO inventory_batches (id, product_id, received_date, quantity_in, quantity_remaining, unit_cost, selling_price) VALUES ('batch-child', 'CHILD1', '2026-02-01', 36, 30, 15, 20);
"
npx tsx scripts/migrations/index.ts down
npx tsx scripts/migrations/index.ts up
```

(The down/up cycle re-runs only migration 120, since it's the most-recently-executed one — this exercises the new merge against the family just inserted.)

- [ ] **Step 6: Verify the merge math**

```bash
mysql -h 127.0.0.1 -u root -p123700 alon_pos_migration_scratch -e "
SELECT id, stock FROM products WHERE id = 'ROOT1';
SELECT id, product_id, quantity_in, quantity_remaining, unit_cost, selling_unit_id FROM inventory_batches WHERE product_id = 'ROOT1' ORDER BY received_date;
SELECT id FROM products WHERE id = 'CHILD1';
"
```

Expected:
- `ROOT1.stock` = 10 + (30 × 1/12) = **12.5000**.
- Two batch rows on `ROOT1`: `batch-root` unchanged (10 / 150), and `batch-child` converted to `quantity_in=3.0000, quantity_remaining=2.5000, unit_cost=180.0000` (30 × 1/12 = 2.5; 15 / (1/12) = 180), each with a non-null `selling_unit_id`.
- The `CHILD1` query returns zero rows (deleted).

- [ ] **Step 7: Verify rollback restores the original values exactly**

```bash
npx tsx scripts/migrations/index.ts down
mysql -h 127.0.0.1 -u root -p123700 alon_pos_migration_scratch -e "
SELECT id, stock FROM products WHERE id IN ('ROOT1', 'CHILD1');
SELECT id, product_id, quantity_in, quantity_remaining, unit_cost, selling_unit_id FROM inventory_batches ORDER BY id;
"
npx tsx scripts/migrations/index.ts up
```

Expected: `ROOT1.stock` back to `10.0000`, `CHILD1` restored with `stock = 30.0000`; `batch-root` unchanged, `batch-child` back to `product_id='CHILD1', quantity_in=36.0000, quantity_remaining=30.0000, unit_cost=15.0000, selling_unit_id=NULL`. The final `up()` re-applies migration 120 so the scratch DB is left in the fully-migrated state (matches the sibling plan's convention of leaving migrations applied after verification).

- [ ] **Step 8: Clean up the scratch database**

```bash
mysql -h 127.0.0.1 -u root -p123700 -e "DROP DATABASE IF EXISTS alon_pos_migration_scratch;"
unset DB_NAME
```

- [ ] **Step 9: Commit**

```bash
git add scripts/migrations/120_migrate_parent_child_to_selling_units.ts
git commit -m "feat: reconcile child stock and inventory_batches when merging into root"
```

---

### Task 3: Validate against the real production-shaped backup dump

**Files:** none modified — this is a verification-only task using the existing fixture the prior final review used (`backups/backup-stock_pilot-2026-04-27T06-28-09-187Z.sql`).

**Interfaces:**
- Consumes: the finished migration 120 from Task 2.
- Produces: recorded evidence (in the report) that the preflight no longer blocks real data, and that stock/value/FIFO order are preserved across all real families.

- [ ] **Step 1: Import the real backup into a fresh scratch database**

```bash
export DB_NAME=alon_pos_real_scratch
mysql -h 127.0.0.1 -u root -p123700 -e "DROP DATABASE IF EXISTS alon_pos_real_scratch; CREATE DATABASE alon_pos_real_scratch;"
mysql -h 127.0.0.1 -u root -p123700 alon_pos_real_scratch < "backups/backup-stock_pilot-2026-04-27T06-28-09-187Z.sql"
```

Expected: import completes with no errors (this file is a full `mysqldump`-style dump — it creates its own tables, so `schema.sql` is not applied separately here).

- [ ] **Step 2: Capture pre-migration totals**

Two numbers matter here, and only two — not a per-family hand-reconciliation, which would require scaling each child's stock by its own `qty_base` before summing (different children under one root can have different factors), and that `qty_base` doesn't exist until the migration computes it. Capture instead:

1. The **global** batch value across the whole database — this must come out exactly unchanged after `up()`, because the migration only ever converts-and-repoints existing `inventory_batches` rows, never creates or destroys value.
2. Each root-with-children's **own** pre-migration stock (not the children's — that's reconciled post-hoc in Step 4 using data the migration itself records).

```bash
mysql -h 127.0.0.1 -u root -p123700 alon_pos_real_scratch -e "
SELECT SUM(quantity_remaining * unit_cost) AS global_batch_value_before FROM inventory_batches;
SELECT id, stock AS stock_before FROM products WHERE id IN (SELECT DISTINCT parent_id FROM products WHERE parent_id IS NOT NULL);
" > /tmp/before.txt
cat /tmp/before.txt
```

Keep this file — Step 4 reads it back.

- [ ] **Step 3: Run the migration and confirm the preflight no longer blocks**

```bash
npx tsx scripts/migrations/index.ts up
```

Expected: no `Migration 120 aborted` error. Console shows the usual `✅ Migrated N selling unit(s) across M product(s); removed K legacy child product row(s)` line, with `K` close to 18 (the real dump's known child-product count).

- [ ] **Step 4: Verify global value conservation, per-root stock, and FIFO order**

```bash
mysql -h 127.0.0.1 -u root -p123700 alon_pos_real_scratch -e "
SELECT SUM(quantity_remaining * unit_cost) AS global_batch_value_after FROM inventory_batches;
"
```

Expected: matches Step 2's `global_batch_value_before`, within rounding tolerance (a few centavos across many fractional batches is acceptable — the same DECIMAL(14,6)/DECIMAL(14,4) rounding tradeoff already accepted for `qty_base` in the prior review). This single number is the strongest correctness signal: it proves the migration moved and converted value without creating or destroying any of it, across every family at once.

Per-root stock reconciliation uses `migration_120_backup` (each deleted child's original `product_json`, still present — `up()` doesn't drop this table) joined to `product_selling_units` (for the `qty_base` the migration actually used), so no manual per-child scaling is needed:

```bash
mysql -h 127.0.0.1 -u root -p123700 alon_pos_real_scratch -e "
SELECT
  b.root_product_id,
  p.stock AS root_stock_after,
  SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(b.product_json, '$.stock')) AS DECIMAL(15,4)) * su.qty_base) AS expected_children_contribution
FROM migration_120_backup b
JOIN product_selling_units su ON su.id = b.selling_unit_id
JOIN products p ON p.id = b.root_product_id
GROUP BY b.root_product_id, p.stock;
" > /tmp/after-stock.txt
cat /tmp/after-stock.txt
```

For each `root_product_id`, look up its `stock_before` from `/tmp/before.txt` (Step 2) and confirm `root_stock_after` equals `stock_before + expected_children_contribution`, within rounding tolerance.

```bash
mysql -h 127.0.0.1 -u root -p123700 alon_pos_real_scratch -e "
SELECT product_id, id, received_date, quantity_remaining
FROM inventory_batches
WHERE product_id IN (SELECT product_id FROM inventory_batches GROUP BY product_id HAVING COUNT(*) > 1)
ORDER BY product_id, received_date ASC, created_at ASC
LIMIT 40;
"
```

Expected: for any merged root with multiple batches, rows are listed in ascending `received_date` order with no gaps or duplicated ids — confirms `deductFromBatches`' `ORDER BY received_date ASC, created_at ASC` query will still consume oldest-first across the combined root+child batch pool.

- [ ] **Step 5: Verify round-trip rollback**

```bash
npx tsx scripts/migrations/index.ts down
mysql -h 127.0.0.1 -u root -p123700 alon_pos_real_scratch -e "
SELECT COUNT(*) AS product_count FROM products;
SELECT SUM(quantity_remaining * unit_cost) AS global_batch_value_restored FROM inventory_batches;
"
```

Expected: `product_count` matches the original dump's product count (children restored), and `global_batch_value_restored` matches Step 2's `global_batch_value_before` exactly (a full up/down round trip must be lossless).

```bash
npx tsx scripts/migrations/index.ts up
```

Expected: migration 120 re-applies cleanly, leaving the scratch DB fully migrated (final state, matching the convention of leaving migrations applied after verification).

- [ ] **Step 6: Clean up**

```bash
mysql -h 127.0.0.1 -u root -p123700 -e "DROP DATABASE IF EXISTS alon_pos_real_scratch;"
unset DB_NAME
rm -f /tmp/before.txt /tmp/after-stock.txt
```

- [ ] **Step 7: Record results**

No commit — this task produces no code changes. Record in the task report: the global batch value before/after/restored (Steps 2, 4, 5), the per-root stock reconciliation table from Step 4 (each root's `stock_before + expected_children_contribution` vs `root_stock_after`), the FIFO-order confirmation from Step 4, and the round-trip product count from Step 5.

---

## Self-Review Notes

- **Spec coverage:** "Conversion math" (stock + batch formulas) → Task 2 Steps 2–4. "New pure helpers" → Task 1. "Testing" unit-level → Task 1 Step 1; migration-level against the real dump → Task 3. The Decisions table's "negative stock merged mechanically" and "narrowed, not removed, guard" → Task 2 Step 2. Rollback reversal → Task 2 Step 4, verified in Task 2 Step 7 and Task 3 Step 5.
- **Placeholder scan:** no TBD/TODO; every step has real SQL/TypeScript; Task 3 has no code changes because it's a validation-only task, which is stated explicitly rather than implied.
- **Type consistency:** `convertChildQuantityToBase(quantity: number, qtyBase: number): number` and `convertChildUnitCostToBase(unitCost: number, qtyBase: number): number` are defined once in Task 1 and used with identical parameter order in Task 2 Steps 3–4.
