import { test, expect, type Page, type Locator } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN, type SessionUser } from './helpers/auth';
import { selectCategory, openWarehousePicker, closeWarehousePicker, pickWarehouses } from './helpers/product-form';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';
import { TEST_BRAND, TEST_CATEGORY, TEST_UNIT } from './fixtures/test-data';

/**
 * The Inventory tab of Add Product: a multi-select warehouse picker where every
 * warehouse of the user's branch starts ticked at 0, the opening-stock input
 * lives INSIDE each ticked picker row, and the first warehouse ticked is the
 * primary (there is no primary control). Cost and reorder point stay single
 * fields shared by the whole submission.
 *
 * add-product-warehouse-picker.spec.ts owns the default selection, where the
 * stock input lives, and the missing primary control. This file covers the rest:
 * per-warehouse stock being independent, the zero-warehouse rules, the submitted
 * payload, and head office's branch-first flow.
 *
 * History worth knowing: this spec was written against the FIRST multi-warehouse
 * design (nothing ticked by default, a separate list of warehouse rows below the
 * picker, a primary radio per row). 870953d and 669431b replaced that design and
 * seven tests here then sat failing against a UI that no longer existed, which
 * hid a real crash behind them. They are rewritten for the current UI. The
 * primary-radio test has no successor as such: the radio is gone, so "which one
 * is primary" is now asserted on the submitted payload instead.
 *
 * Tests that submit capture the create server action's body and abort it; the
 * write path itself is covered by product-multi-warehouse-create.spec.ts.
 */
const tag = `MWF-${Date.now()}`;

function branchUser(uid: string): SessionUser {
  return {
    uid,
    username: `u_${uid.slice(0, 8)}`,
    userType: 'User',
    displayName: 'Branch User',
    permissions: ['*'],
  };
}

async function openInventoryTab(page: Page, user: SessionUser): Promise<Locator> {
  await seedSession(page, user);
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add Product' }).first().click();
  const dialog = page.getByRole('dialog');
  // Ang unang test sa file nagbayad sa cold compile sa /products.
  await expect(dialog.getByText('Add New Product')).toBeVisible({ timeout: 20000 });
  await dialog.getByRole('tab', { name: 'Inventory' }).click();
  return dialog;
}

async function selectOption(page: Page, dialog: Locator, label: string, optionName: string) {
  await dialog.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: optionName }).click();
}

/** Pun-a ang tanang required nga field sa ubang tabs aron ang warehouse ra ang mahimong rason sa pag-fail. */
async function fillRequiredFields(page: Page, dialog: Locator, name: string) {
  await dialog.getByRole('tab', { name: 'Basic Info' }).click();
  await dialog.getByLabel('Product Name').fill(name);
  await dialog.getByLabel('Description', { exact: true }).fill('Multi warehouse form test');
  await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
  await selectCategory(page, dialog, TEST_CATEGORY.name);

  await dialog.getByRole('tab', { name: 'Selling Units' }).click();
  const base = dialog.locator('div.bg-card.border.rounded-md.shadow-sm').nth(0);
  await selectOption(page, dialog, 'Unit Name', `${TEST_UNIT.name} (${TEST_UNIT.abbreviation})`);
  await base.getByLabel('Barcode').fill(String(Date.now()).slice(-9));
  await base.getByLabel('Cost (₱)').fill('10');
  // Ang price columns kay table na (usa ka input kada price level, ang label
  // "Price (₱)" sr-only): pun-a tanan, kay ang matag active level kinahanglan.
  const prices = base.getByLabel('Price (₱)');
  const priceCount = await prices.count();
  expect(priceCount).toBeGreaterThan(0);
  for (let i = 0; i < priceCount; i++) await prices.nth(i).fill('15');
}

test.describe('add product: multi-warehouse picker', () => {
  // The first test in a cold run pays the compile of /products, which can pass the
  // 30s default: a timeout, not an assertion that failed. Alone, each test fits.
  test.setTimeout(120_000);

  let seeded: SeededBranch;
  let otherBranch: SeededBranch;
  let whA: string;
  let whB: string;
  let whInactive: string;
  let nameA: string;
  let nameB: string;
  let nameInactive: string;
  const createdNames: string[] = [];

  test.beforeEach(async () => {
    seeded = await seedSecondBranch();
    otherBranch = await seedSecondBranch();
    whA = seeded.warehouseId;
    whB = await addWarehouseToBranch(seeded.branchId, { active: true });
    whInactive = await addWarehouseToBranch(seeded.branchId, { active: false });
    const r: any[] = await testQuery('SELECT id, name FROM warehouses WHERE id IN (?, ?, ?)', [whA, whB, whInactive]);
    nameA = r.find((x) => x.id === whA).name;
    nameB = r.find((x) => x.id === whB).name;
    nameInactive = r.find((x) => x.id === whInactive).name;
  });

  test.afterEach(async () => {
    for (const n of createdNames.splice(0)) {
      await testQuery('DELETE FROM products WHERE name = ?', [n]);
    }
    await testQuery('DELETE FROM warehouses WHERE id IN (?, ?)', [whB, whInactive]);
    await cleanupSecondBranch(seeded);
    await cleanupSecondBranch(otherBranch);
  });

  test('each ticked warehouse has its own stock input, and unticking one leaves the other alone', async ({ page }) => {
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));

    // Both of the branch's active warehouses start ticked, so the picker already
    // holds one stock input per warehouse.
    const pop = await openWarehousePicker(page, dialog);
    const stockA = pop.getByLabel(`Initial stock for ${nameA}`, { exact: true });
    const stockB = pop.getByLabel(`Initial stock for ${nameB}`, { exact: true });
    await expect(stockA).toBeVisible();
    await expect(stockB).toBeVisible();

    // Each warehouse has its OWN stock: typing in one does not touch the other.
    await stockA.fill('7');
    await stockB.fill('3');
    await expect(stockA).toHaveValue('7');
    await expect(stockB).toHaveValue('3');

    // Unticking one drops its input, and the other warehouse's stock is untouched.
    await pop.getByRole('option', { name: nameA }).click();
    await expect(stockA).toHaveCount(0);
    await expect(stockB).toHaveValue('3');
    await closeWarehousePicker(page, pop);
  });

  test('a branch user cannot submit with zero warehouses ticked', async ({ page }) => {
    const productName = `Branch NoWH ${tag}`;
    createdNames.push(productName);
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));
    // Everything starts ticked, so a branch user reaches "zero" by unticking all.
    await pickWarehouses(page, dialog, []);
    await fillRequiredFields(page, dialog, productName);

    let sawServerAction = false;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() ?? '').includes(productName)) {
        sawServerAction = true;
      }
    });

    await dialog.getByRole('button', { name: 'Add Product' }).click();

    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await expect(dialog.getByText('Select at least one warehouse for this product.')).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(sawServerAction, 'the form must not reach the server action').toBe(false);
    const inDb: any[] = await testQuery('SELECT id FROM products WHERE name = ?', [productName]);
    expect(inDb).toHaveLength(0);

    // Kon naay napili, mawala ang error.
    await pickWarehouses(page, dialog, [nameA]);
    await expect(dialog.getByText('Select at least one warehouse for this product.')).toBeHidden();
  });

  test('head office can submit with zero warehouses ticked, and gets one NULL-warehouse row', async ({ page }) => {
    const productName = `HO NoWH ${tag}`;
    createdNames.push(productName);
    const dialog = await openInventoryTab(page, DEFAULT_ADMIN);
    await expect(dialog.getByText('Warehouses (Optional)')).toBeVisible();
    // The branch's warehouses start ticked, so head office has to untick them to
    // mean "no warehouse".
    await pickWarehouses(page, dialog, []);
    await fillRequiredFields(page, dialog, productName);

    await dialog.getByRole('button', { name: 'Add Product' }).click();

    await expect(dialog).toBeHidden({ timeout: 20000 });
    const created: any[] = await testQuery('SELECT id, warehouse_id FROM products WHERE name = ?', [productName]);
    expect(created).toHaveLength(1);
    expect(created[0].warehouse_id).toBeNull();
  });

  test('cost and reorder point appear once, not per warehouse', async ({ page }) => {
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));
    const pop = await openWarehousePicker(page, dialog);

    // The picker rows carry the opening-stock box and nothing else: one number
    // input per ticked warehouse (A and B), no cost, no reorder point.
    await expect(pop.getByRole('spinbutton')).toHaveCount(2);
    await expect(pop.getByLabel(/cost/i)).toHaveCount(0);
    await expect(pop.getByLabel(/reorder/i)).toHaveCount(0);
    await closeWarehousePicker(page, pop);

    await expect(dialog.getByLabel(/reorder/i)).toHaveCount(0);
    await expect(dialog.getByText(/shared by every warehouse/i)).toBeVisible();

    // Ang cost naa sa base selling-unit row, usa ra bisan duha ang warehouse.
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    await expect(dialog.getByLabel('Cost (₱)')).toHaveCount(1);
  });

  // Regression: the Branch field is NOT a react-hook-form field, but it was built
  // from FormItem/FormLabel/FormControl/FormDescription, all of which call
  // useFormField() and THROW outside a <FormField>. It only renders when there is
  // more than one branch to choose, so it crashed the Inventory tab for exactly
  // one audience - head office on a multi-branch install - and nothing else
  // exercised it: the branch-user tests never render the field at all.
  test('head office with several branches gets the Branch field, and the tab renders', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    // beforeEach seeds two extra branches, so head office has several to choose from.
    const dialog = await openInventoryTab(page, DEFAULT_ADMIN);

    await expect(dialog.getByLabel('Branch', { exact: true })).toBeVisible();
    expect(pageErrors.filter((m) => m.includes('useFormField')), 'the Branch field must not read FormField context').toEqual([]);
  });

  // 669431b: a product belongs to ONE branch, so head office picks the branch
  // first and the picker offers only that branch's warehouses. This replaces the
  // old "tells warehouses of different branches apart by branch name" test, which
  // assumed one picker listing every branch's warehouses side by side.
  test('head office chooses the branch first, and the picker offers only that branch', async ({ page }) => {
    const branchA: any[] = await testQuery('SELECT name FROM branches WHERE id = ?', [seeded.branchId]);
    const branchB: any[] = await testQuery('SELECT name FROM branches WHERE id = ?', [otherBranch.branchId]);
    const otherWh: any[] = await testQuery('SELECT name FROM warehouses WHERE id = ?', [otherBranch.warehouseId]);
    const dialog = await openInventoryTab(page, DEFAULT_ADMIN);

    const chooseBranch = async (name: string) => {
      await dialog.getByLabel('Branch', { exact: true }).click();
      await page.getByRole('option', { name, exact: true }).click();
    };

    await chooseBranch(branchA[0].name);
    let pop = await openWarehousePicker(page, dialog);
    await expect(pop.getByRole('option', { name: nameA })).toBeVisible();
    await expect(pop.getByRole('option', { name: nameB })).toBeVisible();
    await expect(pop.getByRole('option', { name: otherWh[0].name })).toHaveCount(0);
    // Type some stock, to show it does NOT survive the switch below.
    await pop.getByLabel(`Initial stock for ${nameA}`, { exact: true }).fill('7');
    await closeWarehousePicker(page, pop);

    // Switching branch swaps the offered warehouses and REPLACES the selection with
    // the new branch's (every one ticked, at 0). Carrying the old picks across
    // would build exactly the payload the server refuses.
    await chooseBranch(branchB[0].name);
    pop = await openWarehousePicker(page, dialog);
    const other = pop.getByRole('option', { name: otherWh[0].name });
    await expect(other).toBeVisible();
    await expect(other).toHaveAttribute('data-ticked', 'true');
    await expect(pop.getByLabel(`Initial stock for ${otherWh[0].name}`, { exact: true })).toHaveValue('0');
    await expect(pop.getByRole('option', { name: nameA })).toHaveCount(0);
    await expect(pop.getByRole('option', { name: nameB })).toHaveCount(0);
    await closeWarehousePicker(page, pop);

    // ...and switching back does not bring the 7 typed earlier back.
    await chooseBranch(branchA[0].name);
    pop = await openWarehousePicker(page, dialog);
    await expect(pop.getByLabel(`Initial stock for ${nameA}`, { exact: true })).toHaveValue('0');
    await closeWarehousePicker(page, pop);
  });

  /**
   * Fill the required fields, run setUp on the Inventory tab, then submit and
   * return the create server action's body (whitespace stripped) instead of
   * letting it run.
   */
  async function submitAndCapture(
    page: Page,
    dialog: Locator,
    productName: string,
    setUp: (dialog: Locator) => Promise<void>,
  ): Promise<string> {
    await fillRequiredFields(page, dialog, productName);
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await setUp(dialog);

    const sent: string[] = [];
    await page.route('**/products**', async (route) => {
      const req = route.request();
      const body = req.postData() ?? '';
      if (req.method() === 'POST' && req.headers()['next-action'] && body.includes(productName)) {
        sent.push(body);
        await route.abort();
        return;
      }
      await route.continue();
    });

    await dialog.getByRole('button', { name: 'Add Product' }).click();
    await expect.poll(() => sent.length).toBeGreaterThan(0);
    return sent[0].replace(/\s/g, '');
  }

  test('submitting sends each warehouse with its stock, and the first one ticked is the primary', async ({ page }) => {
    const productName = `Payload ${tag}`;
    createdNames.push(productName);
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));

    const compact = await submitAndCapture(page, dialog, productName, async (d) => {
      const pop = await openWarehousePicker(page, d);
      // Both start ticked. Untick and re-tick A so it is the SECOND one ticked:
      // B is then the first, and so the primary.
      await pop.getByRole('option', { name: nameA }).click();
      await pop.getByRole('option', { name: nameA }).click();
      await pop.getByLabel(`Initial stock for ${nameA}`, { exact: true }).fill('5');
      await pop.getByLabel(`Initial stock for ${nameB}`, { exact: true }).fill('9');
      await closeWarehousePicker(page, pop);
    });

    expect(compact).toMatch(new RegExp(`"warehouseId":"${whA}"[^}]*"stock":5`));
    expect(compact).toMatch(new RegExp(`"warehouseId":"${whB}"[^}]*"stock":9`));
    expect(compact).toMatch(new RegExp(`"warehouseId":"${whB}"[^}]*"isPrimary":true`));
    expect(compact).not.toMatch(new RegExp(`"warehouseId":"${whA}"[^}]*"isPrimary":true`));
  });

  test('unticking the primary promotes the next warehouse in the payload', async ({ page }) => {
    const productName = `Promote ${tag}`;
    createdNames.push(productName);
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));

    const compact = await submitAndCapture(page, dialog, productName, async (d) => {
      const pop = await openWarehousePicker(page, d);
      // Make B the primary (first ticked), then untick it: A is the only one left
      // and must be flagged primary - it was explicitly NOT primary a moment ago.
      await pop.getByRole('option', { name: nameA }).click();
      await pop.getByRole('option', { name: nameA }).click();
      await pop.getByRole('option', { name: nameB }).click();
      await closeWarehousePicker(page, pop);
    });

    expect(compact).not.toContain(`"warehouseId":"${whB}"`);
    expect(compact).toMatch(new RegExp(`"warehouseId":"${whA}"[^}]*"isPrimary":true`));
  });
});
