import { test, expect } from '@playwright/test';
import { getProducts, getProductsCount } from '../../app/(app)/products/actions';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
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

  test.afterEach(async () => {
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
});
