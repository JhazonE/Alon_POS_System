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

  /** Direktang insert sa products row; ang barcode `null` mao ang tinuod nga NULL. */
  async function insertProduct(opts: {
    warehouseId: string;
    name: string;
    barcode: string | null;
    stock?: number;
    reorderPoint?: number;
  }): Promise<string> {
    const id = uuidv4();
    productIds.push(id);
    await testQuery(
      `INSERT INTO products (id, name, price, barcode, stock, reorder_point, warehouse_id)
       VALUES (?, ?, 1.00, ?, ?, ?, ?)`,
      [id, opts.name, opts.barcode, opts.stock ?? 0, opts.reorderPoint ?? 0, opts.warehouseId]
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
    const barcode = `DST-${uuidv4().slice(0, 8)}`;
    await insertProduct({ warehouseId: branch.warehouseId, name: `Distinct ${barcode}`, barcode, stock: 10 });
    await insertProduct({ warehouseId: secondWarehouse, name: `Distinct ${barcode}`, barcode, stock: 0 });

    const { totalItems } = await stats(request);
    expect(totalItems).toBe(1); // not 2
  });

  test('total_items counts a NULL-barcode product', async ({ request }) => {
    const barcode = `DST-${uuidv4().slice(0, 8)}`;
    const nullName = `Null barcode ${barcode}`;
    // Usa ka NULL-barcode nga product nga naay kopya sa duha ka warehouse...
    await insertProduct({ warehouseId: branch.warehouseId, name: nullName, barcode: null, stock: 4 });
    await insertProduct({ warehouseId: secondWarehouse, name: nullName, barcode: null, stock: 0 });
    // ...ug usa ka normal nga product nga naay barcode.
    await insertProduct({ warehouseId: branch.warehouseId, name: `Normal ${barcode}`, barcode, stock: 4 });

    const { totalItems } = await stats(request);
    // COUNT(*) = 3, COUNT(DISTINCT barcode) = 1 (gi-drop ang NULL). Husto = 2.
    expect(totalItems).toBe(2);
  });

  test('total_items keeps blank-barcode products with different names apart', async ({ request }) => {
    const tag = uuidv4().slice(0, 8);
    // Duha ka warehouse, sama sa fan-out; walay unique index sa products.barcode,
    // mao nga ang '' dili mapugngan -- ang ngalan ra ang mag-bulag kanila.
    await insertProduct({ warehouseId: branch.warehouseId, name: `Blank A ${tag}`, barcode: '', stock: 1 });
    await insertProduct({ warehouseId: secondWarehouse, name: `Blank B ${tag}`, barcode: '', stock: 1 });

    const { totalItems } = await stats(request);
    expect(totalItems).toBe(2); // dili ma-collapse sa usa ra ang '' barcode
  });

  test('low_stock_items counts a product once even when several copies are low', async ({ request }) => {
    const barcode = `DST-${uuidv4().slice(0, 8)}`;
    // Parehong copy ubos sa reorder_point ug naay stock (> 0).
    await insertProduct({ warehouseId: branch.warehouseId, name: `Low ${barcode}`, barcode, stock: 2, reorderPoint: 50 });
    await insertProduct({ warehouseId: secondWarehouse, name: `Low ${barcode}`, barcode, stock: 3, reorderPoint: 50 });

    const { lowStockItems, totalItems } = await stats(request);
    expect(lowStockItems).toBe(1); // not 2
    expect(totalItems).toBe(1);
  });

  test('reports/inventory pagination count still matches the rows listed', async ({ request }) => {
    const barcode = `DST-${uuidv4().slice(0, 8)}`;
    // 3 ka row sa listing: usa ka product sa duha ka warehouse + usa ka lain.
    await insertProduct({ warehouseId: branch.warehouseId, name: `Inv A ${barcode}`, barcode, stock: 5 });
    await insertProduct({ warehouseId: secondWarehouse, name: `Inv A ${barcode}`, barcode, stock: 0 });
    await insertProduct({ warehouseId: branch.warehouseId, name: `Inv B ${barcode}`, barcode: `${barcode}-B`, stock: 5 });

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
        const barcode = `DST-${uuidv4().slice(0, 8)}`;
        await insertProduct({ warehouseId: branch.warehouseId, name: `Sum ${barcode}`, barcode, stock: 10 });
        await insertProduct({ warehouseId: secondWarehouse, name: `Sum ${barcode}`, barcode, stock: 0 });

        const body = await fetchReport(request, '&limit=1000');
        expect(body.summary.totalItems).toBe(1); // not 2
        expect(body.data).toHaveLength(2); // the listing still shows both copies
      });

      test('summary.totalItems still counts a NULL-barcode product', async ({ request }) => {
        const barcode = `DST-${uuidv4().slice(0, 8)}`;
        const nullName = `Null barcode ${barcode}`;
        await insertProduct({ warehouseId: branch.warehouseId, name: nullName, barcode: null, stock: 4 });
        await insertProduct({ warehouseId: secondWarehouse, name: nullName, barcode: null, stock: 0 });
        await insertProduct({ warehouseId: branch.warehouseId, name: `Normal ${barcode}`, barcode, stock: 4 });

        const body = await fetchReport(request, '&limit=1000');
        // COUNT(*) = 3, plain COUNT(DISTINCT barcode) = 1 (drops NULL). Correct = 2.
        expect(body.summary.totalItems).toBe(2);
      });

      test('pagination.totalItems stays equal to the rows listed (not DISTINCT)', async ({ request }) => {
        const barcode = `DST-${uuidv4().slice(0, 8)}`;
        await insertProduct({ warehouseId: branch.warehouseId, name: `Pg A ${barcode}`, barcode, stock: 5 });
        await insertProduct({ warehouseId: secondWarehouse, name: `Pg A ${barcode}`, barcode, stock: 0 });
        await insertProduct({ warehouseId: branch.warehouseId, name: `Pg B ${barcode}`, barcode: `${barcode}-B`, stock: 5 });

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
