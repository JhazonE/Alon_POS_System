import { test, expect } from '@playwright/test';
import { TEST_TERMINAL, TEST_USERS } from './fixtures/test-data';
import { resetPosState, testQuery } from './helpers/db';

/**
 * Z-reading: ang preview (GET) ug ang committed reading (POST) kay SAMANG report.
 *
 * Kini nga spec nag-lock sa duha ka regression nga nahitabo kay ang GET ug POST
 * handler nag-compute ug kaugalingon nga numero, nga nag-drift:
 *
 *  1. `cash_in_drawer` — ang POST path wala mag-apil sa cash membership fees.
 *     Ang membership kay DILI sale (wala sa pos_transactions) pero ang kwarta
 *     naa sa drawer, so dapat maihap. Kung ang preview mo-apil ug ang gi-save
 *     dili, ang Z-reading mo-report ug bakak nga over/short sa cashier bisan
 *     sakto ra ang cash.
 *
 *  2. `tax_type` nga NULL — ang GET nag-COALESCE sa 'VAT', ang POST wala, so
 *     ang VATable sales ug VAT amount managlahi tali sa gipakita ug gi-file.
 *
 * Ang assertion kay parity (GET == POST), dili fixed nga amount, kay ang punto
 * mao nga ang duha ka path dili na gyud mag-drift pag-usab.
 *
 * NOTE sa window: ang POST mo-derive sa kaugalingon niyang startDate (gikan sa
 * katapusang Z-reading) ug endDate (karon) — gi-ignore niya ang gipadala. Mao
 * nga gi-query ta ang preview sa PAREHAS nga implicit window: walay naunang
 * Z-reading (gi-clear sa beforeEach) → startDate = wala, endDate = karon.
 */

const MEMBERSHIP_FEE = 150;
const TERMINAL = TEST_TERMINAL.id;
const UID = TEST_USERS.admin.uid;

/** Ang membership_payments wala sa resetPosState() — manual nga hinloan. */
async function clearMembership() {
  await testQuery('DELETE FROM membership_payments WHERE terminal_id = ?', [TERMINAL]);
}

async function clearZReadings() {
  await testQuery('DELETE FROM z_readings WHERE terminal_id = ?', [TERMINAL]);
}

/**
 * Usa ka cash membership payment sulod sa window sa Z-reading.
 * Ang customer_id kay NOT NULL, so mogamit ta ug placeholder nga id — walay
 * FK ngadto sa customers nga gi-enforce para niini sa test DB.
 */
async function seedCashMembership(id: string) {
  await testQuery(
    `INSERT INTO membership_payments
      (id, customer_id, customer_loyalty_id, amount, payment_method, is_new_card,
       previous_expiry, new_expiry, terminal_id, user_id, created_at)
     VALUES (?, ?, ?, ?, 'cash', 1, NULL, DATE_ADD(NOW(), INTERVAL 1 YEAR), ?, ?, NOW())`,
    [id, `cust-${id}`, `loy-${id}`, MEMBERSHIP_FEE, TERMINAL, UID]
  );
}

/**
 * Ang preview. Kinahanglan ang `mode=current` — kung wala, ang GET mo-list ra sa
 * mga na-save na nga Z-reading (empty) imbes mo-generate ug bag-o. Ang window
 * kay i-derive sa route mismo, parehas sa POST.
 */
async function fetchPreview(request: import('@playwright/test').APIRequestContext) {
  const res = await request.get(
    `/api/sales/z-reading?mode=current&terminalId=${TERMINAL}&uid=${UID}`
  );
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.success, `preview failed: ${JSON.stringify(body)}`).toBeTruthy();
  return body.data[0];
}

async function commitReading(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/sales/z-reading', {
    data: { terminalId: TERMINAL, cashierName: 'Test Cashier', uid: UID },
  });
  const body = await res.json();
  expect(body.success, `commit failed: ${JSON.stringify(body)}`).toBeTruthy();
  return body.data[0];
}

test.describe('Z-reading preview/committed parity', () => {
  test.beforeEach(async () => {
    await resetPosState();
    await clearMembership();
    await clearZReadings();
  });

  test.afterEach(async () => {
    await clearMembership();
    await clearZReadings();
  });

  test('cash membership fees mo-apil sa cash_in_drawer sa preview UG sa gi-save', async ({
    request,
  }) => {
    await seedCashMembership('test-mp-parity-1');

    const preview = await fetchPreview(request);
    // Ang preview kinahanglan makakita sa membership cash.
    expect(Number(preview.membershipCash)).toBe(MEMBERSHIP_FEE);

    const committed = await commitReading(request);

    // Ang kinauyokan: parehas ang drawer total sa duha ka path.
    expect(Number(committed.membershipCash)).toBe(MEMBERSHIP_FEE);
    expect(Number(committed.cashInDrawer)).toBeCloseTo(Number(preview.cashInDrawer), 2);

    // Ug ang gi-save nga row sa DB mo-match usab — dili lang ang response.
    const rows = await testQuery(
      'SELECT cash_in_drawer, membership_cash FROM z_readings WHERE terminal_id = ? ORDER BY report_date DESC LIMIT 1',
      [TERMINAL]
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].membership_cash)).toBe(MEMBERSHIP_FEE);
    expect(Number(rows[0].cash_in_drawer)).toBeCloseTo(Number(preview.cashInDrawer), 2);
  });

  test('ang VAT figures sa preview ug sa gi-save managsama', async ({ request }) => {
    const preview = await fetchPreview(request);
    const committed = await commitReading(request);

    // Parehas nga VAT breakdown — mao ni ang gi-file sa BIR.
    expect(Number(committed.vatSales)).toBeCloseTo(Number(preview.vatSales), 2);
    expect(Number(committed.vatAmount)).toBeCloseTo(Number(preview.vatAmount), 2);
    expect(Number(committed.vatExempt)).toBeCloseTo(Number(preview.vatExempt), 2);
    expect(Number(committed.zeroRated)).toBeCloseTo(Number(preview.zeroRated), 2);
    expect(Number(committed.nonVat)).toBeCloseTo(Number(preview.nonVat), 2);
    expect(Number(committed.netSales)).toBeCloseTo(Number(preview.netSales), 2);
  });
});
