import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  grantPermission,
  setUserBranch,
  type SeededBranch,
} from './helpers/branches';
import { ALL_BRANCHES_PERMISSION } from '../../lib/branch-context';
import { testQuery } from './helpers/db';
import { seedSession } from './helpers/auth';

/**
 * getBranchWarehouses() resolves its scope from the signed session cookie
 * (resolveScopeFromSession reads Next's request-scoped cookies()), so it can only
 * be exercised through a real request. No page consumes it yet (Task 2 adds the
 * tab strip), so -- like setPrimarySupplier in branch-server-action-isolation.spec.ts --
 * it is invoked the way the browser would: POST its action id from the
 * server-reference manifest, with the session cookie from the page's context.
 */

interface ListResult {
  warehouses: Array<{ id: string; name: string; isActive?: boolean }>;
  isHeadOffice: boolean;
}

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

function actionIdFor(exportedName: string): string {
  for (const dir of ['.next-test/dev/server', '.next-test/server']) {
    const file = path.join(process.cwd(), dir, 'server-reference-manifest.json');
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [id, entry] of Object.entries<any>(manifest.node ?? {})) {
      if (entry.exportedName === exportedName && String(entry.filename).includes('products/actions.ts')) {
        return id;
      }
    }
  }
  throw new Error(`Server action ${exportedName} is not in the manifest`);
}

async function getBranchWarehouses(page: Page): Promise<ListResult> {
  // Compile the page that imports the actions file so the action is in the manifest.
  await page.goto('/products');
  const res = await page.request.post('/products', {
    headers: {
      'Next-Action': actionIdFor('getBranchWarehouses'),
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
    },
    data: JSON.stringify([]),
  });
  const text = await res.text();
  for (const line of text.split('\n')) {
    const m = /^[0-9a-f]+:(\{.*\})$/.exec(line);
    if (!m) continue;
    try {
      const value = JSON.parse(m[1]);
      if (value && typeof value === 'object' && 'warehouses' in value) return value;
    } catch {
      /* not JSON -- next line */
    }
  }
  throw new Error(`No action result in response: ${text.slice(0, 500)}`);
}

test.describe('getBranchWarehouses', () => {
  const seededBranches: SeededBranch[] = [];
  const extraWarehouses: string[] = [];

  async function seed(): Promise<SeededBranch> {
    const b = await seedSecondBranch();
    seededBranches.push(b);
    return b;
  }

  async function addWarehouse(branchId: string, active: boolean): Promise<string> {
    const id = await addWarehouseToBranch(branchId, { active });
    extraWarehouses.push(id);
    return id;
  }

  async function mainBranchActiveWarehouseIds(): Promise<string[]> {
    const rows: any = await testQuery(
      `SELECT w.id FROM warehouses w JOIN branches b ON b.id = w.branch_id
        WHERE b.is_main = 1 AND w.is_active = 1`
    );
    return rows.map((r: any) => r.id as string);
  }

  test.afterEach(async () => {
    for (const id of extraWarehouses.splice(0)) {
      await testQuery('DELETE FROM warehouses WHERE id = ?', [id]);
    }
    for (const b of seededBranches.splice(0)) {
      await cleanupSecondBranch(b);
    }
  });

  test("a branch scope returns only that branch's active warehouses", async ({ page }) => {
    const b = await seed();
    const inactive = await addWarehouse(b.branchId, false);
    const second = await addWarehouse(b.branchId, true);
    const mainIds = await mainBranchActiveWarehouseIds();
    expect(mainIds.length).toBeGreaterThan(0);

    await seedSession(page, branchUser(b));
    const result = await getBranchWarehouses(page);

    const ids = result.warehouses.map((w) => w.id);
    expect(ids.sort()).toEqual([b.warehouseId, second].sort());
    expect(ids).not.toContain(inactive);
    for (const mainId of mainIds) expect(ids).not.toContain(mainId);
    expect(result.isHeadOffice).toBe(false);
  });

  test('head office returns active warehouses of every branch', async ({ page }) => {
    const hq = await seed();
    const b = await seed();
    const inactive = await addWarehouse(b.branchId, false);
    const mainIds = await mainBranchActiveWarehouseIds();
    await grantPermission(hq.userUid, ALL_BRANCHES_PERMISSION);
    await setUserBranch(hq.userUid, null);

    await seedSession(page, branchUser(hq));
    const result = await getBranchWarehouses(page);

    const ids = result.warehouses.map((w) => w.id);
    expect(ids).toContain(b.warehouseId);
    expect(ids).toContain(hq.warehouseId);
    for (const mainId of mainIds) expect(ids).toContain(mainId);
    expect(ids).not.toContain(inactive);
    expect(result.isHeadOffice).toBe(true);
  });

  test('an inactive warehouse is never listed', async ({ page }) => {
    const b = await seed();
    const inactive = await addWarehouse(b.branchId, false);
    // The stale runtime `active` column must not rescue it: is_active is the source of truth.
    const hasActiveCol: any = await testQuery(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'warehouses' AND column_name = 'active'`
    );
    if (Number(hasActiveCol[0].n) > 0) {
      await testQuery('UPDATE warehouses SET active = 1 WHERE id = ?', [inactive]);
    }

    await seedSession(page, branchUser(b));
    const branchIds = (await getBranchWarehouses(page)).warehouses.map((w) => w.id);
    expect(branchIds).not.toContain(inactive);

    // ...and not under the no-cookie fallback either.
    await page.context().clearCookies();
    const fallback = await getBranchWarehouses(page);
    expect(fallback.warehouses.map((w) => w.id)).not.toContain(inactive);
    expect(fallback.warehouses.map((w) => w.id)).toContain(b.warehouseId);
  });

  test('no cookie falls back to the unfiltered active list and reports head office', async ({ page }) => {
    const b = await seed();
    const mainIds = await mainBranchActiveWarehouseIds();

    await seedSession(page, branchUser(b));
    await page.context().clearCookies();
    const result = await getBranchWarehouses(page);

    const ids = result.warehouses.map((w) => w.id);
    expect(ids).toContain(b.warehouseId);
    for (const mainId of mainIds) expect(ids).toContain(mainId);
    expect(result.isHeadOffice).toBe(true);
  });
});
