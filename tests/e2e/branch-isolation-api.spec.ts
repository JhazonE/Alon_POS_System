import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  seedSaleOnTerminal,
  cleanupSale,
  removeBranchWarehouses,
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

  test('mo-uli ug data ang tinuod nga uid, ug gi-403 kung walay uid', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const skuA = `ISO-UID-${Date.now()}`;
      await seedProductInWarehouse(a.warehouseId, skuA);

      const withUid = await request.get(`/api/reports/inventory?uid=${a.userUid}&limit=200`);
      expect(withUid.status()).toBe(200);
      const body = await withUid.json();
      expect(body.success).toBe(true);
      expect((body.data ?? []).map((p: any) => p.sku)).toContain(skuA);

      // Ang server kinahanglan mo-reject sa wala'y uid — dili mo-fallback.
      const noUid = await request.get('/api/reports/inventory?limit=200');
      expect(noUid.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});

// Mga endpoint nga gi-filter pinaagi sa warehouse (ang products/stock). Ang
// /api/products wala ra niini nga set: repository-backed ug naay write, mao
// nga sa Phase 2.
const WAREHOUSE_ENDPOINTS = [
  '/api/reports/cost-vs-retail',
  '/api/reports/velocity',
  '/api/reports/expiring-soon',
  '/api/reports/stats',
  '/api/inventory-batches',
  '/api/sales/by-product',
  '/api/sales/batch-analysis?startDate=2020-01-01&endDate=2030-01-01',
  '/api/sales/top-products',
  '/api/sales/monthly-category',
  '/api/sales/hourly',
  '/api/customers/invoices/outstanding',
  '/api/transactions/all-references',
  '/api/data-management/export/products',
];

// Mga endpoint nga gi-filter pinaagi sa terminal (ang sales / BIR).
const SALES_ENDPOINTS = [
  '/api/sales/voids-report',
  '/api/sales/bir-summary',
  '/api/reports/fiscal-year',
  '/api/pos/recent-sales',
  '/api/sales/ejournal?date=2026-01-01',
  '/api/sales/overall-reading?terminalId=all',
];

const withQuery = (endpoint: string, extra: string) =>
  `${endpoint}${endpoint.includes('?') ? '&' : '?'}${extra}`;

test.describe('branch isolation — dugang nga endpoints', () => {
  for (const endpoint of WAREHOUSE_ENDPOINTS) {
    test(`gi-403 ang cross-branch warehouseId sa ${endpoint}`, async ({ request }) => {
      const a = await seedSecondBranch();
      const b = await seedSecondBranch();
      try {
        const res = await request.get(
          withQuery(endpoint, `uid=${a.userUid}&warehouseId=${b.warehouseId}`)
        );
        expect(res.status()).toBe(403);
      } finally {
        await cleanupSecondBranch(b);
        await cleanupSecondBranch(a);
      }
    });
  }

  for (const endpoint of [...WAREHOUSE_ENDPOINTS, ...SALES_ENDPOINTS]) {
    test(`gi-403 ang ${endpoint} kung walay uid`, async ({ request }) => {
      const res = await request.get(endpoint);
      expect(res.status()).toBe(403);
    });
  }

  test('ang branch nga walay warehouse dili makakita ug produkto sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      await seedProductInWarehouse(b.warehouseId, `ISO-EMPTY-${Date.now()}`);
      await removeBranchWarehouses(a.branchId);

      // Ang [] kinahanglan mosumpay sa "walay mapili", dili sa "walay filter".
      const costVsRetail = await request.get(
        `/api/reports/cost-vs-retail?uid=${a.userUid}&limit=200`
      );
      expect(costVsRetail.status()).toBe(200);
      expect((await costVsRetail.json()).data).toEqual([]);

      const byProduct = await request.get(`/api/sales/by-product?uid=${a.userUid}`);
      expect(byProduct.status()).toBe(200);
      expect((await byProduct.json()).data).toEqual([]);

      const stats = await request.get(`/api/reports/stats?uid=${a.userUid}`);
      expect(stats.status()).toBe(200);
      expect((await stats.json()).summary.totalItems).toBe(0);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang sale sa branch B dili makita sa branch A, apan makita sa head office', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const saleB = await seedSaleOnTerminal(b.terminalId, b.userUid, { status: 'Voided' });
    const saleA = await seedSaleOnTerminal(a.terminalId, a.userUid, { status: 'Voided' });
    try {
      const countFor = async (uid: string) => {
        const res = await request.get(
          `/api/sales/voids-report?uid=${uid}&startDate=2020-01-01&endDate=2100-01-01`
        );
        expect(res.status()).toBe(200);
        const body = await res.json();
        return body.data.length as number;
      };

      // Ang branch A nakakita ra sa kaugalingon niyang 1 ka void; ang head
      // office (test-admin-uid, all_branches) nakakita sa duha (labaw pa).
      expect(await countFor(a.userUid)).toBe(1);
      expect(await countFor('test-admin-uid')).toBeGreaterThanOrEqual(2);
    } finally {
      await cleanupSale(saleA);
      await cleanupSale(saleB);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang terminalId sa laing branch sa overall-reading, e-journal ug recent-sales', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      for (const url of [
        `/api/sales/overall-reading?uid=${a.userUid}&terminalId=${b.terminalId}`,
        `/api/sales/ejournal?uid=${a.userUid}&date=2026-01-01&terminalId=${b.terminalId}`,
        `/api/pos/recent-sales?uid=${a.userUid}&terminalId=${b.terminalId}`,
      ]) {
        const res = await request.get(url);
        expect(res.status(), url).toBe(403);
      }
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  // Ang 403 tests dili mo-exercise sa SQL. Kini mo-dagan sa tinuod nga filtered
  // query para sa usa ka branch user ug sa head office, aron ang sayop nga
  // placeholder/param order mo-dayag isip 500 imbes na mahabilin nga tago.
  test('molampos (dili 500) ang tanang gi-filter nga endpoint para sa branch user ug head office', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const own = [
        // all-references dili apil: 500 na siya sa baseline (purchase_orders ug
        // stock_adjustments walay `reference` column) ug walay client.
        ...WAREHOUSE_ENDPOINTS.filter((e) => !e.includes('all-references')),
        ...SALES_ENDPOINTS,
        `/api/sales/overall-reading?terminalId=${a.terminalId}`,
        `/api/sales/ejournal?date=2026-01-01&terminalId=${a.terminalId}`,
        `/api/pos/recent-sales?terminalId=${a.terminalId}&query=x&dateFrom=2020-01-01&dateTo=2100-01-01`,
        '/api/sales/bir-summary?startDate=2020-01-01&endDate=2100-01-01',
        '/api/sales/by-product?terminalId=all&search=x&category=x&brand=x&cashier=x',
        // by-product?terminalId=<id> dili apil: 500 na siya sa baseline (JOIN users u ON pt.user_id = u.id; ang column kay uid).
        '/api/reports/velocity?type=none&startDate=2020-01-01&endDate=2100-01-01',
        '/api/reports/velocity?type=fast&startDate=2020-01-01&endDate=2100-01-01',
      ];
      for (const uid of [a.userUid, 'test-admin-uid']) {
        for (const endpoint of own) {
          const res = await request.get(withQuery(endpoint, `uid=${uid}`));
          expect(res.status(), `${uid} ${endpoint}`).toBe(200);
        }
        const missing = await request.get(`/api/customers/invoices/no-such-invoice?uid=${uid}`);
        expect(missing.status()).toBe(404);
      }
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office (all_branches) dili ma-403 sa mga gi-filter nga endpoint', async ({ request }) => {
    for (const endpoint of [
      '/api/reports/cost-vs-retail',
      '/api/reports/stats',
      '/api/sales/by-product',
      '/api/sales/bir-summary',
      '/api/reports/fiscal-year',
    ]) {
      const res = await request.get(withQuery(endpoint, 'uid=test-admin-uid'));
      expect(res.status(), endpoint).toBe(200);
    }
  });
});
