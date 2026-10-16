import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  grantPermission,
  setUserBranch,
  seedSaleOnTerminal,
  cleanupSale,
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
