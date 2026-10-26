import { test, expect, type Page } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN, type SessionUser } from './helpers/auth';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  addWarehouseToBranch,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Ang products table mo-land sa USA ka warehouse (dili "All"), kay ang product
 * fan-out naghimo ug zero-stock copy sa matag active warehouse sa branch -- sa
 * "All" makita ang parehas nga produkto kada warehouse.
 *
 * Importante: ang default kinahanglan nga warehouse sa OWN branch sa user, dili
 * mag-agad sa warehouses.is_main, ug dili mo-flatten sa family tree (ang
 * client adunay kaugalingong flatten decision, bulag sa server).
 */

const tag = `WHDEF-${Date.now()}`;

// Ang sidebar links mo-render lang kung naay tinuod nga permission names ('*' dili igo).
const NAV_PERMISSIONS = ['view_dashboard', 'manage_products', 'manage_inventory', 'view_sales', 'manage_settings'];

function branchUser(uid: string, permissions: string[] = ['*']): SessionUser {
  return {
    uid,
    username: `u_${uid.slice(0, 8)}`,
    userType: 'User',
    displayName: 'Branch User',
    permissions,
  };
}

async function openProducts(page: Page, user: SessionUser) {
  await seedSession(page, user);
  await page.goto('/products');
}

/** Pili "All Warehouses" pinaagi sa filter dialog, dayon Apply. */
async function chooseAllWarehouses(page: Page) {
  await page.getByRole('button', { name: 'Open filters' }).click();
  await page.locator('#warehouse-filter').click();
  await page.getByRole('option', { name: 'All Warehouses' }).click();
  await page.getByRole('button', { name: 'Apply Filters' }).click();
}

test.describe('products table defaults to a single warehouse', () => {
  let seeded: SeededBranch;
  let firstWh: string;
  let secondWh: string;
  let firstWhName: string;
  const otherBranches: SeededBranch[] = [];

  test.beforeEach(async () => {
    seeded = await seedSecondBranch();
    firstWh = seeded.warehouseId;
    secondWh = await addWarehouseToBranch(seeded.branchId, { active: true });
    // Pin ang pagkahan-ay: first = pinakaluma. Wala'y mag-agad sa is_main.
    // Mas bag-o kay sa main-branch warehouses, aron ang default nga walay branch
    // filter mopili ug main warehouse imbes (ug mapakita sa test).
    await testQuery('UPDATE warehouses SET created_at = NOW() + INTERVAL 1 DAY WHERE id = ?', [firstWh]);
    await testQuery('UPDATE warehouses SET created_at = NOW() + INTERVAL 2 DAY WHERE id = ?', [secondWh]);
    const rows: any[] = await testQuery('SELECT name FROM warehouses WHERE id = ?', [firstWh]);
    firstWhName = rows[0].name;
  });

  test.afterEach(async () => {
    await testQuery('DELETE FROM products WHERE warehouse_id = ?', [secondWh]);
    await testQuery('DELETE FROM warehouses WHERE id = ?', [secondWh]);
    await cleanupSecondBranch(seeded);
    for (const b of otherBranches.splice(0)) await cleanupSecondBranch(b);
  });

  /** Parehas nga produkto sa duha ka warehouse -- sama sa gihimo sa fan-out. */
  async function seedFannedOut(name: string) {
    const a = await seedProductInWarehouse(firstWh, `${tag}-FA`);
    const b = await seedProductInWarehouse(secondWh, `${tag}-FB`);
    await testQuery('UPDATE products SET name = ? WHERE id IN (?, ?)', [name, a, b]);
    return { a, b };
  }

  test('lands on the first warehouse of the user own branch, not All', async ({ page }) => {
    await openProducts(page, branchUser(seeded.userUid));

    await expect(page.getByText(`Warehouse: ${firstWhName}`)).toBeVisible();
  });

  test('a product fanned out to two warehouses appears exactly once', async ({ page }) => {
    const name = `Fanned ${tag}`;
    await seedFannedOut(name);
    await openProducts(page, branchUser(seeded.userUid));
    await page.getByPlaceholder('Search products...').fill(name);

    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(1);
  });

  test('All Warehouses stays selectable and shows every copy', async ({ page }) => {
    const name = `Fanned ${tag}`;
    await seedFannedOut(name);
    await openProducts(page, branchUser(seeded.userUid));
    await page.getByPlaceholder('Search products...').fill(name);
    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(1);

    await chooseAllWarehouses(page);

    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(2);
    // Walay warehouse chip kung "All" -- ang default dili mobalik sa iyang kaugalingon.
    await expect(page.getByText(`Warehouse: ${firstWhName}`)).toHaveCount(0);
  });

  test('a choice made before the default resolves is not overwritten by it', async ({ page }) => {
    const name = `Fanned ${tag}`;
    await seedFannedOut(name);
    // Ibalik ang unang server-action POSTs (options + default lookup) aron makapili
    // ang user og "All" sa dili pa moabot ang default. Gi-serialize sa Next ang
    // server actions, mao nga ang unang duha lang ang gi-delay.
    let delayed = 0;
    await page.route('**/products*', async (route) => {
      if (route.request().method() === 'POST' && delayed < 2) {
        delayed += 1;
        await new Promise((r) => setTimeout(r, 2000));
      }
      await route.continue();
    });
    await openProducts(page, branchUser(seeded.userUid));

    await chooseAllWarehouses(page);
    await page.getByPlaceholder('Search products...').fill(name);

    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(2);
    await page.waitForTimeout(4500); // hatagan ug higayon ang default nga moabot
    await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(2);
    await expect(page.getByText(`Warehouse: ${firstWhName}`)).toHaveCount(0);
    // Dili mag-pass nga walay sulod kung ang route mohunong sa pag-match.
    expect(delayed).toBe(2);
  });

  test('a cached default is not inherited by the next user to sign in', async ({ page }) => {
    // Duha ka session uid sa USA ka page context: ang QueryClient kay module-level
    // singleton nga mabuhi sa client-side navigation, mao nga mao ni ang tinuod nga
    // sign-out -> sign-in nga walay full reload. Ang user B kinahanglan dili makabaton
    // sa cached default ni A (laing branch).
    const b = await seedSecondBranch();
    otherBranches.push(b);
    const bRows: any[] = await testQuery('SELECT name FROM warehouses WHERE id = ?', [b.warehouseId]);
    const bWhName = bRows[0].name;

    await openProducts(page, branchUser(seeded.userUid, NAV_PERMISSIONS));
    await expect(page.getByText(`Warehouse: ${firstWhName}`)).toBeVisible();

    // Ilisan ang identity (cookie + localStorage) nga walay reload.
    const userB = branchUser(b.userUid, NAV_PERMISSIONS);
    await seedSession(page, userB);
    await page.evaluate((u) => {
      window.localStorage.setItem('mock-user-session', JSON.stringify({ ...u, email: u.username }));
    }, userB);

    // Client-side navigation: layo, dayon balik sa Products.
    await page.locator('a[href="/dashboard"]').first().click();
    await page.waitForURL('**/dashboard');
    await page.locator('a[href="/products"]').first().click();
    await page.waitForURL('**/products');

    await expect(page.getByText(`Warehouse: ${bWhName}`)).toBeVisible();
    await expect(page.getByText(`Warehouse: ${firstWhName}`)).toHaveCount(0);
  });

  test('a warehouse selection still counts as an active filter (chip + Clear All)', async ({ page }) => {
    await openProducts(page, branchUser(seeded.userUid));

    await expect(page.getByText(`Warehouse: ${firstWhName}`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear All' })).toBeVisible();
  });

  test('a family stays nested under its parent when only the default warehouse filter applies', async ({ page }) => {
    const parent = await seedProductInWarehouse(firstWh, `${tag}-P`);
    const child = await seedProductInWarehouse(firstWh, `${tag}-C`);
    const parentName = `Parent ${tag}`;
    const childName = `Child ${tag}`;
    await testQuery('UPDATE products SET name = ? WHERE id = ?', [parentName, parent]);
    await testQuery('UPDATE products SET name = ?, parent_id = ? WHERE id = ?', [childName, parent, child]);

    await openProducts(page, branchUser(seeded.userUid));

    const parentRow = page.getByRole('row', { name: new RegExp(parentName) });
    await expect(parentRow).toBeVisible();
    // Nested: ang child dili top-level row, ug ang parent naay Expand button.
    await expect(page.getByRole('row', { name: new RegExp(childName) })).toHaveCount(0);
    await parentRow.getByRole('button', { name: `Expand ${parentName}` }).click();
    await expect(page.getByRole('row', { name: new RegExp(childName) })).toHaveCount(1);
  });

  test('a row filter (search) still flattens the family', async ({ page }) => {
    const parent = await seedProductInWarehouse(firstWh, `${tag}-SP`);
    const child = await seedProductInWarehouse(firstWh, `${tag}-SC`);
    const childName = `FlatChild ${tag}`;
    await testQuery('UPDATE products SET name = ? WHERE id = ?', [`FlatParent ${tag}`, parent]);
    await testQuery('UPDATE products SET name = ?, parent_id = ? WHERE id = ?', [childName, parent, child]);

    await openProducts(page, branchUser(seeded.userUid));
    await page.getByPlaceholder('Search products...').fill(childName);

    // Flat: ang child mismo makita isip top-level row nga walay pag-expand.
    await expect(page.getByRole('row', { name: new RegExp(childName) })).toHaveCount(1);
  });

  test('a branch with no warehouses gets an empty list, not an unfiltered one', async ({ page }) => {
    // Naa'y produkto sa laing branch; dili kini angay makita sa walay-warehouse nga branch.
    const other = await seedSecondBranch();
    otherBranches.push(other);
    const visibleElsewhere = await seedProductInWarehouse(other.warehouseId, `${tag}-OTHER`);
    await testQuery('UPDATE products SET name = ? WHERE id = ?', [`Elsewhere ${tag}`, visibleElsewhere]);

    await testQuery('DELETE FROM products WHERE warehouse_id IN (?, ?)', [firstWh, secondWh]);
    await testQuery('DELETE FROM warehouses WHERE id IN (?, ?)', [firstWh, secondWh]);

    await openProducts(page, branchUser(seeded.userUid));

    await expect(page.getByText('No products found.')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(`Elsewhere ${tag}`) })).toHaveCount(0);
  });

  test('head office lands on a main-branch warehouse, not on another branch', async ({ page }) => {
    await openProducts(page, DEFAULT_ADMIN);

    const mainNames: any[] = await testQuery(
      `SELECT w.name FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE b.is_main = 1`,
    );
    // Ang chip naay "Remove ×" sa sulod, mao nga i-match sa nombre: usa sa main-branch
    // warehouses ang makita, ug walay chip para sa warehouse sa laing branch.
    const shown = page.locator('span,div').filter({ hasText: /^Warehouse: / }).filter({
      hasText: new RegExp(`Warehouse: (${mainNames.map((r) => r.name).join('|')})`),
    });
    await expect(shown.first()).toBeVisible();
    await expect(page.getByText(`Warehouse: ${firstWhName}`)).toHaveCount(0);
  });
});
