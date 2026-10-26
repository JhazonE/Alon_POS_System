import { test, expect } from '@playwright/test';
import { fanoutTargetWarehouses, addProductWithScope } from '../../lib/product-create';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  seedProductInWarehouse,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Pure nga tests — walay `page` fixture. Ang fan-out target kay mag-agad sa
 * branch; dili gyud mo-target ug warehouse sa laing branch.
 */
test.describe('fanoutTargetWarehouses', () => {
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

  test.afterEach(async () => {
    for (const id of extraWarehouses.splice(0)) {
      await testQuery('DELETE FROM warehouses WHERE id = ?', [id]);
    }
    for (const b of seededBranches.splice(0)) {
      await cleanupSecondBranch(b);
    }
  });

  test('branch scope targets only its own branch warehouses, excluding the selected one', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId, true);
    const targets = await fanoutTargetWarehouses(b.warehouseId, {
      scope: 'single',
      branchId: b.branchId,
    });
    expect(targets).toEqual([extra]);
    expect(targets).not.toContain(b.warehouseId);
  });

  test('null selected warehouse yields no targets', async () => {
    expect(await fanoutTargetWarehouses(null, { scope: 'all', branchId: null })).toEqual([]);
  });

  test('head office targets the selected warehouse branch only', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId, true);
    const targets = await fanoutTargetWarehouses(b.warehouseId, { scope: 'all', branchId: null });
    expect(targets.sort()).toEqual([extra].sort()); // nothing from the main branch
  });

  test('null scope behaves as head office', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId, true);
    expect(await fanoutTargetWarehouses(b.warehouseId, null)).toEqual([extra]);
  });

  test('inactive warehouses are not targets', async () => {
    const b = await seed();
    await addWarehouse(b.branchId, false);
    expect(
      await fanoutTargetWarehouses(b.warehouseId, { scope: 'single', branchId: b.branchId })
    ).toEqual([]);
  });

  test('a branch with one active warehouse yields no targets', async () => {
    const b = await seed();
    expect(
      await fanoutTargetWarehouses(b.warehouseId, { scope: 'single', branchId: b.branchId })
    ).toEqual([]);
  });
});

/**
 * Fan-out on create: ang bag-ong product mo-agi ug zero-stock nga kopya sa
 * ubang active warehouse sa SAMANG branch. Walay stock, batch, selling unit o
 * shelf nga ma-kopya.
 */
test.describe('addProductWithScope fan-out', () => {
  const seededBranches: SeededBranch[] = [];
  const extraWarehouses: string[] = [];
  const skus: string[] = [];

  function newSku(): string {
    const sku = `FAN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    skus.push(sku);
    return sku;
  }

  async function seed(): Promise<SeededBranch> {
    const b = await seedSecondBranch();
    seededBranches.push(b);
    return b;
  }

  async function addWarehouse(branchId: string): Promise<string> {
    const id = await addWarehouseToBranch(branchId, { active: true });
    extraWarehouses.push(id);
    return id;
  }

  function form(sku: string, overrides: Record<string, unknown> = {}): any {
    return {
      name: `Fanout ${sku}`,
      brand: 'TestBrand',
      sku,
      description: 'fan-out test',
      category: 'TestCategory',
      unitOfMeasure: 'pc',
      reorderPoint: 5,
      price: 10,
      cost: 6,
      ...overrides,
    };
  }

  test.afterEach(async () => {
    for (const sku of skus.splice(0)) {
      const ids = (await testQuery('SELECT id FROM products WHERE sku = ?', [sku])) as Array<{ id: string }>;
      for (const { id } of ids) {
        await testQuery('DELETE FROM inventory_batches WHERE product_id = ?', [id]);
        await testQuery('DELETE FROM product_price_levels WHERE product_id = ?', [id]);
        await testQuery('DELETE FROM product_selling_units WHERE product_id = ?', [id]);
        await testQuery('DELETE FROM products WHERE id = ?', [id]);
      }
    }
    for (const id of extraWarehouses.splice(0)) {
      await testQuery('DELETE FROM warehouses WHERE id = ?', [id]);
    }
    for (const b of seededBranches.splice(0)) {
      await cleanupSecondBranch(b);
    }
  });

  test('a created product appears in every active warehouse of the branch at zero stock', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, { warehouse: b.warehouseId, stock: 25 }), b.userUid, true,
      { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);

    const rows = (await testQuery(
      'SELECT warehouse_id, stock, avg_daily_sales FROM products WHERE sku = ? ORDER BY stock DESC', [sku])) as any[];
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].stock)).toBe(25);
    expect(rows[0].warehouse_id).toBe(b.warehouseId);
    expect(Number(rows[1].stock)).toBe(0);
    expect(Number(rows[1].avg_daily_sales)).toBe(0);
    expect(rows[1].warehouse_id).toBe(extra);
  });

  test('the copy carries the descriptive columns of the original', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    const sku = newSku();
    await addProductWithScope(
      form(sku, { warehouse: b.warehouseId, stock: 3, barcode: `BC-${sku}` }), b.userUid, true,
      { scope: 'single', branchId: b.branchId });
    const rows = (await testQuery(
      `SELECT name, category, brand, price, cost, sku, barcode, unit_of_measure, type, shelf_location_id
       FROM products WHERE sku = ? ORDER BY stock DESC`, [sku])) as any[];
    expect(rows).toHaveLength(2);
    for (const k of ['name', 'category', 'brand', 'sku', 'barcode', 'unit_of_measure', 'type']) {
      expect(rows[1][k]).toBe(rows[0][k]);
    }
    expect(Number(rows[1].price)).toBe(Number(rows[0].price));
    expect(Number(rows[1].cost)).toBe(Number(rows[0].cost));
    expect(rows[1].shelf_location_id).toBeNull();
  });

  test('no inventory batch is created for a fanned-out copy', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    await addProductWithScope(
      form(sku, { warehouse: b.warehouseId, stock: 25 }), b.userUid, true,
      { scope: 'single', branchId: b.branchId });
    const batches = await testQuery(
      `SELECT b.id FROM inventory_batches b JOIN products p ON b.product_id = p.id
       WHERE p.sku = ? AND p.warehouse_id = ?`, [sku, extra]);
    expect(batches).toHaveLength(0);
    const original = await testQuery(
      `SELECT b.id FROM inventory_batches b JOIN products p ON b.product_id = p.id
       WHERE p.sku = ? AND p.warehouse_id = ?`, [sku, b.warehouseId]);
    expect(original).toHaveLength(1);
  });

  test('a service product does not fan out', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, { itemType: 'service' }), b.userUid, true,
      { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);
    const rows = await testQuery('SELECT id FROM products WHERE sku = ?', [sku]);
    expect(rows).toHaveLength(1);
  });

  test('selling units are not copied to the fanned-out copy', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouse: b.warehouseId,
        stock: 4,
        sellingUnits: [{
          unitName: 'pc', qtyBase: 1, barcode: `SU-${sku}`, cost: 6, isBase: true, prices: {},
        }],
      }), b.userUid, true, { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);

    const units = await testQuery(
      `SELECT u.id FROM product_selling_units u JOIN products p ON u.product_id = p.id
       WHERE p.sku = ? AND p.warehouse_id = ?`, [sku, extra]);
    expect(units).toHaveLength(0);
    const own = await testQuery(
      `SELECT u.id FROM product_selling_units u JOIN products p ON u.product_id = p.id
       WHERE p.sku = ? AND p.warehouse_id = ?`, [sku, b.warehouseId]);
    expect(own).toHaveLength(1);
  });

  test('a NULL-warehouse product creates one row and does not fan out', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku), 'tester', true, { scope: 'all', branchId: null });
    expect(result.success).toBe(true);
    const rows = await testQuery('SELECT id FROM products WHERE sku = ?', [sku]);
    expect(rows).toHaveLength(1);
  });

  test('a fan-out failure rolls back the primary insert', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    // Same (sku, warehouse_id) already in the target warehouse -> the copy collides.
    await seedProductInWarehouse(extra, sku);
    const result: any = await addProductWithScope(
      form(sku, { warehouse: b.warehouseId, stock: 9 }), b.userUid, true,
      { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(false);
    const selected = await testQuery(
      'SELECT id FROM products WHERE sku = ? AND warehouse_id = ?', [sku, b.warehouseId]);
    expect(selected).toHaveLength(0);
    const batches = await testQuery(
      `SELECT b.id FROM inventory_batches b JOIN products p ON b.product_id = p.id
       WHERE p.sku = ?`, [sku]);
    expect(batches).toHaveLength(0);
  });
});
