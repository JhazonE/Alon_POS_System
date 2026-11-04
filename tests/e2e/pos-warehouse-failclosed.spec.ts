import { test, expect, type Page, type Request } from '@playwright/test';
import { MySqlProductRepository } from '../../src/infrastructure/repositories/MySqlProductRepository';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  seedProductInWarehouse,
  type SeededBranch,
} from './helpers/branches';
import { testQuery, resetPosState } from './helpers/db';
import { TEST_TERMINAL, TEST_MAIN_WAREHOUSE, TEST_USERS, TEST_PRODUCTS } from './fixtures/test-data';

/**
 * The POS filters its product list by the terminal's `location` column. A blank
 * or unresolvable location used to DROP the warehouse filter (truthiness check),
 * so search returned every warehouse's copy of every product. Since product
 * creation fans out same-sku copies, that is a correctness problem, not a
 * cosmetic one: a cashier could ring up a zero-stock duplicate.
 *
 * "No filter requested" (undefined / null) is not the same as "a filter that
 * did not resolve" ('', whitespace, a non-warehouse string, a non-string). The
 * latter must match NOTHING, in the list and in the count alike.
 */
test.describe('product repository warehouse filter fails closed', () => {
  const repo = new MySqlProductRepository();
  let branch: SeededBranch;
  let whA: string;
  let whB: string;
  let tag: string;

  const listSkuRows = async (warehouseId: any) =>
    (await repo.findAll(50, 0, { search: tag, warehouseId })).filter((p: any) => p.barcode === tag);
  const countSku = (warehouseId: any) => repo.countAll({ search: tag, warehouseId });

  test.beforeEach(async () => {
    branch = await seedSecondBranch();
    whA = branch.warehouseId;
    whB = await addWarehouseToBranch(branch.branchId, { active: true });
    tag = `FC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // Same barcode in two warehouses of one branch: exactly what fan-out produces.
    await seedProductInWarehouse(whA, tag);
    await seedProductInWarehouse(whB, tag);
  });

  test.afterEach(async () => {
    await testQuery('DELETE FROM products WHERE barcode = ?', [tag]);
    await testQuery('DELETE FROM warehouses WHERE id = ?', [whB]);
    await cleanupSecondBranch(branch);
  });

  test('a blank warehouse filter does not return every warehouse copy', async () => {
    expect(await listSkuRows('')).toHaveLength(0);
    expect(await countSku('')).toBe(0);
  });

  test('an unresolvable warehouse id returns nothing rather than everything', async () => {
    // 'Store' is the literal default app/api/pos-terminals/route.ts writes.
    expect(await listSkuRows('Store')).toHaveLength(0);
    expect(await countSku('Store')).toBe(0);
  });

  test('a whitespace-only filter is blank, not a filter to drop', async () => {
    expect(await listSkuRows('   ')).toHaveLength(0);
    expect(await countSku('   ')).toBe(0);
  });

  test('a non-string filter fails closed instead of being read as absent or as a predicate', async () => {
    // pool.query escapes an OBJECT as `key` = value, which would be match-many.
    for (const bad of [{ id: 0 }, ['x'], 0, 7, true]) {
      expect(await listSkuRows(bad), `findAll(${JSON.stringify(bad)})`).toHaveLength(0);
      expect(await countSku(bad), `countAll(${JSON.stringify(bad)})`).toBe(0);
    }
  });

  test('an absent filter (undefined / null) still means no warehouse restriction', async () => {
    for (const absent of [undefined, null]) {
      expect(await listSkuRows(absent)).toHaveLength(2);
      expect(await countSku(absent)).toBe(2);
    }
  });

  test('a real warehouse id still scopes to exactly that warehouse', async () => {
    const rows = await listSkuRows(whA);
    expect(rows).toHaveLength(1);
    expect(rows[0].warehouseId).toBe(whA);
    expect(await countSku(whA)).toBe(1);
    expect(await countSku(whB)).toBe(1);
  });

  test('over HTTP, an explicit blank warehouseId returns nothing', async ({ request }) => {
    const blank = await request.get(`/api/products?warehouseId=&search=${tag}&limit=50`);
    const body = await blank.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);

    const absent = await request.get(`/api/products?search=${tag}&limit=50`);
    expect((await absent.json()).data).toHaveLength(2);
  });
});

/**
 * The POS path. The repository only fails closed if the client actually SENDS the
 * unresolved warehouse: useProducts used to drop a blank `warehouseId`, so a
 * terminal with a blank/NULL location asked for "no filter" and got every
 * warehouse's copy of every product.
 */
test.describe('POS terminal location reaches the product query', () => {
  const barcode = TEST_PRODUCTS[0].barcode;

  test.beforeEach(async () => {
    await resetPosState();
  });

  test.afterEach(async () => {
    await testQuery('UPDATE pos_terminals SET location = ? WHERE id = ?', [TEST_MAIN_WAREHOUSE.id, TEST_TERMINAL.id]);
  });

  function trackProductRequests(page: Page) {
    const seen: { url: URL; request: Request }[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname === '/api/products' && r.method() === 'GET') seen.push({ url: u, request: r });
    });
    return seen;
  }

  async function openPos(page: Page) {
    await page.goto('/pos');
    await page.getByLabel('Username').fill(TEST_USERS.cashier.username);
    await page.getByLabel('Password').fill(TEST_USERS.cashier.password);
    await page.getByRole('button', { name: /login to pos/i }).click();
    await expect(page.getByRole('heading', { name: /start new shift/i })).toBeVisible();
  }

  test('a selected terminal with a blank location lists no products, not every copy', async ({ page }) => {
    await testQuery("UPDATE pos_terminals SET location = '' WHERE id = ?", [TEST_TERMINAL.id]);
    const seen = trackProductRequests(page);
    const bodies: any[] = [];
    page.on('response', async (res) => {
      const u = new URL(res.url());
      if (u.pathname === '/api/products') bodies.push(await res.json().catch(() => null));
    });

    await openPos(page);
    await expect.poll(() => bodies.length, { timeout: 15_000 }).toBeGreaterThan(0);
    // The POS mounts several product queries (list, search, F9 dialog, price
    // inquiry); the first response to land is not all of them. Let them settle.
    await page.waitForTimeout(2000);

    // Every product query carried the (blank) warehouseId explicitly...
    for (const { url } of seen) expect(url.searchParams.has('warehouseId'), url.toString()).toBe(true);
    // ...and the server answered each with nothing.
    for (const b of bodies) {
      expect(b?.success).toBe(true);
      expect(b.data).toHaveLength(0);
    }
  });

  test('control: a terminal with a real warehouse still lists its products', async ({ page }) => {
    const seen = trackProductRequests(page);
    const bodies: any[] = [];
    page.on('response', async (res) => {
      const u = new URL(res.url());
      if (u.pathname === '/api/products') bodies.push(await res.json().catch(() => null));
    });

    await openPos(page);
    await expect.poll(() => bodies.some((b) => b?.data?.some((p: any) => p.barcode === barcode)), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(2000);
    for (const { url } of seen) expect(url.searchParams.get('warehouseId')).toBe(TEST_MAIN_WAREHOUSE.id);
  });

  test('before the terminals have loaded the POS sends no product query at all', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(/\/api\/pos-terminals\?activeOnly=true/, async (route) => {
      await gate;
      await route.continue();
    });
    const seen = trackProductRequests(page);

    await openPos(page);
    // Give any (wrong) unfiltered startup query ample time to fire.
    await page.waitForTimeout(2000);
    expect(seen.map((s) => s.url.toString()), 'no product query while the terminal is unknown').toEqual([]);

    release();
    // Once the terminal resolves the real, warehouse-scoped query runs and the list fills.
    await expect.poll(() => seen.length, { timeout: 15_000 }).toBeGreaterThan(0);
    for (const { url } of seen) expect(url.searchParams.get('warehouseId')).toBe(TEST_MAIN_WAREHOUSE.id);
  });
});
