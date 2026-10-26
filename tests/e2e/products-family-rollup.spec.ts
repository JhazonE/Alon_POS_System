import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { getProducts, getProductsCount } from '../../app/(app)/products/actions';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  addWarehouseToBranch,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Pure nga tests — walay `page` fixture. Ang warehouse filter kay row-visibility
 * lang; dili niya angay i-flatten ang family roll-up.
 *
 * Importante: ang server DILI mag-attach ug `children[]`. Ang `getProducts`
 * mo-return ug flat array nga naay roots + ilang descendants (via CTE), ug ang
 * client (page.tsx buildTree) ang mo-grupo pinaagi sa `parentId`. Mao nga ang
 * roll-up makita sa server pinaagi sa PAGING: ang LIMIT/OFFSET nag-ihap lang ug
 * roots (`parent_id IS NULL`), ug ang descendants moduyog sa ilang root. Sa flat
 * mode, ang child kay kaugalingong row sa page.
 *
 * Gi-pin ang created_at (parent > other > child, tanan mas bag-o kay sa seeded
 * data) aron deterministic ang ORDER BY created_at DESC nga paging.
 */
test.describe('products family roll-up vs warehouse filter', () => {
  let seeded: SeededBranch;
  let parentId: string;
  let childId: string;
  let otherRootId: string;
  const tag = `ROLLUP-${Date.now()}`;

  test.beforeEach(async () => {
    seeded = await seedSecondBranch();
    parentId = await seedProductInWarehouse(seeded.warehouseId, `${tag}-P`);
    childId = await seedProductInWarehouse(seeded.warehouseId, `${tag}-C`);
    otherRootId = await seedProductInWarehouse(seeded.warehouseId, `${tag}-O`);
    await testQuery(
      `UPDATE products SET parent_id = ?, name = ?, created_at = NOW() + INTERVAL 1 DAY WHERE id = ?`,
      [parentId, `Rollup Child ${tag}`, childId]
    );
    await testQuery(`UPDATE products SET created_at = NOW() + INTERVAL 3 DAY WHERE id = ?`, [parentId]);
    await testQuery(`UPDATE products SET created_at = NOW() + INTERVAL 2 DAY WHERE id = ?`, [otherRootId]);
  });

  const extraWarehouses: string[] = [];

  test.afterEach(async () => {
    // Products ang unang i-delete (FK) sa dili pa ang extra warehouses.
    for (const id of extraWarehouses.splice(0)) {
      await testQuery('DELETE FROM products WHERE warehouse_id = ?', [id]);
      await testQuery('DELETE FROM warehouses WHERE id = ?', [id]);
    }
    // cleanupSecondBranch mo-delete sa tanang products sa warehouse.
    await cleanupSecondBranch(seeded);
  });

  const ids = (rows: any[]) => rows.map((p) => p.id);

  test('with no filters, the child rides along with its root instead of taking a page slot', async () => {
    const page1 = await getProducts(1, 0, {});
    expect(ids(page1)).toEqual([parentId, childId]); // 1 root + its descendant
    expect(page1.find((p: any) => p.id === childId).parentId).toBe(parentId);
    const page2 = await getProducts(1, 1, {});
    expect(ids(page2)).toEqual([otherRootId]); // child is not a page-2 row
  });

  test('with ONLY a warehouse filter, the family roll-up survives', async () => {
    const wh = { warehouse: seeded.warehouseId };
    const page1 = await getProducts(1, 0, wh);
    expect(ids(page1)).toEqual([parentId, childId]); // child still nested under its root
    const page2 = await getProducts(1, 1, wh);
    expect(ids(page2)).toEqual([otherRootId]);
    expect(ids(await getProducts(1, 2, wh))).toEqual([]); // 2 roots only; child never a page row
  });

  test('a non-warehouse filter still flattens, as before', async () => {
    const res = await getProducts(50, 0, { search: 'Rollup Child' });
    expect(ids(res)).toEqual([childId]); // child is a top-level match even though its parent is not
    const res2 = await getProducts(50, 0, { search: tag });
    expect(ids(res2).sort()).toEqual([parentId, childId, otherRootId].sort()); // flat: all 3 are rows
    expect(await getProductsCount({ search: tag })).toBe(3);
  });

  test('getProductsCount agrees with getProducts under a warehouse-only filter', async () => {
    const wh = { warehouse: seeded.warehouseId };
    const count = await getProductsCount(wh);
    expect(count).toBe(2); // two roots; the child is not counted as its own row

    // Walk the pages: the number of ROOT rows must equal the count, so the
    // pagination controls never promise an empty or truncated trailing page.
    const roots = new Set<string>();
    for (let offset = 0; offset < count + 2; offset++) {
      const page = await getProducts(1, offset, wh);
      for (const p of page) if (p.parentId == null) roots.add(p.id);
    }
    expect(roots.size).toBe(count);
  });

  test('the bulk-price call shape (warehouse only, flat opt-out) returns a flat row list', async () => {
    // Eksakto nga shape sa use-bulk-price-update.ts: search kay undefined kung walay gi-type.
    const flatCall = { warehouse: seeded.warehouseId, search: undefined, flat: true };
    const res = await getProducts(500, 0, flatCall);
    expect(ids(res).sort()).toEqual([parentId, childId, otherRootId].sort()); // child is its own row
    // LIMIT nag-ihap ug rows, dili roots.
    expect(ids(await getProducts(2, 0, flatCall))).toHaveLength(2);
    expect(ids(await getProducts(3, 0, flatCall))).toHaveLength(3);
    // Kung wala ang opt-out, roll-up gihapon (default sa products page wala mausab).
    expect(ids(await getProducts(500, 0, { warehouse: seeded.warehouseId }))).toHaveLength(3);
    expect(ids(await getProducts(1, 0, { warehouse: seeded.warehouseId }))).toHaveLength(2);
  });

  test('flat: true also makes the count flat, in step with the page', async () => {
    const flatCall = { warehouse: seeded.warehouseId, flat: true };
    expect(await getProductsCount(flatCall)).toBe(3);
    expect(await getProductsCount({ warehouse: seeded.warehouseId })).toBe(2);
  });

  test('a warehouse filter COMBINED with a non-warehouse filter still flattens', async () => {
    const res = await getProducts(1, 0, { warehouse: seeded.warehouseId, search: tag });
    expect(res).toHaveLength(1); // flat: LIMIT 1 is one row, not a root + descendants
    const all = await getProducts(50, 0, { warehouse: seeded.warehouseId, search: tag });
    expect(ids(all).sort()).toEqual([parentId, childId, otherRootId].sort());
    expect(await getProductsCount({ warehouse: seeded.warehouseId, search: tag })).toBe(3);
  });

  test('a family whose child sits in a different warehouse than its root', async () => {
    const wh2 = await addWarehouseToBranch(seeded.branchId, { active: true });
    extraWarehouses.push(wh2);
    await testQuery('UPDATE products SET warehouse_id = ? WHERE id = ?', [wh2, childId]);

    // Root's warehouse: the child still rides along with its root (CTE ignores warehouse).
    const rootSide = await getProducts(1, 0, { warehouse: seeded.warehouseId });
    expect(ids(rootSide)).toEqual([parentId, childId]);

    // Child's warehouse, rolled up: the child has a parent_id so it is not a root row,
    // and its root is filtered out. It is invisible here. This pins that known edge so
    // a change is deliberate; fan-out copies never carry parent_id so it concerns only
    // pre-existing families.
    expect(ids(await getProducts(50, 0, { warehouse: wh2 }))).toEqual([]);
    expect(await getProductsCount({ warehouse: wh2 })).toBe(0);

    // Same warehouse with the flat opt-out: the child is visible as its own row.
    expect(ids(await getProducts(50, 0, { warehouse: wh2, flat: true }))).toEqual([childId]);
    expect(await getProductsCount({ warehouse: wh2, flat: true })).toBe(1);
  });

  test('the bulk price tool still passes the flat opt-out (it writes prices from that list)', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../app/(app)/inventory/pricing/use-bulk-price-update.ts'),
      'utf8'
    );
    const call = src.match(/getProducts\(500, 0, \{[^}]*\}\)/);
    expect(call, 'getProducts(500, 0, {...}) call not found').not.toBeNull();
    expect(call![0]).toContain('flat: true');
  });
});
