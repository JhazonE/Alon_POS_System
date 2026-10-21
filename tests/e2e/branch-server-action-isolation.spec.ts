import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  grantPermission,
  setUserBranch,
  seedProductInWarehouse,
  type SeededBranch,
} from './helpers/branches';
import {
  ALL_BRANCHES_PERMISSION,
  BranchResolutionError,
  assertProductInScope,
  assertWarehouseInBranch,
  assertTerminalInBranch,
} from '../../lib/branch-context';
import { testQuery } from './helpers/db';
import { seedSession } from './helpers/auth';
import { EDITABLE_PRODUCT, TEST_SUPPLIER } from './fixtures/test-data';

/**
 * 'use server' actions walay request object, mao nga ang branch guard niini
 * naggikan sa signed session cookie (resolveScopeFromSession), dili sa body.
 *
 * Ang mga test mo-drive sa tinuod nga products UI isip user sa branch A. Ang
 * products list wala pa ma-filter sa branch, mao nga makita sa A ang produkto
 * sa B — mao ang gap nga gisirhan sa guard. Kada isolation test mo-assert nga
 * ang target row WALA mausab (dili lang nga naay error), aron mapakita nga
 * ang cross-branch write tinuod nga napugngan.
 */

function branchUser(seeded: SeededBranch) {
  return {
    uid: seeded.userUid,
    username: 'branch.user',
    userType: 'Admin',
    roleId: 1,
    displayName: 'Branch User',
    photoURL: null,
    permissions: ['*'],
  };
}

/** Mo-seed ug produkto nga kompleto ang field aron molampos ang edit form validation. */
async function seedFullProduct(warehouseId: string, tag: string) {
  const id = `ba-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const sku = `BA-${tag}-${Date.now()}`.toUpperCase();
  const name = `Branch Action Widget ${tag} ${Date.now()}`;
  await testQuery(
    `INSERT INTO products (id, name, price, cost, stock, sku, description, brand, category, unit_of_measure, availability, warehouse_id)
     VALUES (?, ?, 40, 20, 5, ?, 'Product para sa server-action isolation.', ?, ?, ?, 'Available', ?)`,
    [id, name, sku, EDITABLE_PRODUCT.brand, EDITABLE_PRODUCT.category, EDITABLE_PRODUCT.unitOfMeasure, warehouseId]
  );
  return { id, sku, name };
}

async function readProduct(id: string) {
  const rows: any = await testQuery(
    'SELECT name, warehouse_id, stock FROM products WHERE id = ?',
    [id]
  );
  return rows[0] as { name: string; warehouse_id: string | null; stock: number } | undefined;
}

async function cleanupProducts(...ids: string[]) {
  for (const id of ids) {
    await testQuery('DELETE FROM supplier_product_mapping WHERE product_id = ?', [id]);
    await testQuery('DELETE FROM products WHERE id = ?', [id]);
  }
}

function isServerActionPost(r: { request(): { method(): string; headers(): Record<string, string> } }) {
  const req = r.request();
  return req.method() === 'POST' && !!req.headers()['next-action'];
}

/**
 * I-rewrite ang args sa server-action POST. Mao kini ang "crafted request":
 * ang UI nag-ingon A, ang wire mo-ingon B.
 */
async function rewriteNextServerAction(
  page: Page,
  mutate: (args: any[]) => void
): Promise<void> {
  await page.route('**/products**', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST' || !req.headers()['next-action']) {
      await route.continue();
      return;
    }
    const raw = req.postData();
    let args: any;
    try {
      args = raw ? JSON.parse(raw) : null;
    } catch {
      args = null;
    }
    if (!Array.isArray(args)) {
      await route.continue();
      return;
    }
    mutate(args);
    await route.continue({ postData: JSON.stringify(args) });
  });
}

async function openRowMenu(page: Page, sku: string, name: string) {
  await page.getByPlaceholder('Search products...').fill(sku);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open menu' }).click();
}

/** Ablihi ang Edit dialog, usba ang ngalan, ug i-save; ibalik ang server-action response. */
async function editNameViaUI(page: Page, p: { sku: string; name: string }, newName: string) {
  await page.goto('/products');
  await openRowMenu(page, p.sku, p.name);
  await page.getByRole('menuitem', { name: 'Edit Product' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Edit Product')).toBeVisible();
  await dialog.getByLabel('Product Name').fill(newName);
  const action = page.waitForResponse(isServerActionPost);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  return action;
}

async function deleteViaUI(page: Page, p: { sku: string; name: string }) {
  await page.goto('/products');
  await openRowMenu(page, p.sku, p.name);
  await page.getByRole('menuitem', { name: 'Delete Product' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText('Are you sure?')).toBeVisible();
  const action = page.waitForResponse(isServerActionPost);
  await confirm.getByRole('button', { name: 'Delete' }).click();
  return action;
}

test.describe('updateProduct (server action) — branch isolation', () => {
  test('dili mausab sa branch A ang produkto sa branch B pinaagi sa server action', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const product = await seedFullProduct(b.warehouseId, 'UPD-X');
    try {
      await seedSession(page, branchUser(a));
      await editNameViaUI(page, product, 'HIJACKED BY BRANCH A');

      const row = await readProduct(product.id);
      expect(row?.name).toBe(product.name);
      expect(row?.warehouse_id).toBe(b.warehouseId);
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-refuse ang pag-usab sa produkto sa B bisan gi-omit ang warehouse (existing warehouse ra ang basehan)', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const product = await seedFullProduct(b.warehouseId, 'OMIT-X');
    try {
      await seedSession(page, branchUser(a));
      // Walay incoming warehouse nga ma-assert: ang existing warehouse sa
      // produkto ra ang mopugong sa write.
      await rewriteNextServerAction(page, (args) => {
        if (args[1] && typeof args[1] === 'object') delete args[1].warehouse;
      });
      await editNameViaUI(page, product, 'OMITTED WAREHOUSE HIJACK');

      const row = await readProduct(product.id);
      expect(row?.name).toBe(product.name);
      expect(row?.warehouse_id).toBe(b.warehouseId);
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-refuse ang pag-NULL sa warehouse_id sa produkto sa laing branch', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const product = await seedFullProduct(b.warehouseId, 'NULL-X');
    try {
      await seedSession(page, branchUser(a));
      await rewriteNextServerAction(page, (args) => {
        if (args[1] && typeof args[1] === 'object') args[1].warehouse = '';
      });
      await editNameViaUI(page, product, 'DETACHED BY BRANCH A');

      const row = await readProduct(product.id);
      expect(row?.warehouse_id, 'dili ma-detach ang produkto sa B').toBe(b.warehouseId);
      expect(row?.name).toBe(product.name);
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-refuse ang pag-NULL sa warehouse_id sa kaugalingong produkto (one-way door)', async ({ page }) => {
    const a = await seedSecondBranch();
    const product = await seedFullProduct(a.warehouseId, 'NULL-OWN');
    try {
      await seedSession(page, branchUser(a));
      await rewriteNextServerAction(page, (args) => {
        if (args[1] && typeof args[1] === 'object') args[1].warehouse = '';
      });
      await editNameViaUI(page, product, 'SELF DETACHED');

      const row = await readProduct(product.id);
      expect(row?.warehouse_id, 'branch user dili makaguba sa branch scope sa produkto').toBe(a.warehouseId);
      expect(row?.name).toBe(product.name);
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-refuse ang pagbalhin sa kaugalingong produkto ngadto sa warehouse sa laing branch', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const product = await seedFullProduct(a.warehouseId, 'MOVE-OUT');
    try {
      await seedSession(page, branchUser(a));
      await rewriteNextServerAction(page, (args) => {
        if (args[1] && typeof args[1] === 'object') args[1].warehouse = b.warehouseId;
      });
      await editNameViaUI(page, product, 'MOVED TO B');

      const row = await readProduct(product.id);
      expect(row?.warehouse_id).toBe(a.warehouseId);
      expect(row?.name).toBe(product.name);
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang pag-usab sa kaugalingong produkto', async ({ page }) => {
    const a = await seedSecondBranch();
    const product = await seedFullProduct(a.warehouseId, 'UPD-OWN');
    try {
      await seedSession(page, branchUser(a));
      await editNameViaUI(page, product, 'Renamed By Owner');

      await expect(async () => {
        const row = await readProduct(product.id);
        expect(row?.name).toBe('Renamed By Owner');
        expect(row?.warehouse_id).toBe(a.warehouseId);
      }).toPass({ timeout: 10_000 });
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office (all_branches) makausab sa produkto sa bisan unsang branch', async ({ page }) => {
    const hq = await seedSecondBranch();
    const b = await seedSecondBranch();
    const product = await seedFullProduct(b.warehouseId, 'UPD-HQ');
    try {
      await grantPermission(hq.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(hq.userUid, null);
      await seedSession(page, branchUser(hq));
      await editNameViaUI(page, product, 'Renamed By HQ');

      await expect(async () => {
        const row = await readProduct(product.id);
        expect(row?.name).toBe('Renamed By HQ');
      }).toPass({ timeout: 10_000 });
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(hq);
    }
  });

  test('walay cookie (pre-upgrade session) — mo-fallback sa wala-guard nga batasan', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const product = await seedFullProduct(b.warehouseId, 'UPD-NOCK');
    try {
      await seedSession(page, branchUser(a));
      await page.context().clearCookies();
      await editNameViaUI(page, product, 'Renamed Without Cookie');

      await expect(async () => {
        const row = await readProduct(product.id);
        expect(row?.name).toBe('Renamed Without Cookie');
      }).toPass({ timeout: 10_000 });
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

/**
 * Ang setPrimarySupplier ug addProduct walay UI path nga mo-drive niini nga
 * labing diretso, apan ang matag export sa 'use server' file mao ang publiko
 * nga endpoint. Mao nga ang test mo-tawag niini sama sa gibuhat sa browser:
 * POST sa action id (gikan sa server-reference manifest) uban sa session cookie
 * sa context.
 */
function actionIdFor(exportedName: string, fileSuffix = 'products/actions.ts'): string {
  for (const dir of ['.next-test/dev/server', '.next-test/server']) {
    const file = path.join(process.cwd(), dir, 'server-reference-manifest.json');
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [id, entry] of Object.entries<any>(manifest.node ?? {})) {
      if (entry.exportedName === exportedName && String(entry.filename).includes(fileSuffix)) {
        return id;
      }
    }
  }
  throw new Error(`Server action ${exportedName} wala sa manifest`);
}

async function callServerAction(
  page: Page,
  exportedName: string,
  args: unknown[],
  target: { route: string; fileSuffix: string } = { route: '/products', fileSuffix: 'products/actions.ts' }
): Promise<any> {
  // I-compile una ang page nga mo-import sa action aron naa na kini sa manifest.
  await page.goto(target.route);
  const res = await page.request.post(target.route, {
    headers: {
      'Next-Action': actionIdFor(exportedName, target.fileSuffix),
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
    },
    data: JSON.stringify(args),
  });
  const text = await res.text();
  // Flight response: ang return value naa sa usa sa mga "<id>:<json>" lines
  // (ang uban kay debug/chunk refs), mao nga pangitaon ang object nga naay `success`.
  for (const line of text.split('\n')) {
    const m = /^[0-9a-f]+:(\{.*\})$/.exec(line);
    if (!m) continue;
    try {
      const value = JSON.parse(m[1]);
      if (value && typeof value === 'object' && 'success' in value) return value;
    } catch {
      /* dili JSON — sunod nga line */
    }
  }
  throw new Error(`Walay action result sa response: ${text.slice(0, 500)}`);
}

async function readMapping(id: string) {
  const rows: any = await testQuery(
    'SELECT is_primary FROM supplier_product_mapping WHERE id = ?',
    [id]
  );
  return rows[0] as { is_primary: number } | undefined;
}

async function seedMapping(productId: string, isPrimary: boolean, rop: number) {
  const id = `${productId}-m`;
  await testQuery(
    `INSERT INTO supplier_product_mapping
       (id, product_id, supplier_id, supplier_lead_time, supplier_specific_rop, is_primary)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [id, productId, TEST_SUPPLIER.id, rop, isPrimary ? 1 : 0]
  );
  return id;
}

async function readReorderPoint(productId: string): Promise<number> {
  const rows: any = await testQuery('SELECT reorder_point FROM products WHERE id = ?', [productId]);
  return Number(rows[0].reorder_point);
}

test.describe('setPrimarySupplier (server action) — branch isolation', () => {
  test('dili mausab sa branch A ang primary supplier sa produkto sa branch B', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const product = await seedFullProduct(b.warehouseId, 'SPS-X');
    const mappingId = await seedMapping(product.id, false, 9);
    try {
      await seedSession(page, branchUser(a));
      const result = await callServerAction(page, 'setPrimarySupplier', [product.id, mappingId]);

      expect(result.success).toBe(false);
      expect((await readMapping(mappingId))?.is_primary).toBe(0);
      expect(await readReorderPoint(product.id)).toBe(0);
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili makatabok ang mappingId sa produkto sa B pinaagi sa kaugalingong productId', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const own = await seedFullProduct(a.warehouseId, 'SPS-OWN');
    const foreign = await seedFullProduct(b.warehouseId, 'SPS-FOR');
    const ownMapping = await seedMapping(own.id, true, 3);
    const foreignMapping = await seedMapping(foreign.id, false, 9);
    try {
      await seedSession(page, branchUser(a));
      const result = await callServerAction(page, 'setPrimarySupplier', [own.id, foreignMapping]);

      expect(result.success).toBe(false);
      expect((await readMapping(foreignMapping))?.is_primary, 'mapping sa B wala mausab').toBe(0);
      // Rolled back: ang kaugalingong produkto dili mawad-an ug primary.
      expect((await readMapping(ownMapping))?.is_primary).toBe(1);
    } finally {
      await cleanupProducts(own.id, foreign.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang pag-set sa primary supplier sa kaugalingong produkto', async ({ page }) => {
    const a = await seedSecondBranch();
    const product = await seedFullProduct(a.warehouseId, 'SPS-OK');
    const mappingId = await seedMapping(product.id, false, 9);
    try {
      await seedSession(page, branchUser(a));
      const result = await callServerAction(page, 'setPrimarySupplier', [product.id, mappingId]);

      expect(result.success).toBe(true);
      expect((await readMapping(mappingId))?.is_primary).toBe(1);
      expect(await readReorderPoint(product.id)).toBe(9);
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('addProduct (server action) — branch isolation', () => {
  const formFor = (name: string, warehouse: string | undefined) => ({
    name,
    brand: EDITABLE_PRODUCT.brand,
    description: 'Gi-himo sa isolation test.',
    category: EDITABLE_PRODUCT.category,
    unitOfMeasure: EDITABLE_PRODUCT.unitOfMeasure,
    reorderPoint: 0,
    price: 10,
    stock: 1,
    ...(warehouse !== undefined ? { warehouse } : {}),
  });
  const countByName = async (name: string) => {
    const rows: any = await testQuery('SELECT COUNT(*) AS n FROM products WHERE name = ?', [name]);
    return Number(rows[0].n);
  };

  test('dili makahimo ang branch A ug produkto sa warehouse sa branch B', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const name = `Planted In B ${Date.now()}`;
    try {
      await seedSession(page, branchUser(a));
      const result = await callServerAction(page, 'addProduct', [formFor(name, b.warehouseId)]);

      expect(result.success).toBe(false);
      expect(await countByName(name)).toBe(0);
    } finally {
      await testQuery('DELETE FROM products WHERE name = ?', [name]);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili makahimo ang branch user ug produkto nga walay warehouse', async ({ page }) => {
    const a = await seedSecondBranch();
    const name = `Orphan ${Date.now()}`;
    try {
      await seedSession(page, branchUser(a));
      const result = await callServerAction(page, 'addProduct', [formFor(name, undefined)]);

      expect(result.success).toBe(false);
      expect(await countByName(name)).toBe(0);
    } finally {
      await testQuery('DELETE FROM products WHERE name = ?', [name]);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang paghimo ug produkto sa kaugalingong warehouse', async ({ page }) => {
    const a = await seedSecondBranch();
    const name = `Planted In A ${Date.now()}`;
    try {
      await seedSession(page, branchUser(a));
      const result = await callServerAction(page, 'addProduct', [formFor(name, a.warehouseId)]);

      expect(result.success).toBe(true);
      expect(await countByName(name)).toBe(1);
    } finally {
      await testQuery('DELETE FROM products WHERE name = ?', [name]);
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('deleteProduct (server action) — branch isolation', () => {
  test('dili mapapas sa branch A ang produkto sa branch B', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const product = await seedFullProduct(b.warehouseId, 'DEL-X');
    try {
      await seedSession(page, branchUser(a));
      await deleteViaUI(page, product);

      const row = await readProduct(product.id);
      expect(row, 'ang produkto sa B kinahanglan naa pa').toBeTruthy();
      expect(row?.warehouse_id).toBe(b.warehouseId);
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang pagpapas sa kaugalingong produkto', async ({ page }) => {
    const a = await seedSecondBranch();
    const product = await seedFullProduct(a.warehouseId, 'DEL-OWN');
    try {
      await seedSession(page, branchUser(a));
      await deleteViaUI(page, product);

      await expect(async () => {
        expect(await readProduct(product.id)).toBeUndefined();
      }).toPass({ timeout: 10_000 });
    } finally {
      await cleanupProducts(product.id);
      await cleanupSecondBranch(a);
    }
  });
});

/**
 * Ang adjustStock walay UI path nga mo-drive niini nga diretso (ang dialog
 * mo-asa sa localStorage), mao nga gitawag kini isip server action pinaagi sa
 * history/actions.ts. Ang `userId` argument kay gi-pasa sa caller - mao nga
 * DILI kini mahimong basehan sa branch.
 */
const ADJUST_STOCK = { route: '/inventory', fileSuffix: 'inventory/history/actions.ts' };
const adjust = (page: Page, args: unknown[]) => callServerAction(page, 'adjustStock', args, ADJUST_STOCK);

async function readStock(productId: string): Promise<number> {
  const rows: any = await testQuery('SELECT stock FROM products WHERE id = ?', [productId]);
  return Number(rows[0].stock);
}

async function cleanupAdjustments(...productIds: string[]) {
  for (const id of productIds) {
    await testQuery('DELETE FROM stock_adjustments WHERE product_id = ?', [id]);
    await testQuery('DELETE FROM stock_movements WHERE product_id = ?', [id]);
    await testQuery('DELETE FROM inventory_batches WHERE product_id = ?', [id]);
  }
}

test.describe('adjustStock (server action) — branch isolation', () => {
  test('ang cookie sa branch A mo-labaw sa userId sa branch B nga gi-pasa sa caller', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(b.warehouseId, `ADJ-PREM-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      // Cookie = branch A; userId argument = user sa branch B; target = produkto sa B.
      // Kung ang guard mo-basa sa userId, mo-pasar kini nga write.
      const result = await adjust(page, [productId, 5, 'forged userId', b.userUid]);

      expect(result.success).toBe(false);
      expect(await readStock(productId), 'ang stock sa B wala mausab').toBe(10);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-adjust sa branch A ang stock sa produkto sa branch B', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(b.warehouseId, `ADJ-X-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      const result = await adjust(page, [productId, -4, 'cross-branch', a.userUid]);

      expect(result.success).toBe(false);
      expect(await readStock(productId)).toBe(10);
      const adjRows: any = await testQuery('SELECT COUNT(*) AS n FROM stock_adjustments WHERE product_id = ?', [productId]);
      expect(Number(adjRows[0].n), 'walay stock_adjustments row nga nahimo').toBe(0);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-exempt ang guard sa isInternalFinalization flag', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(b.warehouseId, `ADJ-INT-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      const result = await adjust(page, [productId, 3, 'internal flag', a.userUid, true]);

      expect(result.success).toBe(false);
      expect(await readStock(productId)).toBe(10);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang pag-adjust sa stock sa kaugalingong produkto', async ({ page }) => {
    const a = await seedSecondBranch();
    const productId = await seedProductInWarehouse(a.warehouseId, `ADJ-OWN-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      const result = await adjust(page, [productId, 5, 'own product', a.userUid]);

      expect(result.success).toBe(true);
      expect(await readStock(productId)).toBe(15);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-ignore ang scope {all} nga gi-pasa sa caller sa posisyon sa dating scope parameter', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(b.warehouseId, `ADJ-FORGE-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      // Branch-A session, produkto sa B, ug forged scope 'all' sa 7th arg.
      const result = await adjust(page, [
        productId, 5, 'forged scope', a.userUid, false, null,
        { branchId: null, scope: 'all' },
      ]);

      expect(result.success).toBe(false);
      expect(await readStock(productId), 'ang forged scope wala makalabay sa guard').toBe(10);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-ignore ang forged scope {all} bisan sa ubang posisyon sa extra args ug uban sa forged userId', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(b.warehouseId, `ADJ-FORGE2-${Date.now()}`);
    const forged = { branchId: null, scope: 'all' };
    try {
      await seedSession(page, branchUser(a));
      const result = await adjust(page, [
        productId, 5, 'forged scope 2', b.userUid, true, null, forged, forged, forged,
      ]);

      expect(result.success).toBe(false);
      expect(await readStock(productId)).toBe(10);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office (all_branches) maka-adjust sa stock sa bisan unsang branch', async ({ page }) => {
    const hq = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(b.warehouseId, `ADJ-HQ-${Date.now()}`);
    try {
      await grantPermission(hq.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(hq.userUid, null);
      await seedSession(page, branchUser(hq));
      const result = await adjust(page, [productId, 2, 'hq', hq.userUid]);

      expect(result.success).toBe(true);
      expect(await readStock(productId)).toBe(12);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(hq);
    }
  });

  test('walay cookie (pre-upgrade session) — mo-fallback sa wala-guard nga batasan', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(b.warehouseId, `ADJ-NOCK-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      await page.context().clearCookies();
      const result = await adjust(page, [productId, 1, 'no cookie', a.userUid]);

      expect(result.success).toBe(true);
      expect(await readStock(productId)).toBe(11);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

/**
 * Batch writers (submitPriceUpdateBatch, updateProductShelfLocations):
 * ALL-OR-NOTHING. Kung bisan usa ra ka target sa batch ang sa laing branch,
 * ang tibuok batch gisalikway ug walay gisulat - ang partial apply mobiya ug
 * half-done nga update nga walay rekord kung unsa ang gilaktawan. Mao nga ang
 * matag refusal test mo-assert sa DB rows sa TANAN nga targets, lakip ang
 * mga produkto sa kaugalingong branch.
 */
import { SHELF_A, SHELF_B } from './fixtures/test-data';

const PRICING = { route: '/inventory/pricing', fileSuffix: 'inventory/pricing/actions.ts' };
const priceBatch = (page: Page, args: unknown[]) =>
  callServerAction(page, 'submitPriceUpdateBatch', args, PRICING);
const shelfUpdate = (page: Page, args: unknown[]) =>
  callServerAction(page, 'updateProductShelfLocations', args);

function priceItem(productId: string, field: 'price' | 'cost', newValue: number) {
  return {
    productId,
    sku: 'x',
    barcode: '',
    productName: 'Batch item',
    field,
    oldValue: 1,
    newValue,
    adjustmentType: 'exact',
    adjustmentValue: newValue,
  };
}

async function readPriceCost(productId: string) {
  const rows: any = await testQuery('SELECT price, cost FROM products WHERE id = ?', [productId]);
  return {
    price: Number(rows[0].price),
    cost: rows[0].cost === null ? null : Number(rows[0].cost),
  };
}

async function readShelfState(productId: string) {
  const prod: any = await testQuery('SELECT shelf_location_id FROM products WHERE id = ?', [productId]);
  const shelves: any = await testQuery('SELECT COUNT(*) AS n FROM product_shelves WHERE product_id = ?', [productId]);
  const moves: any = await testQuery(
    "SELECT COUNT(*) AS n FROM stock_movements WHERE product_id = ? AND reference_type = 'shelf_transfer'",
    [productId]
  );
  return {
    shelfLocationId: prod[0].shelf_location_id as string | null,
    shelfRows: Number(shelves[0].n),
    movements: Number(moves[0].n),
  };
}

async function cleanupShelfState(...productIds: string[]) {
  for (const id of productIds) {
    await testQuery('DELETE FROM product_shelves WHERE product_id = ?', [id]);
    await testQuery('DELETE FROM stock_movements WHERE product_id = ?', [id]);
  }
}

test.describe('submitPriceUpdateBatch (server action) — branch isolation, all-or-nothing', () => {
  test('kung usa ra sa batch ang sa laing branch, walay bisan usa nga ma-apply', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const a1 = await seedProductInWarehouse(a.warehouseId, `PB-A1-${Date.now()}`);
    const a2 = await seedProductInWarehouse(a.warehouseId, `PB-A2-${Date.now()}`);
    const b1 = await seedProductInWarehouse(b.warehouseId, `PB-B1-${Date.now()}`);
    try {
      const before = [await readPriceCost(a1), await readPriceCost(a2), await readPriceCost(b1)];
      await seedSession(page, branchUser(a));
      const result = await priceBatch(page, [
        a.warehouseId,
        [priceItem(a1, 'price', 55), priceItem(a2, 'cost', 33), priceItem(b1, 'price', 77)],
        a.userUid,
      ]);

      expect(result.success).toBe(false);
      // Tanan tulo: ang duha sa A DILI usab maapektuhan (walay partial apply).
      expect(await readPriceCost(a1), 'a1 wala mausab').toEqual(before[0]);
      expect(await readPriceCost(a2), 'a2 wala mausab').toEqual(before[1]);
      expect(await readPriceCost(b1), 'b1 wala mausab').toEqual(before[2]);
    } finally {
      await cleanupProducts(a1, a2, b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('dili ma-exempt ang guard sa isInternalFinalization flag, ug gi-ignore ang forged scope {all}', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const a1 = await seedProductInWarehouse(a.warehouseId, `PB-F-A1-${Date.now()}`);
    const b1 = await seedProductInWarehouse(b.warehouseId, `PB-F-B1-${Date.now()}`);
    const forged = { branchId: null, scope: 'all' };
    try {
      const before = [await readPriceCost(a1), await readPriceCost(b1)];
      await seedSession(page, branchUser(a));
      const result = await priceBatch(page, [
        a.warehouseId,
        [priceItem(a1, 'price', 55), priceItem(b1, 'price', 77)],
        b.userUid,
        true,
        forged,
        forged,
      ]);

      expect(result.success).toBe(false);
      expect(await readPriceCost(a1)).toEqual(before[0]);
      expect(await readPriceCost(b1)).toEqual(before[1]);
    } finally {
      await cleanupProducts(a1, b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang batch nga tanan sa kaugalingong branch', async ({ page }) => {
    const a = await seedSecondBranch();
    const a1 = await seedProductInWarehouse(a.warehouseId, `PB-OK-A1-${Date.now()}`);
    const a2 = await seedProductInWarehouse(a.warehouseId, `PB-OK-A2-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      const result = await priceBatch(page, [
        a.warehouseId,
        [priceItem(a1, 'price', 55), priceItem(a2, 'cost', 33)],
        a.userUid,
      ]);

      expect(result.success).toBe(true);
      expect(result.applied).toBe(2);
      expect((await readPriceCost(a1)).price).toBe(55);
      expect((await readPriceCost(a2)).cost).toBe(33);
    } finally {
      await cleanupProducts(a1, a2);
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office (all_branches) maka-apply ug batch nga tabok sa mga branch', async ({ page }) => {
    const hq = await seedSecondBranch();
    const b = await seedSecondBranch();
    const hq1 = await seedProductInWarehouse(hq.warehouseId, `PB-HQ-1-${Date.now()}`);
    const b1 = await seedProductInWarehouse(b.warehouseId, `PB-HQ-2-${Date.now()}`);
    try {
      await grantPermission(hq.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(hq.userUid, null);
      await seedSession(page, branchUser(hq));
      const result = await priceBatch(page, [
        hq.warehouseId,
        [priceItem(hq1, 'price', 55), priceItem(b1, 'price', 77)],
        hq.userUid,
      ]);

      expect(result.success).toBe(true);
      expect((await readPriceCost(hq1)).price).toBe(55);
      expect((await readPriceCost(b1)).price).toBe(77);
    } finally {
      await cleanupProducts(hq1, b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(hq);
    }
  });

  test('walay cookie (pre-upgrade session) — mo-fallback sa wala-guard nga batasan', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const a1 = await seedProductInWarehouse(a.warehouseId, `PB-NC-A1-${Date.now()}`);
    const b1 = await seedProductInWarehouse(b.warehouseId, `PB-NC-B1-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      await page.context().clearCookies();
      const result = await priceBatch(page, [
        a.warehouseId,
        [priceItem(a1, 'price', 55), priceItem(b1, 'price', 77)],
        a.userUid,
      ]);

      expect(result.success).toBe(true);
      expect((await readPriceCost(a1)).price).toBe(55);
      expect((await readPriceCost(b1)).price).toBe(77);
    } finally {
      await cleanupProducts(a1, b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('updateProductShelfLocations (server action) — branch isolation, all-or-nothing', () => {
  test('kung usa ra sa batch ang sa laing branch, walay shelf assignment nga ma-apply', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const a1 = await seedProductInWarehouse(a.warehouseId, `SL-A1-${Date.now()}`);
    const a2 = await seedProductInWarehouse(a.warehouseId, `SL-A2-${Date.now()}`);
    const b1 = await seedProductInWarehouse(b.warehouseId, `SL-B1-${Date.now()}`);
    try {
      const before = [await readShelfState(a1), await readShelfState(a2), await readShelfState(b1)];
      await seedSession(page, branchUser(a));
      const result = await shelfUpdate(page, [
        [
          { productId: a1, shelfLocationId: SHELF_A.id },
          { productId: a2, shelfLocationId: SHELF_A.id },
          { productId: b1, shelfLocationId: SHELF_A.id },
        ],
        a.userUid,
      ]);

      expect(result.success).toBe(false);
      expect(await readShelfState(a1), 'a1 wala mausab').toEqual(before[0]);
      expect(await readShelfState(a2), 'a2 wala mausab').toEqual(before[1]);
      expect(await readShelfState(b1), 'b1 wala mausab').toEqual(before[2]);
    } finally {
      await cleanupShelfState(a1, a2, b1);
      await cleanupProducts(a1, a2, b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('kung usa ra sa transfer batch ang sa laing branch, walay shelf row o stock movement nga ma-sulat', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const a1 = await seedProductInWarehouse(a.warehouseId, `SL-T-A1-${Date.now()}`);
    const a2 = await seedProductInWarehouse(a.warehouseId, `SL-T-A2-${Date.now()}`);
    const b1 = await seedProductInWarehouse(b.warehouseId, `SL-T-B1-${Date.now()}`);
    try {
      const before = [await readShelfState(a1), await readShelfState(a2), await readShelfState(b1)];
      await seedSession(page, branchUser(a));
      const result = await shelfUpdate(page, [
        [
          { productId: a1, sourceShelfId: 'unassigned', targetShelfId: SHELF_B.id, quantity: 2 },
          { productId: a2, sourceShelfId: 'unassigned', targetShelfId: SHELF_B.id, quantity: 2 },
          { productId: b1, sourceShelfId: 'unassigned', targetShelfId: SHELF_B.id, quantity: 2 },
        ],
        a.userUid,
        true,
      ]);

      expect(result.success).toBe(false);
      expect(await readShelfState(a1), 'a1 wala mausab').toEqual(before[0]);
      expect(await readShelfState(a2), 'a2 wala mausab').toEqual(before[1]);
      expect(await readShelfState(b1), 'b1 wala mausab').toEqual(before[2]);
    } finally {
      await cleanupShelfState(a1, a2, b1);
      await cleanupProducts(a1, a2, b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-ignore ang forged scope {all} sa extra args', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const b1 = await seedProductInWarehouse(b.warehouseId, `SL-F-B1-${Date.now()}`);
    const forged = { branchId: null, scope: 'all' };
    try {
      await seedSession(page, branchUser(a));
      const result = await shelfUpdate(page, [
        [{ productId: b1, shelfLocationId: SHELF_A.id }],
        b.userUid,
        true,
        forged,
        forged,
      ]);

      expect(result.success).toBe(false);
      expect((await readShelfState(b1)).shelfLocationId).toBeNull();
    } finally {
      await cleanupShelfState(b1);
      await cleanupProducts(b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('molampos ang batch nga tanan sa kaugalingong branch', async ({ page }) => {
    const a = await seedSecondBranch();
    const a1 = await seedProductInWarehouse(a.warehouseId, `SL-OK-A1-${Date.now()}`);
    const a2 = await seedProductInWarehouse(a.warehouseId, `SL-OK-A2-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      const result = await shelfUpdate(page, [
        [
          { productId: a1, shelfLocationId: SHELF_A.id },
          { productId: a2, sourceShelfId: 'unassigned', targetShelfId: SHELF_B.id, quantity: 2 },
        ],
        a.userUid,
      ]);

      expect(result.success).toBe(true);
      expect((await readShelfState(a1)).shelfLocationId).toBe(SHELF_A.id);
      expect((await readShelfState(a2)).movements).toBe(1);
    } finally {
      await cleanupShelfState(a1, a2);
      await cleanupProducts(a1, a2);
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office (all_branches) maka-apply ug batch nga tabok sa mga branch', async ({ page }) => {
    const hq = await seedSecondBranch();
    const b = await seedSecondBranch();
    const hq1 = await seedProductInWarehouse(hq.warehouseId, `SL-HQ-1-${Date.now()}`);
    const b1 = await seedProductInWarehouse(b.warehouseId, `SL-HQ-2-${Date.now()}`);
    try {
      await grantPermission(hq.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(hq.userUid, null);
      await seedSession(page, branchUser(hq));
      const result = await shelfUpdate(page, [
        [
          { productId: hq1, shelfLocationId: SHELF_A.id },
          { productId: b1, shelfLocationId: SHELF_A.id },
        ],
        hq.userUid,
      ]);

      expect(result.success).toBe(true);
      expect((await readShelfState(hq1)).shelfLocationId).toBe(SHELF_A.id);
      expect((await readShelfState(b1)).shelfLocationId).toBe(SHELF_A.id);
    } finally {
      await cleanupShelfState(hq1, b1);
      await cleanupProducts(hq1, b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(hq);
    }
  });

  test('walay cookie (pre-upgrade session) — mo-fallback sa wala-guard nga batasan', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const b1 = await seedProductInWarehouse(b.warehouseId, `SL-NC-B1-${Date.now()}`);
    try {
      await seedSession(page, branchUser(a));
      await page.context().clearCookies();
      const result = await shelfUpdate(page, [
        [{ productId: b1, shelfLocationId: SHELF_A.id }],
        a.userUid,
      ]);

      expect(result.success).toBe(true);
      expect((await readShelfState(b1)).shelfLocationId).toBe(SHELF_A.id);
    } finally {
      await cleanupShelfState(b1);
      await cleanupProducts(b1);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

/**
 * Approval finalization (/api/approvals/process). Ang processor mo-finalize sa
 * item ubos sa branch sa MOHIMO (approval_queue.created_by, gikan sa DB), dili
 * sa approver. REGRESSION GUARD: sa Task 7 mo-pasar kini sa wala pa ang
 * kausaban (wala pay guard sa same-branch path) - ang trabaho niini mao ang
 * mapakyas kung ma-guba ang finalization.
 */
const PROCESS_URL = '/api/approvals/process';

/** I-queue ang item isip created_by; ibalik ang queue id. Mo-seed usab sa single-step workflow. */
async function queueApprovalItem(type: string, data: unknown, createdBy: string): Promise<string> {
  const queueId = `t7q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await testQuery('DELETE FROM approval_workflows WHERE id = ?', [`t7wf-${type}`]);
  await testQuery(
    "INSERT INTO approval_workflows (id, transaction_type, user_type_id, step_order) VALUES (?, ?, 'ut-admin', 1)",
    [`t7wf-${type}`, type]
  );
  await testQuery(
    "INSERT INTO approval_queue (id, transaction_type, transaction_data, created_by, status, current_step) VALUES (?, ?, ?, ?, 'Pending', 1)",
    [queueId, type, JSON.stringify(data), createdBy]
  );
  return queueId;
}

/** Ang approver kinahanglan Admin (role check sa processor); ang seeded user 'User' ra. */
async function makeApprover(seeded: SeededBranch) {
  await testQuery("UPDATE users SET user_type = 'Admin' WHERE uid = ?", [seeded.userUid]);
}

async function cleanupApprovals(types: string[], ...queueIds: string[]) {
  for (const id of queueIds) {
    await testQuery('DELETE FROM approval_history WHERE approval_queue_id = ?', [id]);
    await testQuery('DELETE FROM approval_queue WHERE id = ?', [id]);
  }
  for (const type of types) {
    await testQuery('DELETE FROM approval_workflows WHERE id = ?', [`t7wf-${type}`]);
  }
}

async function queueStatus(queueId: string): Promise<string> {
  const rows: any = await testQuery('SELECT status FROM approval_queue WHERE id = ?', [queueId]);
  return rows[0].status;
}

test.describe('approvals/process - finalization ubos sa branch sa nag-request', () => {
  test('ang head office nga mo-approve sa item sa branch A mo-sulat sa branch A', async ({ page }) => {
    const a = await seedSecondBranch();
    const hq = await seedSecondBranch();
    const productId = await seedProductInWarehouse(a.warehouseId, `AP-HQ-${Date.now()}`);
    let queueId = '';
    try {
      await grantPermission(hq.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(hq.userUid, null);
      await makeApprover(hq);
      queueId = await queueApprovalItem(
        'STOCK_ADJUSTMENT',
        { productId, quantity: 5, reason: 'queued by A', adjustmentType: 'add' },
        a.userUid
      );
      // Naa'y cookie sa head office; wala kini gamita sa processor.
      await seedSession(page, branchUser(hq));
      const res = await page.request.post(PROCESS_URL, {
        data: { queueId, action: 'Approve', userId: hq.userUid, notes: 't7' },
      });

      expect(res.ok(), await res.text()).toBeTruthy();
      expect(await readStock(productId), 'ang stock sa branch A tinuod nga nausab').toBe(15);
      expect(await queueStatus(queueId)).toBe('Approved');
    } finally {
      await cleanupAdjustments(productId);
      await cleanupApprovals(['STOCK_ADJUSTMENT'], queueId);
      await cleanupSecondBranch(hq);
      await cleanupSecondBranch(a);
    }
  });

  test('molihok ang finalization bisan walay cookie (server-to-server)', async ({ request }) => {
    const a = await seedSecondBranch();
    const productId = await seedProductInWarehouse(a.warehouseId, `AP-NC-${Date.now()}`);
    let queueId = '';
    try {
      await makeApprover(a);
      queueId = await queueApprovalItem(
        'STOCK_ADJUSTMENT',
        { productId, quantity: 3, reason: 'no cookie', adjustmentType: 'add' },
        a.userUid
      );
      // Ang `request` fixture walay cookie jar gikan sa usa ka browser session.
      const res = await request.post(PROCESS_URL, {
        data: { queueId, action: 'Approve', userId: a.userUid },
      });

      expect(res.ok(), await res.text()).toBeTruthy();
      expect(await readStock(productId)).toBe(13);
      expect(await queueStatus(queueId)).toBe('Approved');
    } finally {
      await cleanupAdjustments(productId);
      await cleanupApprovals(['STOCK_ADJUSTMENT'], queueId);
      await cleanupSecondBranch(a);
    }
  });

  test('ang approver sa branch B maka-finalize sa adjustment nga gi-request sa branch A', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(a.warehouseId, `AP-XB-${Date.now()}`);
    let queueId = '';
    try {
      await makeApprover(b);
      queueId = await queueApprovalItem(
        'STOCK_ADJUSTMENT',
        { productId, quantity: -4, reason: 'removal', adjustmentType: 'remove' },
        a.userUid
      );
      await seedSession(page, branchUser(b));
      const res = await page.request.post(PROCESS_URL, {
        data: { queueId, action: 'Approve', userId: b.userUid },
      });

      expect(res.ok(), await res.text()).toBeTruthy();
      expect(await readStock(productId), 'ang produkto sa A (dili sa approver) ang nausab').toBe(6);
    } finally {
      await cleanupAdjustments(productId);
      await cleanupApprovals(['STOCK_ADJUSTMENT'], queueId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang item sa branch A nga mutumong sa produkto sa branch B gi-refuse bisan head office ang approver', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const hq = await seedSecondBranch();
    const productId = await seedProductInWarehouse(b.warehouseId, `AP-FORGE-${Date.now()}`);
    let queueId = '';
    try {
      await grantPermission(hq.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(hq.userUid, null);
      await makeApprover(hq);
      // created_by = A, apan ang produkto naa sa B: ang scope sa nag-request mao ang naggahum.
      queueId = await queueApprovalItem(
        'STOCK_ADJUSTMENT',
        { productId, quantity: 5, reason: 'cross-branch target', adjustmentType: 'add' },
        a.userUid
      );
      await seedSession(page, branchUser(hq));
      const res = await page.request.post(PROCESS_URL, {
        data: { queueId, action: 'Approve', userId: hq.userUid },
      });

      expect(res.ok()).toBeFalsy();
      expect(await readStock(productId), 'ang stock sa B wala mausab').toBe(10);
      expect(await queueStatus(queueId), 'nagpabilin nga Pending').toBe('Pending');
    } finally {
      await cleanupAdjustments(productId);
      await cleanupApprovals(['STOCK_ADJUSTMENT'], queueId);
      await cleanupSecondBranch(hq);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang item nga ang nag-request dili na ma-resolve gi-refuse (fail closed), dili unguarded', async ({ request }) => {
    const a = await seedSecondBranch();
    const productId = await seedProductInWarehouse(a.warehouseId, `AP-GHOST-${Date.now()}`);
    let queueId = '';
    try {
      await makeApprover(a);
      queueId = await queueApprovalItem(
        'STOCK_ADJUSTMENT',
        { productId, quantity: 5, reason: 'ghost creator', adjustmentType: 'add' },
        `ghost-${Date.now()}`
      );
      const res = await request.post(PROCESS_URL, {
        data: { queueId, action: 'Approve', userId: a.userUid },
      });

      expect(res.ok()).toBeFalsy();
      expect(await res.text()).toContain('Cannot determine the requesting branch');
      expect(await readStock(productId)).toBe(10);
      expect(await queueStatus(queueId)).toBe('Pending');
    } finally {
      await cleanupAdjustments(productId);
      await cleanupApprovals(['STOCK_ADJUSTMENT'], queueId);
      await cleanupSecondBranch(a);
    }
  });

  test('ang approver sa branch B maka-finalize sa PRODUCT_CREATE nga gi-request sa branch A', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const name = `AP Created Widget ${Date.now()}`;
    let queueId = '';
    try {
      await makeApprover(b);
      queueId = await queueApprovalItem(
        'PRODUCT_CREATE',
        {
          name, brand: EDITABLE_PRODUCT.brand, category: EDITABLE_PRODUCT.category,
          description: 'queued by A', unitOfMeasure: EDITABLE_PRODUCT.unitOfMeasure,
          price: 10, cost: 5, stock: 0, reorderPoint: 0, warehouse: a.warehouseId,
        },
        a.userUid
      );
      await seedSession(page, branchUser(b));
      const res = await page.request.post(PROCESS_URL, {
        data: { queueId, action: 'Approve', userId: b.userUid },
      });

      expect(res.ok(), await res.text()).toBeTruthy();
      const rows: any = await testQuery('SELECT warehouse_id FROM products WHERE name = ?', [name]);
      expect(rows.length, 'nahimo ang produkto').toBe(1);
      expect(rows[0].warehouse_id, 'sa warehouse sa branch A').toBe(a.warehouseId);
    } finally {
      await testQuery('DELETE FROM products WHERE name = ?', [name]);
      await cleanupApprovals(['PRODUCT_CREATE'], queueId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang PRODUCT_CREATE sa branch A nga mutumong sa warehouse sa branch B gi-refuse', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const name = `AP Refused Widget ${Date.now()}`;
    let queueId = '';
    try {
      await makeApprover(a);
      queueId = await queueApprovalItem(
        'PRODUCT_CREATE',
        {
          name, brand: EDITABLE_PRODUCT.brand, category: EDITABLE_PRODUCT.category,
          description: 'wrong warehouse', unitOfMeasure: EDITABLE_PRODUCT.unitOfMeasure,
          price: 10, cost: 5, stock: 0, reorderPoint: 0, warehouse: b.warehouseId,
        },
        a.userUid
      );
      const res = await request.post(PROCESS_URL, {
        data: { queueId, action: 'Approve', userId: a.userUid },
      });

      expect(res.ok()).toBeFalsy();
      const rows: any = await testQuery('SELECT id FROM products WHERE name = ?', [name]);
      expect(rows.length, 'walay produkto nga nahimo').toBe(0);
      expect(await queueStatus(queueId)).toBe('Pending');
    } finally {
      await testQuery('DELETE FROM products WHERE name = ?', [name]);
      await cleanupApprovals(['PRODUCT_CREATE'], queueId);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang approver sa branch B maka-finalize sa SHELF_TRANSFER ug PRICE_UPDATE nga gi-request sa branch A', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const productId = await seedProductInWarehouse(a.warehouseId, `AP-SP-${Date.now()}`);
    let shelfQueue = '';
    let priceQueue = '';
    try {
      await makeApprover(b);
      shelfQueue = await queueApprovalItem(
        'SHELF_TRANSFER',
        { updates: [{ productId, shelfLocationId: SHELF_A.id }] },
        a.userUid
      );
      priceQueue = await queueApprovalItem(
        'PRICE_UPDATE',
        { warehouseId: a.warehouseId, items: [priceItem(productId, 'price', 55)] },
        a.userUid
      );
      await seedSession(page, branchUser(b));
      for (const queueId of [shelfQueue, priceQueue]) {
        const res = await page.request.post(PROCESS_URL, {
          data: { queueId, action: 'Approve', userId: b.userUid },
        });
        expect(res.ok(), await res.text()).toBeTruthy();
      }

      expect((await readShelfState(productId)).shelfLocationId).toBe(SHELF_A.id);
      expect((await readPriceCost(productId)).price).toBe(55);
    } finally {
      await cleanupShelfState(productId);
      await cleanupProducts(productId);
      await cleanupApprovals(['SHELF_TRANSFER', 'PRICE_UPDATE'], shelfQueue, priceQueue);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

/**
 * Type-confusion: ang server-action args moabot gikan sa wire ug ang TS types
 * nawala na. lib/mysql.ts naggamit ug pool.query, mao nga ang OBJECT nga
 * parameter ma-escape nga `key` = value — ang `WHERE id = ?` nga adunay
 * {supplier_id: 0} mahimong `WHERE id = `supplier_id` = 0`, nga motugma sa
 * daghang row. Ang assert nagbasa ra sa rows[0], busa kung ang unang row
 * naa sa branch sa attacker, molapas ang guard samtang ang write mo-igo sa
 * tanan. Ang assert kinahanglan mo-refuse sa non-string id sa sinugdanan.
 */
test.describe('object-id type confusion — branch isolation', () => {
  const ATTACK_ID = { supplier_id: 0 };

  async function setSupplier(productId: string) {
    await testQuery('UPDATE products SET supplier_id = ? WHERE id = ?', [TEST_SUPPLIER.id, productId]);
  }

  async function countReorder(rop: number): Promise<number> {
    const rows: any = await testQuery('SELECT COUNT(*) AS n FROM products WHERE reorder_point = ?', [rop]);
    return Number(rows[0].n);
  }

  test('gi-refuse ang object nga productId sa setPrimarySupplier ug walay row nga mausab', async ({ page }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const rop = 4242;
    // Ang '!' nga prefix mohimo nga ang produkto sa A ang unang row sa table scan,
    // aron ang rows[0]-only nga assert molapas kung wala ang type check.
    const own = await seedFullProduct(a.warehouseId, 'OBJ-OWN');
    const foreign = await seedFullProduct(b.warehouseId, 'OBJ-FOR');
    const ownId = `!${own.id}`;
    await testQuery('UPDATE products SET id = ? WHERE id = ?', [ownId, own.id]);
    await setSupplier(ownId);
    await setSupplier(foreign.id);
    const ownMapping = await seedMapping(ownId, false, rop);
    try {
      const before = await countReorder(rop);
      await seedSession(page, branchUser(a));
      const result = await callServerAction(page, 'setPrimarySupplier', [ATTACK_ID, ownMapping]);

      expect(result.success).toBe(false);
      expect(await readReorderPoint(foreign.id), 'reorder_point sa produkto sa B wala mausab').not.toBe(rop);
      expect(await readReorderPoint(ownId)).not.toBe(rop);
      expect((await readMapping(ownMapping))?.is_primary).toBe(0);
      expect(await countReorder(rop), 'walay row nga na-update').toBe(before);
    } finally {
      await cleanupProducts(ownId, foreign.id);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('gi-refuse sa tulo ka assert ang object/walay-sulod nga id, bisan sa head office', async () => {
    const single = { scope: 'single', branchId: 'any-branch' } as const;
    const all = { scope: 'all', branchId: null } as const;
    const bad: unknown[] = [ATTACK_ID, { id: 1 }, ['x'], 0, 1, null, undefined, ''];
    for (const scope of [single, all]) {
      for (const id of bad) {
        for (const assertFn of [assertProductInScope, assertWarehouseInBranch, assertTerminalInBranch]) {
          await expect(assertFn(id as string, scope)).rejects.toBeInstanceOf(BranchResolutionError);
        }
      }
    }
  });
});

/**
 * Ang valid nga cookie sa user nga wala na sa DB (gipapas) mohimo nga mo-throw
 * ang resolveScopeFromSession. Ang tulo ka wrapper kinahanglan mobalik ug
 * ilang kaugalingong failure shape, dili unhandled server error.
 */
test.describe('wrapper nga ang cookie dili na ma-resolve — mobalik ug failure, dili mo-throw', () => {
  test('adjustStock, updateProductShelfLocations ug submitPriceUpdateBatch', async ({ page }) => {
    const a = await seedSecondBranch();
    const product = await seedFullProduct(a.warehouseId, 'GHOST');
    try {
      await seedSession(page, { ...branchUser(a), uid: `ghost-cookie-${Date.now()}` });
      const adj = await callServerAction(page, 'adjustStock', [product.id, 1, 'ghost'], ADJUST_STOCK);
      const shelf = await callServerAction(page, 'updateProductShelfLocations', [
        [{ productId: product.id, shelfLocationId: SHELF_A.id }],
      ]);
      const price = await callServerAction(
        page,
        'submitPriceUpdateBatch',
        [a.warehouseId, [priceItem(product.id, 'price', 50)], 'ghost'],
        PRICING
      );

      for (const r of [adj, shelf, price]) expect(r.success).toBe(false);
      expect(await readStock(product.id)).toBe(5);
      expect((await readPriceCost(product.id)).price).toBe(40);
    } finally {
      await cleanupAdjustments(product.id);
      await cleanupProducts(product.id);
      await cleanupSecondBranch(a);
    }
  });
});
