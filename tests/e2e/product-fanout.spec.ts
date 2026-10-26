import { test, expect } from '@playwright/test';
import { fanoutTargetWarehouses } from '../../lib/product-create';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Pure nga tests — walay `page` fixture. Ang fan-out target kay mag-agad sa
 * branch; dili gyud mo-target ug warehouse sa laing branch.
 */
test.describe('fanoutTargetWarehouses', () => {
  const seededBranches: SeededBranch[] = [];
  const extraWarehouses: string[] = [];

  async function seed(): Promise<SeededBranch> {
    const b = await seedSecondBranch();
    seededBranches.push(b);
    return b;
  }

  async function addWarehouse(branchId: string, active: boolean): Promise<string> {
    const id = await addWarehouseToBranch(branchId, { active });
    extraWarehouses.push(id);
    return id;
  }

  test.afterEach(async () => {
    for (const id of extraWarehouses.splice(0)) {
      await testQuery('DELETE FROM warehouses WHERE id = ?', [id]);
    }
    for (const b of seededBranches.splice(0)) {
      await cleanupSecondBranch(b);
    }
  });

  test('branch scope targets only its own branch warehouses, excluding the selected one', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId, true);
    const targets = await fanoutTargetWarehouses(b.warehouseId, {
      scope: 'single',
      branchId: b.branchId,
    });
    expect(targets).toEqual([extra]);
    expect(targets).not.toContain(b.warehouseId);
  });

  test('null selected warehouse yields no targets', async () => {
    expect(await fanoutTargetWarehouses(null, { scope: 'all', branchId: null })).toEqual([]);
  });

  test('head office targets the selected warehouse branch only', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId, true);
    const targets = await fanoutTargetWarehouses(b.warehouseId, { scope: 'all', branchId: null });
    expect(targets.sort()).toEqual([extra].sort()); // nothing from the main branch
  });

  test('null scope behaves as head office', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId, true);
    expect(await fanoutTargetWarehouses(b.warehouseId, null)).toEqual([extra]);
  });

  test('inactive warehouses are not targets', async () => {
    const b = await seed();
    await addWarehouse(b.branchId, false);
    expect(
      await fanoutTargetWarehouses(b.warehouseId, { scope: 'single', branchId: b.branchId })
    ).toEqual([]);
  });

  test('a branch with one active warehouse yields no targets', async () => {
    const b = await seed();
    expect(
      await fanoutTargetWarehouses(b.warehouseId, { scope: 'single', branchId: b.branchId })
    ).toEqual([]);
  });
});
