import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';import { selectCategory } from './helpers/product-form';
import { resetPosState, testQuery } from './helpers/db';
import {
  TEST_BRAND,
  TEST_CATEGORY,
  TEST_UNIT,
  TEST_PRICE_LEVEL,
  TEST_PRICE_LEVEL_WHOLESALE,
  TEST_SUPPLIER,
  TEST_WAREHOUSE,
  TEST_PAYMENT_METHOD,
  PO_PRODUCT,
} from './fixtures/test-data';

/**
 * "Add New Product" sulod sa New Purchase Order page (/purchases/new) (DB-backed).
 *
 * Coverage:
 *  1. Ang button disabled samtang walay supplier; human mapili ang supplier,
 *     mo-abli ang Add Product sheet sa ibabaw sa PO, Standard-only, ug ang
 *     supplier naka-prefill isip primary mapping.
 *  2. Human ma-save, ang bag-ong product mo-gawas isip PO item row (qty 1 + cost).
 *  3. Ang "No products found." empty state sa autocomplete dropdown naghatag sa samang
 *     action, nga ang gi-type nga text prefilled isip product name.
 *  4. Edit PO: ang wala-pa-ma-save nga edit sa order dili ma-reset human mag-add
 *     ug bag-ong product.
 *  5. Pending approval: wala'y row nga gidugang sa PO.
 */

const WORKFLOW_ID = 'wf-po-newprod-e2e';

async function selectOption(page: Page, dialog: Locator, label: string | RegExp, optionName: string) {
  await dialog.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: optionName }).click();
}

/** Open a fresh PO page (/purchases/new) from /purchases and return its locator. */
async function openPurchaseOrder(page: Page) {
  await seedSession(page, DEFAULT_ADMIN);
  await page.goto('/purchases');
  await page.getByRole('link', { name: 'Add New Purchase Order' }).click();
  await expect(page).toHaveURL(/\/purchases\/new/);
  const poDialog = page.getByRole('main');
  await expect(poDialog.getByRole('button', { name: 'Create Order' })).toBeVisible();
  return poDialog;
}

/** Fill the required Add Product fields (Basic Info, Inventory, Selling Units). */
async function fillRequiredProductFields(
  page: Page,
  dialog: Locator,
  opts: { name?: string; description: string; cost: string },
) {
  if (opts.name) await dialog.getByLabel('Product Name').fill(opts.name);
  await dialog.getByLabel('Description', { exact: true }).fill(opts.description);
  await selectOption(page, dialog, 'Brand', TEST_BRAND.name);
  await selectCategory(page, dialog, TEST_CATEGORY.name);

  await dialog.getByRole('tab', { name: 'Inventory' }).click();
  await dialog.getByLabel('Initial Stock').fill('0');

  await dialog.getByRole('tab', { name: 'Selling Units' }).click();
  const base = dialog.locator('div.bg-card.border.rounded-md.shadow-sm').nth(0);
  await selectOption(page, dialog, 'Unit Name', `${TEST_UNIT.name} (${TEST_UNIT.abbreviation})`);
  // product_selling_units.barcode is globally UNIQUE.
  await base.getByLabel('Barcode').fill(`PO${Date.now()}`.slice(-10));
  await base.getByLabel('Cost (₱)').fill(opts.cost);
  await base.getByLabel(`${TEST_PRICE_LEVEL.name} (₱)`).fill('100');
  await base.getByLabel(`${TEST_PRICE_LEVEL_WHOLESALE.name} (₱)`).fill('100');
}

test.describe('Purchase order: Add New Product', () => {
  test('button is guarded without a supplier, then creates a product that lands in the PO items', async ({ page }) => {
    test.setTimeout(120_000);
    const name = `PO New Product ${Date.now()}`;
    const poDialog = await openPurchaseOrder(page);

    // --- Guard: no supplier chosen yet ---
    const addNew = poDialog.getByRole('button', { name: 'Add New Product' });
    await expect(addNew).toBeDisabled();

    // --- Supplier chosen: the button unlocks ---
    await selectOption(page, poDialog, 'Supplier', TEST_SUPPLIER.name);
    await expect(addNew).toBeEnabled();
    await addNew.click();

    // The Add Product sheet sits above the PO dialog and takes the focus/clicks.
    const addDialog = page.getByRole('dialog', { name: 'Add New Product' });
    await expect(addDialog).toBeVisible();
    // Services can't be purchased: the Standard/Service toggle is gone.
    await expect(addDialog.getByRole('group', { name: 'Product type' })).toHaveCount(0);

    await fillRequiredProductFields(page, addDialog, {
      name,
      description: 'Created from inside the purchase order dialog.',
      cost: '80',
    });

    // The PO's supplier is pre-mapped as the primary supplier.
    await addDialog.getByRole('tab', { name: 'Suppliers' }).click();
    const mappingRow = addDialog.locator('div.bg-card.border.rounded-md.shadow-sm');
    await expect(mappingRow).toHaveCount(1);
    await expect(mappingRow.getByLabel('Supplier', { exact: true })).toContainText(TEST_SUPPLIER.name);
    await expect(mappingRow.getByLabel('Primary supplier', { exact: true })).toBeChecked();

    await addDialog.getByRole('button', { name: 'Add Product' }).click();
    await expect(addDialog).toBeHidden();

    // The purchase order itself must NOT have been submitted by that save.
    await expect(poDialog).toBeVisible();

    // A row for the new product appears: qty 1 and the product's cost.
    const row = poDialog.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await expect(row.locator('input[name="items.0.quantity"]')).toHaveValue('1');
    await expect(row.locator('input[name="items.0.cost"]')).toHaveValue(/80/);
  });

  test('autocomplete: typing suggests products; click and exact-SKU Enter both add a row', async ({ page }) => {
    test.setTimeout(90_000);
    const poDialog = await openPurchaseOrder(page);
    await selectOption(page, poDialog, 'Supplier', TEST_SUPPLIER.name);
    const search = poDialog.getByPlaceholder('Scan barcode, enter SKU, or type product name');

    // Partial name -> inline suggestion; clicking it adds the row and clears the input.
    await search.fill('PO Line');
    await poDialog.getByRole('option', { name: new RegExp(PO_PRODUCT.name) }).click();
    const row = poDialog.getByRole('row', { name: new RegExp(PO_PRODUCT.name) });
    await expect(row.locator('input[name="items.0.quantity"]')).toHaveValue('1');
    await expect(search).toHaveValue('');

    // Exact SKU + Enter adds again (bumps the qty of the same product).
    await search.fill(PO_PRODUCT.sku);
    await page.keyboard.press('Enter');
    await expect(row.locator('input[name="items.0.quantity"]')).toHaveValue('2');
  });

  test('Back asks to discard an order with unsaved items, and Discard returns to the list', async ({ page }) => {
    test.setTimeout(90_000);
    const poDialog = await openPurchaseOrder(page);
    await selectOption(page, poDialog, 'Supplier', TEST_SUPPLIER.name);

    // Add an item so the form is dirty.
    await poDialog.getByPlaceholder('Scan barcode, enter SKU, or type product name').fill(PO_PRODUCT.sku);
    await page.keyboard.press('Enter');
    await expect(poDialog.getByRole('row', { name: new RegExp(PO_PRODUCT.name) })).toBeVisible();

    await poDialog.getByRole('button', { name: 'Back to purchase orders' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Discard this purchase order?' });
    await expect(confirm).toBeVisible();

    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await expect(confirm).toBeHidden();
    await expect(page).toHaveURL(/\/purchases\/new/);

    await poDialog.getByRole('button', { name: 'Cancel' }).click();
    await confirm.getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(/\/purchases$/);
  });

  test('"No products found." offers Add New Product with the typed text as the name', async ({ page }) => {
    test.setTimeout(90_000);
    const typed = `Zzz Not Stocked ${Date.now()}`;
    const poDialog = await openPurchaseOrder(page);
    await selectOption(page, poDialog, 'Supplier', TEST_SUPPLIER.name);

    await poDialog.getByPlaceholder('Scan barcode, enter SKU, or type product name').fill(typed);

    // The suggestions open inline under the input (no separate search dialog).
    await expect(poDialog.getByText('No products found.')).toBeVisible();
    await poDialog.locator('[cmdk-empty]').getByRole('button', { name: 'Add New Product' }).click();

    const addDialog = page.getByRole('dialog', { name: 'Add New Product' });
    await expect(addDialog).toBeVisible();
    await expect(addDialog.getByLabel('Product Name')).toHaveValue(typed);
  });

  test('Edit PO: adding a product keeps the order\'s unsaved edits and appends the new row', async ({ page, request }) => {
    test.setTimeout(120_000);
    const reference = `PO-E2E-ADDNEW-${Date.now()}`;
    const name = `PO Edit New Product ${Date.now()}`;

    const created = await request.post('/api/purchase-orders', {
      data: {
        supplierId: TEST_SUPPLIER.id,
        supplierName: TEST_SUPPLIER.name,
        date: new Date().toISOString(),
        paymentMethod: TEST_PAYMENT_METHOD.name,
        purchaseType: 'Order',
        status: 'Pending',
        reference,
        receiveToWarehouse: TEST_WAREHOUSE.id,
        receiveToWarehouseName: TEST_WAREHOUSE.name,
        shipping: 0,
        orderedBy: DEFAULT_ADMIN.displayName,
        items: [
          {
            productId: PO_PRODUCT.id,
            productName: PO_PRODUCT.name,
            quantity: 5,
            cost: PO_PRODUCT.cost,
            sellingPrice: PO_PRODUCT.price,
            discount: 0,
            discountType: 'amount',
            vatSubject: false,
          },
        ],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/purchases');
    const listRow = page.getByRole('row', { name: new RegExp(reference) });
    await expect(listRow).toBeVisible();
    await listRow.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();

    await expect(page).toHaveURL(new RegExp('/purchases/.+/edit'));
    const poDialog = page.getByRole('main');
    const existingRow = poDialog.getByRole('row', { name: new RegExp(PO_PRODUCT.name) });
    await expect(existingRow).toBeVisible();

    // An unsaved edit that a re-initialisation of the order would throw away.
    await existingRow.locator('input[name="items.0.quantity"]').fill('7');

    await poDialog.getByRole('button', { name: 'Add New Product' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Add New Product' });
    await expect(addDialog).toBeVisible();
    await fillRequiredProductFields(page, addDialog, {
      name,
      description: 'Created from inside an edited purchase order.',
      cost: '80',
    });
    await addDialog.getByRole('button', { name: 'Add Product' }).click();
    await expect(addDialog).toBeHidden();

    await expect(poDialog.getByRole('row', { name: new RegExp(name) })).toBeVisible();
    // Give the post-save refetches time to land, then check nothing was reset.
    await page.waitForTimeout(2_000);
    await expect(poDialog.getByRole('row', { name: new RegExp(name) })).toHaveCount(1);
    await expect(poDialog.getByRole('row', { name: new RegExp(PO_PRODUCT.name) }).locator('input[name="items.0.quantity"]')).toHaveValue('7');
  });

  test('Restock from the products page: adding a product keeps the Ref # and the chosen supplier', async ({ page, request }) => {
    test.setTimeout(120_000);
    const otherSupplier = { id: `sup_e2e_${Date.now()}`, name: `E2E Other Supplier ${Date.now()}` };
    const name = `PO Restock New Product ${Date.now()}`;
    const created = await request.post('/api/suppliers', { data: otherSupplier });
    expect(created.ok(), await created.text()).toBeTruthy();

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await page.getByPlaceholder('Search products...').fill(PO_PRODUCT.name);
    const productRow = page.getByRole('row', { name: new RegExp(PO_PRODUCT.name) });
    await expect(productRow).toBeVisible();
    await productRow.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('menuitem', { name: 'Restock' }).click();

    // Restock prefills the product's own supplier; the user switches to another.
    await expect(page).toHaveURL(/\/purchases\/new\?productId=/);
    const poDialog = page.getByRole('main');
    await expect(poDialog.getByRole('combobox', { name: 'Supplier' })).toContainText(TEST_SUPPLIER.name);
    await selectOption(page, poDialog, 'Supplier', otherSupplier.name);
    await expect(poDialog.getByRole('combobox', { name: 'Supplier' })).toContainText(otherSupplier.name);
    const refBefore = await poDialog.getByLabel('Ref #').inputValue();
    expect(refBefore).toMatch(/^PO-/);

    await poDialog.getByRole('button', { name: 'Add New Product' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Add New Product' });
    await expect(addDialog).toBeVisible();
    await fillRequiredProductFields(page, addDialog, {
      name,
      description: 'Created from a restock purchase order.',
      cost: '80',
    });
    await addDialog.getByRole('button', { name: 'Add Product' }).click();
    await expect(addDialog).toBeHidden();

    // The products page refetches its rows after the save (a new `prefillProduct`
    // object); that must not re-initialise the order.
    await expect(poDialog.getByRole('row', { name: new RegExp(name) })).toBeVisible();
    await page.waitForTimeout(2_000);
    await expect(poDialog.getByRole('row', { name: new RegExp(name) })).toHaveCount(1);
    await expect(poDialog.getByRole('combobox', { name: 'Supplier' })).toContainText(otherSupplier.name);
    await expect(poDialog.getByLabel('Ref #')).toHaveValue(refBefore);
  });

  test.describe('pending approval', () => {
    test.beforeEach(async () => {
      await resetPosState();
      await testQuery("DELETE FROM approval_queue WHERE transaction_type='PRODUCT_CREATE'");
      await testQuery('DELETE FROM approval_workflows WHERE id=?', [WORKFLOW_ID]);
    });

    test.afterAll(async ({ request }) => {
      // A left-on switch would break the other add-product specs.
      await testQuery('DELETE FROM approval_workflows WHERE id=?', [WORKFLOW_ID]);
      await testQuery("DELETE FROM approval_queue WHERE transaction_type='PRODUCT_CREATE'");
      await request.post('/api/pos-settings', { data: { requireProductConfirmation: false } });
    });

    test('a product held for approval adds nothing to the PO', async ({ page, request }) => {
      test.setTimeout(120_000);
      const nonAdminRole = await testQuery("SELECT id FROM user_types WHERE name <> 'Admin' ORDER BY id LIMIT 1");
      const roleId = nonAdminRole[0]?.id ?? (await testQuery('SELECT id FROM user_types LIMIT 1'))[0]?.id;
      await testQuery(
        "INSERT INTO approval_workflows (id, transaction_type, user_type_id, step_order) VALUES (?, 'PRODUCT_CREATE', ?, 1)",
        [WORKFLOW_ID, roleId],
      );
      const res = await request.post('/api/pos-settings', { data: { requireProductConfirmation: true } });
      expect(res.ok(), await res.text()).toBeTruthy();

      const name = `PO Pending Product ${Date.now()}`;
      const poDialog = await openPurchaseOrder(page);
      await selectOption(page, poDialog, 'Supplier', TEST_SUPPLIER.name);
      await poDialog.getByRole('button', { name: 'Add New Product' }).click();

      const addDialog = page.getByRole('dialog', { name: 'Add New Product' });
      await expect(addDialog).toBeVisible();
      await fillRequiredProductFields(page, addDialog, {
        name,
        description: 'Submitted for approval from the purchase order dialog.',
        cost: '70',
      });
      await addDialog.getByRole('button', { name: 'Add Product' }).click();
      await expect(addDialog).toBeHidden();

      await expect(page.getByText('Submitted for Approval', { exact: true })).toBeVisible();
      await expect(poDialog.getByText('No items added')).toBeVisible();
      await expect(poDialog.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
    });
  });
});
