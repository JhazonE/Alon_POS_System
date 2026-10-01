import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';
import { EDITABLE_PRODUCT, DELETABLE_PRODUCT, TEST_SUPPLIER } from './fixtures/test-data';

/**
 * Edit / Delete product (DB-backed) — i-drive ang products table row actions batok
 * sa alon_pos_test. Naggamit ug dedicated seeded products (EDIT-ME / DELETE-ME) aron
 * dili maapektuhan ang ubang specs.
 */

/** I-search ang product pinaagi sa SKU dayon ablihi ang iyang row action menu. */
async function openRowMenu(page: Page, sku: string, name: string) {
  await page.getByPlaceholder('Search products...').fill(sku);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open menu' }).click();
}

test.describe('Edit product', () => {
  test('admin makausab sa ngalan sa product', async ({ page, request }) => {
    const newName = 'Edited Widget Name';

    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await openRowMenu(page, EDITABLE_PRODUCT.sku, EDITABLE_PRODUCT.name);
    await page.getByRole('menuitem', { name: 'Edit Product' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit Product')).toBeVisible();
    // Ang legacy read-only SKU line makita ug mao ang stored value.
    await expect(dialog.getByLabel('SKU', { exact: true })).toHaveValue(EDITABLE_PRODUCT.sku);

    // I-usab ang Product Name dayon i-save.
    await dialog.getByLabel('Product Name').fill(newName);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).toBeHidden();

    // I-verify nga na-persist ang bag-ong ngalan (parehas ra nga SKU).
    const res = await request.get(`/api/products?search=${EDITABLE_PRODUCT.sku}&limit=50`);
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.sku === EDITABLE_PRODUCT.sku);
    expect(match, 'product gihapon naa pinaagi sa SKU').toBeTruthy();
    expect(match.name).toBe(newName);
  });

  test('admin makausab ug product nga walay SKU — dili mo-require ug dili mag-set ug SKU', async ({ page, request }) => {
    const id = 'test-no-sku-1';
    const name = 'No SKU Widget';
    const newName = 'No SKU Widget Renamed';
    await testQuery('DELETE FROM products WHERE id = ?', [id]);
    await testQuery(
      `INSERT INTO products (id, name, price, stock, sku, description, brand, category, unit_of_measure, availability)
       VALUES (?, ?, 40, 5, NULL, 'Product nga walay SKU.', ?, ?, ?, 'Available')`,
      [id, name, EDITABLE_PRODUCT.brand, EDITABLE_PRODUCT.category, EDITABLE_PRODUCT.unitOfMeasure],
    );
    try {
      await seedSession(page, DEFAULT_ADMIN);
      await page.goto('/products');
      await openRowMenu(page, name, name);
      await page.getByRole('menuitem', { name: 'Edit Product' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Edit Product')).toBeVisible();
      // No SKU line for a product that has none.
      await expect(dialog.getByLabel('SKU', { exact: true })).toHaveCount(0);

      await dialog.getByLabel('Product Name').fill(newName);
      await dialog.getByRole('button', { name: 'Save Changes' }).click();
      await expect(dialog).toBeHidden();

      const [row] = await testQuery('SELECT name, sku FROM products WHERE id = ?', [id]);
      expect(row.name).toBe(newName);
      expect(row.sku, 'SKU stays NULL, not empty string').toBeNull();
    } finally {
      await testQuery('DELETE FROM products WHERE id = ?', [id]);
    }
  });
});

/**
 * Product Suppliers tab (Edit) — the SAME form-based panel Add Product uses
 * (components/supplier-mappings-panel.tsx). Rows are added / edited / removed
 * in the form and are written only when "Save Changes" is clicked; Cancel
 * discards them. (The old live-save ProductSuppliers dialog is gone.)
 *
 * Each test seeds its OWN product (and, where needed, a second supplier) so it
 * does not depend on — or disturb — EDITABLE_PRODUCT, whose name the "Edit
 * product" tests above rewrite.
 */
const SECOND_SUPPLIER = { id: 'sup-e2e-second', name: 'E2E Second Supplier' };

type SeedMapping = {
  supplierId: string;
  sku?: string | null;
  leadTime?: number;
  rop?: number;
  cost?: number | null;
  isPrimary?: boolean;
};

/**
 * Seeds a standard product (with a stored SKU so it is searchable) and,
 * optionally, its supplier mappings. `legacySupplierId` sets only
 * products.supplier_id (no mapping row) — the pre-mapping-table shape.
 */
async function seedSupplierProduct(
  id: string,
  opts: { mappings?: SeedMapping[]; legacySupplierId?: string; reorderPoint?: number } = {},
) {
  const sku = `SUPMAP-${id}`;
  const name = `Supplier Map Widget ${id}`;
  await cleanupSupplierProduct(id);
  await testQuery(
    `INSERT INTO products (id, name, price, cost, stock, sku, description, brand, category, unit_of_measure, availability, supplier_id, reorder_point)
     VALUES (?, ?, 40, 20, 5, ?, 'Product para sa supplier-tab e2e.', ?, ?, ?, 'Available', ?, ?)`,
    [
      id, name, sku, EDITABLE_PRODUCT.brand, EDITABLE_PRODUCT.category, EDITABLE_PRODUCT.unitOfMeasure,
      opts.legacySupplierId ?? opts.mappings?.find((m) => m.isPrimary)?.supplierId ?? null,
      opts.reorderPoint ?? opts.mappings?.find((m) => m.isPrimary)?.rop ?? 0,
    ],
  );
  for (const [i, m] of (opts.mappings ?? []).entries()) {
    await testQuery(
      `INSERT INTO supplier_product_mapping
         (id, product_id, supplier_id, supplier_sku, supplier_lead_time, supplier_specific_rop, supplier_cost, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`${id}-m${i}`, id, m.supplierId, m.sku ?? null, m.leadTime ?? 0, m.rop ?? 0, m.cost ?? null, m.isPrimary ? 1 : 0],
    );
  }
  return { id, sku, name };
}

async function cleanupSupplierProduct(id: string) {
  await testQuery('DELETE FROM supplier_product_mapping WHERE product_id = ?', [id]);
  await testQuery('DELETE FROM products WHERE id = ?', [id]);
}

/** Stored mappings for a product. */
async function storedMappings(productId: string) {
  const rows = await testQuery(
    `SELECT supplier_id, supplier_sku, supplier_lead_time, supplier_specific_rop, supplier_cost, is_primary
     FROM supplier_product_mapping WHERE product_id = ? ORDER BY supplier_id`,
    [productId],
  );
  return rows as Array<{
    supplier_id: string; supplier_sku: string | null; supplier_lead_time: number;
    supplier_specific_rop: number; supplier_cost: string | null; is_primary: number;
  }>;
}

async function storedProduct(productId: string) {
  const [row] = await testQuery('SELECT supplier_id, reorder_point FROM products WHERE id = ?', [productId]);
  return row as { supplier_id: string | null; reorder_point: number | null };
}

/** Opens the Edit drawer for a seeded product. */
async function openEditDialog(page: Page, p: { sku: string; name: string }) {
  await page.goto('/products');
  await openRowMenu(page, p.sku, p.name);
  await page.getByRole('menuitem', { name: 'Edit Product' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Edit Product', { exact: true })).toBeVisible();
  return dialog;
}

async function openSuppliersTab(dialog: Locator) {
  await dialog.getByRole('tab', { name: 'Suppliers' }).click();
  // Save is disabled and Add Supplier is blocked while the stored mappings load.
  await expect(dialog.getByText('Loading suppliers…')).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
}

/** One bordered card per mapped supplier (same card markup as the Selling Units rows). */
function mappingRows(dialog: Locator): Locator {
  return dialog.locator('div.bg-card.border.rounded-md.shadow-sm');
}

/** Pick a supplier in a mapping row's Supplier select (options portal to the page). */
async function pickSupplier(page: Page, row: Locator, supplierName: string) {
  await row.getByLabel('Supplier', { exact: true }).click();
  await page.getByRole('option', { name: supplierName }).click();
}

async function saveAndWaitClosed(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Product Suppliers tab (Edit)', () => {
  const ID = {
    add: 'test-supmap-add',
    remove: 'test-supmap-remove',
    removeAll: 'test-supmap-removeall',
    primary: 'test-supmap-primary',
    legacy: 'test-supmap-legacy',
    cancel: 'test-supmap-cancel',
  };

  test.beforeAll(async () => {
    await testQuery('DELETE FROM suppliers WHERE id = ?', [SECOND_SUPPLIER.id]);
    await testQuery('INSERT INTO suppliers (id, name) VALUES (?, ?)', [SECOND_SUPPLIER.id, SECOND_SUPPLIER.name]);
  });

  test.afterAll(async () => {
    for (const id of Object.values(ID)) await cleanupSupplierProduct(id);
    await testQuery('DELETE FROM suppliers WHERE id = ?', [SECOND_SUPPLIER.id]);
  });

  test('admin makadugang ug supplier mapping — ma-save ra kung i-click ang Save Changes, ug mo-persist', async ({ page }) => {
    const p = await seedSupplierProduct(ID.add);
    await seedSession(page, DEFAULT_ADMIN);
    const dialog = await openEditDialog(page, p);
    await openSuppliersTab(dialog);
    await expect(dialog.getByText('No suppliers mapped yet.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Add Supplier' }).click();
    const row = mappingRows(dialog).nth(0);
    await pickSupplier(page, row, TEST_SUPPLIER.name);
    await row.getByLabel('Supplier SKU').fill('E2E-SUP-SKU-1');
    await row.getByLabel('Lead Time (days)').fill('5');
    await row.getByLabel('Cost (₱)').fill('123.45');
    await row.getByLabel('Reorder Point').fill('20');
    // The first row added defaults to primary.
    await expect(row.getByLabel('Primary supplier', { exact: true })).toBeChecked();

    // Form-based: nothing is written until Save Changes (the old dialog live-saved).
    expect(await storedMappings(p.id)).toHaveLength(0);

    await saveAndWaitClosed(dialog);

    await expect(async () => {
      const rows = await storedMappings(p.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].supplier_id).toBe(TEST_SUPPLIER.id);
      expect(rows[0].supplier_sku).toBe('E2E-SUP-SKU-1');
      expect(rows[0].supplier_lead_time).toBe(5);
      expect(rows[0].supplier_specific_rop).toBe(20);
      expect(Number(rows[0].supplier_cost)).toBe(123.45);
      expect(rows[0].is_primary).toBe(1);
    }).toPass({ timeout: 15_000 });
    // The primary mapping propagates onto the product itself.
    const prod = await storedProduct(p.id);
    expect(prod.supplier_id).toBe(TEST_SUPPLIER.id);
    expect(Number(prod.reorder_point)).toBe(20);

    // Reopen — the saved row loads back into the form.
    const reopened = await openEditDialog(page, p);
    await openSuppliersTab(reopened);
    await expect(mappingRows(reopened)).toHaveCount(1);
    const back = mappingRows(reopened).nth(0);
    await expect(back.getByLabel('Supplier', { exact: true })).toContainText(TEST_SUPPLIER.name);
    await expect(back.getByLabel('Supplier SKU')).toHaveValue('E2E-SUP-SKU-1');
    await expect(back.getByLabel('Lead Time (days)')).toHaveValue('5');
    await expect(back.getByLabel('Cost (₱)')).toHaveValue('123.45');
    await expect(back.getByLabel('Reorder Point')).toHaveValue('20');
    await expect(back.getByLabel('Primary supplier', { exact: true })).toBeChecked();
  });

  test('pag-remove sa usa ka row ug Save — mawala ang mapping, ug ang nahabilin mao na ang primary', async ({ page }) => {
    const p = await seedSupplierProduct(ID.remove, {
      mappings: [
        { supplierId: TEST_SUPPLIER.id, sku: 'A-SKU', leadTime: 3, rop: 11, cost: 10, isPrimary: true },
        { supplierId: SECOND_SUPPLIER.id, sku: 'B-SKU', leadTime: 4, rop: 22, cost: 12, isPrimary: false },
      ],
    });
    await seedSession(page, DEFAULT_ADMIN);
    const dialog = await openEditDialog(page, p);
    await openSuppliersTab(dialog);
    await expect(mappingRows(dialog)).toHaveCount(2);

    // Remove the PRIMARY row — the remaining row is promoted to primary.
    const primaryRow = mappingRows(dialog).filter({ has: page.getByLabel('Primary supplier', { exact: true }) });
    await expect(primaryRow).toHaveCount(1);
    await primaryRow.getByRole('button', { name: 'Remove supplier' }).click();
    await expect(mappingRows(dialog)).toHaveCount(1);
    await expect(mappingRows(dialog).nth(0).getByLabel('Supplier', { exact: true })).toContainText(SECOND_SUPPLIER.name);
    await expect(mappingRows(dialog).nth(0).getByLabel('Primary supplier', { exact: true })).toBeChecked();

    // Not saved yet.
    expect(await storedMappings(p.id)).toHaveLength(2);

    await saveAndWaitClosed(dialog);

    await expect(async () => {
      const rows = await storedMappings(p.id);
      expect(rows.map((r) => r.supplier_id)).toEqual([SECOND_SUPPLIER.id]);
      expect(rows[0].is_primary).toBe(1);
    }).toPass({ timeout: 15_000 });
    const prod = await storedProduct(p.id);
    expect(prod.supplier_id).toBe(SECOND_SUPPLIER.id);
    expect(Number(prod.reorder_point)).toBe(22);
  });

  test('pag-remove sa tanang rows ug Save — mawala ang tanang mapping ug ang product supplier', async ({ page }) => {
    const p = await seedSupplierProduct(ID.removeAll, {
      mappings: [{ supplierId: TEST_SUPPLIER.id, leadTime: 2, rop: 9, cost: 10, isPrimary: true }],
    });
    await seedSession(page, DEFAULT_ADMIN);
    const dialog = await openEditDialog(page, p);
    await openSuppliersTab(dialog);
    await expect(mappingRows(dialog)).toHaveCount(1);

    await mappingRows(dialog).nth(0).getByRole('button', { name: 'Remove supplier' }).click();
    await expect(mappingRows(dialog)).toHaveCount(0);
    await expect(dialog.getByText('No suppliers mapped yet.')).toBeVisible();
    await saveAndWaitClosed(dialog);

    await expect(async () => {
      expect(await storedMappings(p.id)).toHaveLength(0);
    }).toPass({ timeout: 15_000 });
    const prod = await storedProduct(p.id);
    expect(prod.supplier_id || null).toBeNull();
    expect(Number(prod.reorder_point ?? 0)).toBe(0);
  });

  test('pag-ilis sa primary — walay ma-save hangtod i-click ang Save Changes', async ({ page }) => {
    const p = await seedSupplierProduct(ID.primary, {
      mappings: [
        { supplierId: TEST_SUPPLIER.id, leadTime: 3, rop: 11, cost: 10, isPrimary: true },
        { supplierId: SECOND_SUPPLIER.id, leadTime: 4, rop: 22, cost: 12, isPrimary: false },
      ],
    });
    await seedSession(page, DEFAULT_ADMIN);
    const dialog = await openEditDialog(page, p);
    await openSuppliersTab(dialog);
    await expect(mappingRows(dialog)).toHaveCount(2);

    // Rows are found by their supplier's name, not by position.
    const rowFor = (supplierName: string) =>
      mappingRows(dialog).filter({ has: page.getByLabel('Supplier', { exact: true }).filter({ hasText: supplierName }) });
    const first = rowFor(TEST_SUPPLIER.name);
    const second = rowFor(SECOND_SUPPLIER.name);
    await expect(first.getByLabel('Primary supplier', { exact: true })).toBeChecked();
    await expect(second.getByLabel('Set as primary supplier', { exact: true })).not.toBeChecked();

    // Star the second — no confirmation dialog anymore (the row flips in the form only).
    await second.getByLabel('Set as primary supplier', { exact: true }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(second.getByLabel('Primary supplier', { exact: true })).toBeChecked();
    await expect(first.getByLabel('Set as primary supplier', { exact: true })).not.toBeChecked();
    // Still the old primary in the DB.
    let rows = await storedMappings(p.id);
    expect(rows.find((r) => r.supplier_id === TEST_SUPPLIER.id)?.is_primary).toBe(1);

    await saveAndWaitClosed(dialog);

    await expect(async () => {
      rows = await storedMappings(p.id);
      expect(rows.find((r) => r.supplier_id === SECOND_SUPPLIER.id)?.is_primary).toBe(1);
      expect(rows.find((r) => r.supplier_id === TEST_SUPPLIER.id)?.is_primary).toBe(0);
    }).toPass({ timeout: 15_000 });
    const prod = await storedProduct(p.id);
    expect(prod.supplier_id).toBe(SECOND_SUPPLIER.id);
    // The new primary's ROP propagates onto the product's reorder_point.
    expect(Number(prod.reorder_point)).toBe(22);
  });

  test('legacy product (supplier_id nga walay mapping) — usa ka seeded primary row, ma-save isip mapping', async ({ page }) => {
    const p = await seedSupplierProduct(ID.legacy, { legacySupplierId: TEST_SUPPLIER.id, reorderPoint: 7 });
    expect(await storedMappings(p.id)).toHaveLength(0);

    await seedSession(page, DEFAULT_ADMIN);
    const dialog = await openEditDialog(page, p);
    await openSuppliersTab(dialog);

    // Exactly one row seeded from products.supplier_id / reorder_point, marked primary.
    await expect(dialog.getByText('No suppliers mapped yet.')).toBeHidden();
    await expect(mappingRows(dialog)).toHaveCount(1);
    const row = mappingRows(dialog).nth(0);
    await expect(row.getByLabel('Supplier', { exact: true })).toContainText(TEST_SUPPLIER.name);
    await expect(row.getByLabel('Reorder Point')).toHaveValue(/^7(\.0+)?$/); // DB decimal(…,4) surfaces as '7.0000' for a seeded legacy row
    await expect(row.getByLabel('Primary supplier', { exact: true })).toBeChecked();

    // Saving persists it as a real mapping so the supplier is not silently dropped.
    await saveAndWaitClosed(dialog);
    await expect(async () => {
      const rows = await storedMappings(p.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].supplier_id).toBe(TEST_SUPPLIER.id);
      expect(rows[0].is_primary).toBe(1);
      expect(rows[0].supplier_specific_rop).toBe(7);
    }).toPass({ timeout: 15_000 });
    const prod = await storedProduct(p.id);
    expect(prod.supplier_id).toBe(TEST_SUPPLIER.id);
    expect(Number(prod.reorder_point)).toBe(7);
  });

  test('Cancel mo-discard sa wala pa ma-save nga mapping edits', async ({ page }) => {
    const p = await seedSupplierProduct(ID.cancel, {
      mappings: [{ supplierId: TEST_SUPPLIER.id, sku: 'KEEP-SKU', leadTime: 3, rop: 11, cost: 10, isPrimary: true }],
    });
    await seedSession(page, DEFAULT_ADMIN);
    const dialog = await openEditDialog(page, p);
    await openSuppliersTab(dialog);
    await expect(mappingRows(dialog)).toHaveCount(1);

    // Edit the stored row and add a second one — then bail out with Cancel.
    const row = mappingRows(dialog).nth(0);
    await row.getByLabel('Lead Time (days)').fill('99');
    await row.getByLabel('Reorder Point').fill('77');
    await dialog.getByRole('button', { name: 'Add Supplier' }).click();
    await expect(mappingRows(dialog)).toHaveCount(2);
    await pickSupplier(page, mappingRows(dialog).nth(1), SECOND_SUPPLIER.name);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // Nothing was written.
    const rows = await storedMappings(p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].supplier_id).toBe(TEST_SUPPLIER.id);
    expect(rows[0].supplier_lead_time).toBe(3);
    expect(rows[0].supplier_specific_rop).toBe(11);
    expect(Number((await storedProduct(p.id)).reorder_point)).toBe(11);

    // Reopening shows the stored state, not the discarded edits.
    const reopened = await openEditDialog(page, p);
    await openSuppliersTab(reopened);
    await expect(mappingRows(reopened)).toHaveCount(1);
    const back = mappingRows(reopened).nth(0);
    await expect(back.getByLabel('Lead Time (days)')).toHaveValue('3');
    await expect(back.getByLabel('Reorder Point')).toHaveValue('11');
  });
});

test.describe('Edit Product mirrors Add Product', () => {
  const ID = 'test-editparity-1';

  test.afterAll(async () => {
    await cleanupSupplierProduct(ID);
  });

  test('Inventory tab walay Reorder Point / Supplier (Optional); Stock read-only; Standard type gi-highlight', async ({ page }) => {
    const p = await seedSupplierProduct(ID);
    await seedSession(page, DEFAULT_ADMIN);
    const dialog = await openEditDialog(page, p);

    // Header type control: present, disabled, Standard is the pressed one.
    const typeGroup = dialog.getByRole('group', { name: 'Product type' });
    const standardBtn = typeGroup.getByRole('button', { name: 'Standard', exact: true });
    const serviceBtn = typeGroup.getByRole('button', { name: 'Service', exact: true });
    await expect(standardBtn).toBeDisabled();
    await expect(serviceBtn).toBeDisabled();
    await expect(standardBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(serviceBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByText('Product Type:')).toHaveCount(0);

    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    await expect(dialog.getByText('Warehouse (Optional)')).toBeVisible();
    // Supplier + reorder point moved to the Suppliers tab (per-supplier).
    await expect(dialog.getByText('Supplier (Optional)')).toHaveCount(0);
    await expect(dialog.getByText('Reorder Point')).toHaveCount(0);
    // Stock is a read-only display.
    await expect(dialog.getByText('Stock is updated via transactions.')).toBeVisible();
    const stock = dialog.locator('input[disabled]').first();
    await expect(stock).toBeDisabled();
    await expect(stock).toHaveValue('5');
  });

  test('Selling Units Cost naay supplier-cost picker — disabled kung walay supplier cost, mo-fill sa Cost kung naa', async ({ page }) => {
    const p = await seedSupplierProduct(ID);
    await seedSession(page, DEFAULT_ADMIN);
    const dialog = await openEditDialog(page, p);
    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    const base = mappingRows(dialog).nth(0);
    const picker = base.getByRole('button', { name: 'Pick from supplier cost' });
    await expect(picker).toBeVisible();
    // No supplier mapped yet: picker is present but disabled, with the hint title.
    await expect(picker).toBeDisabled();
    await expect(picker).toHaveAttribute('title', /No supplier cost yet/);

    // Map a supplier with a cost in the (unsaved) Suppliers tab — the picker enables.
    await openSuppliersTab(dialog);
    await dialog.getByRole('button', { name: 'Add Supplier' }).click();
    const row = mappingRows(dialog).nth(0);
    await pickSupplier(page, row, TEST_SUPPLIER.name);
    await row.getByLabel('Cost (₱)').fill('33.5');

    await dialog.getByRole('tab', { name: 'Selling Units' }).click();
    const base2 = mappingRows(dialog).nth(0);
    const picker2 = base2.getByRole('button', { name: 'Pick from supplier cost' });
    await expect(picker2).toBeEnabled();
    await expect(picker2).toHaveAttribute('title', 'Pick from supplier cost');
    await picker2.click();
    await page.getByRole('menuitem', { name: new RegExp(`${TEST_SUPPLIER.name}.*33\\.50`) }).click();
    await expect(base2.getByLabel('Cost (₱)')).toHaveValue('33.5');

    // Unsaved — discard so the seeded product is untouched.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(await storedMappings(p.id)).toHaveLength(0);
  });
});

test.describe('Delete product', () => {
  test('admin makapapas sa product', async ({ page, request }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    await openRowMenu(page, DELETABLE_PRODUCT.sku, DELETABLE_PRODUCT.name);
    await page.getByRole('menuitem', { name: 'Delete Product' }).click();

    // Kumpirmahon sa AlertDialog (Radix role = alertdialog).
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByText('Are you sure?')).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete' }).click();

    // I-verify nga wala na ang product sa DB.
    await expect(async () => {
      const res = await request.get(`/api/products?search=${DELETABLE_PRODUCT.sku}&limit=50`);
      const body = await res.json();
      const match = (body.data ?? []).find((p: any) => p.sku === DELETABLE_PRODUCT.sku);
      expect(match, 'product kinahanglan wala na').toBeFalsy();
    }).toPass({ timeout: 10_000 });
  });
});
