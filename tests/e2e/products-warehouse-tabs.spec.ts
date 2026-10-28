import { test, expect, type Page } from '@playwright/test';
import { seedSession, type SessionUser } from './helpers/auth';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
  addWarehouseToBranch,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Ang warehouse dili na usa ka filter sa dialog — usa na siya ka tab strip sa
 * ibabaw sa products table. Ang warehouse mao ang LUGAR nga naa ka, dili usa ka
 * filter, mao nga:
 *   - ang resolved default warehouse mao ang selected tab pag-load,
 *   - ang pag-click sa tab mao ang pag-filter sa table,
 *   - ang "Clear All" dili motandog sa gipili nga warehouse,
 *   - walay "Warehouse: …" chip ug dili siya mo-count sa filter badge,
 *   - ang branch nga walay warehouse mo-pakita ug WALAY SULOD nga table
 *     (NO_WAREHOUSE sentinel), DILI sa produkto sa laing branch.
 *
 * Ang tanan test diri moagi sa page (UI surface) — walay server-action id
 * invocation, walay flight-response parsing.
 */

const tag = `WHTAB-${Date.now()}`;

function branchUser(uid: string): SessionUser {
  return {
    uid,
    username: `u_${uid.slice(0, 8)}`,
    userType: 'User',
    displayName: 'Branch User',
    permissions: ['*'],
  };
}

/** Ang tab strip; `role=tablist` gikan sa Radix Tabs. */
function tabs(page: Page) {
  return page.getByRole('tablist', { name: 'Warehouse' });
}

function tab(page: Page, name: string) {
  return tabs(page).getByRole('tab', { name, exact: true });
}

async function openProducts(page: Page, user: SessionUser) {
  await seedSession(page, user);
  await page.goto('/products');
}

test.describe('products warehouse tab strip', () => {
  let seeded: SeededBranch;
  let firstWh: string;
  let secondWh: string;
  let firstWhName: string;
  let secondWhName: string;
  const otherBranches: SeededBranch[] = [];

  test.beforeEach(async () => {
    seeded = await seedSecondBranch();
    firstWh = seeded.warehouseId;
    secondWh = await addWarehouseToBranch(seeded.branchId, { active: true });
    // Pin ang pagkahan-ay: ang `firstWh` mao ang pinakaluma, mao nga siya ang
    // resolved default (oldest active warehouse by created_at).
    await testQuery('UPDATE warehouses SET created_at = NOW() + INTERVAL 1 DAY WHERE id = ?', [firstWh]);
    await testQuery('UPDATE warehouses SET created_at = NOW() + INTERVAL 2 DAY WHERE id = ?', [secondWh]);
    const rows: any[] = await testQuery('SELECT id, name FROM warehouses WHERE id IN (?, ?)', [firstWh, secondWh]);
    firstWhName = rows.find((r) => r.id === firstWh).name;
    secondWhName = rows.find((r) => r.id === secondWh).name;
  });

  test.afterEach(async () => {
    await testQuery('DELETE FROM products WHERE warehouse_id = ?', [secondWh]);
    await testQuery('DELETE FROM warehouses WHERE id = ?', [secondWh]);
    await cleanupSecondBranch(seeded);
    for (const b of otherBranches.splice(0)) await cleanupSecondBranch(b);
  });

  async function seedNamed(warehouseId: string, sku: string, name: string) {
    const id = await seedProductInWarehouse(warehouseId, sku);
    await testQuery('UPDATE products SET name = ? WHERE id = ?', [name, id]);
    return id;
  }

  test('the resolved default warehouse tab is selected on load', async ({ page }) => {
    await openProducts(page, branchUser(seeded.userUid));

    await expect(tab(page, firstWhName)).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, secondWhName)).toHaveAttribute('aria-selected', 'false');
    await expect(tab(page, 'All warehouses')).toHaveAttribute('aria-selected', 'false');
  });

  test('clicking a warehouse tab filters the table to that warehouse', async ({ page }) => {
    const aName = `TabOnlyA ${tag}`;
    const bName = `TabOnlyB ${tag}`;
    await seedNamed(firstWh, `${tag}-A`, aName);
    await seedNamed(secondWh, `${tag}-B`, bName);

    await openProducts(page, branchUser(seeded.userUid));

    await expect(page.getByRole('row', { name: new RegExp(aName) })).toHaveCount(1);
    await expect(page.getByRole('row', { name: new RegExp(bName) })).toHaveCount(0);

    await tab(page, secondWhName).click();

    await expect(tab(page, secondWhName)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('row', { name: new RegExp(bName) })).toHaveCount(1);
    await expect(page.getByRole('row', { name: new RegExp(aName) })).toHaveCount(0);
  });

  test('Clear filters does not change the selected warehouse tab', async ({ page }) => {
    const bName = `TabClear ${tag}`;
    await seedNamed(secondWh, `${tag}-C`, bName);

    await openProducts(page, branchUser(seeded.userUid));
    await tab(page, secondWhName).click();
    await expect(page.getByRole('row', { name: new RegExp(bName) })).toHaveCount(1);

    // Usa ka tinuod nga row filter aron motungha ang "Clear All".
    await page.getByRole('button', { name: 'Open filters' }).click();
    await page.locator('#status-filter').click();
    await page.getByRole('option', { name: 'In Stock' }).click();
    await page.getByRole('button', { name: 'Apply Filters' }).click();
    await expect(page.getByText('Status: In Stock')).toBeVisible();

    await page.getByRole('button', { name: 'Clear All' }).click();

    // Ang status chip nawala, apan ang warehouse tab nagpabilin.
    await expect(page.getByText('Status: In Stock')).toHaveCount(0);
    await expect(tab(page, secondWhName)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('row', { name: new RegExp(bName) })).toHaveCount(1);
  });

  test('the warehouse no longer appears as a filter chip', async ({ page }) => {
    await openProducts(page, branchUser(seeded.userUid));

    // Ang default warehouse selected na, apan walay chip ug walay "Clear All"
    // (ang warehouse dili mo-count isip active filter).
    await expect(tab(page, firstWhName)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/^Warehouse: /)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear All' })).toHaveCount(0);

    // Wala na usab ang warehouse select sa filter dialog.
    await page.getByRole('button', { name: 'Open filters' }).click();
    await expect(page.locator('#warehouse-filter')).toHaveCount(0);
  });

  test('a branch with no warehouses shows an empty table, not an unfiltered one', async ({ page }) => {
    // Naa'y produkto sa laing branch: kini ang mopatunghag unfiltered leak kon
    // ma-drop ang sentinel.
    const other = await seedSecondBranch();
    otherBranches.push(other);
    await seedNamed(other.warehouseId, `${tag}-OTHER`, `Elsewhere ${tag}`);

    await testQuery('DELETE FROM products WHERE warehouse_id IN (?, ?)', [firstWh, secondWh]);
    await testQuery('DELETE FROM warehouses WHERE id IN (?, ?)', [firstWh, secondWh]);

    await openProducts(page, branchUser(seeded.userUid));

    await expect(page.getByText('No products found.')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(`Elsewhere ${tag}`) })).toHaveCount(0);
    // Walay warehouse tab para niining branch, ug ang "All warehouses" DILI
    // selected — ang sentinel ang naka-pili.
    await expect(tabs(page).getByRole('tab')).toHaveCount(1);
    await expect(tab(page, 'All warehouses')).toHaveAttribute('aria-selected', 'false');
  });
});
