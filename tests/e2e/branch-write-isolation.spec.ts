import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  grantPermission,
  setUserBranch,
  seedSaleOnTerminal,
  cleanupSale,
  removeBranchWarehouses,
  readPosTransactionBranch,
  cleanupPosTransaction,
} from './helpers/branches';
import { ALL_BRANCHES_PERMISSION } from '../../lib/branch-context';
import { testQuery } from './helpers/db';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
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

test.describe('POST /api/stock-adjustments — branch isolation', () => {
  test('gi-403 ang adjustment sa produkto sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(b.warehouseId, `WI-SA-${Date.now()}`);
      const res = await request.post('/api/stock-adjustments', {
        data: { uid: a.userUid, productId, quantity: 1, reason: 'branch isolation test' },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang adjustment sa kaugalingong produkto', async ({ request }) => {
    const a = await seedSecondBranch();
    let productId: string | undefined;
    try {
      productId = await seedProductInWarehouse(a.warehouseId, `WI-SA-OK-${Date.now()}`);
      const res = await request.post('/api/stock-adjustments', {
        data: { uid: a.userUid, productId, quantity: 1, reason: 'branch isolation test' },
      });
      // res.ok() dili not-403: ang 500 dili motugot nga molampos kini.
      expect(res.ok()).toBe(true);
    } finally {
      // Ang adjustment nagsulat ug rows nga nagtudlo sa produkto; limpyohi
      // sila una aron walay mabilin human sa cleanup sa branch.
      if (productId) {
        await testQuery('DELETE FROM stock_adjustments WHERE product_id = ?', [productId]);
        await testQuery('DELETE FROM stock_movements WHERE product_id = ?', [productId]);
        await testQuery('DELETE FROM inventory_batches WHERE product_id = ?', [productId]);
      }
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang adjustment nga walay uid', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `WI-SA-NU-${Date.now()}`);
      const res = await request.post('/api/stock-adjustments', {
        data: { productId, quantity: 1, reason: 'branch isolation test' },
      });
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});

// ---------------------------------------------------------------------------
// Invoice ug order document writes. Ang branch sa matag dokumento:
//   sales order            -> sales_orders.warehouse_id -> warehouses.branch_id
//   invoice gikan sa order -> sales_invoices.sales_order_id -> ang order sa ibabaw
//   invoice gikan sa POS   -> sales_invoices.reference = sales_transactions.reference
//                             -> sales_transactions.branch_id
// (Ang sales_invoices walay kaugalingong branch_id ni warehouse_id.)
// ---------------------------------------------------------------------------

/** Mo-seed ug sales order sa usa ka warehouse (direkta sa DB). Ibalik ang id. */
async function seedOrderInWarehouse(
  warehouseId: string | null,
  status: 'Pending' | 'Delivered' | 'Invoiced' = 'Pending'
): Promise<string> {
  const id = `SO-ISO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await testQuery(
    `INSERT INTO sales_orders (id, customer_id, order_date, total, warehouse_id, status, reference)
     VALUES (?, ?, CURDATE(), 0, ?, ?, ?)`,
    [id, SO_CUSTOMER.id, warehouseId, status, `ISO-${id.slice(-12)}`]
  );
  return id;
}

/** Mo-seed ug invoice nga gikan sa usa ka order. */
async function seedInvoiceForOrder(orderId: string): Promise<string> {
  const id = `INV-ISO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await testQuery(
    `INSERT INTO sales_invoices (id, reference, sales_order_id, customer_id, invoice_date, total, status)
     VALUES (?, ?, ?, ?, CURDATE(), 0, 'Pending')`,
    [id, `ISO-${id.slice(-12)}`, orderId, SO_CUSTOMER.id]
  );
  return id;
}

/** Mo-seed ug POS-style invoice: managsama ang reference sa sale, walay order. */
async function seedInvoiceForSale(saleId: string): Promise<string> {
  const id = `INV-ISO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await testQuery(
    `INSERT INTO sales_invoices (id, reference, customer_id, invoice_date, total, status, transaction_source)
     SELECT ?, reference, NULL, CURDATE(), 0, 'Paid', 'POS' FROM sales_transactions WHERE id = ?`,
    [id, saleId]
  );
  return id;
}

async function invoiceStatus(invoiceId: string): Promise<string | undefined> {
  const rows: any = await testQuery('SELECT status FROM sales_invoices WHERE id = ?', [invoiceId]);
  return rows[0]?.status;
}

async function orderRow(orderId: string): Promise<any | undefined> {
  const rows: any = await testQuery('SELECT status, warehouse_id, note FROM sales_orders WHERE id = ?', [orderId]);
  return rows[0];
}

async function cleanupDocs(opts: { invoiceIds?: string[]; orderIds?: string[]; saleIds?: string[] }) {
  for (const id of opts.invoiceIds ?? []) {
    await testQuery('DELETE FROM sales_invoice_items WHERE sales_invoice_id = ?', [id]);
    await testQuery('DELETE FROM sales_invoices WHERE id = ?', [id]);
  }
  for (const id of opts.orderIds ?? []) {
    await testQuery('DELETE FROM sales_order_items WHERE sales_order_id = ?', [id]);
    await testQuery('DELETE FROM sales_orders WHERE id = ?', [id]);
  }
  for (const id of opts.saleIds ?? []) await cleanupSale(id);
}

/** Tinuod nga body para sa PUT /api/sales/orders/[id] (gikan sa route mismo). */
function putBody(uid: string | undefined, extra: Record<string, any> = {}) {
  return {
    ...(uid ? { uid } : {}),
    customer: { id: SO_CUSTOMER.id, name: SO_CUSTOMER.name },
    orderDate: '2026-07-23',
    deliveryDate: '2026-07-23',
    paymentMethod: 'CASH',
    status: 'Pending',
    note: 'edited',
    items: [{ product: { id: SO_PRODUCT.id, name: SO_PRODUCT.name }, quantity: 1, price: SO_PRODUCT.price }],
    ...extra,
  };
}

test.describe('document writes — branch isolation', () => {
  test('gi-403 ang void sa invoice (gikan sa order) sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    const invoiceIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId, 'Invoiced');
      orderIds.push(orderId);
      const invoiceId = await seedInvoiceForOrder(orderId);
      invoiceIds.push(invoiceId);
      const res = await request.post(`/api/sales/invoices/${invoiceId}/void`, {
        data: { uid: a.userUid, voidReason: 'test' },
      });
      expect(res.status()).toBe(403);
      // Wala gyud ma-void ang invoice sa laing branch.
      expect(await invoiceStatus(invoiceId)).toBe('Pending');
    } finally {
      await cleanupDocs({ invoiceIds, orderIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang void sa POS invoice sa laing branch (pinaagi sa sale)', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const saleIds: string[] = [];
    const invoiceIds: string[] = [];
    try {
      const saleId = await seedSaleOnTerminal(b.terminalId, b.userUid);
      saleIds.push(saleId);
      const invoiceId = await seedInvoiceForSale(saleId);
      invoiceIds.push(invoiceId);
      const res = await request.post(`/api/sales/invoices/${invoiceId}/void`, {
        data: { uid: a.userUid, voidReason: 'test' },
      });
      expect(res.status()).toBe(403);
      expect(await invoiceStatus(invoiceId)).toBe('Paid');
    } finally {
      await cleanupDocs({ invoiceIds, saleIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-403 ang void sa kaugalingong invoice', async ({ request }) => {
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    const invoiceIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId, 'Invoiced');
      orderIds.push(orderId);
      const invoiceId = await seedInvoiceForOrder(orderId);
      invoiceIds.push(invoiceId);
      const res = await request.post(`/api/sales/invoices/${invoiceId}/void`, {
        data: { uid: b.userUid, voidReason: 'test' },
      });
      expect(res.status()).not.toBe(403);
    } finally {
      await cleanupDocs({ invoiceIds, orderIds });
      await cleanupSecondBranch(b);
    }
  });

  test('gi-403 ang paghimo ug invoice gikan sa order sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId, 'Delivered');
      orderIds.push(orderId);
      const res = await request.post('/api/sales/invoices', {
        data: { uid: a.userUid, orderId },
      });
      expect(res.status()).toBe(403);
      // Wala himoa ang invoice ug wala mausab ang status sa order.
      const made: any = await testQuery('SELECT COUNT(*) c FROM sales_invoices WHERE sales_order_id = ?', [orderId]);
      expect(Number(made[0].c)).toBe(0);
      expect((await orderRow(orderId)).status).toBe('Delivered');
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang paghimo ug invoice gikan sa kaugalingong order', async ({ request }) => {
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    let invoiceIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId, 'Delivered');
      orderIds.push(orderId);
      const res = await request.post('/api/sales/invoices', {
        data: { uid: b.userUid, orderId },
      });
      const body = await res.json();
      expect(res.ok(), `create invoice failed: ${JSON.stringify(body)}`).toBe(true);
      invoiceIds = [body.data.id];
      expect((await orderRow(orderId)).status).toBe('Invoiced');
    } finally {
      await cleanupDocs({ invoiceIds, orderIds });
      await cleanupSecondBranch(b);
    }
  });

  test('gi-403 ang pag-edit sa order sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId);
      orderIds.push(orderId);
      const res = await request.put(`/api/sales/orders/${orderId}`, {
        data: putBody(a.userUid, { warehouse: b.warehouseId }),
      });
      expect(res.status()).toBe(403);
      expect((await orderRow(orderId)).note).toBeNull();
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang pag-edit sa kaugalingong order padulong sa warehouse sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(a.warehouseId);
      orderIds.push(orderId);
      const res = await request.put(`/api/sales/orders/${orderId}`, {
        data: putBody(a.userUid, { warehouse: b.warehouseId }),
      });
      expect(res.status()).toBe(403);
      // Naa gihapon ang order sa warehouse ni A.
      expect((await orderRow(orderId)).warehouse_id).toBe(a.warehouseId);
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang pag-edit sa kaugalingong order', async ({ request }) => {
    const a = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(a.warehouseId);
      orderIds.push(orderId);
      const res = await request.put(`/api/sales/orders/${orderId}`, {
        data: putBody(a.userUid, { warehouse: a.warehouseId }),
      });
      const body = await res.json();
      expect(res.ok(), `edit failed: ${JSON.stringify(body)}`).toBe(true);
      expect((await orderRow(orderId)).note).toBe('edited');
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang pag-delete sa order sa laing branch (uid sa query string)', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId);
      orderIds.push(orderId);
      const res = await request.delete(`/api/sales/orders/${orderId}?uid=${a.userUid}`);
      expect(res.status()).toBe(403);
      // Naa pa ang order.
      expect(await orderRow(orderId)).toBeDefined();
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang pag-delete sa kaugalingong order', async ({ request }) => {
    const a = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(a.warehouseId);
      orderIds.push(orderId);
      const res = await request.delete(`/api/sales/orders/${orderId}?uid=${a.userUid}`);
      expect(res.ok()).toBe(true);
      expect(await orderRow(orderId)).toBeUndefined();
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang delivery sa order sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId);
      orderIds.push(orderId);
      const res = await request.post(`/api/sales/orders/${orderId}/deliver`, {
        data: { uid: a.userUid },
      });
      expect(res.status()).toBe(403);
      expect((await orderRow(orderId)).status).toBe('Pending');
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang delivery sa kaugalingong order', async ({ request }) => {
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId);
      orderIds.push(orderId);
      const res = await request.post(`/api/sales/orders/${orderId}/deliver`, {
        data: { uid: b.userUid },
      });
      const body = await res.json();
      expect(res.ok(), `deliver failed: ${JSON.stringify(body)}`).toBe(true);
      expect((await orderRow(orderId)).status).toBe('Delivered');
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(b);
    }
  });

  test('ang head office (test-admin-uid) makahimo sa order sa bisan unsang branch', async ({ request }) => {
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId);
      orderIds.push(orderId);
      const res = await request.post(`/api/sales/orders/${orderId}/deliver`, {
        data: { uid: 'test-admin-uid' },
      });
      expect(res.ok()).toBe(true);
      expect((await orderRow(orderId)).status).toBe('Delivered');
    } finally {
      await cleanupDocs({ orderIds });
      await cleanupSecondBranch(b);
    }
  });

  test('gi-403 ang tanang lima ka handlers kung walay uid', async ({ request }) => {
    const b = await seedSecondBranch();
    const orderIds: string[] = [];
    const invoiceIds: string[] = [];
    try {
      const orderId = await seedOrderInWarehouse(b.warehouseId);
      orderIds.push(orderId);
      const invoiceOrderId = await seedOrderInWarehouse(b.warehouseId, 'Delivered');
      orderIds.push(invoiceOrderId);
      const invoiceId = await seedInvoiceForOrder(invoiceOrderId);
      invoiceIds.push(invoiceId);

      const responses = {
        create: await request.post('/api/sales/invoices', { data: { orderId: invoiceOrderId } }),
        void: await request.post(`/api/sales/invoices/${invoiceId}/void`, { data: {} }),
        put: await request.put(`/api/sales/orders/${orderId}`, { data: putBody(undefined) }),
        del: await request.delete(`/api/sales/orders/${orderId}`),
        deliver: await request.post(`/api/sales/orders/${orderId}/deliver`, { data: {} }),
      };
      for (const [name, res] of Object.entries(responses)) {
        expect(res.status(), `${name} should refuse a missing uid`).toBe(403);
      }
      // Wala gyud ma-ilisan ang bisan unsa.
      expect((await orderRow(orderId)).status).toBe('Pending');
      expect(await invoiceStatus(invoiceId)).toBe('Pending');
    } finally {
      await cleanupDocs({ invoiceIds, orderIds });
      await cleanupSecondBranch(b);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 6: pos/void-transaction, sales (use case), importer, pos-transactions
// ---------------------------------------------------------------------------

async function saleStatus(saleId: string): Promise<string | undefined> {
  const rows: any = await testQuery('SELECT status FROM sales_transactions WHERE id = ?', [saleId]);
  return rows[0]?.status;
}

test.describe('POST /api/pos/void-transaction — branch isolation', () => {
  test('gi-403 ang pag-void sa sale sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const saleIds: string[] = [];
    try {
      const saleId = await seedSaleOnTerminal(b.terminalId, b.userUid);
      saleIds.push(saleId);
      const res = await request.post('/api/pos/void-transaction', {
        data: { saleId, voidReason: 'cross-branch', voidedByUserId: a.userUid, voidedByName: 'A' },
      });
      expect(res.status()).toBe(403);
      expect(await saleStatus(saleId)).toBe('Paid');
    } finally {
      await cleanupDocs({ saleIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang pag-void sa kaugalingong sale', async ({ request }) => {
    const a = await seedSecondBranch();
    const saleIds: string[] = [];
    try {
      const saleId = await seedSaleOnTerminal(a.terminalId, a.userUid);
      saleIds.push(saleId);
      const res = await request.post('/api/pos/void-transaction', {
        data: { saleId, voidReason: 'same-branch', voidedByUserId: a.userUid, voidedByName: 'A' },
      });
      const body = await res.json();
      expect(res.ok(), JSON.stringify(body)).toBe(true);
      expect(await saleStatus(saleId)).toBe('Voided');
    } finally {
      await cleanupDocs({ saleIds });
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office makapa-void sa sale sa bisan unsang branch', async ({ request }) => {
    const b = await seedSecondBranch();
    const saleIds: string[] = [];
    try {
      const saleId = await seedSaleOnTerminal(b.terminalId, b.userUid);
      saleIds.push(saleId);
      const res = await request.post('/api/pos/void-transaction', {
        data: { saleId, voidReason: 'head office', voidedByUserId: 'test-admin-uid' },
      });
      expect(res.ok()).toBe(true);
      expect(await saleStatus(saleId)).toBe('Voided');
    } finally {
      await cleanupDocs({ saleIds });
      await cleanupSecondBranch(b);
    }
  });

  test('gi-403 ang pag-void kung walay voidedByUserId o uid', async ({ request }) => {
    const b = await seedSecondBranch();
    const saleIds: string[] = [];
    try {
      const saleId = await seedSaleOnTerminal(b.terminalId, b.userUid);
      saleIds.push(saleId);
      const res = await request.post('/api/pos/void-transaction', {
        data: { saleId, voidReason: 'no user' },
      });
      expect(res.status()).toBe(403);
      expect(await saleStatus(saleId)).toBe('Paid');
    } finally {
      await cleanupDocs({ saleIds });
      await cleanupSecondBranch(b);
    }
  });
});

/** Tinuod nga body para sa POST /api/sales (CreateSaleUseCase). */
function salesBody(uid: string | undefined, productId: string, extra: Record<string, any> = {}) {
  return {
    ...(uid ? { uid } : {}),
    customer: { id: SO_CUSTOMER.id, name: SO_CUSTOMER.name },
    invoiceDate: '2026-10-16',
    reference: `ISO-S-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    paymentMethod: 'CASH',
    status: 'Pending',
    items: [{ product: { id: productId, name: 'Isolation Product' }, price: 1, quantity: 1 }],
    ...extra,
  };
}

async function productStock(productId: string): Promise<number> {
  const rows: any = await testQuery('SELECT stock FROM products WHERE id = ?', [productId]);
  return Number(rows[0]?.stock);
}

test.describe('POST /api/sales — branch isolation (CreateSaleUseCase)', () => {
  test('gi-403 ang invoice nga ang produkto naa sa warehouse sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const invoiceIds: string[] = [];
    try {
      const productId = await seedProductInWarehouse(b.warehouseId, `SL-X-${Date.now()}`);
      const body = salesBody(a.userUid, productId);
      const res = await request.post('/api/sales', { data: body });
      expect(res.status()).toBe(403);
      // Wala nawad-an ug stock ug wala matunga ang invoice.
      expect(await productStock(productId)).toBe(10);
      const made: any = await testQuery('SELECT id FROM sales_invoices WHERE reference = ?', [body.reference]);
      invoiceIds.push(...made.map((r: any) => r.id));
      expect(made).toHaveLength(0);
    } finally {
      await cleanupDocs({ invoiceIds });
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang invoice sa produkto sa kaugalingong warehouse', async ({ request }) => {
    const a = await seedSecondBranch();
    const invoiceIds: string[] = [];
    try {
      const productId = await seedProductInWarehouse(a.warehouseId, `SL-OK-${Date.now()}`);
      const res = await request.post('/api/sales', { data: salesBody(a.userUid, productId) });
      const body = await res.json();
      expect(res.ok(), JSON.stringify(body)).toBe(true);
      invoiceIds.push(body.data.id);
      expect(await productStock(productId)).toBe(9);
    } finally {
      await cleanupDocs({ invoiceIds });
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office makahimo ug invoice sa produkto sa bisan unsang branch', async ({ request }) => {
    const b = await seedSecondBranch();
    const invoiceIds: string[] = [];
    try {
      const productId = await seedProductInWarehouse(b.warehouseId, `SL-HO-${Date.now()}`);
      const res = await request.post('/api/sales', { data: salesBody('test-admin-uid', productId) });
      const body = await res.json();
      expect(res.ok(), JSON.stringify(body)).toBe(true);
      invoiceIds.push(body.data.id);
      expect(await productStock(productId)).toBe(9);
    } finally {
      await cleanupDocs({ invoiceIds });
      await cleanupSecondBranch(b);
    }
  });

  test('gi-403 ang invoice kung walay uid', async ({ request }) => {
    const b = await seedSecondBranch();
    try {
      const productId = await seedProductInWarehouse(b.warehouseId, `SL-NU-${Date.now()}`);
      const res = await request.post('/api/sales', { data: salesBody(undefined, productId) });
      expect(res.status()).toBe(403);
      expect(await productStock(productId)).toBe(10);
    } finally {
      await cleanupSecondBranch(b);
    }
  });
});

const IMPORT_URL = '/api/data-management/import/products';

function importRow(name: string, extra: Record<string, any> = {}) {
  return { name, selling_price: '5', cost_price: '3', stock_quantity: '0', ...extra };
}

async function productByName(name: string): Promise<any | undefined> {
  const rows: any = await testQuery('SELECT id, warehouse_id, price FROM products WHERE name = ?', [name]);
  return rows[0];
}

async function deleteProductsByName(...names: string[]) {
  for (const n of names) await testQuery('DELETE FROM products WHERE name = ?', [n]);
}

test.describe('POST /api/data-management/import/products — branch warehouse (D6)', () => {
  test('ang produkto nga gi-import ni A mo-landing sa warehouse sa branch ni A', async ({ request }) => {
    const a = await seedSecondBranch();
    const name = `IMP-A-${Date.now()}`;
    try {
      const res = await request.post(IMPORT_URL, { data: { uid: a.userUid, rows: [importRow(name)] } });
      const body = await res.json();
      expect(res.ok(), JSON.stringify(body)).toBe(true);
      expect(body.added).toBe(1);
      expect((await productByName(name))?.warehouse_id).toBe(a.warehouseId);
    } finally {
      await deleteProductsByName(name);
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office nagpabilin sa global nga default warehouse', async ({ request }) => {
    const name = `IMP-HO-${Date.now()}`;
    try {
      const [expected]: any = await testQuery(
        `SELECT id FROM warehouses WHERE is_active = 1
         ORDER BY is_main DESC, (id = 'wh_main') DESC, created_at ASC LIMIT 1`
      );
      const res = await request.post(IMPORT_URL, { data: { uid: 'test-admin-uid', rows: [importRow(name)] } });
      expect(res.ok()).toBe(true);
      expect((await productByName(name))?.warehouse_id).toBe(expected.id);
    } finally {
      await deleteProductsByName(name);
    }
  });

  test('gi-403 ang import kung walay uid, ug walay produkto nga na-himo', async ({ request }) => {
    const name = `IMP-NU-${Date.now()}`;
    try {
      const res = await request.post(IMPORT_URL, { data: { rows: [importRow(name)] } });
      expect(res.status()).toBe(403);
      expect(await productByName(name)).toBeUndefined();
    } finally {
      await deleteProductsByName(name);
    }
  });

  test('gi-409 ang import sa branch nga walay active nga warehouse (dili unassigned)', async ({ request }) => {
    const a = await seedSecondBranch();
    const name = `IMP-NW-${Date.now()}`;
    try {
      await removeBranchWarehouses(a.branchId);
      const res = await request.post(IMPORT_URL, { data: { uid: a.userUid, rows: [importRow(name)] } });
      expect(res.status()).toBe(409);
      expect(await productByName(name)).toBeUndefined();
    } finally {
      await deleteProductsByName(name);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-usab ang produkto sa laing branch nga parehas ug ngalan', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const name = `IMP-DUP-${Date.now()}`;
    try {
      const otherId = await seedProductInWarehouse(b.warehouseId, `IMP-DUP-SKU-${Date.now()}`);
      await testQuery('UPDATE products SET name = ?, price = 1.00 WHERE id = ?', [name, otherId]);
      const res = await request.post(IMPORT_URL, {
        data: { uid: a.userUid, rows: [importRow(name, { selling_price: '99' })] },
      });
      expect(res.ok()).toBe(true);
      const rows: any = await testQuery('SELECT warehouse_id, price FROM products WHERE id = ?', [otherId]);
      expect(Number(rows[0].price)).toBe(1);
      expect(rows[0].warehouse_id).toBe(b.warehouseId);
    } finally {
      await deleteProductsByName(name);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('POST /api/pos-transactions — sale branch wins over terminal (D7)', () => {
  test('ang row mo-takig branch sa sale, dili sa terminal nga nagkontra', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    let saleId: string | undefined;
    let posTransId: string | undefined;
    try {
      saleId = await seedSaleOnTerminal(a.terminalId, a.userUid);
      const res = await request.post('/api/pos-transactions', {
        data: {
          saleId,
          userId: a.userUid,
          terminalId: b.terminalId, // laing branch kaysa sale
          subtotal: 1.0,
          totalAmount: 1.0,
          paymentMethod: 'Cash',
        },
      });
      const body = await res.json();
      posTransId = body.data?.id;
      expect(res.ok(), JSON.stringify(body)).toBe(true);
      expect(await readPosTransactionBranch(String(posTransId))).toBe(a.branchId);
    } finally {
      if (posTransId) await cleanupPosTransaction(posTransId);
      if (saleId) await cleanupSale(saleId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

// Ang multipart (legacy) nga importer — kini ang dalan nga gigamit sa Settings
// uploader. Parehas nga SKU mahimong naa sa daghang branch (unique key kay
// (sku, warehouse_id)), mao nga ang UPDATE dili pwede mag-target sa sku ra.
test.describe('POST /api/data-management/import/products (multipart) — branch isolation', () => {
  test('dili ma-usab ang produkto sa laing branch nga parehas ug SKU', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const sku = `IMP-LEG-${Date.now()}`;
    try {
      const aId = await seedProductInWarehouse(a.warehouseId, sku);
      const bId = await seedProductInWarehouse(b.warehouseId, sku);
      await testQuery('UPDATE products SET name = ?, cost = 2.00, price = 3.00, stock = 10 WHERE id = ?', ['Legacy B Original', bId]);

      const csv =
        'name,sku,cost_price,selling_price,stock_quantity\n' +
        `Legacy A Updated,${sku},40,50,77\n`;
      const res = await request.post(`/api/data-management/import/products?uid=${a.userUid}`, {
        multipart: { file: { name: 'products.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) } },
      });
      const body = await res.json();
      expect(res.ok(), JSON.stringify(body)).toBe(true);
      expect(body.message).toContain('Updated: 1');

      const aRow: any = (await testQuery('SELECT name, cost, price, stock FROM products WHERE id = ?', [aId]) as any)[0];
      expect(aRow.name).toBe('Legacy A Updated');
      expect(Number(aRow.price)).toBe(50);
      expect(Number(aRow.stock)).toBe(77);

      // Ang branch B walay nausab: ngalan, cost, price ug stock.
      const bRow: any = (await testQuery('SELECT name, cost, price, stock FROM products WHERE id = ?', [bId]) as any)[0];
      expect(bRow.name).toBe('Legacy B Original');
      expect(Number(bRow.cost)).toBe(2);
      expect(Number(bRow.price)).toBe(3);
      expect(Number(bRow.stock)).toBe(10);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

/**
 * Page-level: ang server-contract tests sa taas dili makakita kung ang CLIENT
 * mawad-an sa iyang `appendSessionUid` / `getSessionUid` call (mo-agi ra gihapon
 * kay ang test mismo ang naghatag ug uid). Dinhi ang tinuod nga page ang
 * mo-drive, ug ang outgoing request ang gi-assert.
 */
test.describe('page-level — ang client mo-apil sa session uid sa write request', () => {
  async function createPendingOrder(request: any): Promise<{ id: string; reference: string }> {
    const res = await request.post('/api/sales/orders', {
      data: {
        uid: 'test-admin-uid',
        customer: { id: SO_CUSTOMER.id, name: SO_CUSTOMER.name },
        orderDate: '2026-07-23',
        deliveryDate: '2026-07-23',
        paymentMethod: 'CASH',
        status: 'Pending',
        items: [{ product: { id: SO_PRODUCT.id, name: SO_PRODUCT.name }, quantity: 1, price: SO_PRODUCT.price }],
      },
    });
    const body = await res.json();
    expect(body.success, `create failed: ${JSON.stringify(body)}`).toBe(true);
    const rows: any = await testQuery('SELECT reference FROM sales_orders WHERE id = ?', [body.data.id]);
    return { id: body.data.id as string, reference: rows[0].reference as string };
  }

  /** I-search ang order sa /sales/orders ug ablihi ang row actions menu niini. */
  async function openRowMenu(page: any, reference: string) {
    await page.goto('/sales/orders');
    await page.getByPlaceholder('Search orders...').fill(reference);
    const row = page.getByRole('row').filter({ hasText: reference });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole('button', { name: 'Open menu' }).click();
  }

  test('ang "Cancel Order" sa /sales/orders mo-DELETE nga naay ?uid= gikan sa session', async ({ page, request }) => {
    await seedSession(page);
    const order = await createPendingOrder(request);
    try {
      const seen: { method: string; url: string }[] = [];
      await page.route('**/api/sales/orders/*', async (route) => {
        const req = route.request();
        if (req.method() === 'DELETE') seen.push({ method: req.method(), url: req.url() });
        await route.continue();
      });

      await openRowMenu(page, order.reference);
      await page.getByRole('menuitem', { name: 'Cancel Order' }).click();
      const respPromise = page.waitForResponse(
        (r) => r.request().method() === 'DELETE' && r.url().includes(`/api/sales/orders/${order.id}`),
      );
      await page.getByRole('button', { name: 'Cancel Order' }).click();
      const resp = await respPromise;

      expect(seen).toHaveLength(1);
      expect(new URL(seen[0].url).searchParams.get('uid')).toBe(DEFAULT_ADMIN.uid);
      // Ang uid gidawat sa server — dili 403 — mao nga nawala ang order.
      expect(resp.status()).toBe(200);
      const rows: any = await testQuery('SELECT id FROM sales_orders WHERE id = ?', [order.id]);
      expect(rows).toHaveLength(0);
    } finally {
      await request.delete(`/api/sales/orders/${order.id}?uid=test-admin-uid`).catch(() => {});
    }
  });

  test('ang "Make Delivery" sa /sales/orders mo-POST nga naay "uid" sa body gikan sa session', async ({ page, request }) => {
    await seedSession(page);
    const order = await createPendingOrder(request);
    try {
      const seen: string[] = [];
      // Gi-stub ang response aron dili ma-deduct ang stock sa shared fixture;
      // ang gi-assert ra kay unsay gipadala sa client.
      await page.route(`**/api/sales/orders/${order.id}/deliver`, async (route) => {
        seen.push(route.request().postData() ?? '');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
      });

      await openRowMenu(page, order.reference);
      await page.getByRole('menuitem', { name: 'Make Delivery' }).click();
      await expect.poll(() => seen.length).toBe(1);

      expect(JSON.parse(seen[0]).uid).toBe(DEFAULT_ADMIN.uid);
    } finally {
      await request.delete(`/api/sales/orders/${order.id}?uid=test-admin-uid`).catch(() => {});
    }
  });
});
