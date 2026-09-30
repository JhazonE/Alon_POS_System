import { test, expect } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { selectCategory } from './helpers/product-form';
import { resetPosState, testQuery } from './helpers/db';
import { TEST_BRAND, TEST_CATEGORY, TEST_UNIT, TEST_PRICE_LEVEL, TEST_PRICE_LEVEL_WHOLESALE } from './fixtures/test-data';

/**
 * Add Product Approval (DB-backed) — verifies the require_product_confirmation
 * switch + approval_workflows gate on product creation:
 *  - switch OFF: product is created immediately (legacy behavior unchanged).
 *  - switch ON + a PRODUCT_CREATE workflow row: submitting a product routes it
 *    into approval_queue as Pending instead of inserting into products.
 *  - approving the queued item finalizes it and inserts the product.
 *
 * Drives the real Add Product dialog — dialog interaction and selectOption
 * helper copied verbatim from add-product.spec.ts.
 */

const WORKFLOW_ID = 'wf-prodcreate-e2e';

/** Pick a Radix Select option by label inside the dialog. */
async function selectOption(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
  label: string | RegExp,
  optionName: string,
) {
  // exact:true so "Category" doesn't match "Subcategory" (substring).
  await dialog.getByLabel(label, { exact: true }).click();
  // The Radix Select content portals to body — page-level option locator.
  await page.getByRole('option', { name: optionName }).click();
}

async function fillAndSubmitProduct(
  page: import('@playwright/test').Page,
  opts: { name: string; description: string; stock: number; cost: string },
) {
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add Product' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Add New Product')).toBeVisible();

  // --- Basic Info ---
  await dialog.getByLabel('Product Name').fill(opts.name);
  await dialog.getByLabel('Description', { exact: true }).fill(opts.description);
  await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
  await selectCategory(page, dialog, TEST_CATEGORY.name);

  // --- Inventory ---
  await dialog.getByRole('tab', { name: 'Inventory' }).click();
  await dialog.getByLabel('Initial Stock').fill(String(opts.stock));

  // --- Selling Units (base row owns unit name, barcode, cost ug price) ---
  await dialog.getByRole('tab', { name: 'Selling Units' }).click();
  const base = dialog.locator('div.bg-card.border.rounded-md.shadow-sm').nth(0);
  // Unit Name kay Select (InlineEditableSelect), dili free-text input.
  await selectOption(page, dialog, 'Unit Name', `${TEST_UNIT.name} (${TEST_UNIT.abbreviation})`);
  // Unique kada tawag — product_selling_units.barcode kay globally UNIQUE.
  await base.getByLabel('Barcode').fill(String(Date.now()).slice(-8));
  await base.getByLabel('Cost (₱)').fill(opts.cost);
  await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill(String(Number(opts.cost) * 1.25));
  // Every active price level's column is required.
  await base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`).fill(String(Number(opts.cost) * 1.25));

  // --- Submit ---
  await dialog.getByRole('button', { name: 'Add Product' }).click();
  await expect(dialog).toBeHidden();
}

async function setRequireProductConfirmation(request: import('@playwright/test').APIRequestContext, value: boolean) {
  const res = await request.post('/api/pos-settings', { data: { requireProductConfirmation: value } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

test.describe('Add Product Approval', () => {
  test.beforeEach(async () => {
    await resetPosState();
    await testQuery("DELETE FROM approval_queue WHERE transaction_type='PRODUCT_CREATE'");
    await testQuery("DELETE FROM products WHERE name LIKE 'APRV-E2E %'");
    // Each ON-test seeds its own workflow row; clear any leftover from a prior test.
    await testQuery('DELETE FROM approval_workflows WHERE id=?', [WORKFLOW_ID]);
  });

  test.afterAll(async ({ request }) => {
    // MUST reset teardown state — a left-on switch breaks add-product.spec.ts.
    await testQuery("DELETE FROM approval_workflows WHERE id=?", [WORKFLOW_ID]);
    await setRequireProductConfirmation(request, false);
  });

  test('switch OFF: product is created immediately', async ({ page, request }) => {
    await setRequireProductConfirmation(request, false);
    await seedSession(page, DEFAULT_ADMIN);

    const name = `APRV-E2E Off Widget ${Date.now()}`;
    await fillAndSubmitProduct(page, {
      name,
      description: 'Created while require_product_confirmation is OFF.',
      stock: 10,
      cost: '50',
    });

    const res = await request.get(`/api/products?search=${encodeURIComponent(name)}&limit=50`);
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.name === name);
    expect(match, 'product created immediately when switch is OFF').toBeTruthy();

    // No approval queue row should have been created.
    const queueRows = await testQuery(
      "SELECT * FROM approval_queue WHERE transaction_type='PRODUCT_CREATE'"
    );
    expect(queueRows.length).toBe(0);
  });

  test('switch ON + workflow: product is held for approval, not created', async ({ page, request }) => {
    // Seed a PRODUCT_CREATE workflow step assigned to a non-Admin role (defense
    // in depth — the seeded session uid 'test-admin-uid' likely doesn't exist in
    // alon_pos_test.users anyway, so role resolution yields undefined and no step
    // is auto-skipped regardless).
    const nonAdminRole = await testQuery(
      "SELECT id FROM user_types WHERE name <> 'Admin' ORDER BY id LIMIT 1"
    );
    const fallbackRole = nonAdminRole[0]?.id ?? (await testQuery('SELECT id FROM user_types LIMIT 1'))[0]?.id;
    await testQuery(
      "INSERT INTO approval_workflows (id, transaction_type, user_type_id, step_order) VALUES (?, 'PRODUCT_CREATE', ?, 1)",
      [WORKFLOW_ID, fallbackRole]
    );
    await setRequireProductConfirmation(request, true);
    await seedSession(page, DEFAULT_ADMIN);

    const name = `APRV-E2E On Widget ${Date.now()}`;
    await fillAndSubmitProduct(page, {
      name,
      description: 'Submitted while require_product_confirmation is ON.',
      stock: 5,
      cost: '75',
    });

    // Product must NOT exist yet.
    const res = await request.get(`/api/products?search=${encodeURIComponent(name)}&limit=50`);
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.name === name);
    expect(match, 'product must not be created while pending approval').toBeFalsy();

    // Queue row must exist as Pending, carrying this product name in transaction_data.
    const queueRows = await testQuery(
      "SELECT * FROM approval_queue WHERE transaction_type='PRODUCT_CREATE' AND status='Pending'"
    );
    expect(queueRows.length).toBe(1);
    const txData = typeof queueRows[0].transaction_data === 'string'
      ? JSON.parse(queueRows[0].transaction_data)
      : queueRows[0].transaction_data;
    expect(txData.name).toBe(name);
  });

  test('approving the queued product creates it', async ({ page, request }) => {
    const nonAdminRole = await testQuery(
      "SELECT id FROM user_types WHERE name <> 'Admin' ORDER BY id LIMIT 1"
    );
    const fallbackRole = nonAdminRole[0]?.id ?? (await testQuery('SELECT id FROM user_types LIMIT 1'))[0]?.id;
    await testQuery(
      "INSERT INTO approval_workflows (id, transaction_type, user_type_id, step_order) VALUES (?, 'PRODUCT_CREATE', ?, 1)",
      [WORKFLOW_ID, fallbackRole]
    );
    await setRequireProductConfirmation(request, true);
    await seedSession(page, DEFAULT_ADMIN);

    const name = `APRV-E2E Finalized Widget ${Date.now()}`;
    await fillAndSubmitProduct(page, {
      name,
      description: 'Submitted then approved.',
      stock: 7,
      cost: '60',
    });

    const queueRows = await testQuery(
      "SELECT * FROM approval_queue WHERE transaction_type='PRODUCT_CREATE' AND status='Pending'"
    );
    expect(queueRows.length).toBe(1);
    const queueId = queueRows[0].id;

    // The approver must satisfy the role check in app/api/approvals/process/route.ts:
    // username='admin' OR role name in ('Admin','Super Admin') bypasses the
    // per-step role requirement. test-admin-uid may not exist in alon_pos_test.users,
    // so look up a real admin user from the seeded DB.
    const adminUsers = await testQuery(`
      SELECT u.uid FROM users u
      JOIN user_types ut ON (u.user_type = ut.id OR u.user_type = ut.name)
      WHERE ut.name IN ('Admin','Super Admin') OR u.username='admin'
      LIMIT 1
    `);
    expect(adminUsers.length, 'a real admin user must exist in alon_pos_test to approve').toBeGreaterThan(0);
    const approverUid = adminUsers[0].uid;

    const approveRes = await request.post('/api/approvals/process', {
      data: { queueId, action: 'Approve', userId: approverUid, notes: 'e2e approve' },
    });
    expect(approveRes.ok(), await approveRes.text()).toBeTruthy();

    const res = await request.get(`/api/products?search=${encodeURIComponent(name)}&limit=50`);
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.name === name);
    expect(match, 'product created after approval').toBeTruthy();

    const finalRows = await testQuery('SELECT status FROM approval_queue WHERE id=?', [queueId]);
    expect(finalRows[0].status).toBe('Approved');
  });
});
