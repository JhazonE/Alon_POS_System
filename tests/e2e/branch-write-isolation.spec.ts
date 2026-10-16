import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  grantPermission,
  setUserBranch,
} from './helpers/branches';
import { ALL_BRANCHES_PERMISSION } from '../../lib/branch-context';

/**
 * Ang write kay gi-REJECT, dili gi-filter: ang caller mismo nag-ingon unsa
 * ang target, mao nga ang server mo-403 kung sakop sa laing branch.
 */
test.describe('POST /api/inventory/adjust/bulk — branch isolation', () => {
  test('gi-403 ang adjustment sa warehouse sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(b.warehouseId, `WI-${Date.now()}`);
      const res = await request.post('/api/inventory/adjust/bulk', {
        data: {
          uid: a.userUid,
          userId: a.userUid,
          warehouseId: b.warehouseId,
          adjustmentType: 'add',
          adjustments: [{ productId, quantity: 1, reason: 'test' }],
        },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang transfer nga ang TARGET warehouse sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-T-${Date.now()}`);
      const res = await request.post('/api/inventory/adjust/bulk', {
        data: {
          uid: a.userUid,
          userId: a.userUid,
          warehouseId: a.warehouseId,        // kaugalingon — OK
          targetWarehouseId: b.warehouseId,  // laing branch — dili OK
          adjustmentType: 'transfer',
          adjustments: [{ productId, quantity: 1, reason: 'test' }],
        },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang adjustment sa kaugalingong warehouse', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-OK-${Date.now()}`);
      const res = await request.post('/api/inventory/adjust/bulk', {
        data: {
          uid: a.userUid,
          userId: a.userUid,
          warehouseId: a.warehouseId,
          adjustmentType: 'add',
          adjustments: [{ productId, quantity: 1, reason: 'test' }],
        },
      });
      // Ang importante: DILI 403. Ang 400/500 gikan sa laing validation kay
      // lain nga isyu — pero kinahanglan dili ma-block sa branch check.
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office makasulod sa bisan unsang warehouse', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      await grantPermission(a.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(a.userUid, null);
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-HO-${Date.now()}`);
      const res = await request.post('/api/inventory/adjust/bulk', {
        data: {
          uid: a.userUid,
          userId: a.userUid,
          warehouseId: a.warehouseId,
          adjustmentType: 'add',
          adjustments: [{ productId, quantity: 1, reason: 'test' }],
        },
      });
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});
