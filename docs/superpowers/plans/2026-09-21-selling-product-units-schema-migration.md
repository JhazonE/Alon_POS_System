# Selling Product Units — Plan 1: Schema & Data Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the new `product_selling_units` / `product_selling_unit_prices` tables, add `selling_unit_id` (+ snapshot columns where relevant) to `sale_items`, `purchase_order_items`, and `inventory_batches`, and migrate every existing product — standalone or parent/child family — into the new flat selling-unit model, without breaking any code that still reads `products.parent_id` / `conversion_factor` / `conversion_factors` / `product_price_levels`.

**Architecture:** Five additive, idempotent schema migrations (numbered 115–119) followed by one data migration (120) that reads the current `products` + `conversion_factors` tables, computes a flattening plan through a pure, unit-tested module (`lib/selling-units-migration.ts`), and applies it inside a single DB transaction — inserting `product_selling_units` rows, re-pointing `inventory_batches` / `sale_items` / `purchase_order_items` off deleted child product rows, and backing up every deleted row so the migration is cleanly reversible via `npm run migrate:down`.

**Tech Stack:** TypeScript migrations run via `tsx` (`scripts/migrations/`), raw `mysql2/promise` (`lib/mysql.ts`), Node's built-in `assert/strict` for unit tests (`tests/unit/`, run via `tsx tests/unit/run.ts`).

**Spec:** `docs/superpowers/specs/2026-09-11-selling-product-units-design.md` — this plan implements the "New table: `product_selling_units`", "New table: `product_selling_unit_prices`", "New columns on transaction tables", and "Migration of existing data" sections in full. It does **not** implement Costing & stock deduction, Add/Edit Product UI, POS checkout, or Break Pack/Consolidate — those are later plans (2–5) in this same feature.

## Global Constraints

- New migration files start at **`115`** (highest existing migration is `114_default_hide_approvals_pages.ts`) and must be registered, in order, in `scripts/migrations/index.ts`.
- Every migration file exports a `Migration` object (`{ name, timestamp, up(), down() }`) registered via `registerMigration(...)` from `./runner`, matching the existing convention in `scripts/migrations/114_default_hide_approvals_pages.ts` and `scripts/migrations/113_add_z_reading_lockout_toggle.ts`. `timestamp` must be a `YYYY-MM-DD_HH-mm-ss` string later than `114`'s (`2026-09-21_10-00-00`) — rollback order is sorted by this string.
- **Do NOT drop `products.parent_id`, `products.conversion_factor`, the `conversion_factors` table, or the `product_price_levels` table in this plan.** Every one of the ~15 existing call sites that read/write them (checkout, purchase receiving, break-pack/consolidate, transfers, adjustments, returns, the Add/Edit Product UI) keeps working unmodified until Plans 2–5 migrate them off. Dropping the old schema is the final task of Plan 5, once nothing reads it anymore.
- `product_selling_units.barcode` is globally `UNIQUE`, but today's `products.barcode` has **no** uniqueness constraint and can be `NULL`/blank. The data migration must assign a synthetic fallback barcode (`SU-<product id>`) whenever a product's real barcode is missing or already claimed by another selling unit — never let the migration fail on a collision.
- Selling-unit `qty_base` for a multi-level family (grandparent → parent → child) must be the **composed** factor to the root (parent's factor × child's factor relative to parent), not just the immediate one, per the spec's migration step 2 and its own testing checklist.
- Where a product's own `conversion_factor` scalar disagrees with the matching `conversion_factors` table row for that unit, **the `conversion_factors` table value wins** (per spec step 2 — `lib/family-sync.ts`'s `findUltimateRoot` already treats it as authoritative today).

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/migrations/115_create_product_selling_units.ts` | Creates `product_selling_units` |
| `scripts/migrations/116_create_product_selling_unit_prices.ts` | Creates `product_selling_unit_prices` |
| `scripts/migrations/117_add_selling_unit_to_sale_items.ts` | Adds `selling_unit_id` + snapshot columns to `sale_items` |
| `scripts/migrations/118_add_selling_unit_to_purchase_order_items.ts` | Adds `selling_unit_id` + snapshot columns to `purchase_order_items` |
| `scripts/migrations/119_add_selling_unit_to_inventory_batches.ts` | Adds nullable `selling_unit_id` to `inventory_batches` |
| `lib/selling-units-migration.ts` | Pure, DB-free function that turns a flat product/conversion-factor list into a selling-units migration plan |
| `tests/unit/selling-units-migration.test.ts` | Unit tests for the above |
| `scripts/migrations/120_migrate_parent_child_to_selling_units.ts` | Data migration: reads DB, calls the pure planner, applies it transactionally, with a full backup-and-restore `down()` |
| `scripts/migrations/index.ts` | Modified — registers 115–120 |
| `tests/unit/run.ts` | Modified — imports the new test file |

---

### Task 1: `product_selling_units` table

**Files:**
- Create: `scripts/migrations/115_create_product_selling_units.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Produces: table `product_selling_units(id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order, created_at, updated_at)`, consumed by Task 7 and every later plan.

- [ ] **Step 1: Write the migration**

```ts
// scripts/migrations/115_create_product_selling_units.ts
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

const migration: Migration = {
  name: '115_create_product_selling_units',
  timestamp: '2026-09-21_11-00-00',

  async up(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS product_selling_units (
        id VARCHAR(50) NOT NULL,
        product_id VARCHAR(50) NOT NULL,
        unit_name VARCHAR(100) NOT NULL,
        qty_base DECIMAL(10,4) NOT NULL,
        barcode VARCHAR(100) NOT NULL,
        cost DECIMAL(10,2) DEFAULT NULL,
        price DECIMAL(10,2) NOT NULL,
        is_base TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_selling_unit_barcode (barcode),
        UNIQUE KEY unique_product_unit_name (product_id, unit_name),
        KEY idx_psu_product_id (product_id),
        CONSTRAINT fk_psu_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ product_selling_units table created');
  },

  async down(): Promise<void> {
    await query('DROP TABLE IF EXISTS product_selling_units');
    console.log('✅ product_selling_units table dropped');
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register it**

Add to `scripts/migrations/index.ts` immediately after the `114` import:

```ts
import './115_create_product_selling_units';
```

- [ ] **Step 3: Run it**

Run: `npm run migrate`
Expected: console includes `📈 Running migration: 115_create_product_selling_units` then `✅ product_selling_units table created`, and `🎉 Migration complete! Executed 1 migration(s)`.

- [ ] **Step 4: Verify the table shape**

Run: `npx tsx -e "import('./lib/mysql').then(async ({query}) => { console.log(await query(\"DESCRIBE product_selling_units\")); process.exit(0); })"`
Expected: 11 rows listing `id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order, created_at, updated_at`.

- [ ] **Step 5: Verify rollback**

Run: `npm run migrate:down`
Expected: `✅ product_selling_units table dropped`. Then run `npm run migrate` again to re-create it (subsequent tasks assume it exists).

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/115_create_product_selling_units.ts scripts/migrations/index.ts
git commit -m "feat: add product_selling_units table"
```

---

### Task 2: `product_selling_unit_prices` table

**Files:**
- Create: `scripts/migrations/116_create_product_selling_unit_prices.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Consumes: `product_selling_units(id)` (Task 1), `price_levels(id)` (existing table).
- Produces: table `product_selling_unit_prices(selling_unit_id, price_level_id, price, min_quantity)`.

- [ ] **Step 1: Write the migration**

```ts
// scripts/migrations/116_create_product_selling_unit_prices.ts
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

const migration: Migration = {
  name: '116_create_product_selling_unit_prices',
  timestamp: '2026-09-21_11-05-00',

  async up(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS product_selling_unit_prices (
        selling_unit_id VARCHAR(50) NOT NULL,
        price_level_id VARCHAR(50) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        min_quantity DECIMAL(10,2) DEFAULT NULL,
        PRIMARY KEY (selling_unit_id, price_level_id),
        KEY idx_psup_price_level_id (price_level_id),
        CONSTRAINT fk_psup_selling_unit FOREIGN KEY (selling_unit_id) REFERENCES product_selling_units (id) ON DELETE CASCADE,
        CONSTRAINT fk_psup_price_level FOREIGN KEY (price_level_id) REFERENCES price_levels (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ product_selling_unit_prices table created');
  },

  async down(): Promise<void> {
    await query('DROP TABLE IF EXISTS product_selling_unit_prices');
    console.log('✅ product_selling_unit_prices table dropped');
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register it**

Add to `scripts/migrations/index.ts` after `115`:

```ts
import './116_create_product_selling_unit_prices';
```

- [ ] **Step 3: Run it**

Run: `npm run migrate`
Expected: `✅ product_selling_unit_prices table created`.

- [ ] **Step 4: Verify FK to price_levels**

Run: `npx tsx -e "import('./lib/mysql').then(async ({query}) => { console.log(await query(\"SHOW CREATE TABLE product_selling_unit_prices\")); process.exit(0); })"`
Expected: output includes both `fk_psup_selling_unit` and `fk_psup_price_level` constraints.

- [ ] **Step 5: Verify rollback**

Run: `npm run migrate:down` then `npm run migrate` (leaves the table present again).

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/116_create_product_selling_unit_prices.ts scripts/migrations/index.ts
git commit -m "feat: add product_selling_unit_prices table"
```

---

### Task 3: `selling_unit_id` + snapshot columns on `sale_items`

**Files:**
- Create: `scripts/migrations/117_add_selling_unit_to_sale_items.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Consumes: `product_selling_units(id)` (Task 1).
- Produces: `sale_items.selling_unit_id` (nullable FK, `ON DELETE SET NULL`), `sale_items.selling_unit_name`, `sale_items.selling_unit_qty_base` — consumed by Task 7 and, later, by the checkout rewrite in Plan 4.

- [ ] **Step 1: Write the migration**

Uses the existing repo pattern for idempotent `ALTER TABLE ADD COLUMN` (see `scripts/migrations/113_add_z_reading_lockout_toggle.ts`) since `sale_items` already has data in it.

```ts
// scripts/migrations/117_add_selling_unit_to_sale_items.ts
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any = await query(`
    SELECT COUNT(*) as cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  return rows[0]?.cnt > 0;
}

const migration: Migration = {
  name: '117_add_selling_unit_to_sale_items',
  timestamp: '2026-09-21_11-10-00',

  async up(): Promise<void> {
    if (await columnExists('sale_items', 'selling_unit_id')) {
      console.log('⏭️  selling_unit_id already exists on sale_items, skipping');
      return;
    }
    await query(`
      ALTER TABLE sale_items
      ADD COLUMN selling_unit_id VARCHAR(50) DEFAULT NULL,
      ADD COLUMN selling_unit_name VARCHAR(100) DEFAULT NULL,
      ADD COLUMN selling_unit_qty_base DECIMAL(10,4) DEFAULT NULL,
      ADD CONSTRAINT fk_sale_items_selling_unit FOREIGN KEY (selling_unit_id) REFERENCES product_selling_units (id) ON DELETE SET NULL
    `);
    console.log('✅ selling_unit_id + snapshot columns added to sale_items');
  },

  async down(): Promise<void> {
    if (!(await columnExists('sale_items', 'selling_unit_id'))) {
      console.log('⏭️  selling_unit_id not present on sale_items, skipping');
      return;
    }
    await query('ALTER TABLE sale_items DROP FOREIGN KEY fk_sale_items_selling_unit');
    await query(`
      ALTER TABLE sale_items
      DROP COLUMN selling_unit_id,
      DROP COLUMN selling_unit_name,
      DROP COLUMN selling_unit_qty_base
    `);
    console.log('✅ selling_unit_id + snapshot columns dropped from sale_items');
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register it**

```ts
import './117_add_selling_unit_to_sale_items';
```

- [ ] **Step 3: Run it**

Run: `npm run migrate`
Expected: `✅ selling_unit_id + snapshot columns added to sale_items`.

- [ ] **Step 4: Verify**

Run: `npx tsx -e "import('./lib/mysql').then(async ({query}) => { console.log(await query(\"DESCRIBE sale_items\")); process.exit(0); })"`
Expected: output includes `selling_unit_id`, `selling_unit_name`, `selling_unit_qty_base`.

- [ ] **Step 5: Verify rollback**

Run: `npm run migrate:down` then `npm run migrate` (columns present again).

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/117_add_selling_unit_to_sale_items.ts scripts/migrations/index.ts
git commit -m "feat: add selling_unit columns to sale_items"
```

---

### Task 4: `selling_unit_id` + snapshot columns on `purchase_order_items`

**Files:**
- Create: `scripts/migrations/118_add_selling_unit_to_purchase_order_items.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Consumes: `product_selling_units(id)` (Task 1).
- Produces: `purchase_order_items.selling_unit_id` (nullable FK, `ON DELETE SET NULL`), `.selling_unit_name`, `.selling_unit_qty_base` — consumed by Task 7 and, later, by the purchasing rewrite in Plan 5.

- [ ] **Step 1: Write the migration**

Same idempotent-column pattern as Task 3.

```ts
// scripts/migrations/118_add_selling_unit_to_purchase_order_items.ts
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any = await query(`
    SELECT COUNT(*) as cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  return rows[0]?.cnt > 0;
}

const migration: Migration = {
  name: '118_add_selling_unit_to_purchase_order_items',
  timestamp: '2026-09-21_11-15-00',

  async up(): Promise<void> {
    if (await columnExists('purchase_order_items', 'selling_unit_id')) {
      console.log('⏭️  selling_unit_id already exists on purchase_order_items, skipping');
      return;
    }
    await query(`
      ALTER TABLE purchase_order_items
      ADD COLUMN selling_unit_id VARCHAR(50) DEFAULT NULL,
      ADD COLUMN selling_unit_name VARCHAR(100) DEFAULT NULL,
      ADD COLUMN selling_unit_qty_base DECIMAL(10,4) DEFAULT NULL,
      ADD CONSTRAINT fk_poi_selling_unit FOREIGN KEY (selling_unit_id) REFERENCES product_selling_units (id) ON DELETE SET NULL
    `);
    console.log('✅ selling_unit_id + snapshot columns added to purchase_order_items');
  },

  async down(): Promise<void> {
    if (!(await columnExists('purchase_order_items', 'selling_unit_id'))) {
      console.log('⏭️  selling_unit_id not present on purchase_order_items, skipping');
      return;
    }
    await query('ALTER TABLE purchase_order_items DROP FOREIGN KEY fk_poi_selling_unit');
    await query(`
      ALTER TABLE purchase_order_items
      DROP COLUMN selling_unit_id,
      DROP COLUMN selling_unit_name,
      DROP COLUMN selling_unit_qty_base
    `);
    console.log('✅ selling_unit_id + snapshot columns dropped from purchase_order_items');
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register it**

```ts
import './118_add_selling_unit_to_purchase_order_items';
```

- [ ] **Step 3: Run it**

Run: `npm run migrate`
Expected: `✅ selling_unit_id + snapshot columns added to purchase_order_items`.

- [ ] **Step 4: Verify**

Run: `npx tsx -e "import('./lib/mysql').then(async ({query}) => { console.log(await query(\"DESCRIBE purchase_order_items\")); process.exit(0); })"`
Expected: output includes `selling_unit_id`, `selling_unit_name`, `selling_unit_qty_base`.

- [ ] **Step 5: Verify rollback**

Run: `npm run migrate:down` then `npm run migrate`.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/118_add_selling_unit_to_purchase_order_items.ts scripts/migrations/index.ts
git commit -m "feat: add selling_unit columns to purchase_order_items"
```

---

### Task 5: `selling_unit_id` on `inventory_batches`

**Files:**
- Create: `scripts/migrations/119_add_selling_unit_to_inventory_batches.ts`
- Modify: `scripts/migrations/index.ts`

**Why this table too:** the spec's migration step 3 explicitly says re-pointed batches must be "tagg[ed]... with the new selling_unit_id" (an audit tag of which unit a batch was originally received/produced in — batches themselves always store quantity/cost in base units, unchanged). No snapshot columns are needed here since a batch's `quantity_in`/`unit_cost` are already base-unit values.

**Interfaces:**
- Consumes: `product_selling_units(id)` (Task 1).
- Produces: `inventory_batches.selling_unit_id` (nullable FK, `ON DELETE SET NULL`) — consumed by Task 7.

- [ ] **Step 1: Write the migration**

```ts
// scripts/migrations/119_add_selling_unit_to_inventory_batches.ts
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any = await query(`
    SELECT COUNT(*) as cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  return rows[0]?.cnt > 0;
}

const migration: Migration = {
  name: '119_add_selling_unit_to_inventory_batches',
  timestamp: '2026-09-21_11-20-00',

  async up(): Promise<void> {
    if (await columnExists('inventory_batches', 'selling_unit_id')) {
      console.log('⏭️  selling_unit_id already exists on inventory_batches, skipping');
      return;
    }
    await query(`
      ALTER TABLE inventory_batches
      ADD COLUMN selling_unit_id VARCHAR(50) DEFAULT NULL,
      ADD CONSTRAINT fk_ib_selling_unit FOREIGN KEY (selling_unit_id) REFERENCES product_selling_units (id) ON DELETE SET NULL
    `);
    console.log('✅ selling_unit_id added to inventory_batches');
  },

  async down(): Promise<void> {
    if (!(await columnExists('inventory_batches', 'selling_unit_id'))) {
      console.log('⏭️  selling_unit_id not present on inventory_batches, skipping');
      return;
    }
    await query('ALTER TABLE inventory_batches DROP FOREIGN KEY fk_ib_selling_unit');
    await query('ALTER TABLE inventory_batches DROP COLUMN selling_unit_id');
    console.log('✅ selling_unit_id dropped from inventory_batches');
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register it**

```ts
import './119_add_selling_unit_to_inventory_batches';
```

- [ ] **Step 3: Run it**

Run: `npm run migrate`
Expected: `✅ selling_unit_id added to inventory_batches`.

- [ ] **Step 4: Verify**

Run: `npx tsx -e "import('./lib/mysql').then(async ({query}) => { console.log(await query(\"DESCRIBE inventory_batches\")); process.exit(0); })"`
Expected: output includes `selling_unit_id`.

- [ ] **Step 5: Verify rollback**

Run: `npm run migrate:down` then `npm run migrate`.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/119_add_selling_unit_to_inventory_batches.ts scripts/migrations/index.ts
git commit -m "feat: add selling_unit_id to inventory_batches"
```

---

### Task 6: Pure selling-units migration planner (TDD)

This is the core flattening logic, kept as a pure, DB-free module (mirroring the existing `lib/product-tree.ts` / `tests/unit/product-tree.test.ts` pattern) so the tricky parts — composed `qty_base`, `conversion_factors`-wins-over-scalar, barcode collisions, and safe deepest-first deletion order — are fully unit tested before Task 7 wires them to real DB rows.

**Files:**
- Create: `lib/selling-units-migration.ts`
- Create: `tests/unit/selling-units-migration.test.ts`
- Modify: `tests/unit/run.ts`

**Interfaces:**
- Produces: `computeSellingUnitsPlan(products, conversionFactors, generateId?) => MigrationPlan`, consumed by Task 7's `up()`.
- `MigrationPlan = { sellingUnits: PlannedSellingUnit[]; deletedProductIds: string[]; reassignments: Array<{ fromProductId: string; toRootProductId: string; sellingUnitId: string }> }`
- `PlannedSellingUnit = { id: string; rootProductId: string; sourceProductId: string; unitName: string; qtyBase: number; barcode: string; cost: number | null; price: number; isBase: boolean; sortOrder: number }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/selling-units-migration.test.ts
import assert from 'node:assert/strict';
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput } from '../../lib/selling-units-migration';

function makeIdGen(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

// --- Standalone product: no parent, no children ---
{
  const products: MigrationProductInput[] = [
    { id: 'P1', parentId: null, unitOfMeasure: 'Piece', barcode: '111', cost: 5, price: 10, conversionFactor: null },
  ];
  const plan = computeSellingUnitsPlan(products, [], makeIdGen('su'));
  assert.equal(plan.sellingUnits.length, 1, 'standalone product gets exactly one selling unit');
  assert.equal(plan.sellingUnits[0].isBase, true);
  assert.equal(plan.sellingUnits[0].qtyBase, 1);
  assert.equal(plan.sellingUnits[0].barcode, '111');
  assert.deepEqual(plan.deletedProductIds, []);
  assert.deepEqual(plan.reassignments, []);
}

// --- 2-level family: parent + 1 child, factor from conversion_factors ---
{
  const products: MigrationProductInput[] = [
    { id: 'PARENT', parentId: null, unitOfMeasure: 'Sachet', barcode: 'P-BC', cost: 1, price: 2, conversionFactor: null },
    { id: 'CHILD', parentId: 'PARENT', unitOfMeasure: 'Box', barcode: 'C-BC', cost: 10, price: 20, conversionFactor: 999 },
  ];
  const cfs: MigrationConversionFactorInput[] = [
    { productId: 'PARENT', unit: 'Box', factor: 12 },
  ];
  const plan = computeSellingUnitsPlan(products, cfs, makeIdGen('su'));
  assert.equal(plan.sellingUnits.length, 2, 'base + one derived unit');
  const boxUnit = plan.sellingUnits.find(u => u.sourceProductId === 'CHILD')!;
  assert.equal(boxUnit.qtyBase, 12, 'conversion_factors row (12) wins over conversionFactor scalar (999)');
  assert.equal(boxUnit.rootProductId, 'PARENT');
  assert.deepEqual(plan.deletedProductIds, ['CHILD']);
  assert.deepEqual(plan.reassignments, [{ fromProductId: 'CHILD', toRootProductId: 'PARENT', sellingUnitId: boxUnit.id }]);
}

// --- 3-level family: composed qty_base, deepest-first deletion order ---
{
  const products: MigrationProductInput[] = [
    { id: 'GRANDPARENT', parentId: null, unitOfMeasure: 'Piece', barcode: 'GP', cost: 1, price: 2, conversionFactor: null },
    { id: 'PARENT', parentId: 'GRANDPARENT', unitOfMeasure: 'Box', barcode: 'PA', cost: 10, price: 20, conversionFactor: null },
    { id: 'CHILD', parentId: 'PARENT', unitOfMeasure: 'Case', barcode: 'CH', cost: 100, price: 200, conversionFactor: null },
  ];
  const cfs: MigrationConversionFactorInput[] = [
    { productId: 'GRANDPARENT', unit: 'Box', factor: 12 },
    { productId: 'PARENT', unit: 'Case', factor: 5 },
  ];
  const plan = computeSellingUnitsPlan(products, cfs, makeIdGen('su'));
  assert.equal(plan.sellingUnits.length, 3, 'one product ends up with 3 flat selling units');
  const boxUnit = plan.sellingUnits.find(u => u.sourceProductId === 'PARENT')!;
  const caseUnit = plan.sellingUnits.find(u => u.sourceProductId === 'CHILD')!;
  assert.equal(boxUnit.qtyBase, 12, 'direct child factor');
  assert.equal(caseUnit.qtyBase, 60, 'composed: 12 (grandparent->parent) * 5 (parent->child), not just 5');
  assert.equal(boxUnit.rootProductId, 'GRANDPARENT');
  assert.equal(caseUnit.rootProductId, 'GRANDPARENT');
  assert.deepEqual(plan.deletedProductIds, ['CHILD', 'PARENT'], 'deepest-first: CHILD before PARENT so the parent_id FK never blocks a delete');
}

// --- Barcode collisions get a deterministic synthetic fallback ---
{
  const products: MigrationProductInput[] = [
    { id: 'A', parentId: null, unitOfMeasure: 'Piece', barcode: 'DUPLICATE', cost: 1, price: 2, conversionFactor: null },
    { id: 'B', parentId: null, unitOfMeasure: 'Piece', barcode: 'DUPLICATE', cost: 1, price: 2, conversionFactor: null },
    { id: 'C', parentId: null, unitOfMeasure: 'Piece', barcode: null, cost: 1, price: 2, conversionFactor: null },
  ];
  const plan = computeSellingUnitsPlan(products, [], makeIdGen('su'));
  const barcodes = plan.sellingUnits.map(u => u.barcode);
  assert.equal(new Set(barcodes).size, 3, 'all three barcodes are unique after fallback resolution');
  assert.ok(barcodes.includes('DUPLICATE'), 'first claimant keeps its real barcode');
  assert.ok(barcodes.includes('SU-B'), 'second claimant of the same barcode falls back to SU-<id>');
  assert.ok(barcodes.includes('SU-C'), 'blank barcode falls back to SU-<id>');
}

console.log('selling-units-migration: all assertions passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/selling-units-migration.test.ts`
Expected: FAIL — `Cannot find module '../../lib/selling-units-migration'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/selling-units-migration.ts

export interface MigrationProductInput {
  id: string;
  parentId: string | null;
  unitOfMeasure: string | null;
  barcode: string | null;
  cost: number | null;
  price: number;
  conversionFactor: number | null;
}

export interface MigrationConversionFactorInput {
  productId: string; // the parent product's id
  unit: string;       // matches the child's unit_of_measure
  factor: number;
}

export interface PlannedSellingUnit {
  id: string;
  rootProductId: string;
  sourceProductId: string;
  unitName: string;
  qtyBase: number;
  barcode: string;
  cost: number | null;
  price: number;
  isBase: boolean;
  sortOrder: number;
}

export interface MigrationPlan {
  sellingUnits: PlannedSellingUnit[];
  /** Deepest-first: safe to DELETE FROM products in this exact order. */
  deletedProductIds: string[];
  reassignments: Array<{ fromProductId: string; toRootProductId: string; sellingUnitId: string }>;
}

let fallbackIdCounter = 0;
function defaultIdGenerator(): string {
  fallbackIdCounter += 1;
  return `psu_${Date.now()}_${fallbackIdCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function computeSellingUnitsPlan(
  products: MigrationProductInput[],
  conversionFactors: MigrationConversionFactorInput[],
  generateId: () => string = defaultIdGenerator
): MigrationPlan {
  const childrenOf = new Map<string, MigrationProductInput[]>();
  for (const p of products) {
    if (p.parentId != null) {
      const list = childrenOf.get(p.parentId) || [];
      list.push(p);
      childrenOf.set(p.parentId, list);
    }
  }

  const cfMap = new Map<string, number>();
  for (const cf of conversionFactors) {
    cfMap.set(`${cf.productId}::${cf.unit}`, cf.factor);
  }

  const usedBarcodes = new Set<string>();
  function resolveBarcode(candidate: string | null, fallbackSourceId: string): string {
    const trimmed = (candidate || '').trim();
    if (trimmed && !usedBarcodes.has(trimmed)) {
      usedBarcodes.add(trimmed);
      return trimmed;
    }
    const fallback = `SU-${fallbackSourceId}`;
    usedBarcodes.add(fallback);
    return fallback;
  }

  const sellingUnits: PlannedSellingUnit[] = [];
  const reassignments: MigrationPlan['reassignments'] = [];

  const roots = products.filter(p => p.parentId == null);

  const deletedProductIds: string[] = [];

  for (const root of roots) {
    let sortOrder = 0;
    sellingUnits.push({
      id: generateId(),
      rootProductId: root.id,
      sourceProductId: root.id,
      unitName: root.unitOfMeasure || 'Unit',
      qtyBase: 1,
      barcode: resolveBarcode(root.barcode, root.id),
      cost: root.cost,
      price: root.price,
      isBase: true,
      sortOrder: sortOrder++,
    });

    const walk = (node: MigrationProductInput, cumulativeFactor: number) => {
      const children = childrenOf.get(node.id) || [];
      for (const child of children) {
        const cfFactor = cfMap.get(`${node.id}::${child.unitOfMeasure || ''}`);
        const immediateFactor = cfFactor ?? child.conversionFactor ?? 1;
        const childCumulative = cumulativeFactor * (immediateFactor || 1);

        const sellingUnitId = generateId();
        sellingUnits.push({
          id: sellingUnitId,
          rootProductId: root.id,
          sourceProductId: child.id,
          unitName: child.unitOfMeasure || 'Unit',
          qtyBase: childCumulative,
          barcode: resolveBarcode(child.barcode, child.id),
          cost: child.cost,
          price: child.price,
          isBase: false,
          sortOrder: sortOrder++,
        });
        reassignments.push({ fromProductId: child.id, toRootProductId: root.id, sellingUnitId });

        // Recurse into this child's own children (if it was itself a parent)
        // before marking it for deletion, so every descendant collapses onto
        // the same root and deletedProductIds stays deepest-first.
        walk(child, childCumulative);

        deletedProductIds.push(child.id);
      }
    };

    walk(root, 1);
  }

  return { sellingUnits, deletedProductIds, reassignments };
}
```

- [ ] **Step 4: Register the test and run it**

Add to `tests/unit/run.ts` after the last import:

```ts
import './selling-units-migration.test';
```

Run: `npx tsx tests/unit/selling-units-migration.test.ts`
Expected: PASS — final line `selling-units-migration: all assertions passed`.

Run: `npm run test:unit`
Expected: all existing tests still pass, plus the new one.

- [ ] **Step 5: Commit**

```bash
git add lib/selling-units-migration.ts tests/unit/selling-units-migration.test.ts tests/unit/run.ts
git commit -m "feat: add pure selling-units migration planner with unit tests"
```

---

### Task 7: Data migration — collapse parent/child families into selling units

**Files:**
- Create: `scripts/migrations/120_migrate_parent_child_to_selling_units.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Consumes: `computeSellingUnitsPlan` from `lib/selling-units-migration.ts` (Task 6); tables from Tasks 1–5; `withTransaction` from `lib/mysql.ts`; `toSafeNumber` from `lib/utils.ts`.
- Produces: fully populated `product_selling_units` (every product has ≥1 row), re-pointed `inventory_batches`/`sale_items`/`purchase_order_items`, and a `migration_120_backup` table used only by `down()`.

**Note on `down()`:** this is a genuinely destructive migration (it deletes `products` rows), so `down()` does a real restore rather than a no-op: every deleted row is JSON-backed-up before deletion, and rollback topologically re-inserts parents before their former children (a plain reverse-order pass would break the `parent_id` FK if a grandchild were restored before its parent).

- [ ] **Step 1: Write the migration**

```ts
// scripts/migrations/120_migrate_parent_child_to_selling_units.ts
import { registerMigration, Migration } from './runner';
import { withTransaction } from '../../lib/mysql';
import { toSafeNumber } from '../../lib/utils';
import { computeSellingUnitsPlan, MigrationProductInput, MigrationConversionFactorInput } from '../../lib/selling-units-migration';

const migration: Migration = {
  name: '120_migrate_parent_child_to_selling_units',
  timestamp: '2026-09-21_11-30-00',

  async up(): Promise<void> {
    await withTransaction(async (connection) => {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS migration_120_backup (
          id VARCHAR(50) NOT NULL,
          product_json JSON NOT NULL,
          conversion_factors_json JSON NOT NULL,
          root_product_id VARCHAR(50) NOT NULL,
          selling_unit_id VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);

      const [productRows]: any = await connection.query(`
        SELECT id, parent_id AS parentId, unit_of_measure AS unitOfMeasure,
               barcode, cost, price, conversion_factor AS conversionFactor
        FROM products
      `);
      const [cfRows]: any = await connection.query(`
        SELECT product_id AS productId, unit, factor FROM conversion_factors
      `);

      const products: MigrationProductInput[] = productRows.map((r: any) => ({
        id: r.id,
        parentId: r.parentId,
        unitOfMeasure: r.unitOfMeasure,
        barcode: r.barcode,
        cost: r.cost === null ? null : toSafeNumber(r.cost),
        price: toSafeNumber(r.price),
        conversionFactor: r.conversionFactor === null ? null : toSafeNumber(r.conversionFactor),
      }));
      const conversionFactors: MigrationConversionFactorInput[] = cfRows.map((r: any) => ({
        productId: r.productId,
        unit: r.unit,
        factor: toSafeNumber(r.factor),
      }));

      let idCounter = 0;
      const generateId = () => {
        idCounter += 1;
        return `psu_${Date.now()}_${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
      };

      const plan = computeSellingUnitsPlan(products, conversionFactors, generateId);

      for (const unit of plan.sellingUnits) {
        await connection.query(
          `INSERT INTO product_selling_units
             (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [unit.id, unit.rootProductId, unit.unitName, unit.qtyBase, unit.barcode, unit.cost, unit.price, unit.isBase ? 1 : 0, unit.sortOrder]
        );
      }

      for (const r of plan.reassignments) {
        await connection.query(
          `UPDATE inventory_batches SET product_id = ?, selling_unit_id = ? WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, r.fromProductId]
        );
        await connection.query(
          `UPDATE sale_items
           SET product_id = ?,
               selling_unit_id = ?,
               selling_unit_name = (SELECT unit_name FROM product_selling_units WHERE id = ?),
               selling_unit_qty_base = (SELECT qty_base FROM product_selling_units WHERE id = ?)
           WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, r.sellingUnitId, r.sellingUnitId, r.fromProductId]
        );
        await connection.query(
          `UPDATE purchase_order_items
           SET product_id = ?,
               selling_unit_id = ?,
               selling_unit_name = (SELECT unit_name FROM product_selling_units WHERE id = ?),
               selling_unit_qty_base = (SELECT qty_base FROM product_selling_units WHERE id = ?)
           WHERE product_id = ?`,
          [r.toRootProductId, r.sellingUnitId, r.sellingUnitId, r.sellingUnitId, r.fromProductId]
        );
      }

      // Deepest-first order from the plan means a node's own children (if
      // any) are already gone by the time we delete it, so the self-FK on
      // products.parent_id never blocks a delete here.
      for (const deletedId of plan.deletedProductIds) {
        const [[productRow]]: any = await connection.query('SELECT * FROM products WHERE id = ?', [deletedId]);
        const [cfForThisProduct]: any = await connection.query(
          'SELECT id, product_id, unit, factor, created_at FROM conversion_factors WHERE product_id = ?',
          [deletedId]
        );
        const r = plan.reassignments.find(x => x.fromProductId === deletedId)!;

        await connection.query(
          `INSERT INTO migration_120_backup (id, product_json, conversion_factors_json, root_product_id, selling_unit_id)
           VALUES (?, ?, ?, ?, ?)`,
          [deletedId, JSON.stringify(productRow), JSON.stringify(cfForThisProduct), r.toRootProductId, r.sellingUnitId]
        );

        await connection.query('DELETE FROM products WHERE id = ?', [deletedId]);
      }

      const rootCount = new Set(plan.sellingUnits.map(u => u.rootProductId)).size;
      console.log(`✅ Migrated ${plan.sellingUnits.length} selling unit(s) across ${rootCount} product(s); removed ${plan.deletedProductIds.length} legacy child product row(s)`);
    });
  },

  async down(): Promise<void> {
    await withTransaction(async (connection) => {
      const [backupRows]: any = await connection.query('SELECT * FROM migration_120_backup');

      if (backupRows.length === 0) {
        console.log('ℹ️  No migration_120_backup rows found, nothing to restore');
      } else {
        const pending = new Map<string, any>(backupRows.map((r: any) => [r.id, r]));
        let progress = true;

        while (pending.size > 0 && progress) {
          progress = false;
          for (const [id, row] of Array.from(pending.entries())) {
            const productData = JSON.parse(row.product_json);
            const parentId = productData.parent_id;
            if (parentId) {
              const [[parentExists]]: any = await connection.query('SELECT id FROM products WHERE id = ?', [parentId]);
              if (!parentExists) continue; // parent not restored yet, retry next pass
            }

            const columns = Object.keys(productData);
            const placeholders = columns.map(() => '?').join(', ');
            await connection.query(
              `INSERT INTO products (${columns.join(', ')}) VALUES (${placeholders})`,
              columns.map(c => productData[c])
            );

            const cfRows = JSON.parse(row.conversion_factors_json);
            for (const cf of cfRows) {
              await connection.query(
                'INSERT INTO conversion_factors (id, product_id, unit, factor, created_at) VALUES (?, ?, ?, ?, ?)',
                [cf.id, cf.product_id, cf.unit, cf.factor, cf.created_at]
              );
            }

            await connection.query(
              'UPDATE inventory_batches SET product_id = ?, selling_unit_id = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );
            await connection.query(
              'UPDATE sale_items SET product_id = ?, selling_unit_id = NULL, selling_unit_name = NULL, selling_unit_qty_base = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );
            await connection.query(
              'UPDATE purchase_order_items SET product_id = ?, selling_unit_id = NULL, selling_unit_name = NULL, selling_unit_qty_base = NULL WHERE product_id = ? AND selling_unit_id = ?',
              [id, row.root_product_id, row.selling_unit_id]
            );

            pending.delete(id);
            progress = true;
          }
        }

        if (pending.size > 0) {
          throw new Error(`migration_120 rollback stalled: could not restore parent for ${[...pending.keys()].join(', ')}`);
        }
      }

      // up() created a selling unit for every surviving product too — remove all of them.
      await connection.query('DELETE FROM product_selling_units');
      await connection.query('DROP TABLE IF EXISTS migration_120_backup');
      console.log('✅ Rolled back selling-units data migration');
    });
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register it**

```ts
import './120_migrate_parent_child_to_selling_units';
```

- [ ] **Step 3: Run it**

Run: `npm run migrate`
Expected: a line like `✅ Migrated N selling unit(s) across M product(s); removed K legacy child product row(s)` (K may be 0 on a dev DB with no existing parent/child products — that's fine, every product still gets exactly one base selling unit).

- [ ] **Step 4: Verify every product has a selling unit and no orphaned parent_id remains**

Run:
```bash
npx tsx -e "import('./lib/mysql').then(async ({query}) => { \
  const [{cnt: productCount}] = await query('SELECT COUNT(*) as cnt FROM products'); \
  const [{cnt: unitCount}] = await query('SELECT COUNT(*) as cnt FROM product_selling_units'); \
  const [{cnt: baseCount}] = await query('SELECT COUNT(*) as cnt FROM product_selling_units WHERE is_base = 1'); \
  const [{cnt: danglingParents}] = await query('SELECT COUNT(*) as cnt FROM products p LEFT JOIN products parent ON p.parent_id = parent.id WHERE p.parent_id IS NOT NULL AND parent.id IS NULL'); \
  console.log({ productCount, unitCount, baseCount, danglingParents }); \
  process.exit(0); \
})"
```
Expected: `unitCount >= productCount` (every product has at least a base unit), `baseCount === productCount` (exactly one base unit per surviving product), `danglingParents === 0`.

- [ ] **Step 5: Verify rollback restores original product count**

Run:
```bash
npx tsx -e "import('./lib/mysql').then(async ({query}) => { const [{cnt}] = await query('SELECT COUNT(*) as cnt FROM products'); console.log('before down:', cnt); process.exit(0); })"
```
Run: `npm run migrate:down`
Run:
```bash
npx tsx -e "import('./lib/mysql').then(async ({query}) => { const [{cnt}] = await query('SELECT COUNT(*) as cnt FROM products'); console.log('after down:', cnt); process.exit(0); })"
```
Expected: the two counts are equal (every deleted child product came back).

- [ ] **Step 6: Re-apply so the DB is left in the fully-migrated state Plan 2 expects**

Run: `npm run migrate`
Expected: migration `120` runs again successfully (console shows the same migrated/removed summary as Step 3).

- [ ] **Step 7: Commit**

```bash
git add scripts/migrations/120_migrate_parent_child_to_selling_units.ts scripts/migrations/index.ts
git commit -m "feat: migrate parent/child products into flat selling units"
```

---

## Self-Review Notes

- **Spec coverage:** "New table: `product_selling_units`" → Task 1. "New table: `product_selling_unit_prices`" → Task 2. "New columns on transaction tables" (`sales_items`/`purchase_order_items`) → Tasks 3–4; the migration-steps' additional requirement to tag re-pointed `inventory_batches` with `selling_unit_id` → Task 5. "Migration of existing data" steps 1–6 → Tasks 6–7 (steps 1–2 as `sellingUnits`, step 3 as the `inventory_batches` re-point, step 4 as the `sale_items`/`purchase_order_items` re-point, step 5 as `deletedProductIds`, step 6's depth-first/composed-factor requirement as the `walk()` recursion order and test case 3). "Dropped" section is explicitly **not** done here — deferred to Plan 5 per Global Constraints, since it's the point where every consumer has finally moved off the old columns.
- **Placeholder scan:** no TBD/TODO, every step has real SQL/TypeScript, no "similar to Task N" shortcuts.
- **Type consistency:** `MigrationPlan`, `PlannedSellingUnit`, `MigrationProductInput`, `MigrationConversionFactorInput` are defined once in `lib/selling-units-migration.ts` (Task 6) and used with identical field names in Task 7's `up()` — checked against the test file's usage in Task 6 as well.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-21-selling-product-units-schema-migration.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
