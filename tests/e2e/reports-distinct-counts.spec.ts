import { test, expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Ang fan-out mo-himo ug zero-stock nga kopya sa usa ka product sa matag aktibo
 * nga warehouse sa branch, ug ang branch-scoped reports mo-scope sa TANANG
 * warehouse sa branch. Mao nga ang business-metric nga counts (`total_items`,
 * `low_stock_items`) kinahanglan mag-count ug product kausa, dili kausa kada
 * warehouse. Apan ang `reports/inventory` kay per-warehouse-row nga listing:
 * ang pagination count niini kinahanglan motugma sa mga row nga gilista.
 *
 * Ang matag test mo-seed ug lab-as nga branch, mao nga ang counts kay exact
 * (walay baseline nga i-subtract).
 */
test.describe('reports counts after product fan-out', () => {
  let branch: SeededBranch;
  let secondWarehouse: string;
  const productIds: string[] = [];

  test.beforeEach(async () => {
    branch = await seedSecondBranch();
    secondWarehouse = await addWarehouseToBranch(branch.branchId, { active: true });
  });

  test.afterEach(async () => {
    for (const id of productIds.splice(0)) {
      await testQuery('DELETE FROM products WHERE id = ?', [id]);
    }
    await testQuery('DELETE FROM products WHERE warehouse_id = ?', [secondWarehouse]);
    await testQuery('DELETE FROM warehouses WHERE id = ?', [secondWarehouse]);
    await cleanupSecondBranch(branch);
  });

  /** Direktang insert sa products row; ang sku `null` mao ang tinuod nga NULL. */
  async function insertProduct(opts: {
    warehouseId: string;
    name: string;
    sku: string | null;
    stock?: number;
    reorderPoint?: number;
  }): Promise<string> {
    const id = uuidv4();
    productIds.push(id);
    await testQuery(
      `INSERT INTO products (id, name, price, sku, stock, reorder_point, warehouse_id)
       VALUES (?, ?, 1.00, ?, ?, ?, ?)`,
      [id, opts.name, opts.sku, opts.stock ?? 0, opts.reorderPoint ?? 0, opts.warehouseId]
    );
    return id;
  }

  async function stats(request: any): Promise<{ totalItems: number; lowStockItems: number }> {
    const res = await request.get(`/api/reports/stats?uid=${branch.userUid}`);
    expect(res.ok()).toBeTruthy();
    const { summary } = await res.json();
    return { totalItems: summary.totalItems, lowStockItems: summary.lowStockItems };
  }

  test('total_items counts a fanned-out product once', async ({ request }) => {
    const sku = `DST-${uuidv4().slice(0, 8)}`;
    await insertProduct({ warehouseId: branch.warehouseId, name: `Distinct ${sku}`, sku, stock: 10 });
    await insertProduct({ warehouseId: secondWarehouse, name: `Distinct ${sku}`, sku, stock: 0 });

    const { totalItems } = await stats(request);
    expect(totalItems).toBe(1); // not 2
  });

  test('total_items counts a NULL-sku product', async ({ request }) => {
    const sku = `DST-${uuidv4().slice(0, 8)}`;
    const nullName = `Null sku ${sku}`;
    // Usa ka NULL-sku nga product nga naay kopya sa duha ka warehouse...
    await insertProduct({ warehouseId: branch.warehouseId, name: nullName, sku: null, stock: 4 });
    await insertProduct({ warehouseId: secondWarehouse, name: nullName, sku: null, stock: 0 });
    // ...ug usa ka normal nga product nga naay sku.
    await insertProduct({ warehouseId: branch.warehouseId, name: `Normal ${sku}`, sku, stock: 4 });

    const { totalItems } = await stats(request);
    // COUNT(*) = 3, COUNT(DISTINCT sku) = 1 (gi-drop ang NULL-sku). Husto = 2.
    expect(totalItems).toBe(2);
  });

  test('total_items keeps blank-sku products with different names apart', async ({ request }) => {
    const tag = uuidv4().slice(0, 8);
    await insertProduct({ warehouseId: branch.warehouseId, name: `Blank A ${tag}`, sku: '', stock: 1 });
    // (sku, warehouse_id) kay unique, mao nga ang ikaduha naa sa lain nga warehouse.
    await insertProduct({ warehouseId: secondWarehouse, name: `Blank B ${tag}`, sku: '', stock: 1 });

    const { totalItems } = await stats(request);
    expect(totalItems).toBe(2); // dili ma-collapse sa usa ra ang '' sku
  });

  test('low_stock_items counts a product once even when several copies are low', async ({ request }) => {
    const sku = `DST-${uuidv4().slice(0, 8)}`;
    // Parehong copy ubos sa reorder_point ug naay stock (> 0).
    await insertProduct({ warehouseId: branch.warehouseId, name: `Low ${sku}`, sku, stock: 2, reorderPoint: 50 });
    await insertProduct({ warehouseId: secondWarehouse, name: `Low ${sku}`, sku, stock: 3, reorderPoint: 50 });

    const { lowStockItems, totalItems } = await stats(request);
    expect(lowStockItems).toBe(1); // not 2
    expect(totalItems).toBe(1);
  });

  test('reports/inventory pagination count still matches the rows listed', async ({ request }) => {
    const sku = `DST-${uuidv4().slice(0, 8)}`;
    // 3 ka row sa listing: usa ka product sa duha ka warehouse + usa ka lain.
    await insertProduct({ warehouseId: branch.warehouseId, name: `Inv A ${sku}`, sku, stock: 5 });
    await insertProduct({ warehouseId: secondWarehouse, name: `Inv A ${sku}`, sku, stock: 0 });
    await insertProduct({ warehouseId: branch.warehouseId, name: `Inv B ${sku}`, sku: `${sku}-B`, stock: 5 });

    const base = `/api/reports/inventory?uid=${branch.userUid}`;

    const all = await (await request.get(`${base}&limit=1000`)).json();
    expect(all.data).toHaveLength(3);
    expect(all.pagination.totalItems).toBe(all.data.length);
    expect(all.summary.totalItems).toBe(2); // distinct products, not listed rows (3)

    // Page-by-page: totalPages kinahanglan mo-cover sa matag listed row.
    const page1 = await (await request.get(`${base}&limit=2&page=1`)).json();
    expect(page1.pagination.totalItems).toBe(3);
    expect(page1.pagination.totalPages).toBe(2);
    expect(page1.data).toHaveLength(2);

    const page2 = await (await request.get(`${base}&limit=2&page=2`)).json();
    expect(page2.data).toHaveLength(1); // dili empty/truncated nga trailing page

    const ids = [...page1.data, ...page2.data].map((r: any) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  // Ang `summary.totalItems` sa duha ka valuation report kay business metric (grand
  // total), dili pagination -- kinahanglan mag-count ug product kausa. Ang
  // `pagination.totalItems` sa parehas nga response kinahanglan magpabilin nga
  // COUNT(*) (= mga row nga gilista), kay kung i-DISTINCT kini mawala ang paging.
  for (const route of ['inventory', 'cost-vs-retail']) {
    test.describe(`reports/${route} grand total vs pagination count`, () => {
      async function fetchReport(request: any, extra = '') {
        const res = await request.get(`/api/reports/${route}?uid=${branch.userUid}${extra}`);
        expect(res.ok()).toBeTruthy();
        return res.json();
      }

      test('summary.totalItems counts a fanned-out product once', async ({ request }) => {
        const sku = `DST-${uuidv4().slice(0, 8)}`;
        await insertProduct({ warehouseId: branch.warehouseId, name: `Sum ${sku}`, sku, stock: 10 });
        await insertProduct({ warehouseId: secondWarehouse, name: `Sum ${sku}`, sku, stock: 0 });

        const body = await fetchReport(request, '&limit=1000');
        expect(body.summary.totalItems).toBe(1); // not 2
        expect(body.data).toHaveLength(2); // the listing still shows both copies
      });

      test('summary.totalItems still counts a NULL-sku product', async ({ request }) => {
        const sku = `DST-${uuidv4().slice(0, 8)}`;
        const nullName = `Null sku ${sku}`;
        await insertProduct({ warehouseId: branch.warehouseId, name: nullName, sku: null, stock: 4 });
        await insertProduct({ warehouseId: secondWarehouse, name: nullName, sku: null, stock: 0 });
        await insertProduct({ warehouseId: branch.warehouseId, name: `Normal ${sku}`, sku, stock: 4 });

        const body = await fetchReport(request, '&limit=1000');
        // COUNT(*) = 3, plain COUNT(DISTINCT sku) = 1 (drops NULL). Correct = 2.
        expect(body.summary.totalItems).toBe(2);
      });

      test('pagination.totalItems stays equal to the rows listed (not DISTINCT)', async ({ request }) => {
        const sku = `DST-${uuidv4().slice(0, 8)}`;
        await insertProduct({ warehouseId: branch.warehouseId, name: `Pg A ${sku}`, sku, stock: 5 });
        await insertProduct({ warehouseId: secondWarehouse, name: `Pg A ${sku}`, sku, stock: 0 });
        await insertProduct({ warehouseId: branch.warehouseId, name: `Pg B ${sku}`, sku: `${sku}-B`, stock: 5 });

        const all = await fetchReport(request, '&limit=1000');
        expect(all.data).toHaveLength(3);
        expect(all.pagination.totalItems).toBe(3); // rows, whereas summary.totalItems is 2
        expect(all.summary.totalItems).toBe(2);

        const page1 = await fetchReport(request, '&limit=2&page=1');
        expect(page1.pagination.totalPages).toBe(2);
        const page2 = await fetchReport(request, '&limit=2&page=2');
        expect(page2.data).toHaveLength(1); // not an empty/truncated trailing page
      });
    });
  }
});
