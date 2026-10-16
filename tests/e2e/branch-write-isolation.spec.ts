import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  grantPermission,
  setUserBranch,
} from './helpers/branches';
import { ALL_BRANCHES_PERMISSION } from '../../lib/branch-context';
import { testQuery } from './helpers/db';
import { SO_CUSTOMER, SO_PRODUCT } from './fixtures/test-data';

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

/**
 * Ang `warehouse` field (dili `warehouseId`) sa sales/orders POST.
 */
test.describe('POST /api/sales/orders — branch isolation', () => {
  const orderBody = (uid: string, warehouse: string) => ({
    uid,
    customer: { id: SO_CUSTOMER.id, name: SO_CUSTOMER.name },
    orderDate: '2026-07-23',
    deliveryDate: '2026-07-23',
    paymentMethod: 'CASH',
    status: 'Pending',
    warehouse,
    items: [
      {
        product: { id: SO_PRODUCT.id, name: SO_PRODUCT.name },
        quantity: 1,
        price: SO_PRODUCT.price,
      },
    ],
  });

  test('gi-403 ang order nga ang warehouse sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const res = await request.post('/api/sales/orders', {
        data: orderBody(a.userUid, b.warehouseId),
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang order sa kaugalingong warehouse', async ({ request }) => {
    const a = await seedSecondBranch();
    let orderId: string | undefined;
    try {
      const res = await request.post('/api/sales/orders', {
        data: orderBody(a.userUid, a.warehouseId),
      });
      // Ang importante: DILI 403. Ang laing validation kay lain nga isyu.
      expect(res.status()).not.toBe(403);
      const json = await res.json().catch(() => null);
      orderId = json?.data?.id;
    } finally {
      // Limpyohi ang order aron dili mabilin ang row nga nagtudlo sa
      // warehouse nga gi-delete sa cleanup.
      if (orderId) {
        await testQuery('DELETE FROM sales_order_items WHERE sales_order_id = ?', [orderId]);
        await testQuery('DELETE FROM sales_orders WHERE id = ?', [orderId]);
      }
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('POST /api/sales/z-reading — branch isolation', () => {
  test('gi-403 ang Z-reading sa terminal sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const res = await request.post('/api/sales/z-reading', {
        data: { uid: a.userUid, terminalId: b.terminalId, cashierName: 'Test' },
      });
      // Ang Z-reading kay BIR filing — dili pwede mo-file para sa laing
      // establishment.
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-403 ang Z-reading sa kaugalingong terminal', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const res = await request.post('/api/sales/z-reading', {
        data: { uid: a.userUid, terminalId: a.terminalId, cashierName: 'Test' },
      });
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('uid-required write routes — branch isolation', () => {
  test('gi-403 ang PATCH sa produkto sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(b.warehouseId, `WI-P-${Date.now()}`);
      const res = await request.patch(`/api/products/${productId}`, {
        data: { uid: a.userUid, price: 99 },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-403 ang PATCH sa kaugalingong produkto', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-P-OK-${Date.now()}`);
      const res = await request.patch(`/api/products/${productId}`, {
        data: { uid: a.userUid, price: 99 },
      });
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang PATCH nga walay uid', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-P-NU-${Date.now()}`);
      const res = await request.patch(`/api/products/${productId}`, {
        data: { price: 99 },
      });
      // Walay uid = walay ma-resolve nga branch. Mo-fail closed.
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});
