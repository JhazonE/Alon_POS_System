import { test, expect } from '@playwright/test';
import { resetPosState, testQuery } from './helpers/db';

/**
 * Membership Phase 2 (report API + Z-reading line), DB-backed on alon_pos_test.
 * Uses the same POST /api/pos/membership-payment endpoint the drawer calls.
 */

const FEE = 200;
const DURATION = 12;

test.describe('Membership phase 2', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/pos-settings', { data: { membershipFee: FEE, membershipDurationMonths: DURATION } });
    expect(res.ok(), await res.text()).toBeTruthy();
  });

  test.beforeEach(async () => {
    await resetPosState();
    await testQuery("DELETE FROM membership_payments WHERE customer_id LIKE 'p2-e2e-%'");
    await testQuery("DELETE FROM customer_loyalty WHERE customer_id LIKE 'p2-e2e-%'");
    await testQuery("DELETE FROM customers WHERE id LIKE 'p2-e2e-%'");
  });

  test('report API returns rows + summary for activation and renewal', async ({ request }) => {
    // Activation (cash) + renewal (card).
    await testQuery('INSERT INTO customers (id, name) VALUES (?, ?)', ['p2-e2e-act', 'P2 Activation']);
    await testQuery('INSERT INTO customers (id, name) VALUES (?, ?)', ['p2-e2e-ren', 'P2 Renewal']);
    await testQuery(
      'INSERT INTO customer_loyalty (id, customer_id, rfid_code, expiry_date, current_points) VALUES (?, ?, ?, ?, 0)',
      ['LOY-P2-REN', 'p2-e2e-ren', 'RFID-P2-REN', '2026-01-01']
    );

    const a = await request.post('/api/pos/membership-payment', {
      data: { customerId: 'p2-e2e-act', rfidCode: 'RFID-P2-ACT', paymentMethod: 'cash', amountTendered: 500, userId: 'test.cashier' },
    });
    expect(a.ok(), await a.text()).toBeTruthy();
    const r = await request.post('/api/pos/membership-payment', {
      data: { customerId: 'p2-e2e-ren', paymentMethod: 'card', userId: 'test.cashier' },
    });
    expect(r.ok(), await r.text()).toBeTruthy();

    const rep = await request.get('/api/reports/membership');
    expect(rep.ok(), await rep.text()).toBeTruthy();
    const body = await rep.json();
    expect(body.success).toBe(true);
    expect(body.data.summary.totalActivations).toBeGreaterThanOrEqual(1);
    expect(body.data.summary.totalRenewals).toBeGreaterThanOrEqual(1);
    expect(body.data.summary.totalCollected).toBeGreaterThanOrEqual(2 * FEE);

    const actRow = body.data.rows.find((x: any) => x.customerId === 'p2-e2e-act');
    expect(actRow, 'activation row present').toBeTruthy();
    expect(actRow.type).toBe('activation');
    expect(actRow.paymentMethod).toBe('cash');
    expect(actRow.cashierName).toBeTruthy();

    const renRow = body.data.rows.find((x: any) => x.customerId === 'p2-e2e-ren');
    expect(renRow, 'renewal row present').toBeTruthy();
    expect(renRow.type).toBe('renewal');
    expect(renRow.paymentMethod).toBe('card');
  });

  test('report API filters by date range', async ({ request }) => {
    await testQuery('INSERT INTO customers (id, name) VALUES (?, ?)', ['p2-e2e-date', 'P2 Date']);
    await request.post('/api/pos/membership-payment', {
      data: { customerId: 'p2-e2e-date', rfidCode: 'RFID-P2-DATE', paymentMethod: 'cash', amountTendered: 500, userId: 'test.cashier' },
    });
    // A far-past window must exclude today's payment.
    const past = await request.get('/api/reports/membership?startDate=2000-01-01&endDate=2000-01-31');
    const body = await past.json();
    const found = body.data.rows.find((x: any) => x.customerId === 'p2-e2e-date');
    expect(found, 'today payment excluded from a 2000 window').toBeFalsy();
  });

  test('z-reading exposes membershipCash and folds it into cashInDrawer', async ({ request }) => {
    // A cash membership payment with no terminal → picked up by the all-terminal Z-reading scope.
    await testQuery('INSERT INTO customers (id, name) VALUES (?, ?)', ['p2-e2e-z', 'P2 Zread']);
    await request.post('/api/pos/membership-payment', {
      data: { customerId: 'p2-e2e-z', rfidCode: 'RFID-P2-Z', paymentMethod: 'cash', amountTendered: 500, userId: 'test.cashier' },
    });
    const z = await request.get('/api/sales/z-reading?mode=current&terminalId=all');
    expect(z.ok(), await z.text()).toBeTruthy();
    const body = await z.json();
    const row = body.data[0];
    expect(Number(row.membershipCash)).toBeGreaterThanOrEqual(FEE);
    // cashInDrawer includes membershipCash.
    expect(Number(row.cashInDrawer)).toBeGreaterThanOrEqual(Number(row.cashSales) + Number(row.membershipCash) - 0.001);
  });

  test('z-reading scopes membership cash by terminal', async ({ request }) => {
    const TERMINAL = 'p2-term-1';
    await testQuery('INSERT INTO customers (id, name) VALUES (?, ?)', ['p2-e2e-zterm', 'P2 ZTerm']);
    const pay = await request.post('/api/pos/membership-payment', {
      data: { customerId: 'p2-e2e-zterm', rfidCode: 'RFID-P2-ZTERM', paymentMethod: 'cash', amountTendered: 500, userId: 'test.cashier', terminalId: TERMINAL },
    });
    expect(pay.ok(), await pay.text()).toBeTruthy();

    // The payment was stored against TERMINAL, so a Z-reading scoped to that terminal must include it.
    const z = await request.get(`/api/sales/z-reading?mode=current&terminalId=${TERMINAL}`);
    expect(z.ok(), await z.text()).toBeTruthy();
    const body = await z.json();
    const row = body.data[0];
    expect(Number(row.membershipCash)).toBeGreaterThanOrEqual(FEE);
  });
});
