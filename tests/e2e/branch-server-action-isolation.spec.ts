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
import { ALL_BRANCHES_PERMISSION } from '../../lib/branch-context';
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
