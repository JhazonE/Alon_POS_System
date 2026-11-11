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

    // Ang unang test sa file nagbayad sa cold compile sa /products: hatagan og
    // dakong margin ang unang assertion.
    await expect(tab(page, firstWhName)).toHaveAttribute('aria-selected', 'true', { timeout: 15000 });
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

  test('focusing the only tab of an empty branch does not select it (fail-closed under keyboard)', async ({ page }) => {
    // Radix activates a tab on FOCUS unless activationMode="manual". In an empty
    // branch "All warehouses" is the only tab and is unselected, so merely tabbing
    // into the strip would otherwise fire chooseWarehouse('all') and show the
    // cross-branch catalogue -- with no click at all.
    const other = await seedSecondBranch();
    otherBranches.push(other);
    await seedNamed(other.warehouseId, `${tag}-OTHERF`, `ElsewhereF ${tag}`);

    await testQuery('DELETE FROM products WHERE warehouse_id IN (?, ?)', [firstWh, secondWh]);
    await testQuery('DELETE FROM warehouses WHERE id IN (?, ?)', [firstWh, secondWh]);

    await openProducts(page, branchUser(seeded.userUid));
    await expect(page.getByText('No products found.')).toBeVisible();

    const all = tab(page, 'All warehouses');
    await all.focus();
    await expect(all).toBeFocused();
    // Hatagan og higayon ang bisan unsang (sayop) state update ug refetch.
    await page.waitForTimeout(1500);

    await expect(all).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByText('No products found.')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(`ElsewhereF ${tag}`) })).toHaveCount(0);

    // Ang explicit nga aksyon (Enter) mo-activate gihapon, aron dili mamatay ang keyboard.
    await page.keyboard.press('Enter');
    await expect(all).toHaveAttribute('aria-selected', 'true');
  });

  test('arrow keys move focus between tabs without selecting; Enter / Space select', async ({ page }) => {
    const bName = `TabKb ${tag}`;
    await seedNamed(secondWh, `${tag}-KB`, bName);
    await openProducts(page, branchUser(seeded.userUid));
    await expect(tab(page, firstWhName)).toHaveAttribute('aria-selected', 'true');

    await tab(page, firstWhName).focus();
    await page.keyboard.press('ArrowRight');
    // Radix roving focus: ang sunod nga tab ang focused, apan wala pa selected.
    // Async ang Radix roving focus (setTimeout), busa mag-poll, dili isa ka basa.
    await expect(tab(page, firstWhName)).not.toBeFocused();
    await expect(tabs(page).locator('[role="tab"]:focus')).toHaveCount(1);
    await expect(tab(page, firstWhName)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Enter');
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(tab(page, firstWhName)).toHaveAttribute('aria-selected', 'false');

    await tab(page, secondWhName).focus();
    await page.keyboard.press(' ');
    await expect(tab(page, secondWhName)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('row', { name: new RegExp(bName) })).toHaveCount(1);
  });

  test('a long strip scrolls inside itself: one row, no page-level horizontal scroll, selected tab in view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    // Ibutang sa kataposan sa han-ay ang default, busa gawas sa view dayon.
    // Ug paka-oldest siya aron siya gihapon ang resolved default (ang extras
    // gi-seed human sa beforeEach, busa mas bag-o).
    await testQuery(
      'UPDATE warehouses SET name = ?, created_at = NOW() - INTERVAL 2 DAY WHERE id = ?',
      [`ZZ-Default ${tag}`, firstWh],
    );
    // Baseline: ang page-level scrollWidth sa phone width WALA pa ang dugang nga
    // tabs. Naay laing elemento sa layout (breadcrumb/toolbar) nga pre-existing
    // modagan lapas sa 390px, busa ang assertion kay "ang strip wala nagdugang".
    await openProducts(page, branchUser(seeded.userUid));
    await expect(tab(page, `ZZ-Default ${tag}`)).toHaveAttribute('aria-selected', 'true');
    const baselineDocW = await page.evaluate(() => document.documentElement.scrollWidth);

    const extra: string[] = [];
    try {
      for (let i = 0; i < 12; i++) {
        const id = await addWarehouseToBranch(seeded.branchId, { active: true });
        await testQuery('UPDATE warehouses SET name = ? WHERE id = ?', [`AA-Long warehouse name ${i} ${tag}`, id]);
        extra.push(id);
      }
      await page.reload();
      await expect(tab(page, `ZZ-Default ${tag}`)).toHaveAttribute('aria-selected', 'true');
      await expect(tabs(page).getByRole('tab')).toHaveCount(15); // 14 warehouses + All

      const m = await page.evaluate(() => {
        const list = document.querySelector('[role="tablist"]') as HTMLElement;
        const wrap = list.parentElement as HTMLElement;
        const tabEls = Array.from(list.querySelectorAll('[role="tab"]')) as HTMLElement[];
        const sel = list.querySelector('[role="tab"][aria-selected="true"]') as HTMLElement;
        const w = wrap.getBoundingClientRect();
        const s = sel.getBoundingClientRect();
        return {
          docScrollW: document.documentElement.scrollWidth,
          docClientW: document.documentElement.clientWidth,
          wrapScrollW: wrap.scrollWidth,
          wrapClientW: wrap.clientWidth,
          wrapOverflowX: getComputedStyle(wrap).overflowX,
          tops: Array.from(new Set(tabEls.map((t) => Math.round(t.getBoundingClientRect().top)))),
          // Sa phone width ang app shell (sidebar) mismo ang mokaon sa lapad, busa ang
          // wrapper mahimong mas pig-ot kay sa usa ka tab: ang gipangayo kay nga ang
          // selected tab MOSUGOD sulod sa view (wala ma-scroll = ~3000px sa gawas).
          selInView: s.left >= w.left - 1 && s.left < w.right,
        };
      });
      expect(m.wrapOverflowX).toBe('auto');
      expect(m.wrapScrollW).toBeGreaterThan(m.wrapClientW); // ang strip mismo ang mo-scroll
      expect(m.docScrollW).toBe(baselineDocW); // dili ang page ang nidako
      expect(m.tops).toHaveLength(1); // usa ra ka row
      expect(m.selInView).toBe(true); // ang selected tab gi-scroll sa view
    } finally {
      for (const id of extra) await testQuery('DELETE FROM warehouses WHERE id = ?', [id]);
    }
  });

  test('a failed warehouse-list fetch still renders "All warehouses" instead of a dead skeleton', async ({ page }) => {
    // I-fail ang getBranchWarehouses (ang response nga naay `isHeadOffice`) apan
    // dili ang default-warehouse o products actions.
    await page.route('**/products*', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
      try {
        const res = await route.fetch();
        const body = await res.text();
        if (body.includes('isHeadOffice')) return await route.abort();
        return await route.fulfill({ response: res, body });
      } catch {
        // Ang page/context nagsira na (katapusan sa test) -- walay mabuhat.
      }
    });

    await openProducts(page, branchUser(seeded.userUid));

    const all = tab(page, 'All warehouses');
    await expect(all).toBeVisible({ timeout: 20000 });
    // Ang default nag-resolve sa tinuod nga warehouse apan wala na siya'y tab:
    // ang user makahimo pa'g ilis ngadto sa "All warehouses".
    await all.click();
    await expect(all).toHaveAttribute('aria-selected', 'true');
    // Ayaw pagbilin og in-flight route callback sa pagtapos sa test.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('head office tells branches apart by branch name, not by location', async ({ page }) => {
    // `location` is free text and may be blank or shared between branches; the
    // branch name is what actually disambiguates, so it wins when both exist.
    await testQuery('UPDATE warehouses SET location = ? WHERE id = ?', ['Aisle 9 (free text)', firstWh]);
    const branch: any[] = await testQuery('SELECT name FROM branches WHERE id = ?', [seeded.branchId]);

    await openProducts(page, DEFAULT_ADMIN);

    const strip = tabs(page);
    const t = strip.getByRole('tab', { name: new RegExp(firstWhName) });
    await expect(t).toBeVisible({ timeout: 15000 });
    await expect(t).toContainText(branch[0].name);
    await expect(t).not.toContainText('Aisle 9');
  });
});
