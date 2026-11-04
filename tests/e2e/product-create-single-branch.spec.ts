import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  readMainBranchId,
  type SeededBranch,
} from './helpers/branches';
import { testQuery } from './helpers/db';
import { addProduct } from '../../app/(app)/products/actions';
import { EDITABLE_PRODUCT, TEST_MAIN_WAREHOUSE } from './fixtures/test-data';

/**
 * Usa ka produkto kay para sa USA ka branch.
 *
 * Ang `assertWarehouseForWrite` mo-return dayon para sa head office
 * (`scope === 'all'`), mao nga sa wala pa kini, ang head office makahimo ug
 * usa ka produkto nga naay warehouse gikan sa duha ka lain-laing branch sa
 * usa ka submission. Ang branch user dili — gi-assert na ang iyang mga entry
 * batok sa iyang kaugalingong branch.
 *
 * Ang rule karon: ang tanang warehouse sa usa ka submission kinahanglan parehas
 * ug branch. Gi-enforce kini sa SERVER (dili lang sa UI picker), kay ang
 * argumento sa usa ka server action naggikan sa wire — ang approval item nga
 * gi-replay, o ang direktang tawag, dili mo-agi sa picker.
 */
test.describe('addProduct — usa ka branch kada produkto', () => {
  let other: SeededBranch;

  test.beforeAll(async () => {
    other = await seedSecondBranch();
  });

  test.afterAll(async () => {
    await cleanupSecondBranch(other);
  });

  function formData(name: string, warehouses: { warehouseId: string; stock: number }[]) {
    return {
      name,
      description: 'Produkto para sa single-branch rule test.',
      price: 100,
      cost: 50,
      brand: EDITABLE_PRODUCT.brand,
      category: EDITABLE_PRODUCT.category,
      unitOfMeasure: EDITABLE_PRODUCT.unitOfMeasure,
      availability: 'Available',
      warehouses,
    } as any;
  }

  test('gi-refuse ang submission nga naay warehouse gikan sa duha ka branch', async () => {
    const name = `Cross Branch Widget ${Date.now()}`;
    const result = await addProduct(
      formData(name, [
        { warehouseId: TEST_MAIN_WAREHOUSE.id, stock: 5 },
        { warehouseId: other.warehouseId, stock: 3 },
      ]),
    );

    expect(result.success, 'cross-branch submission kinahanglan ma-refuse').toBe(false);
    expect(result.message ?? '').toMatch(/branch/i);

    // All-or-nothing: WALAY product row nga nahimo, bisan para sa main branch
    // nga entry — ang assert modagan sa wala pa ang transaction.
    const rows = await testQuery('SELECT id FROM products WHERE name = ?', [name]);
    expect(rows, 'walay product row nga nahimo').toHaveLength(0);
  });

  test('gidawat ang submission nga pulos usa ra ka branch', async () => {
    const name = `Single Branch Widget ${Date.now()}`;
    const mainBranchId = await readMainBranchId();
    const warehouses = (await testQuery(
      'SELECT id FROM warehouses WHERE branch_id = ? AND is_active = 1 ORDER BY created_at LIMIT 2',
      [mainBranchId],
    )) as { id: string }[];
    expect(warehouses.length, 'kinahanglan duha ka warehouse sa main branch').toBeGreaterThan(1);

    const result = await addProduct(
      formData(name, warehouses.map((w, i) => ({ warehouseId: w.id, stock: i === 0 ? 7 : 2 }))),
    );

    expect(result.success, result.message ?? 'kinahanglan molampos').toBe(true);
    const rows = await testQuery('SELECT id FROM products WHERE name = ?', [name]);
    expect(rows, 'usa ka row kada warehouse').toHaveLength(2);

    await testQuery('DELETE FROM products WHERE name = ?', [name]);
  });
});
