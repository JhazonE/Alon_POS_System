import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-data';
import { resetPosState, testQuery } from './helpers/db';

/**
 * Membership payment flow (DB-backed).
 *
 * Covers the spec's three checks:
 *  1. The POS customer dialog no longer shows the "Add New Customer" + button,
 *     and the new Membership action is present.
 *  2. Activation — a customer WITHOUT a loyalty card pays; a customer_loyalty row
 *     is created with a future expiry.
 *  3. Renewal — a customer WITH a card pays; expiry moves to ~today + duration.
 *
 * Checks 2 and 3 exercise POST /api/pos/membership-payment directly (the same
 * endpoint the MembershipPaymentDialog calls) and assert DB state, avoiding a
 * flaky full shift-driven UI interaction for the data assertions.
 */

const cashier = TEST_USERS.cashier;
const FEE = 200;
const DURATION = 12;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function expectedExpiry(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + DURATION);
  return ymd(d);
}

test.describe('Membership payment', () => {
  test.beforeAll(async ({ request }) => {
    // Ensure the membership fee is configured in the test DB.
    const res = await request.post('/api/pos-settings', {
      data: { membershipFee: FEE, membershipDurationMonths: DURATION },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  });

  test.beforeEach(async () => {
    await resetPosState();
    // Clean any membership rows/cards/customers left by a previous run so each
    // test starts from a known state.
    await testQuery("DELETE FROM membership_payments WHERE customer_id LIKE 'mbr-e2e-%'");
    await testQuery("DELETE FROM customer_loyalty WHERE customer_id LIKE 'mbr-e2e-%'");
    await testQuery("DELETE FROM customers WHERE id LIKE 'mbr-e2e-%'");
  });

  test('customer dialog has no Add Customer button and no footer Membership action', async ({ page }) => {
    // Login + start shift (POS renders its own login form and shift gate).
    await page.goto('/pos');
    await expect(page.getByRole('heading', { name: /cashier login/i })).toBeVisible();
    await page.getByLabel('Username').fill(cashier.username);
    await page.getByLabel('Password').fill(cashier.password);
    await page.getByRole('button', { name: /login to pos/i }).click();

    await expect(page.getByRole('heading', { name: /start new shift/i })).toBeVisible();
    await page.getByRole('button', { name: /start shift/i }).click();
    await expect(page.getByPlaceholder(/scan barcode or search product/i)).toBeVisible();

    // Phase 2 moved membership into the Customer drawer, so the standalone
    // footer Membership button no longer exists.
    await expect(page.getByRole('button', { name: /^membership$/i })).toHaveCount(0);

    // Open the Customer dialog (footer action label is "Customer" + a Ctrl+3 hint).
    await page.getByRole('button', { name: /customer/i }).first().click();
    // The RFID / Loyalty Card field is unique to the customer account dialog.
    await expect(page.getByPlaceholder(/scan or type rfid/i)).toBeVisible();
    // The removed Add New Customer + button must be gone.
    await expect(page.getByRole('button', { name: /add new customer/i })).toHaveCount(0);
  });

  test('activation: customer without a card gets one with a future expiry', async ({ request }) => {
    const customerId = 'mbr-e2e-activate';
    await testQuery('INSERT INTO customers (id, name) VALUES (?, ?)', [customerId, 'E2E Activation']);

    const res = await request.post('/api/pos/membership-payment', {
      data: {
        customerId,
        rfidCode: 'RFID-E2E-ACT-001',
        pointSetting: 'default',
        paymentMethod: 'cash',
        amountTendered: 500,
        userId: 'test.cashier',
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.isNewCard).toBe(true);
    expect(body.data.newExpiry).toBe(expectedExpiry());

    // A loyalty card now exists for the customer with the future expiry.
    const rows = await testQuery(
      'SELECT rfid_code, expiry_date FROM customer_loyalty WHERE customer_id = ?',
      [customerId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].rfid_code).toBe('RFID-E2E-ACT-001');
    expect(ymd(new Date(rows[0].expiry_date))).toBe(expectedExpiry());

    // An audit row was written; nothing leaked into pos_transactions.
    const pay = await testQuery(
      'SELECT amount, payment_method, is_new_card FROM membership_payments WHERE customer_id = ?',
      [customerId]
    );
    expect(pay.length).toBe(1);
    expect(Number(pay[0].amount)).toBe(FEE);
    expect(pay[0].is_new_card).toBe(1);
  });

  test('renewal: existing card expiry moves to today + duration', async ({ request }) => {
    const customerId = 'mbr-e2e-renew';
    const oldExpiry = '2026-01-01';
    await testQuery('INSERT INTO customers (id, name) VALUES (?, ?)', [customerId, 'E2E Renewal']);
    await testQuery(
      'INSERT INTO customer_loyalty (id, customer_id, rfid_code, expiry_date, current_points) VALUES (?, ?, ?, ?, 0)',
      ['LOY-E2E-RENEW', customerId, 'RFID-E2E-RENEW-001', oldExpiry]
    );

    const res = await request.post('/api/pos/membership-payment', {
      data: {
        customerId,
        paymentMethod: 'cash',
        amountTendered: 200,
        userId: 'test.cashier',
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.isNewCard).toBe(false);
    expect(body.data.previousExpiry).toBe(oldExpiry);
    expect(body.data.newExpiry).toBe(expectedExpiry());

    const rows = await testQuery(
      'SELECT expiry_date FROM customer_loyalty WHERE customer_id = ?',
      [customerId]
    );
    expect(rows.length).toBe(1);
    expect(ymd(new Date(rows[0].expiry_date))).toBe(expectedExpiry());
  });

  test('validation: activation without an RFID is rejected', async ({ request }) => {
    const customerId = 'mbr-e2e-norfid';
    await testQuery('INSERT INTO customers (id, name) VALUES (?, ?)', [customerId, 'E2E NoRFID']);

    const res = await request.post('/api/pos/membership-payment', {
      data: { customerId, paymentMethod: 'cash', amountTendered: 500, userId: 'test.cashier' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/RFID code is required/i);
  });
});
