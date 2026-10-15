import { test, expect } from '@playwright/test';
import { getNextSINumber, getNextMCNumber, getNextBirOrNumber } from '../../lib/mysql';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  insertRawSale,
  cleanupRawSales,
} from './helpers/branches';

/**
 * Pure nga tests — walay `page` fixture. Kada branch kay kaugalingong BIR
 * series: dili mag-sagol, dili mag-gap.
 */
test.describe('per-branch BIR counters', () => {
  test('ang duha ka branch adunay independent nga SI series', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    const b = await seedSecondBranch({ withNumberSeries: true });
    try {
      const a1 = await getNextSINumber(a.branchId);
      const b1 = await getNextSINumber(b.branchId);
      const a2 = await getNextSINumber(a.branchId);

      expect(a1).toBe('000001');
      expect(b1).toBe('000001'); // parehas nga numero, lain nga branch
      expect(a2).toBe('000002'); // wala na-apektuhan sa branch B
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('walay gap ang series sa sunod-sunod nga pag-issue', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    try {
      const nums: string[] = [];
      for (let i = 0; i < 5; i++) nums.push(await getNextSINumber(a.branchId));
      expect(nums).toEqual(['000001', '000002', '000003', '000004', '000005']);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('ang MC ug OR series kay independent sab per branch', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    const b = await seedSecondBranch({ withNumberSeries: true });
    try {
      expect(await getNextMCNumber(a.branchId)).toBe('MC-000001');
      expect(await getNextMCNumber(b.branchId)).toBe('MC-000001');
      expect(await getNextBirOrNumber(a.branchId)).toBe('OR-000001');
      expect(await getNextBirOrNumber(b.branchId)).toBe('OR-000001');
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('mo-fail closed ang branch nga walay series row — dili mo-fallback sa main', async () => {
    const a = await seedSecondBranch({ withNumberSeries: false });
    try {
      await expect(getNextSINumber(a.branchId)).rejects.toThrow(
        /no number series/i
      );
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('mo-fail closed sa wala-kaila nga branch id', async () => {
    await expect(getNextSINumber('does-not-exist')).rejects.toThrow(
      /no number series/i
    );
  });
});

import {
  seedProductInWarehouse,
  seedSaleOnTerminal,
  cleanupSale,
  readSaleBranch,
  readPosTransactionBranch,
  readMainBranchId,
  cleanupPosTransaction,
  advanceSeries,
  readSeries,
} from './helpers/branches';

test.describe('POST /api/pos/checkout — per-branch SI', () => {
  test('ang checkout sa branch A mo-gamit sa series sa branch A', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    let saleId: string | undefined;
    try {
      const sku = `NUM-A-${Date.now()}`;
      const productId = await seedProductInWarehouse(a.warehouseId, sku);

      // Ang route mogamit sa `id` (dili `productId`) kada item, ug sa `totalDue`.
      const res = await request.post('/api/pos/checkout', {
        data: {
          terminalId: a.terminalId,
          userId: a.userUid,
          items: [{ id: productId, name: `Test Product ${sku}`, quantity: 1, price: 1.0 }],
          paymentMethod: 'Cash',
          totalDue: 1.0,
          amountTendered: 1.0,
          change: 0,
        },
      });
      const body = await res.json();
      saleId = body.data?.saleId;
      expect(res.ok(), JSON.stringify(body)).toBeTruthy();
      // Unang invoice sa bag-ong branch kay 000001.
      expect(body.data.siNumber).toBe('000001');
    } finally {
      if (saleId) await cleanupSale(saleId);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang checkout sa terminal nga walay branch series', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: false });
    try {
      const sku = `NUM-B-${Date.now()}`;
      const productId = await seedProductInWarehouse(a.warehouseId, sku);
      const res = await request.post('/api/pos/checkout', {
        data: {
          terminalId: a.terminalId,
          userId: a.userUid,
          items: [{ id: productId, name: `Test Product ${sku}`, quantity: 1, price: 1.0 }],
          paymentMethod: 'Cash',
          totalDue: 1.0,
          amountTendered: 1.0,
          change: 0,
        },
      });
      // Mo-fail, dili mo-fallback sa series sa main branch.
      expect(res.ok()).toBeFalsy();
      const body = await res.json();
      expect(body.error).toContain('has no number series row');
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('POST /api/sales/transactions — branch stamping', () => {
  test('ang sale nga walay terminal mo-landing sa main branch', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    let saleId: string | undefined;
    let posTransId: string | undefined;
    try {
      const sku = `NUM-C-${Date.now()}`;
      const productId = await seedProductInWarehouse(a.warehouseId, sku);

      const res = await request.post('/api/sales/transactions', {
        data: {
          // Walay terminalId -- mao ni ang path nga naghimo ug NULL terminal_id.
          userId: a.userUid,
          items: [{ id: productId, name: `Test Product ${sku}`, quantity: 1, price: 1.0 }],
          paymentMethod: 'Cash',
          totalDue: 1.0,
          amountTendered: 1.0,
          change: 0,
        },
      });
      const body = await res.json();
      saleId = body.data?.saleId;
      posTransId = body.data?.posTransId;
      expect(res.ok(), JSON.stringify(body)).toBeTruthy();
      // Kon NULL ang branch_id, mawala ni sa tanan branch user ug
      // maka-under-report sa buhis -- busa main branch gyud.
      const mainId = await readMainBranchId();
      expect(await readSaleBranch(String(saleId))).toBe(mainId);
      expect(await readPosTransactionBranch(String(posTransId))).toBe(mainId);
    } finally {
      if (saleId) await cleanupSale(saleId);
      await cleanupSecondBranch(a);
    }
  });

  test('ang sale nga naay terminal mo-landing sa branch sa terminal', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    let saleId: string | undefined;
    let posTransId: string | undefined;
    try {
      const sku = `NUM-D-${Date.now()}`;
      const productId = await seedProductInWarehouse(a.warehouseId, sku);

      const res = await request.post('/api/sales/transactions', {
        data: {
          terminalId: a.terminalId,
          userId: a.userUid,
          items: [{ id: productId, name: `Test Product ${sku}`, quantity: 1, price: 1.0 }],
          paymentMethod: 'Cash',
          totalDue: 1.0,
          amountTendered: 1.0,
          change: 0,
        },
      });
      const body = await res.json();
      saleId = body.data?.saleId;
      posTransId = body.data?.posTransId;
      expect(res.ok(), JSON.stringify(body)).toBeTruthy();
      expect(await readSaleBranch(String(saleId))).toBe(a.branchId);
      expect(await readPosTransactionBranch(String(posTransId))).toBe(a.branchId);
    } finally {
      if (saleId) await cleanupSale(saleId);
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('POST /api/pos-transactions — branch stamping', () => {
  test('ang POS transaction nga walay terminal mo-landing sa main branch', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    let saleId: string | undefined;
    let posTransId: string | undefined;
    try {
      saleId = await seedSaleOnTerminal(a.terminalId, a.userUid);
      const res = await request.post('/api/pos-transactions', {
        data: {
          saleId,
          userId: a.userUid,
          subtotal: 1.0,
          totalAmount: 1.0,
          paymentMethod: 'Cash',
        },
      });
      const body = await res.json();
      posTransId = body.data?.id;
      expect(res.ok(), JSON.stringify(body)).toBeTruthy();
      expect(await readPosTransactionBranch(String(posTransId))).toBe(await readMainBranchId());
    } finally {
      if (posTransId) await cleanupPosTransaction(posTransId);
      if (saleId) await cleanupSale(saleId);
      await cleanupSecondBranch(a);
    }
  });

  test('ang POS transaction nga naay terminal mo-landing sa branch sa terminal', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    let saleId: string | undefined;
    let posTransId: string | undefined;
    try {
      saleId = await seedSaleOnTerminal(a.terminalId, a.userUid);
      const res = await request.post('/api/pos-transactions', {
        data: {
          saleId,
          userId: a.userUid,
          terminalId: a.terminalId,
          subtotal: 1.0,
          totalAmount: 1.0,
          paymentMethod: 'Cash',
        },
      });
      const body = await res.json();
      posTransId = body.data?.id;
      expect(res.ok(), JSON.stringify(body)).toBeTruthy();
      expect(await readPosTransactionBranch(String(posTransId))).toBe(a.branchId);
    } finally {
      if (posTransId) await cleanupPosTransaction(posTransId);
      if (saleId) await cleanupSale(saleId);
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('data reset — ang series kinahanglan mo-reset sab', () => {
  // Ang duha ka action nga naghilabot sa BIR
  // counters. Ang `factory_reset` naa sa zz-factory-reset-series.spec.ts kay
  // gipang-truncate niini ang products/terminals/users sa test DB.
  for (const action of ['clear_sales', 'reset_references']) {
    test(`ang ${action} mo-reset sa branch_number_series`, async ({ request }) => {
      const second = await seedSecondBranch({ withNumberSeries: true });
      try {
        await advanceSeries(); // main branch + ikaduha, tanan SI/MC/OR = 000042

        const before = await readSeries();
        expect(before.length).toBeGreaterThanOrEqual(2);
        for (const row of before) {
          expect([row.si_number, row.mc_number, row.bir_or_number]).toEqual([
            '000042', '000042', '000042',
          ]);
        }

        const res = await request.post('/api/data-management/reset', {
          data: { action },
        });
        const body = await res.json();
        expect(res.status()).toBe(200);
        expect(body.success).toBe(true);

        const after = await readSeries();
        // Ang rows kinahanglan mabuhi gihapon (UPDATE, dili TRUNCATE/DELETE).
        expect(after.length).toBe(before.length);
        for (const row of after) {
          expect([row.si_number, row.mc_number, row.bir_or_number]).toEqual([
            '000000', '000000', '000000',
          ]);
        }
      } finally {
        await cleanupSecondBranch(second);
      }
    });
  }
});

test.describe('composite BIR unique keys', () => {
  test('parehas nga si_number OK sa duha ka branch, pero dili sulod sa usa', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    const b = await seedSecondBranch({ withNumberSeries: true });
    const si = `9${Date.now()}`.slice(-6);
    try {
      // Parehas nga numero, lain nga branch — kinahanglan OK.
      await insertRawSale(a.branchId, si);
      await insertRawSale(b.branchId, si);

      // Parehas nga numero, parehas nga branch — kinahanglan gi-reject
      // sa composite key mismo (ER_DUP_ENTRY), dili sa laing error.
      await expect(insertRawSale(a.branchId, si)).rejects.toMatchObject({
        code: 'ER_DUP_ENTRY',
        message: expect.stringContaining('uq_sales_tx_branch_si'),
      });
    } finally {
      await cleanupRawSales(si);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});
