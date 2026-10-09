# Consolidate Transfers Into Bulk Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Bulk Adjustment the single screen for every inventory transfer — warehouse-to-warehouse and shelf-to-shelf — then delete the Transfer Board and Shelf Board.

**Architecture:** The UI is unified; the two write paths are not. Transfer mode gains a destination-type toggle (Warehouse | Shelf). Warehouse transfers keep going to `POST /api/inventory/adjust/bulk`; shelf transfers call the existing `updateProductShelfLocations()` server action, which already owns `product_shelves` arithmetic and `SHELF_TRANSFER` approvals. No stock-arithmetic code is rewritten.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, raw `mysql2/promise`, Playwright e2e against `alon_pos_test` on port 3100.

**Spec:** `docs/superpowers/specs/2026-10-09-consolidate-transfers-into-bulk-adjustment-design.md`

## Global Constraints

- **Shelf transfers must never change `products.stock`.** They only move rows in `product_shelves`. A shelf move that alters total stock is inventory corruption.
- **The two approval types stay separate:** `STOCK_TRANSFER` for warehouse, `SHELF_TRANSFER` for shelf. Do not merge them.
- **`shelf_locations` has no `warehouse_id`.** Shelves are global. Do not add warehouse scoping to shelves in this plan.
- **One source warehouse and one destination per batch.** No multi-source, no mixed warehouse+shelf batches.
- **Do not modify `updateProductShelfLocations()`** (`app/(app)/products/actions.ts:1177`). It is reused as-is and is also called by approval finalization.
- **E2E tests run `workers: 1`** — the test DB is shared. Never add parallelism.
- **E2E assertions read the database, not the UI.** A success toast does not prove a write landed.
- Mode tabs stay exactly three: Add / Remove / Transfer.

## Review Focus

Input classes the spec implies but which no single task's happy path exercises. Each has its test assigned to the task that owns the code.

1. **Shelf transfer where source and target shelf are the same** — should be rejected before submit, not produce a no-op write. (Task 3)
2. **Shelf quantity exceeding what sits on the source shelf** — a product with 100 total but 3 on Aisle A1 must not move more than 3 off A1. (Task 2)
3. **Source shelf = Unassigned** — the ceiling is `stock - sum(shelfQuantities)`, which can be 0 even when total stock is large. (Task 2)
4. **Switching destination type with items already staged** — stale per-item max quantities must be re-clamped, not left pointing at the old ceiling. (Task 3)
5. **Shelf transfer when approval is required** — must return `pendingApproval` and write nothing to `product_shelves` until approved. (Task 4)

---

## Task 1: Shelf state and shelf-location loading

Adds the new state and loads shelf locations. No behavior change yet — transfer mode still warehouse-only, so this task is safe on its own.

**Files:**
- Modify: `app/(app)/inventory/bulk-adjustment/constants.ts`
- Modify: `app/(app)/inventory/bulk-adjustment/use-bulk-adjustment.ts:29-37` (state block), `:90-101` (`loadMetadata`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: exported type `TransferTarget = 'warehouse' | 'shelf'`. From `useBulkAdjustment()`: `transferTarget: TransferTarget`, `setTransferTarget: (t: TransferTarget) => void`, `sourceShelfId: string`, `setSourceShelfId: (v: string) => void`, `targetShelfId: string`, `setTargetShelfId: (v: string) => void`, `shelfLocations: ShelfLocation[]`.

- [ ] **Step 1: Add the `TransferTarget` type**

In `constants.ts`, after the existing `AdjustmentType` declaration:

```ts
/**
 * Asa paingon ang transfer. Ang warehouse mo-usab sa `products.stock` sa duha
 * ka row; ang shelf mo-usab ra sa `product_shelves` (wala mausab ang total
 * stock). Bulag gyud sila nga write path — tan-awa ang spec.
 */
export type TransferTarget = 'warehouse' | 'shelf';
```

- [ ] **Step 2: Add state to the hook**

In `use-bulk-adjustment.ts`, add the `ShelfLocation` type to the existing type import, then add state after the `targetWarehouseId` line (~line 34):

```ts
  const [transferTarget, setTransferTarget] = useState<TransferTarget>('warehouse');
  const [sourceShelfId, setSourceShelfId] = useState<string>('');
  const [targetShelfId, setTargetShelfId] = useState<string>('');
  const [shelfLocations, setShelfLocations] = useState<ShelfLocation[]>([]);
```

Import `TransferTarget` from `./constants` alongside the existing `AdjustmentItem, AdjustmentType` import, and add `ShelfLocation` to the `@/lib/types` import.

- [ ] **Step 3: Load shelf locations in `loadMetadata`**

Replace the body of `loadMetadata` (~lines 90-101):

```ts
  const loadMetadata = async () => {
    try {
      const [whRes, supRes, shelfRes] = await Promise.all([
        fetch('/api/warehouses?activeOnly=true').then(r => r.json()),
        fetch('/api/suppliers').then(r => r.json()),
        fetch('/api/shelf-locations?activeOnly=true').then(r => r.json())
      ]);
      if (whRes.success) setWarehouses(whRes.data);
      if (supRes.success) setSuppliers(supRes.data);
      if (shelfRes.success) setShelfLocations(shelfRes.data);
    } catch (error) {
      console.error('Failed to load metadata:', error);
    }
  };
```

- [ ] **Step 4: Export the new values**

Add to the hook's returned object (alongside `targetWarehouseId`, `setTargetWarehouseId`):

```ts
    transferTarget,
    setTransferTarget,
    sourceShelfId,
    setSourceShelfId,
    targetShelfId,
    setTargetShelfId,
    shelfLocations,
```

- [ ] **Step 5: Verify it compiles and nothing regressed**

Run: `npm run typecheck 2>&1 | grep -E "bulk-adjustment|constants"`
Expected: no output (the pre-existing `.next/types` errors in `warehouses/[id]`, `shelf-locations/[id]`, `sales/orders/[id]` are unrelated — they fail on `main` too).

Run: `npx playwright test tests/e2e/adjustment-expiration.spec.ts --reporter=line`
Expected: 8 passed.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inventory/bulk-adjustment/constants.ts" "app/(app)/inventory/bulk-adjustment/use-bulk-adjustment.ts"
git commit -m "feat(inventory): load shelf locations into bulk adjustment"
```

---

## Task 2: Shelf quantity ceilings

The arithmetic for "how much can move off this shelf". Pure functions, unit-tested, before any UI uses them. This is where Review Focus items 2 and 3 are pinned.

**Files:**
- Create: `app/(app)/inventory/bulk-adjustment/shelf-quantities.ts`
- Create: `tests/unit/shelf-quantities.test.ts`
- Modify: `tests/unit/run.ts` (register the new test file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `UNASSIGNED_SHELF_ID: string` (the literal `'unassigned'`), `shelfQuantityOf(product: Product, shelfId: string): number`, `productsOnShelf(products: Product[], shelfId: string): Product[]`.

**Test convention:** this repo's unit tests use `node:assert/strict` with top-level
assertions that self-execute on import, run by `tsx tests/unit/run.ts` via
`npm run test:unit`. There is no vitest or jest — do not add one. Imports are
**relative** (`../../lib/...`), not `@/`-aliased. See `tests/unit/aes-gcm.test.ts`
for the pattern.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shelf-quantities.test.ts`:

```ts
import assert from 'node:assert/strict';
import type { Product } from '../../lib/types';
import {
  UNASSIGNED_SHELF_ID,
  shelfQuantityOf,
  productsOnShelf,
} from '../../app/(app)/inventory/bulk-adjustment/shelf-quantities';

/** Minimal nga product — ang mga field nga gi-gamit ra sa shelf math. */
function product(over: Partial<Product>): Product {
  return { id: 'p1', name: 'P', stock: 0, price: 0, ...over } as Product;
}

// --- shelfQuantityOf ---

const twoShelves = product({ stock: 100, shelfQuantities: { a1: 3, b2: 10 } });
assert.equal(shelfQuantityOf(twoShelves, 'a1'), 3, 'quantity sa gipili nga shelf');
assert.equal(shelfQuantityOf(twoShelves, 'b2'), 10, 'quantity sa laing shelf');
assert.equal(shelfQuantityOf(twoShelves, 'zz'), 0, '0 kung wala sa shelf');
assert.equal(shelfQuantityOf(twoShelves, UNASSIGNED_SHELF_ID), 87, 'unassigned = stock olos sa assigned');

// Review Focus 3: ang unassigned mahimong 0 bisan dako ang total stock.
const fullyShelved = product({ stock: 13, shelfQuantities: { a1: 3, b2: 10 } });
assert.equal(shelfQuantityOf(fullyShelved, UNASSIGNED_SHELF_ID), 0, 'unassigned = 0 kung assigned na ang tanan');

const overAssigned = product({ stock: 5, shelfQuantities: { a1: 10 } });
assert.equal(shelfQuantityOf(overAssigned, UNASSIGNED_SHELF_ID), 0, 'wala mo-negative');

const noShelves = product({ stock: 42 });
assert.equal(shelfQuantityOf(noShelves, UNASSIGNED_SHELF_ID), 42, 'walay assignment: tanan unassigned');
assert.equal(shelfQuantityOf(noShelves, 'a1'), 0, 'walay assignment: 0 sa bisan unsang shelf');

// --- productsOnShelf ---

const onShelfCases = [
  product({ id: 'has', stock: 50, shelfQuantities: { a1: 5 } }),
  product({ id: 'zero', stock: 50, shelfQuantities: { a1: 0 } }),
  product({ id: 'other', stock: 50, shelfQuantities: { b2: 5 } }),
];
assert.deepEqual(
  productsOnShelf(onShelfCases, 'a1').map(p => p.id),
  ['has'],
  'ang naa ra gyuy stock sa shelf ang mogawas',
);

const unassignedCases = [
  product({ id: 'loose', stock: 10, shelfQuantities: { a1: 4 } }),
  product({ id: 'allshelved', stock: 10, shelfQuantities: { a1: 10 } }),
];
assert.deepEqual(
  productsOnShelf(unassignedCases, UNASSIGNED_SHELF_ID).map(p => p.id),
  ['loose'],
  'unassigned: ang naa pay wala ma-assign ang mogawas',
);

console.log('✓ shelf-quantities');
```

- [ ] **Step 2: Register the test file in the runner**

A file not listed in `TEST_FILES` never runs. In `tests/unit/run.ts`, add to the end of the `TEST_FILES` array (after `'void-selling-unit-restore.test',`):

```ts
  'shelf-quantities.test',
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit 2>&1 | grep -A3 shelf-quantities`
Expected: FAIL — `Cannot find module './shelf-quantities'` (the implementation does not exist yet).

- [ ] **Step 4: Write the implementation**

Create `app/(app)/inventory/bulk-adjustment/shelf-quantities.ts`:

```ts
import type { Product } from '@/lib/types';

/**
 * Ang sentinel para sa stock nga wala pa ma-assign sa bisan unsang shelf.
 * Pareho sa gi-gamit sa `updateProductShelfLocations`, nga mo-translate niini
 * ngadto sa NULL sa wala pa ang write.
 */
export const UNASSIGNED_SHELF_ID = 'unassigned';

/**
 * Pila ka unit ang nahimutang sa `shelfId` para niini nga product.
 *
 * Para sa UNASSIGNED_SHELF_ID, gi-derive siya: total stock olos sa tanan nga
 * naka-assign sa shelves. Mao ni ang ceiling para sa shelf transfer — DILI ang
 * `product.stock`. Usa ka product nga 100 ang total apan 3 ra sa Aisle A1 kay
 * 3 ra ang mahimong ibalhin gikan sa A1.
 */
export function shelfQuantityOf(product: Product, shelfId: string): number {
  const assignments = product.shelfQuantities || {};

  if (shelfId === UNASSIGNED_SHELF_ID) {
    const assigned = Object.values(assignments).reduce((sum, q) => sum + (q || 0), 0);
    // Mo-clamp sa 0: ang drifted nga data mahimong mo-assign ug sobra sa stock,
    // ug ang negative nga ceiling mo-guba sa quantity input.
    return Math.max(0, (product.stock || 0) - assigned);
  }

  return assignments[shelfId] || 0;
}

/**
 * Ang mga product nga naa gyuy mabalhin gikan sa `shelfId`.
 *
 * Gi-filter ang search sa shelf mode pinaagi niini aron dili maka-stage ang
 * user ug item nga dili diay ma-transfer.
 */
export function productsOnShelf(products: Product[], shelfId: string): Product[] {
  return products.filter(p => shelfQuantityOf(p, shelfId) > 0);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:unit 2>&1 | tail -5`
Expected: `✓ shelf-quantities` appears, and the run ends with `All N unit test files passed.` (N is one higher than before).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inventory/bulk-adjustment/shelf-quantities.ts" tests/unit/shelf-quantities.test.ts tests/unit/run.ts
git commit -m "feat(inventory): add shelf quantity ceiling helpers"
```

---

## Task 3: Destination toggle and shelf pickers

Wires the toggle into the UI, swaps the pickers, filters search by source shelf, and clamps quantities. Pins Review Focus items 1 and 4.

**Files:**
- Modify: `app/(app)/inventory/bulk-adjustment/config-fields.tsx:93-108` (the transfer destination block)
- Modify: `app/(app)/inventory/bulk-adjustment/use-bulk-adjustment.ts` (`filteredProducts`, `addProduct`, `handleProcessAdjustments` guard)
- Modify: `app/(app)/inventory/bulk-adjustment/BulkAdjustmentClient.tsx:24-80` (destructure + `configFieldsProps`)
- Test: `tests/e2e/bulk-adjustment-transfers.spec.ts` (created in Task 4)

**Interfaces:**
- Consumes: `TransferTarget`, `transferTarget`, `setTransferTarget`, `sourceShelfId`, `setSourceShelfId`, `targetShelfId`, `setTargetShelfId`, `shelfLocations` (Task 1); `UNASSIGNED_SHELF_ID`, `shelfQuantityOf`, `productsOnShelf` (Task 2).
- Produces: from `useBulkAdjustment()`, `maxQuantityFor(product: Product): number`. `ConfigFields` accepts the seven new props listed in Step 2.

- [ ] **Step 1: Add the destination toggle and shelf pickers to `ConfigFields`**

In `config-fields.tsx`, replace the entire `{/* Transfer Destination */}` block (lines 93-108) with:

```tsx
      {/* Transfer Destination */}
      {adjustmentType === 'transfer' && (
        <>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Transfer To</Label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-xl">
              {(['warehouse', 'shelf'] as const).map(target => (
                <button
                  key={target}
                  onClick={() => onChangeTransferTarget(target)}
                  className={cn(
                    "py-2 px-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all",
                    transferTarget === target
                      ? "bg-card shadow-sm text-blue-600 dark:text-blue-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {target === 'warehouse' ? 'Warehouse' : 'Shelf'}
                </button>
              ))}
            </div>
          </div>

          {transferTarget === 'warehouse' ? (
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Destination Warehouse</Label>
              <Select value={targetWarehouseId} onValueChange={setTargetWarehouseId}>
                <SelectTrigger className="h-10 border-blue-200 bg-blue-50/50 ring-1 ring-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:ring-blue-500/20">
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.filter(w => w.id !== warehouseId).map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Source Shelf</Label>
                <Select value={sourceShelfId} onValueChange={setSourceShelfId}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select source shelf" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_SHELF_ID}>Unassigned</SelectItem>
                    {shelfLocations.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Destination Shelf</Label>
                <Select value={targetShelfId} onValueChange={setTargetShelfId}>
                  <SelectTrigger className="h-10 border-blue-200 bg-blue-50/50 ring-1 ring-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:ring-blue-500/20">
                    <SelectValue placeholder="Select destination shelf" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceShelfId !== UNASSIGNED_SHELF_ID && (
                      <SelectItem value={UNASSIGNED_SHELF_ID}>Unassigned</SelectItem>
                    )}
                    {shelfLocations.filter(s => s.id !== sourceShelfId).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </>
      )}
```

Review Focus 1 is handled structurally: the destination list excludes `sourceShelfId`, so the same-shelf case cannot be selected.

- [ ] **Step 2: Add the new props to the `ConfigFields` signature**

Add to both the destructured parameters and the type annotation:

```ts
  transferTarget: TransferTarget;
  onChangeTransferTarget: (target: TransferTarget) => void;
  sourceShelfId: string;
  setSourceShelfId: (value: string) => void;
  targetShelfId: string;
  setTargetShelfId: (value: string) => void;
  shelfLocations: ShelfLocation[];
```

Add imports to `config-fields.tsx`:

```ts
import type { Supplier, Warehouse, ShelfLocation } from '@/lib/types';
import { typeConfig, type AdjustmentType, type TransferTarget } from './constants';
import { UNASSIGNED_SHELF_ID } from './shelf-quantities';
```

- [ ] **Step 3: Pass the props through `BulkAdjustmentClient`**

In `BulkAdjustmentClient.tsx`, add to the `useBulkAdjustment()` destructure (~line 39) and to `configFieldsProps` (~line 63):

```ts
    transferTarget,
    onChangeTransferTarget: changeTransferTarget,
    sourceShelfId,
    setSourceShelfId,
    targetShelfId,
    setTargetShelfId,
    shelfLocations,
```

Note: the destructure takes `changeTransferTarget` (the hook's name, added in Step 5); `configFieldsProps` maps it to the prop `onChangeTransferTarget`. Both desktop and mobile already spread `configFieldsProps`, so no layout edits are needed.

- [ ] **Step 4: Filter search by source shelf and clamp quantities**

In `use-bulk-adjustment.ts`, add the import:

```ts
import { UNASSIGNED_SHELF_ID, shelfQuantityOf, productsOnShelf } from './shelf-quantities';
```

Replace `filteredProducts` (~line 104):

```ts
  /**
   * Ang ceiling sa usa ka item. Sa shelf transfer, kung pila ang naa sa SOURCE
   * SHELF — dili ang total stock (Review Focus 2). Kung dili shelf, ang stock.
   */
  const maxQuantityFor = (product: Product): number => {
    if (adjustmentType === 'transfer' && transferTarget === 'shelf' && sourceShelfId) {
      return shelfQuantityOf(product, sourceShelfId);
    }
    return product.stock;
  };

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return [];
    let filtered = allProducts;

    const isShelfTransfer = adjustmentType === 'transfer' && transferTarget === 'shelf';

    if (isShelfTransfer) {
      // Sa shelf mode, ang naa ra gyuy stock sa source shelf ang mahimong
      // ibalhin — kung dili ni i-filter, maka-stage ang user ug item nga dili
      // diay ma-transfer. Ang warehouse filter gi-laktawan kay global ang
      // shelves (walay warehouse_id ang shelf_locations).
      filtered = sourceShelfId ? productsOnShelf(filtered, sourceShelfId) : [];
    } else if (warehouseId && warehouseId !== 'none') {
      filtered = filtered.filter(p => p.warehouseId === warehouseId || p.warehouse === warehouseId);
    }

    return filtered.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    ).slice(0, 40);
  }, [allProducts, search, warehouseId, adjustmentType, transferTarget, sourceShelfId]);
```

- [ ] **Step 5: Re-clamp staged items when the destination changes**

Review Focus 4: staged items keep a `quantity` that was valid under the old ceiling. Add after `changeAdjustmentType`:

```ts
  /**
   * Kung mo-usab ang destination type, mo-usab sad ang ceiling sa matag item
   * (total stock vs. shelf quantity), mao nga i-clamp ang na-stage na aron dili
   * mabilin nga mo-tumong sa daan nga ceiling (Review Focus 4).
   */
  const changeTransferTarget = (target: TransferTarget) => {
    setTransferTarget(target);
    setAdjustments(prev => prev.map(a => {
      const max = target === 'shelf' && sourceShelfId
        ? shelfQuantityOf(a.product, sourceShelfId)
        : a.product.stock;
      return { ...a, quantity: Math.min(a.quantity, Math.max(1, max)) };
    }));
  };
```

Export `changeTransferTarget` and `maxQuantityFor` from the hook (and keep exporting `setTransferTarget` for completeness).

- [ ] **Step 6: Guard submit on the shelf fields**

In `handleProcessAdjustments`, replace the existing transfer guard:

```ts
    if (adjustmentType === 'transfer') {
      if (transferTarget === 'warehouse' && !targetWarehouseId) {
        toast({ variant: 'destructive', title: 'Target Warehouse Required', description: 'Please select a destination warehouse.' });
        return;
      }
      if (transferTarget === 'shelf') {
        if (!sourceShelfId || !targetShelfId) {
          toast({ variant: 'destructive', title: 'Shelves Required', description: 'Please select both a source and destination shelf.' });
          return;
        }
        if (sourceShelfId === targetShelfId) {
          toast({ variant: 'destructive', title: 'Invalid Transfer', description: 'Source and destination shelf must be different.' });
          return;
        }
      }
    }
```

- [ ] **Step 7: Verify it compiles and nothing regressed**

Run: `npm run typecheck 2>&1 | grep -E "bulk-adjustment|config-fields|shelf-quantities"`
Expected: no output.

Run: `npx playwright test tests/e2e/adjustment-expiration.spec.ts --reporter=line`
Expected: 8 passed.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/inventory/bulk-adjustment/"
git commit -m "feat(inventory): add shelf destination toggle to bulk adjustment transfers"
```

---

## Task 4: Shelf transfer submit + e2e coverage

Routes shelf transfers to `updateProductShelfLocations()` and proves both transfer paths against the database. This is the task that makes the feature work.

**Files:**
- Modify: `app/(app)/inventory/bulk-adjustment/use-bulk-adjustment.ts` (`handleProcessAdjustments`)
- Create: `tests/e2e/bulk-adjustment-transfers.spec.ts`
- Modify: `tests/e2e/fixtures/test-data.ts`
- Modify: `tests/e2e/setup/prepare-test-db.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: fixtures `SHELF_A`, `SHELF_B`, `SHELF_XFER_PRODUCT`.

- [ ] **Step 1: Add the shelf fixtures**

Append to `tests/e2e/fixtures/test-data.ts`:

```ts
/** Duha ka shelf para sa shelf-transfer test. Global ang shelves — walay warehouse_id. */
export const SHELF_A = { id: 'shelf-xfer-a', name: 'Aisle A1' };
export const SHELF_B = { id: 'shelf-xfer-b', name: 'Aisle B2' };

/**
 * Produkto nga 30 ang total stock apan 4 ra ang naa sa SHELF_A (ug 6 sa
 * SHELF_B), mao nga 20 ang unassigned.
 *
 * Ang kalainan tali sa total stock ug sa per-shelf nga quantity mao ang
 * importante: ang ceiling sa shelf transfer kay ang shelf quantity (4), dili
 * ang total (30). Usa ka test nga pareho ni sila dili makakita sa bug.
 */
export const SHELF_XFER_PRODUCT = {
  id: 'test-shelf-xfer-1',
  name: 'Shelf Transfer Product',
  sku: 'SHLF-XFER-001',
  price: 75,
  cost: 40,
  stock: 30,
  onShelfA: 4,
  onShelfB: 6,
};
```

- [ ] **Step 2: Seed the fixtures**

In `tests/e2e/setup/prepare-test-db.ts`, add `SHELF_A`, `SHELF_B`, `SHELF_XFER_PRODUCT` to the import list from `../fixtures/test-data`, then insert before the `// --- sales-order fixtures` comment:

```ts
  // --- shelf-transfer fixtures: duha ka shelf + produkto nga partial ang assignment ---
  for (const s of [SHELF_A, SHELF_B]) {
    await conn.query('INSERT INTO shelf_locations (id, name, is_active) VALUES (?, ?, 1)', [s.id, s.name]);
  }
  await conn.query(
    `INSERT INTO products (id, name, price, cost, stock, sku, availability)
     VALUES (?, ?, ?, ?, ?, ?, 'Available')`,
    [SHELF_XFER_PRODUCT.id, SHELF_XFER_PRODUCT.name, SHELF_XFER_PRODUCT.price,
     SHELF_XFER_PRODUCT.cost, SHELF_XFER_PRODUCT.stock, SHELF_XFER_PRODUCT.sku],
  );
  // Partial ra ang assignment: 4 sa A, 6 sa B, 20 ang nahabilin nga unassigned.
  await conn.query('INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)',
    [SHELF_XFER_PRODUCT.id, SHELF_A.id, SHELF_XFER_PRODUCT.onShelfA]);
  await conn.query('INSERT INTO product_shelves (product_id, shelf_id, quantity) VALUES (?, ?, ?)',
    [SHELF_XFER_PRODUCT.id, SHELF_B.id, SHELF_XFER_PRODUCT.onShelfB]);
```

- [ ] **Step 3: Write the failing e2e test**

Create `tests/e2e/bulk-adjustment-transfers.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import { SHELF_A, SHELF_B, SHELF_XFER_PRODUCT } from './fixtures/test-data';

/**
 * Transfers pinaagi sa Bulk Adjustment page — mao na ang usa ra nga lugar para
 * sa tanan nga transfer human matangal ang Transfer Board ug Shelf Board.
 *
 * Ang assertions mo-adto sa DATABASE: ang success toast dili pruweba nga naka-
 * landing ang write. Ilabi na sa shelf transfer — ang `products.stock` kinahanglan
 * DILI gyud mausab, ug ang toast dili makasulti niana.
 */

async function shelfQty(productId: string, shelfId: string): Promise<number> {
  const rows = await testQuery(
    'SELECT quantity FROM product_shelves WHERE product_id = ? AND shelf_id = ?',
    [productId, shelfId],
  );
  return rows.length ? Number(rows[0].quantity) : 0;
}

async function totalStock(productId: string): Promise<number> {
  const rows = await testQuery('SELECT stock FROM products WHERE id = ?', [productId]);
  return Number(rows[0].stock);
}

test.describe('Bulk Adjustment transfers', () => {
  test('shelf transfer: mobalhin ang product_shelves, DILI mausab ang total stock', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);

    const stockBefore = await totalStock(SHELF_XFER_PRODUCT.id);
    const aBefore = await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_A.id);
    const bBefore = await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_B.id);
    expect(aBefore).toBe(SHELF_XFER_PRODUCT.onShelfA);

    await page.goto('/inventory/bulk-adjustment');

    await page.getByRole('button', { name: /^transfer$/i }).click();
    await page.getByRole('button', { name: /^shelf$/i }).click();

    await page.getByLabel(/source shelf/i).click();
    await page.getByRole('option', { name: SHELF_A.name }).click();
    await page.getByLabel(/destination shelf/i).click();
    await page.getByRole('option', { name: SHELF_B.name }).click();

    await page.getByPlaceholder(/search/i).first().fill(SHELF_XFER_PRODUCT.sku);
    await page.getByText(SHELF_XFER_PRODUCT.name).first().click();

    await page.getByRole('button', { name: /process|confirm|apply/i }).first().click();

    await expect(async () => {
      expect(await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_A.id)).toBe(aBefore - 1);
      expect(await shelfQty(SHELF_XFER_PRODUCT.id, SHELF_B.id)).toBe(bBefore + 1);
      // Ang pinakaimportante nga assertion sa tibuok file.
      expect(await totalStock(SHELF_XFER_PRODUCT.id)).toBe(stockBefore);
    }).toPass({ timeout: 15_000 });
  });

  test('shelf mode: ang ceiling kay ang shelf quantity, dili ang total stock', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/inventory/bulk-adjustment');

    await page.getByRole('button', { name: /^transfer$/i }).click();
    await page.getByRole('button', { name: /^shelf$/i }).click();

    await page.getByLabel(/source shelf/i).click();
    await page.getByRole('option', { name: SHELF_A.name }).click();
    await page.getByLabel(/destination shelf/i).click();
    await page.getByRole('option', { name: SHELF_B.name }).click();

    await page.getByPlaceholder(/search/i).first().fill(SHELF_XFER_PRODUCT.sku);
    await page.getByText(SHELF_XFER_PRODUCT.name).first().click();

    // 4 ra ang naa sa SHELF_A bisan 30 ang total stock. Ang item row kinahanglan
    // mo-pakita sa 4 isip ceiling — kung 30, naguba ang per-shelf limit.
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('99');
    await qtyInput.blur();
    await expect(qtyInput).toHaveValue(String(SHELF_XFER_PRODUCT.onShelfA));
  });

  test('ang tangal na nga boards mo-404', async ({ page }) => {
    for (const path of ['/inventory/transfer-board', '/inventory/shelf-board']) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} kinahanglan 404`).toBe(404);
    }
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx playwright test tests/e2e/bulk-adjustment-transfers.spec.ts --reporter=line`
Expected: FAIL. The shelf-transfer test fails because submit still posts to `adjust/bulk` (which does not touch `product_shelves`); the 404 test fails because the boards still exist.

If the selectors in Step 3 do not match the rendered UI, fix the selectors against the real DOM — do not change the assertions. The DB assertions are the contract.

- [ ] **Step 5: Route shelf transfers to the shelf action**

In `use-bulk-adjustment.ts`, add the import:

```ts
import { getProducts, updateProductShelfLocations } from '../../products/actions';
```

Then, inside `handleProcessAdjustments`, immediately after `setIsProcessing(true); try {`, insert the shelf branch:

```ts
      // Ang shelf transfer lahi nga write path: mo-usab ra siya sa
      // `product_shelves`, wala sa `products.stock`, ug naa siyay kaugalingong
      // SHELF_TRANSFER approval. Gi-reuse ang server action nga naa nay tanan
      // niini — wala gyud nato gi-hilabtan ang stock arithmetic.
      if (adjustmentType === 'transfer' && transferTarget === 'shelf') {
        const userSession = localStorage.getItem('mock-user-session');
        const userId = userSession ? JSON.parse(userSession).uid : 'system';

        const result = await updateProductShelfLocations(
          adjustments.map(a => ({
            productId: a.product.id,
            sourceShelfId: sourceShelfId === UNASSIGNED_SHELF_ID ? null : sourceShelfId,
            targetShelfId: targetShelfId === UNASSIGNED_SHELF_ID ? null : targetShelfId,
            quantity: a.quantity,
          })),
          userId,
        );

        if (!result.success) throw new Error('Shelf transfer failed');

        await logActivity({
          action: 'TRANSFER',
          module: 'INVENTORY',
          description: `Shelf transfer: ${adjustments.length} item(s)${result.pendingApproval ? ' (pending approval)' : ''}`,
        });

        toast(result.pendingApproval
          ? { title: 'Approval Required', description: 'The shelf transfer was sent for approval.' }
          : { title: 'Shelf Transfer Successful', description: `Moved ${adjustments.length} item(s).` });

        setAdjustments([]);
        dispatchStockUpdate();
        router.push('/inventory');
        return;
      }
```

Review Focus 5 is satisfied by `updateProductShelfLocations` itself: when `SHELF_TRANSFER` approval is required it returns `{ pendingApproval: true }` and writes nothing until finalization.

- [ ] **Step 6: Clamp the quantity input to the shelf ceiling**

In `adjustment-table-row.tsx` and `adjustment-mobile-card.tsx`, accept a `maxQuantity: number` prop and clamp both the `+` button and the input:

```tsx
            onClick={() => onUpdate(adj.product.id, { quantity: Math.min(maxQuantity, adj.quantity + 1) })}
```

```tsx
            onChange={e => onUpdate(adj.product.id, { quantity: Math.min(maxQuantity, Math.max(1, parseInt(e.target.value) || 1)) })}
```

Pass `maxQuantity={maxQuantityFor(adj.product)}` from `BulkAdjustmentClient.tsx` wherever `AdjustmentTableRow` and `AdjustmentMobileCard` are rendered.

- [ ] **Step 7: Run the tests — the shelf tests should now pass**

Run: `npx playwright test tests/e2e/bulk-adjustment-transfers.spec.ts --reporter=line`
Expected: the two shelf tests PASS; the 404 test still FAILS (boards not yet deleted — Task 5).

If a run fails with stale behavior, re-run once: Playwright reuses a running dev server (`reuseExistingServer: !process.env.CI`) and Turbopack compiles routes lazily, so the first request after an edit can serve stale code.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/inventory/bulk-adjustment/" tests/e2e/
git commit -m "feat(inventory): route shelf transfers through bulk adjustment"
```

---

## Task 5: Delete both boards

The removal. Last, so every capability has a tested home first.

**Files:**
- Delete: `app/(app)/inventory/transfer-board/` (6 files)
- Delete: `app/(app)/inventory/shelf-board/` (2 files)
- Delete: `app/api/inventory/transfer/bulk/route.ts`
- Modify: `app/(app)/inventory/page.tsx:87-101`

**Interfaces:**
- Consumes: Task 4's passing shelf-transfer tests (the capability must have a home before its screen is removed).
- Produces: nothing.

- [ ] **Step 1: Confirm nothing still imports the boards or the bulk endpoint**

Run:
```bash
grep -rn "transfer-board\|shelf-board\|inventory/transfer/bulk" app lib components src tests --include=*.ts --include=*.tsx
```
Expected: only the two `<Link>` lines in `app/(app)/inventory/page.tsx` and the files being deleted. If anything else appears, stop and report it — a consumer was missed.

- [ ] **Step 2: Delete the directories and the dead endpoint**

```bash
git rm -r "app/(app)/inventory/transfer-board" "app/(app)/inventory/shelf-board" "app/api/inventory/transfer/bulk"
```

- [ ] **Step 3: Remove the two nav links**

In `app/(app)/inventory/page.tsx`, delete the `<Link href="/inventory/transfer-board">` block, the `<Link href="/inventory/shelf-board">` block, and the two orphaned `<div className="h-4 w-px bg-border/60 mx-1 flex-shrink-0" />` separators that preceded them. Keep the Bulk Adjustment and Pricing links and the separator between them.

Then remove the now-unused `Kanban` and `Rows3` imports from the `lucide-react` import at the top of the file — but first check they are not used elsewhere:

Run: `grep -n "Kanban\|Rows3" "app/(app)/inventory/page.tsx"`
Remove from the import only the ones with no remaining usage.

- [ ] **Step 4: Verify the full suite**

Run: `npm run typecheck 2>&1 | grep -vE "\.next/types"`
Expected: no application-code errors.

Run: `npx playwright test tests/e2e/bulk-adjustment-transfers.spec.ts tests/e2e/adjustment-expiration.spec.ts --reporter=line`
Expected: all PASS, including the 404 test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(inventory): remove transfer board and shelf board"
```

---

## Task 6: Warehouse transfer regression coverage

The warehouse path was never changed, but it was also never covered end-to-end from this page. Closes the gap the boards left.

**Files:**
- Modify: `tests/e2e/bulk-adjustment-transfers.spec.ts`

**Interfaces:**
- Consumes: Task 4's spec file and helpers; the `TRANSFER_NULL_SKU_SOURCE` / `TRANSFER_TARGET_WAREHOUSE` fixtures already in `test-data.ts`.
- Produces: nothing.

- [ ] **Step 1: Add the warehouse transfer test**

Append inside the `test.describe` block in `tests/e2e/bulk-adjustment-transfers.spec.ts`:

```ts
  test('warehouse transfer: mo-move ang stock tali sa duha ka warehouse', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);

    const srcBefore = await totalStock(TRANSFER_NULL_SKU_SOURCE.id);
    const destBefore = await totalStock(TRANSFER_NULL_SKU_TARGET.id);

    await page.goto('/inventory/bulk-adjustment');

    await page.getByRole('button', { name: /^transfer$/i }).click();
    // Ang warehouse mao ang default nga destination type — gi-click gihapon
    // aron ma-pruweba nga mo-trabaho ang toggle sa duha ka direksyon.
    await page.getByRole('button', { name: /^warehouse$/i }).click();

    await page.getByLabel(/source warehouse/i).click();
    await page.getByRole('option', { name: TEST_WAREHOUSE.name }).click();
    await page.getByLabel(/destination warehouse/i).click();
    await page.getByRole('option', { name: TRANSFER_TARGET_WAREHOUSE.name }).click();

    await page.getByPlaceholder(/search/i).first().fill(TRANSFER_NULL_SKU_SOURCE.name);
    await page.getByText(TRANSFER_NULL_SKU_SOURCE.name).first().click();

    await page.getByRole('button', { name: /process|confirm|apply/i }).first().click();

    await expect(async () => {
      expect(await totalStock(TRANSFER_NULL_SKU_SOURCE.id)).toBe(srcBefore - 1);
      expect(await totalStock(TRANSFER_NULL_SKU_TARGET.id)).toBe(destBefore + 1);
    }).toPass({ timeout: 15_000 });
  });
```

Add to the file's fixture import:

```ts
import {
  SHELF_A, SHELF_B, SHELF_XFER_PRODUCT,
  TEST_WAREHOUSE, TRANSFER_TARGET_WAREHOUSE,
  TRANSFER_NULL_SKU_SOURCE, TRANSFER_NULL_SKU_TARGET,
} from './fixtures/test-data';
```

- [ ] **Step 2: Run the full spec**

Run: `npx playwright test tests/e2e/bulk-adjustment-transfers.spec.ts --reporter=line`
Expected: 4 passed.

- [ ] **Step 3: Run the whole e2e suite**

Run: `npx playwright test --reporter=line`
Expected: no failures attributable to this branch. Record any pre-existing failures and confirm they also fail on `main` before dismissing them.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/bulk-adjustment-transfers.spec.ts
git commit -m "test(inventory): cover warehouse transfer via bulk adjustment"
```

---

## Notes for the executor

- **The uncommitted NULL-SKU transfer fix.** The working tree may carry an unrelated fix to `app/api/inventory/adjust/bulk/route.ts` plus `tests/e2e/bulk-transfer.spec.ts` and fixture/seed edits. That is a separate change; commit or stash it before starting, and do not fold it into these commits. The `TRANSFER_*` fixtures Task 6 uses come from it — if it is gone, add them back per `tests/e2e/fixtures/test-data.ts` history.
- **`npm run lint` is broken on `main`** (`next lint` was removed in Next 16). Use `npm run typecheck` for static checks; do not try to fix the lint script here.
- **Pre-existing typecheck errors** live in `.next/types/**` for `warehouses/[id]`, `shelf-locations/[id]`, `sales/orders/[id]`, and `dev/mock-sta-lucia`. They fail on `main`. Filter them out rather than fixing them.
- **Comments in this codebase's inventory and test code are written in Cebuano.** Match that; the code blocks above already do.
