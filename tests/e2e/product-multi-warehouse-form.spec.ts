import { test, expect, type Page, type Locator } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN, type SessionUser } from './helpers/auth';
import { selectCategory } from './helpers/product-form';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';
import { TEST_BRAND, TEST_CATEGORY, TEST_UNIT } from './fixtures/test-data';

/**
 * Ang Inventory tab sa Add Product dili na single-select: ang warehouse picker
 * multi-select na, ug kada napili nga warehouse naay kaugalingon nga initial
 * stock input ug primary marker. Cost ug reorder point nagpabilin nga usa ra
 * ka shared field para sa tibuok submission.
 *
 * Ang tanan test moagi sa dialog (UI surface). Ang write path (Task 5) wala pa
 * ania dinhi: ang mga test nga mo-submit mag-assert lang sa unsa ang gipadala o
 * sa dili pag-padala.
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

function picker(dialog: Locator) {
  return dialog.getByLabel(/^Warehouses/);
}

async function openPicker(page: Page, dialog: Locator) {
  await picker(dialog).click();
  const pop = page.locator('[data-radix-popper-content-wrapper]');
  // Naghulat sa listahan nga ma-load.
  await expect(pop.getByRole('option').first()).toBeVisible();
  return pop;
}

async function closePicker(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toBeHidden();
}

async function chooseWarehouses(page: Page, dialog: Locator, names: string[]) {
  const pop = await openPicker(page, dialog);
  for (const n of names) {
    await pop.getByRole('option', { name: n }).click();
  }
  await closePicker(page);
}

function rows(dialog: Locator) {
  return dialog.getByTestId('warehouse-row');
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

  test('selecting two warehouses shows a stock input for each', async ({ page }) => {
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));

    await expect(rows(dialog)).toHaveCount(0);
    await chooseWarehouses(page, dialog, [nameA, nameB]);

    await expect(rows(dialog)).toHaveCount(2);
    const stockA = dialog.getByLabel(`Initial stock for ${nameA}`, { exact: true });
    const stockB = dialog.getByLabel(`Initial stock for ${nameB}`, { exact: true });
    await expect(stockA).toBeVisible();
    await expect(stockB).toBeVisible();

    // Kada warehouse naay kaugalingong stock: ang usa dili mo-apekto sa usa.
    await stockA.fill('7');
    await stockB.fill('3');
    await expect(stockA).toHaveValue('7');
    await expect(stockB).toHaveValue('3');

    // Ang pag-uncheck sa usa mo-wala sa row niini, ug ang stock sa nahabilin dili mausab.
    const pop = await openPicker(page, dialog);
    await pop.getByRole('option', { name: nameA }).click();
    await closePicker(page);
    await expect(rows(dialog)).toHaveCount(1);
    await expect(dialog.getByLabel(`Initial stock for ${nameB}`, { exact: true })).toHaveValue('3');
  });

  test('the first selected warehouse is the primary by default and the primary can be changed', async ({ page }) => {
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));

    // Gi-pili una ang B, unya A: ang una nga napili (B), dili ang una sa listahan.
    await chooseWarehouses(page, dialog, [nameB, nameA]);
    const primaryA = dialog.getByRole('radio', { name: `Primary warehouse: ${nameA}`, exact: true });
    const primaryB = dialog.getByRole('radio', { name: `Primary warehouse: ${nameB}`, exact: true });
    await expect(primaryB).toBeChecked();
    await expect(primaryA).not.toBeChecked();

    await primaryA.click();
    await expect(primaryA).toBeChecked();
    await expect(primaryB).not.toBeChecked();

    // Kon ang primary gi-tangtang, ang nahabilin mahimong primary (kinahanglan naay usa).
    const pop = await openPicker(page, dialog);
    await pop.getByRole('option', { name: nameA }).click();
    await closePicker(page);
    await expect(dialog.getByRole('radio', { name: `Primary warehouse: ${nameB}`, exact: true })).toBeChecked();
  });

  test('a branch user cannot submit with zero warehouses selected', async ({ page }) => {
    const productName = `Branch NoWH ${tag}`;
    createdNames.push(productName);
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));
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
    await chooseWarehouses(page, dialog, [nameA]);
    await expect(dialog.getByText('Select at least one warehouse for this product.')).toBeHidden();
  });

  test('head office can submit with zero warehouses selected', async ({ page }) => {
    const productName = `HO NoWH ${tag}`;
    createdNames.push(productName);
    const dialog = await openInventoryTab(page, DEFAULT_ADMIN);
    await expect(dialog.getByText('Warehouses (Optional)')).toBeVisible();
    await fillRequiredFields(page, dialog, productName);

    await dialog.getByRole('button', { name: 'Add Product' }).click();

    await expect(dialog).toBeHidden({ timeout: 20000 });
    const created: any[] = await testQuery('SELECT id, warehouse_id FROM products WHERE name = ?', [productName]);
    expect(created).toHaveLength(1);
    expect(created[0].warehouse_id).toBeNull();
  });

  test("the picker lists only the branch's active warehouses", async ({ page }) => {
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));
    const pop = await openPicker(page, dialog);

    await expect(pop.getByRole('option')).toHaveCount(2);
    await expect(pop.getByRole('option', { name: nameA })).toBeVisible();
    await expect(pop.getByRole('option', { name: nameB })).toBeVisible();
    // Inactive ug laing branch nga warehouse dili makita.
    await expect(pop.getByRole('option', { name: nameInactive })).toHaveCount(0);
    const other: any[] = await testQuery('SELECT name FROM warehouses WHERE id = ?', [otherBranch.warehouseId]);
    await expect(pop.getByRole('option', { name: other[0].name })).toHaveCount(0);
  });

  test('cost and reorder point appear once, not per warehouse', async ({ page }) => {
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));
    await chooseWarehouses(page, dialog, [nameA, nameB]);
    await expect(rows(dialog)).toHaveCount(2);

    // Walay cost o reorder input sulod sa warehouse section: ang row naay stock ra.
    for (const i of [0, 1]) {
      const row = rows(dialog).nth(i);
      await expect(row.getByRole('spinbutton')).toHaveCount(1);
      await expect(row.getByLabel(/cost/i)).toHaveCount(0);
      await expect(row.getByLabel(/reorder/i)).toHaveCount(0);
    }
    await expect(dialog.getByLabel(/reorder/i)).toHaveCount(0);
    await expect(dialog.getByText(/shared by every warehouse/i)).toBeVisible();

    // Ang cost naa sa base selling-unit row, usa ra bisan duha ang warehouse.
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    await expect(dialog.getByLabel('Cost (₱)')).toHaveCount(1);
  });

  test('head office tells warehouses of different branches apart by branch name', async ({ page }) => {
    const branch: any[] = await testQuery('SELECT name FROM branches WHERE id = ?', [seeded.branchId]);
    const dialog = await openInventoryTab(page, DEFAULT_ADMIN);
    const pop = await openPicker(page, dialog);

    const option = pop.getByRole('option', { name: nameA });
    await expect(option).toBeVisible();
    await expect(option).toContainText(branch[0].name);
    await closePicker(page);
  });

  test('submitting sends each warehouse with its stock and the primary flag', async ({ page }) => {
    const productName = `Payload ${tag}`;
    createdNames.push(productName);
    const dialog = await openInventoryTab(page, branchUser(seeded.userUid));
    await fillRequiredFields(page, dialog, productName);
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await chooseWarehouses(page, dialog, [nameA, nameB]);
    await dialog.getByLabel(`Initial stock for ${nameA}`, { exact: true }).fill('5');
    await dialog.getByLabel(`Initial stock for ${nameB}`, { exact: true }).fill('9');
    await dialog.getByRole('radio', { name: `Primary warehouse: ${nameB}`, exact: true }).click();

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

    const compact = sent[0].replace(/\s/g, '');
    expect(compact).toMatch(new RegExp(`"warehouseId":"${whA}"[^}]*"stock":5`));
    expect(compact).toMatch(new RegExp(`"warehouseId":"${whB}"[^}]*"stock":9`));
    expect(compact).toMatch(new RegExp(`"warehouseId":"${whB}"[^}]*"isPrimary":true`));
    expect(compact).not.toMatch(new RegExp(`"warehouseId":"${whA}"[^}]*"isPrimary":true`));
  });
});
