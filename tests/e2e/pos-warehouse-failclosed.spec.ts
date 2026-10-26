import { test, expect } from '@playwright/test';
import { MySqlProductRepository } from '../../src/infrastructure/repositories/MySqlProductRepository';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  seedProductInWarehouse,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * The POS filters its product list by the terminal's `location` column. A blank
 * or unresolvable location used to DROP the warehouse filter (truthiness check),
 * so search returned every warehouse's copy of every product. Since product
 * creation fans out same-sku copies, that is a correctness problem, not a
 * cosmetic one: a cashier could ring up a zero-stock duplicate.
 *
 * "No filter requested" (undefined / null) is not the same as "a filter that
 * did not resolve" ('', whitespace, a non-warehouse string, a non-string). The
 * latter must match NOTHING, in the list and in the count alike.
 */
test.describe('product repository warehouse filter fails closed', () => {
  const repo = new MySqlProductRepository();
  let branch: SeededBranch;
  let whA: string;
  let whB: string;
  let sku: string;

  const listSkuRows = async (warehouseId: any) =>
    (await repo.findAll(50, 0, { search: sku, warehouseId })).filter((p: any) => p.sku === sku);
  const countSku = (warehouseId: any) => repo.countAll({ search: sku, warehouseId });

  test.beforeEach(async () => {
    branch = await seedSecondBranch();
    whA = branch.warehouseId;
    whB = await addWarehouseToBranch(branch.branchId, { active: true });
    sku = `FC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // Same sku in two warehouses of one branch: exactly what fan-out produces.
    await seedProductInWarehouse(whA, sku);
    await seedProductInWarehouse(whB, sku);
  });

  test.afterEach(async () => {
    await testQuery('DELETE FROM products WHERE sku = ?', [sku]);
    await testQuery('DELETE FROM warehouses WHERE id = ?', [whB]);
    await cleanupSecondBranch(branch);
  });

  test('a blank warehouse filter does not return every warehouse copy', async () => {
    expect(await listSkuRows('')).toHaveLength(0);
    expect(await countSku('')).toBe(0);
  });

  test('an unresolvable warehouse id returns nothing rather than everything', async () => {
    // 'Store' is the literal default app/api/pos-terminals/route.ts writes.
    expect(await listSkuRows('Store')).toHaveLength(0);
    expect(await countSku('Store')).toBe(0);
  });

  test('a whitespace-only filter is blank, not a filter to drop', async () => {
    expect(await listSkuRows('   ')).toHaveLength(0);
    expect(await countSku('   ')).toBe(0);
  });

  test('a non-string filter fails closed instead of being read as absent or as a predicate', async () => {
    // pool.query escapes an OBJECT as `key` = value, which would be match-many.
    for (const bad of [{ id: 0 }, ['x'], 0, 7, true]) {
      expect(await listSkuRows(bad), `findAll(${JSON.stringify(bad)})`).toHaveLength(0);
      expect(await countSku(bad), `countAll(${JSON.stringify(bad)})`).toBe(0);
    }
  });

  test('an absent filter (undefined / null) still means no warehouse restriction', async () => {
    for (const absent of [undefined, null]) {
      expect(await listSkuRows(absent)).toHaveLength(2);
      expect(await countSku(absent)).toBe(2);
    }
  });

  test('a real warehouse id still scopes to exactly that warehouse', async () => {
    const rows = await listSkuRows(whA);
    expect(rows).toHaveLength(1);
    expect(rows[0].warehouseId).toBe(whA);
    expect(await countSku(whA)).toBe(1);
    expect(await countSku(whB)).toBe(1);
  });

  test('over HTTP, an explicit blank warehouseId returns nothing', async ({ request }) => {
    const blank = await request.get(`/api/products?warehouseId=&search=${sku}&limit=50`);
    const body = await blank.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);

    const absent = await request.get(`/api/products?search=${sku}&limit=50`);
    expect((await absent.json()).data).toHaveLength(2);
  });
});
