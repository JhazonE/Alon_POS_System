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

/**
 * Ang warehouse usa na ka tab strip (dili na filter dialog) sukad sa warehouse-
 * tabs nga trabaho, mao nga ang "selected warehouse" gi-assert pinaagi sa
 * `aria-selected` sa tab, dili pinaagi sa usa ka "Warehouse: …" chip.
 */
function warehouseTab(page: Page, name: string) {
  return page
    .getByRole('tablist', { name: 'Warehouse' })
    .getByRole('tab', { name, exact: true });
}

/** I-assert nga kini nga warehouse mao ang gipili nga tab. */
async function expectWarehouseSelected(page: Page, name: string) {
  await expect(warehouseTab(page, name)).toHaveAttribute('aria-selected', 'true');
}

/** Pili "All warehouses" pinaagi sa tab strip. */
async function chooseAllWarehouses(page: Page) {
  await warehouseTab(page, 'All warehouses').click();
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

    await expectWarehouseSelected(page, firstWhName);
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
    // "All" ang selected tab -- ang default dili mobalik sa iyang kaugalingon.
    await expectWarehouseSelected(page, 'All warehouses');
    await expect(warehouseTab(page, firstWhName)).toHaveAttribute('aria-selected', 'false');
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
    await expectWarehouseSelected(page, 'All warehouses');
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
    await expectWarehouseSelected(page, firstWhName);

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

    await expectWarehouseSelected(page, bWhName);
    // Ang warehouse ni A kay sa laing branch -- wala na gani siya sa strip.
    await expect(warehouseTab(page, firstWhName)).toHaveCount(0);
  });

  test('a warehouse selection is NOT an active filter (no chip, no Clear All)', async ({ page }) => {
    // Gi-balit-ad sa warehouse-tabs nga trabaho: ang warehouse mao ang lugar nga
    // naa ka, dili usa ka narrowing sa list, mao nga wala siya sa chip row ug
    // dili siya mo-trigger sa "Clear All".
    await openProducts(page, branchUser(seeded.userUid));

    await expectWarehouseSelected(page, firstWhName);
    await expect(page.getByText(/^Warehouse: /)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear All' })).toHaveCount(0);
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

  test('a FAILED default resolution falls back to All, not to an empty page', async ({ page }) => {
    // mainBranchId() THROWS (status 500) when no branch is is_main: a resolution
    // failure, not "no warehouse". Head office resolves through it. Before the fix
    // the action swallowed that into { warehouseId: null }, the client pinned the
    // match-nothing sentinel, and the catalogue was blank for the whole session.
    const name = `Visible ${tag}`;
    const id = await seedProductInWarehouse(firstWh, `${tag}-FAIL`);
    await testQuery('UPDATE products SET name = ? WHERE id = ?', [name, id]);
    const mains: any[] = await testQuery('SELECT id FROM branches WHERE is_main = 1');
    try {
      await testQuery('UPDATE branches SET is_main = 0 WHERE is_main = 1');
      await openProducts(page, DEFAULT_ADMIN);
      await page.getByPlaceholder('Search products...').fill(name);

      await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(1, { timeout: 15000 });
      await expect(page.getByText('No products found.')).toHaveCount(0);
      await expectWarehouseSelected(page, 'All warehouses'); // fell back to All
    } finally {
      for (const m of mains) await testQuery('UPDATE branches SET is_main = 1 WHERE id = ?', [m.id]);
    }
  });

  test('head office lands on a main-branch warehouse, not on another branch', async ({ page }) => {
    await openProducts(page, DEFAULT_ADMIN);

    const mainNames: any[] = await testQuery(
      `SELECT w.name FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE b.is_main = 1`,
    );
    // Ang head office makakita sa TANAN branch sa strip, mao nga ang assertion kay
    // kinsa ang SELECTED: usa sa main-branch warehouses, dili ang warehouse sa
    // gi-seed nga second branch.
    const selected = page
      .getByRole('tablist', { name: 'Warehouse' })
      .locator('[role="tab"][aria-selected="true"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveText(
      new RegExp(`^(${mainNames.map((r) => r.name).join('|')})`),
    );
    await expect(warehouseTab(page, firstWhName)).toHaveAttribute('aria-selected', 'false');
  });
});
