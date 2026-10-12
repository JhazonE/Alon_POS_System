import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
} from './helpers/branches';

/**
 * Isolation kay gi-assert direkta batok sa API, dili pinaagi sa UI.
 * Gi-pamatuod nga ang branch kay server-derived: bisan mag-ilis ang client
 * sa gi-claim niyang branch, dili siya makakita sa laing branch.
 */
test.describe('GET /api/reports/inventory — branch isolation', () => {
  test('ang user sa branch A dili makakita sa produkto sa branch B', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const skuB = `ISO-B-${Date.now()}`;
      await seedProductInWarehouse(b.warehouseId, skuB);

      const res = await request.get(`/api/reports/inventory?uid=${a.userUid}&limit=200`);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const skus = (body.data ?? []).map((p: any) => p.sku);
      expect(skus).not.toContain(skuB);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('makakita ang user sa branch A sa kaugalingon niyang produkto', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const skuA = `ISO-A-${Date.now()}`;
      await seedProductInWarehouse(a.warehouseId, skuA);

      const res = await request.get(`/api/reports/inventory?uid=${a.userUid}&limit=200`);
      const body = await res.json();
      const skus = (body.data ?? []).map((p: any) => p.sku);
      expect(skus).toContain(skuA);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang warehouseId sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const res = await request.get(
        `/api/reports/inventory?uid=${a.userUid}&warehouseId=${b.warehouseId}`
      );
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang gi-pilit nga viewBranchId walay kalabutan kung walay all_branches', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const res = await request.get(
        `/api/reports/inventory?uid=${a.userUid}&viewBranchId=${b.branchId}`
      );
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});
