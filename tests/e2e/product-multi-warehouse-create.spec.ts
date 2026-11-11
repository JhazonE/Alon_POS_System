import { test, expect } from '@playwright/test';
import { addProductWithScope } from '../../lib/product-create';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  addWarehouseToBranch,
  seedProductInWarehouse,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';

/**
 * Multi-warehouse create: ang `warehouses` collection mao ang mo-ingon asa
 * i-create ang product ug pila ang opening stock sa kada warehouse. Walay
 * branch-wide fan-out — ang gipili ra ang ma-sulatan.
 *
 * Pure nga tests — walay `page` fixture; ang write path mismo ang gi-test.
 */
test.describe('addProductWithScope multi-warehouse create', () => {
  const seededBranches: SeededBranch[] = [];
  const extraWarehouses: string[] = [];
  const skus: string[] = [];

  function newSku(): string {
    const sku = `MWH-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
      name: `MultiWH ${sku}`,
      brand: 'TestBrand',
      barcode: sku,
      description: 'multi-warehouse create test',
      category: 'TestCategory',
      unitOfMeasure: 'pc',
      reorderPoint: 5,
      price: 10,
      cost: 6,
      ...overrides,
    };
  }

  /** Every product row created for this sku, highest stock first. */
  async function rowsBySku(sku: string): Promise<any[]> {
    return (await testQuery(
      `SELECT id, warehouse_id, stock, avg_daily_sales FROM products
       WHERE barcode = ? ORDER BY stock DESC`,
      [sku],
    )) as any[];
  }

  async function batchesBySku(sku: string): Promise<any[]> {
    return (await testQuery(
      `SELECT b.id, b.quantity_in, b.quantity_remaining, b.unit_cost, b.selling_price,
              b.source_type, b.notes, p.warehouse_id
         FROM inventory_batches b JOIN products p ON b.product_id = p.id
        WHERE p.barcode = ?`,
      [sku],
    )) as any[];
  }

  async function movementsBySku(sku: string): Promise<any[]> {
    return (await testQuery(
      `SELECT m.id, m.quantity_change, m.previous_stock, m.new_stock, m.movement_type,
              m.notes, p.warehouse_id
         FROM stock_movements m JOIN products p ON m.product_id = p.id
        WHERE p.barcode = ?`,
      [sku],
    )) as any[];
  }

  test.afterEach(async () => {
    for (const sku of skus.splice(0)) {
      // Resolved by NAME, not by barcode. `form()` always sets the name to
      // `MultiWH ${sku}` and nothing rewrites it, whereas products.barcode is
      // not a stable handle here: a submission may override it (`BC-${sku}`),
      // and a base selling unit's barcode is synced back onto the product row
      // (lib/product-create.ts), so a barcode-keyed cleanup silently leaves
      // rows behind for exactly the tests that exercise those paths. The name
      // covers every row this spec creates, under any of its barcodes.
      const ids = (await testQuery(
        'SELECT id FROM products WHERE name = ? OR barcode = ?',
        [`MultiWH ${sku}`, sku],
      )) as Array<{ id: string }>;
      for (const { id } of ids) {
        await testQuery('DELETE FROM inventory_batches WHERE product_id = ?', [id]);
        await testQuery('DELETE FROM stock_movements WHERE product_id = ?', [id]);
        await testQuery('DELETE FROM product_price_levels WHERE product_id = ?', [id]);
        await testQuery('DELETE FROM product_selling_units WHERE product_id = ?', [id]);
        await testQuery('DELETE FROM product_shelves WHERE product_id = ?', [id]);
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

  // --- the core multi-warehouse property -----------------------------------

  test('each selected warehouse gets a product row, a batch and a movement row', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 25, isPrimary: true },
          { warehouseId: extra, stock: 7 },
        ],
      }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(result.success).toBe(true);

    const rows = await rowsBySku(sku);
    expect(rows).toHaveLength(2);
    expect(rows[0].warehouse_id).toBe(b.warehouseId);
    expect(Number(rows[0].stock)).toBe(25);
    expect(rows[1].warehouse_id).toBe(extra);
    expect(Number(rows[1].stock)).toBe(7);

    const batches = await batchesBySku(sku);
    expect(batches).toHaveLength(2);
    const byWh = (wh: string) => batches.find((x) => x.warehouse_id === wh);
    expect(Number(byWh(b.warehouseId).quantity_in)).toBe(25);
    expect(Number(byWh(b.warehouseId).quantity_remaining)).toBe(25);
    expect(Number(byWh(extra).quantity_in)).toBe(7);
    // The shared cost and the product price are on every batch.
    for (const batch of batches) {
      expect(Number(batch.unit_cost)).toBe(6);
      expect(Number(batch.selling_price)).toBe(10);
      expect(batch.source_type).toBe('adjustment');
      expect(batch.notes).toBe('Initial Stock');
    }

    const movements = await movementsBySku(sku);
    expect(movements).toHaveLength(2);
    for (const m of movements) {
      expect(m.movement_type).toBe('adjustment');
      expect(Number(m.previous_stock)).toBe(0);
    }
    expect(Number(movements.find((m) => m.warehouse_id === b.warehouseId).quantity_change)).toBe(25);
    expect(Number(movements.find((m) => m.warehouse_id === b.warehouseId).new_stock)).toBe(25);
    expect(Number(movements.find((m) => m.warehouse_id === extra).quantity_change)).toBe(7);
    expect(Number(movements.find((m) => m.warehouse_id === extra).new_stock)).toBe(7);
  });

  test('a warehouse with zero opening stock gets a row but no batch and no movement', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 12, isPrimary: true },
          { warehouseId: extra, stock: 0 },
        ],
      }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(result.success).toBe(true);

    const rows = await rowsBySku(sku);
    expect(rows).toHaveLength(2);
    const zeroRow = rows.find((r) => r.warehouse_id === extra);
    expect(Number(zeroRow.stock)).toBe(0);
    expect(Number(zeroRow.avg_daily_sales)).toBe(0);

    const batches = await batchesBySku(sku);
    expect(batches).toHaveLength(1);
    expect(batches[0].warehouse_id).toBe(b.warehouseId);

    const movements = await movementsBySku(sku);
    expect(movements).toHaveLength(1);
    expect(movements[0].warehouse_id).toBe(b.warehouseId);
  });

  // A product belongs to ONE branch (669431b). `assertWarehouseForWrite` is a no-op
  // for head office, so without `assertEntriesShareOneBranch` a head-office caller
  // could put a single product, and its stock, in two BIR establishments. This used
  // to be asserted the other way round ("head office may select warehouses in two
  // different branches"), which is the hole that commit closed.
  test('head office cannot put one product in two branches, and nothing is written', async () => {
    const b1 = await seed();
    const b2 = await seed();
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b1.warehouseId, stock: 3, isPrimary: true },
          { warehouseId: b2.warehouseId, stock: 4 },
        ],
      }),
      'tester', true, { scope: 'all', branchId: null },
    );
    expect(result.success).toBe(false);
    // The refusal names the split so the user can see which pick is the odd one.
    expect(String(result.message)).toMatch(/belongs to one branch/);
    expect(String(result.message)).toMatch(/span 2/);

    expect(await rowsBySku(sku)).toHaveLength(0);
    expect(await batchesBySku(sku)).toHaveLength(0);
    expect(await movementsBySku(sku)).toHaveLength(0);
  });

  // The per-entry assert is skipped entirely without a session cookie (scope null),
  // so for that caller the one-branch rule is the ONLY thing between it and a
  // cross-branch product.
  test('an unguarded caller (no session cookie) cannot span two branches either', async () => {
    const b1 = await seed();
    const b2 = await seed();
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b1.warehouseId, stock: 3, isPrimary: true },
          { warehouseId: b2.warehouseId, stock: 4 },
        ],
      }),
      'tester', true, null,
    );
    expect(result.success).toBe(false);
    expect(String(result.message)).toMatch(/belongs to one branch/);

    expect(await rowsBySku(sku)).toHaveLength(0);
    expect(await batchesBySku(sku)).toHaveLength(0);
    expect(await movementsBySku(sku)).toHaveLength(0);
  });

  // The positive control: the refusal is about SPANNING branches, not about head
  // office, so several warehouses of one branch must still go through.
  test('head office may still pick several warehouses of ONE branch', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 3, isPrimary: true },
          { warehouseId: extra, stock: 4 },
        ],
      }),
      'tester', true, { scope: 'all', branchId: null },
    );
    expect(result.success).toBe(true);
    const rows = await rowsBySku(sku);
    expect(rows.map((r) => r.warehouse_id).sort()).toEqual([b.warehouseId, extra].sort());
  });

  // --- refusals: nothing is written ----------------------------------------

  test('an out-of-branch warehouse refuses the whole submission and writes nothing', async () => {
    const b = await seed();
    const other = await seed(); // a different branch entirely
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 5, isPrimary: true },
          { warehouseId: other.warehouseId, stock: 6 },
        ],
      }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(result.success).toBe(false);
    // The message names the offending warehouse so the user can act on it.
    expect(String(result.message)).toContain(other.warehouseId);

    expect(await rowsBySku(sku)).toHaveLength(0);
    expect(await batchesBySku(sku)).toHaveLength(0);
    expect(await movementsBySku(sku)).toHaveLength(0);
  });

  test('a duplicate warehouseId is refused', async () => {
    const b = await seed();
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 5, isPrimary: true },
          { warehouseId: b.warehouseId, stock: 6 },
        ],
      }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(result.success).toBe(false);
    expect(await rowsBySku(sku)).toHaveLength(0);
    expect(await batchesBySku(sku)).toHaveLength(0);
    expect(await movementsBySku(sku)).toHaveLength(0);
  });

  test('a non-string warehouseId is refused before any write', async () => {
    const b = await seed();
    const sku = newSku();
    // `query` uses pool.query, which escapes an OBJECT parameter as `key` = value:
    // `WHERE id = ?` fed this would become a match-many predicate. Never coerce.
    const result: any = await addProductWithScope(
      form(sku, { warehouses: [{ warehouseId: { supplier_id: 0 } as any, stock: 5, isPrimary: true }] }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(result.success).toBe(false);
    expect(await rowsBySku(sku)).toHaveLength(0);
    expect(await batchesBySku(sku)).toHaveLength(0);
    expect(await movementsBySku(sku)).toHaveLength(0);
  });

  test('a non-string warehouseId is refused for head office too', async () => {
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, { warehouses: [{ warehouseId: 0 as any, stock: 5, isPrimary: true }] }),
      'tester', true, { scope: 'all', branchId: null },
    );
    expect(result.success).toBe(false);
    expect(await rowsBySku(sku)).toHaveLength(0);
  });

  test('a negative or fractional opening stock is refused', async () => {
    const b = await seed();
    const negSku = newSku();
    const negative: any = await addProductWithScope(
      form(negSku, { warehouses: [{ warehouseId: b.warehouseId, stock: -1, isPrimary: true }] }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(negative.success).toBe(false);
    expect(await rowsBySku(negSku)).toHaveLength(0);

    const fracSku = newSku();
    const fractional: any = await addProductWithScope(
      form(fracSku, { warehouses: [{ warehouseId: b.warehouseId, stock: 1.5, isPrimary: true }] }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(fractional.success).toBe(false);
    expect(await rowsBySku(fracSku)).toHaveLength(0);
  });

  test('two entries flagged primary are refused', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 1, isPrimary: true },
          { warehouseId: extra, stock: 2, isPrimary: true },
        ],
      }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(result.success).toBe(false);
    expect(await rowsBySku(sku)).toHaveLength(0);
  });

  // --- the primary row owns the extras -------------------------------------

  test('the primary defaults to the first entry when none is flagged', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 0 },
          { warehouseId: extra, stock: 0 },
        ],
        sellingUnits: [{
          unitName: 'pc', qtyBase: 1, barcode: `DP-${sku}`, cost: 6, isBase: true, prices: {},
        }],
      }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    expect(result.success).toBe(true);
    // The selling unit belongs to the PRIMARY row, which is the first entry.
    // Keyed on `DP-${sku}`, not on the bare `sku`: the base selling unit's
    // barcode is written back onto products.barcode by the selling-unit sync
    // (lib/product-create.ts `UPDATE products SET ... barcode = ?`), so the
    // row no longer carries the form's barcode at all. This used to key on
    // products.sku, a separate column the sync never touched.
    const owner = (await testQuery(
      `SELECT p.warehouse_id FROM product_selling_units u JOIN products p ON u.product_id = p.id
       WHERE p.barcode = ?`, [`DP-${sku}`])) as any[];
    expect(owner).toHaveLength(1);
    expect(owner[0].warehouse_id).toBe(b.warehouseId);
  });

  test('the non-primary row carries the descriptive columns of the primary', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    await addProductWithScope(
      form(sku, {
        barcode: `BC-${sku}`,
        warehouses: [
          { warehouseId: b.warehouseId, stock: 3, isPrimary: true },
          { warehouseId: extra, stock: 0 },
        ],
      }),
      b.userUid, true, { scope: 'single', branchId: b.branchId },
    );
    const rows = (await testQuery(
      // `BC-${sku}`, not `sku`: this submission overrides the form barcode, and
      // with products.sku retired the barcode is the only handle on the rows.
      `SELECT name, category, brand, price, cost, barcode, unit_of_measure, type, shelf_location_id
       FROM products WHERE barcode = ? ORDER BY stock DESC`, [`BC-${sku}`])) as any[];
    expect(rows).toHaveLength(2);
    for (const k of ['name', 'category', 'brand', 'barcode', 'unit_of_measure', 'type']) {
      expect(rows[1][k]).toBe(rows[0][k]);
    }
    expect(Number(rows[1].price)).toBe(Number(rows[0].price));
    expect(Number(rows[1].cost)).toBe(Number(rows[0].cost));
    // A shelf is physical and belongs to one warehouse, so it is not carried.
    expect(rows[1].shelf_location_id).toBeNull();
  });

  test('the non-primary row takes its scalar columns from the post-sync primary, not from the form', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const levels = (await testQuery(
      'SELECT id FROM price_levels ORDER BY is_default DESC, name ASC')) as Array<{ id: string }>;
    expect(levels.length).toBeGreaterThanOrEqual(1);
    const result: any = await addProductWithScope(
      // Form values that the base selling unit deliberately contradicts.
      form(sku, {
        price: 10, cost: 6, barcode: `FORM-${sku}`, unitOfMeasure: 'pc',
        warehouses: [
          { warehouseId: b.warehouseId, stock: 4, isPrimary: true },
          { warehouseId: extra, stock: 0 },
        ],
        sellingUnits: [{
          unitName: 'box', qtyBase: 1, barcode: `SU-${sku}`, cost: 7, isBase: true,
          prices: { [levels[0].id]: { price: 15 } },
        }],
      }), b.userUid, true, { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);

    // Keyed on `SU-${sku}` — the BASE SELLING UNIT's barcode, which is exactly
    // what this test asserts below that the sync writes onto both rows. Neither
    // the bare `sku` nor the form's `FORM-${sku}` survives on the product rows.
    const rows = (await testQuery(
      `SELECT warehouse_id, price, cost, barcode, unit_of_measure FROM products
       WHERE barcode = ? ORDER BY stock DESC`, [`SU-${sku}`])) as any[];
    expect(rows).toHaveLength(2);
    const [primary, copy] = rows;
    expect(copy.warehouse_id).toBe(extra);
    // The sync really did rewrite the primary (guards against a vacuous test)...
    expect(Number(primary.price)).toBe(15);
    expect(Number(primary.cost)).toBe(7);
    expect(primary.barcode).toBe(`SU-${sku}`);
    expect(primary.unit_of_measure).toBe('box');
    // ...and the copy carries the synced values, not the form's 10 / 6 / FORM- / pc.
    expect(Number(copy.price)).toBe(15);
    expect(Number(copy.cost)).toBe(7);
    expect(copy.barcode).toBe(`SU-${sku}`);
    expect(copy.unit_of_measure).toBe('box');
  });

  test('product_price_levels rows are copied to the non-primary row under its own product id', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const levels = (await testQuery(
      'SELECT id FROM price_levels ORDER BY is_default DESC, name ASC')) as Array<{ id: string }>;
    expect(levels.length).toBeGreaterThanOrEqual(2);
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 4, isPrimary: true },
          { warehouseId: extra, stock: 0 },
        ],
        sellingUnits: [{
          unitName: 'pc', qtyBase: 1, barcode: `PL-${sku}`, cost: 6, isBase: true,
          prices: {
            [levels[0].id]: { price: 15 },
            [levels[1].id]: { price: 12, minQuantity: 5 },
          },
        }],
      }), b.userUid, true, { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);

    const ids = (await testQuery(
      // `PL-${sku}`: the base selling unit's barcode is synced onto the product.
      'SELECT id, warehouse_id FROM products WHERE barcode = ?', [`PL-${sku}`])) as any[];
    const primaryId = ids.find((r) => r.warehouse_id === b.warehouseId).id;
    const copyId = ids.find((r) => r.warehouse_id === extra).id;
    expect(copyId).not.toBe(primaryId);

    const shape = (rows: any[]) => rows
      .map((r) => ({
        price_level_id: r.price_level_id,
        price: Number(r.price),
        min_quantity: Number(r.min_quantity),
      }))
      .sort((x, y) => x.price_level_id.localeCompare(y.price_level_id));
    const fetch = async (pid: string) => shape((await testQuery(
      'SELECT price_level_id, price, min_quantity FROM product_price_levels WHERE product_id = ?',
      [pid])) as any[]);
    const primaryLevels = await fetch(primaryId);
    const copyLevels = await fetch(copyId);
    expect(primaryLevels).toHaveLength(2); // non-vacuous: there is something to copy
    expect(copyLevels).toEqual(primaryLevels);
    expect(copyLevels.find((r) => r.price_level_id === levels[1].id)).toMatchObject({
      price: 12, min_quantity: 5,
    });
  });

  test('selling units are not copied to the non-primary row', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 4, isPrimary: true },
          { warehouseId: extra, stock: 0 },
        ],
        sellingUnits: [{
          unitName: 'pc', qtyBase: 1, barcode: `SU-${sku}`, cost: 6, isBase: true, prices: {},
        }],
      }), b.userUid, true, { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);

    // product_selling_units carries a GLOBAL UNIQUE(barcode) and the column is
    // NOT NULL, so a second copy of the same barcode cannot exist.
    const units = await testQuery(
      `SELECT u.id FROM product_selling_units u JOIN products p ON u.product_id = p.id
       WHERE p.barcode = ? AND p.warehouse_id = ?`, [`SU-${sku}`, extra]);
    expect(units).toHaveLength(0);
    const own = await testQuery(
      `SELECT u.id FROM product_selling_units u JOIN products p ON u.product_id = p.id
       WHERE p.barcode = ? AND p.warehouse_id = ?`, [`SU-${sku}`, b.warehouseId]);
    expect(own).toHaveLength(1);
  });

  // --- legacy / service / NULL-warehouse -----------------------------------

  test('a legacy single-warehouse payload still creates correctly', async () => {
    const b = await seed();
    await addWarehouse(b.branchId); // must NOT receive a copy any more
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, { warehouse: b.warehouseId, stock: 25 }), b.userUid, true,
      { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);

    const rows = await rowsBySku(sku);
    expect(rows).toHaveLength(1);
    expect(rows[0].warehouse_id).toBe(b.warehouseId);
    expect(Number(rows[0].stock)).toBe(25);

    const batches = await batchesBySku(sku);
    expect(batches).toHaveLength(1);
    expect(Number(batches[0].quantity_in)).toBe(25);
    const movements = await movementsBySku(sku);
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity_change)).toBe(25);
  });

  test('a legacy payload with stock but no warehouse keeps the stock on the NULL-warehouse row', async () => {
    // Ruling A: the pre-multi-warehouse code wrote `stock: formData.stock || 0`
    // onto the product row independently of any warehouse, and created an
    // opening batch for it. A PRODUCT_CREATE item queued under the old shape and
    // finalized after this change must not lose its stock silently.
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, { stock: 50 }), 'tester', true, { scope: 'all', branchId: null });
    expect(result.success).toBe(true);

    const rows = await rowsBySku(sku);
    expect(rows).toHaveLength(1);
    expect(rows[0].warehouse_id).toBeNull();
    expect(Number(rows[0].stock)).toBe(50);

    const batches = await batchesBySku(sku);
    expect(batches).toHaveLength(1);
    expect(Number(batches[0].quantity_in)).toBe(50);
    expect(Number(batches[0].quantity_remaining)).toBe(50);
    const movements = await movementsBySku(sku);
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity_change)).toBe(50);
  });

  test('a NULL-warehouse product creates exactly one row', async () => {
    const b = await seed();
    await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku), 'tester', true, { scope: 'all', branchId: null });
    expect(result.success).toBe(true);
    const rows = await rowsBySku(sku);
    expect(rows).toHaveLength(1);
    expect(rows[0].warehouse_id).toBeNull();
  });

  test('a service product creates one row and takes no warehouse collection', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, { itemType: 'service' }), b.userUid, true,
      { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);
    const rows = await rowsBySku(sku);
    // Services keep their existing path: ONE row, filed in a warehouse of the
    // caller's own branch (which one is the pre-existing resolver's choice),
    // never a row per warehouse.
    expect(rows).toHaveLength(1);
    expect([b.warehouseId, extra]).toContain(rows[0].warehouse_id);
    expect(await batchesBySku(sku)).toHaveLength(0);
    expect(await movementsBySku(sku)).toHaveLength(0);
  });

  test('a service ignores a warehouse collection even if one is supplied', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    // The schema pins a service's `warehouses` to an empty array, but
    // addProductWithScope's arguments arrive off the wire, so the write path
    // must drop a supplied collection rather than fan a service out.
    const result: any = await addProductWithScope(
      form(sku, {
        itemType: 'service',
        warehouses: [
          { warehouseId: b.warehouseId, stock: 5, isPrimary: true },
          { warehouseId: extra, stock: 5 },
        ],
      }), b.userUid, true, { scope: 'single', branchId: b.branchId });
    expect(result.success).toBe(true);
    expect(await rowsBySku(sku)).toHaveLength(1);
    expect(await batchesBySku(sku)).toHaveLength(0);
  });

  // --- all-or-nothing ------------------------------------------------------

  /**
   * Usa ka pakyas SULOD sa transaction mo-rollback sa tanan: product row,
   * batch ug stock_movements.
   *
   * Ang gamit nga collision kay `product_selling_units.unique_selling_unit_barcode`
   * — usa ka GLOBAL UNIQUE (migration 115) nga magpabilin human sa migration 145.
   *
   * KANIADTO kini nag-seed ug row nga parehas ug `(sku, warehouse_id)` sa
   * ikaduhang warehouse, nga mo-violate sa unique index `sku_warehouse`
   * (migration 056). Dili na mahimo: blangko na ang tanang products.sku, ug ang
   * migration 145 mo-drop na sa kolum UG sa index. Ang products.barcode WALAY
   * unique index (ug tinuyo nga dili dugangan — daghang spec ang legitimong
   * mo-seed sa parehas nga barcode sa duha ka warehouse), mao nga walay
   * constraint nga ma-violate sa products mismo gawas sa PRIMARY, nga
   * generated ang id ug dili ma-kontrol gikan sa gawas.
   *
   * SAKOP NGA NAWALA, gi-record imbes gi-tabonan: ang selling-unit insert
   * mo-una sa secondary-warehouse rows sa lib/product-create.ts, mao nga kini
   * nga test mo-prube nga ang primary row + batch + movement mo-rollback, APAN
   * DILI na niya ma-prube nga ang pakyas sa IKADUHANG warehouse row mismo
   * mo-rollback sa primary. Ang maong path kay walay reachable nga failure
   * mode karon; ang pag-test niini kinahanglan ug bag-ong constraint o fault
   * injection, nga labaw sa trabaho sa pagtangtang sa patay nga kolum.
   */
  test('a failure inside the transaction rolls the whole multi-insert back', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const clashBarcode = `SUCLASH-${sku}`;
    // I-angkon ang selling-unit barcode pinaagi sa laing produkto. Ang INSERT
    // sa selling unit sa sulod sa transaction mao ang mo-pakyas.
    const holderId = await seedProductInWarehouse(b.warehouseId, `holder-${sku}`);
    await testQuery(
      `INSERT INTO product_selling_units (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
       VALUES (?, ?, 'pc', 1, ?, 1, 2, 1, 0)`,
      [`su-holder-${sku}`, holderId, clashBarcode],
    );
    try {
      const result: any = await addProductWithScope(
        form(sku, {
          warehouses: [
            { warehouseId: b.warehouseId, stock: 9, isPrimary: true },
            { warehouseId: extra, stock: 4 },
          ],
          sellingUnits: [{
            unitName: 'pc', qtyBase: 1, barcode: clashBarcode, cost: 6, isBase: true, prices: {},
          }],
        }),
        b.userUid, true, { scope: 'single', branchId: b.branchId });
      expect(result.success).toBe(false);

      // Walay product row sa BISAN ASA sa duha ka warehouse.
      const left = await testQuery(
        'SELECT id FROM products WHERE name = ?', [`MultiWH ${sku}`]);
      expect(left).toHaveLength(0);
      expect(await batchesBySku(sku)).toHaveLength(0);
      // The movement joined the transaction, so it rolled back too.
      expect(await movementsBySku(sku)).toHaveLength(0);
    } finally {
      await testQuery('DELETE FROM product_selling_units WHERE product_id = ?', [holderId]);
      await testQuery('DELETE FROM products WHERE id = ?', [holderId]);
    }
  });

  // --- queue summary -------------------------------------------------------

  test('a queued multi-warehouse create records one items[] row per warehouse', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();

    const names = (await testQuery(
      'SELECT id, name FROM warehouses WHERE id IN (?, ?)', [b.warehouseId, extra])) as any[];
    const nameOf = (id: string) => names.find((n) => n.id === id).name;

    // Turn PRODUCT_CREATE approval on: both the pos_settings master switch and
    // a workflow step are needed (checkApprovalRequired tests both). The step is
    // assigned to Admin while the seeded test user is a plain 'User', so
    // submitToApprovalQueue cannot auto-skip it and the item really queues.
    const workflowId = `wf-test-${Date.now()}`;
    await testQuery(
      'UPDATE pos_settings SET require_product_confirmation = 1');
    await testQuery(
      `INSERT INTO approval_workflows (id, transaction_type, user_type_id, step_order)
       VALUES (?, 'PRODUCT_CREATE', 'ut-admin', 1)`, [workflowId]);
    let queueId: string | undefined;
    try {
      const result: any = await addProductWithScope(
        form(sku, {
          warehouses: [
            { warehouseId: b.warehouseId, stock: 25, isPrimary: true },
            { warehouseId: extra, stock: 7 },
          ],
        }),
        b.userUid, false, { scope: 'single', branchId: b.branchId },
      );
      expect(result.success).toBe(true);
      expect(result.pendingApproval).toBe(true);
      queueId = result.queueId;

      const rows = (await testQuery(
        'SELECT transaction_data FROM approval_queue WHERE id = ?', [queueId])) as any[];
      const data = typeof rows[0].transaction_data === 'string'
        ? JSON.parse(rows[0].transaction_data)
        : rows[0].transaction_data;
      expect(data.items).toHaveLength(2);
      const byWarehouse = (name: string) => data.items.find((i: any) => i.warehouseName === name);
      expect(byWarehouse(nameOf(b.warehouseId)).quantity).toBe(25);
      expect(byWarehouse(nameOf(extra)).quantity).toBe(7);
      for (const item of data.items) {
        expect(item.productName).toBe(`MultiWH ${sku}`);
        expect(item.barcode).toBe(sku);
      }
      // Nothing was written yet.
      expect(await rowsBySku(sku)).toHaveLength(0);
    } finally {
      if (queueId) {
        await testQuery('DELETE FROM approval_history WHERE approval_queue_id = ?', [queueId]);
        await testQuery('DELETE FROM approval_queue WHERE id = ?', [queueId]);
      }
      await testQuery('DELETE FROM approval_workflows WHERE id = ?', [workflowId]);
      await testQuery('UPDATE pos_settings SET require_product_confirmation = 0');
    }
  });

  test('head office may still create in a specific branch warehouse', async () => {
    const b = await seed();
    await addWarehouse(b.branchId); // not selected -> must stay empty
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, { warehouses: [{ warehouseId: b.warehouseId, stock: 2, isPrimary: true }] }),
      'tester', true, { scope: 'all', branchId: null });
    expect(result.success).toBe(true);
    const rows = await rowsBySku(sku);
    expect(rows).toHaveLength(1);
    expect(rows[0].warehouse_id).toBe(b.warehouseId);
  });

  test('a null scope falls back to pre-guard behaviour and writes the selected warehouses', async () => {
    const b = await seed();
    const extra = await addWarehouse(b.branchId);
    const sku = newSku();
    const result: any = await addProductWithScope(
      form(sku, {
        warehouses: [
          { warehouseId: b.warehouseId, stock: 1, isPrimary: true },
          { warehouseId: extra, stock: 2 },
        ],
      }),
      'tester', true, null);
    expect(result.success).toBe(true);
    expect(await rowsBySku(sku)).toHaveLength(2);
  });
});
