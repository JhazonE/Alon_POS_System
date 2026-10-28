import { test, expect } from '@playwright/test';
import {
  productSchema,
  normalizeLegacyWarehouseInput,
} from '../../app/(app)/products/add-product/product-schema';

/**
 * Pure schema tests: parse and assert, no DB, no `page`, no request context.
 *
 * Every entry of `warehouses` is validated, not just the first: lib/mysql.ts
 * uses pool.query, which escapes an OBJECT parameter as `key` = value, so a
 * `WHERE id = ?` fed `{ foo: 0 }` becomes a match-many predicate.
 */

const baseUnit = {
  unitName: 'pc',
  qtyBase: 1,
  barcode: '4800000000001',
  isBase: true,
  prices: {},
};

function standard(overrides: Record<string, unknown> = {}) {
  return {
    itemType: 'standard',
    name: 'Widget',
    brand: 'Acme',
    description: 'A widget',
    category: 'General',
    sellingUnits: [baseUnit],
    warehouses: [{ warehouseId: 'wh_a', stock: 5 }],
    ...overrides,
  };
}

function service(overrides: Record<string, unknown> = {}) {
  return {
    itemType: 'service',
    name: 'Alteration',
    brand: 'Acme',
    description: 'Hemming',
    category: 'Services',
    unitOfMeasure: 'job',
    price: 100,
    cost: 0,
    ...overrides,
  };
}

test.describe('multi-warehouse product schema', () => {
  test('accepts several warehouses each with its own stock', () => {
    const r = productSchema.safeParse(
      standard({
        warehouses: [
          { warehouseId: 'wh_a', stock: 5, isPrimary: true },
          { warehouseId: 'wh_b', stock: 0 },
          { warehouseId: 'wh_c', stock: 12 },
        ],
      }),
    );
    expect(r.success).toBe(true);
    if (r.success && r.data.itemType === 'standard') {
      expect(r.data.warehouses.map((w) => [w.warehouseId, w.stock])).toEqual([
        ['wh_a', 5],
        ['wh_b', 0],
        ['wh_c', 12],
      ]);
    }
  });

  test('rejects a duplicate warehouseId in one submission', () => {
    const r = productSchema.safeParse(
      standard({
        warehouses: [
          { warehouseId: 'wh_a', stock: 1 },
          { warehouseId: 'wh_a', stock: 2 },
        ],
      }),
    );
    expect(r.success).toBe(false);
    // A padded copy of the same id is still a duplicate once trimmed.
    const padded = productSchema.safeParse(
      standard({
        warehouses: [
          { warehouseId: 'wh_a', stock: 1 },
          { warehouseId: ' wh_a ', stock: 2 },
        ],
      }),
    );
    expect(padded.success).toBe(false);
  });

  test('rejects more than one primary, and accepts exactly one or none', () => {
    const two = productSchema.safeParse(
      standard({
        warehouses: [
          { warehouseId: 'wh_a', stock: 1, isPrimary: true },
          { warehouseId: 'wh_b', stock: 1, isPrimary: true },
        ],
      }),
    );
    expect(two.success).toBe(false);
    const one = productSchema.safeParse(
      standard({
        warehouses: [
          { warehouseId: 'wh_a', stock: 1 },
          { warehouseId: 'wh_b', stock: 1, isPrimary: true },
        ],
      }),
    );
    expect(one.success).toBe(true);
    // None flagged: the primary defaults to the first entry, so this is valid.
    const none = productSchema.safeParse(
      standard({
        warehouses: [
          { warehouseId: 'wh_a', stock: 1 },
          { warehouseId: 'wh_b', stock: 1 },
        ],
      }),
    );
    expect(none.success).toBe(true);
  });

  test('rejects a non-string or blank warehouseId', () => {
    for (const bad of ['', '  ', 0, {}, null, undefined, ['wh_a'], true]) {
      // The bad id is the SECOND entry: every entry is validated, not just the first.
      const r = productSchema.safeParse(
        standard({
          warehouses: [
            { warehouseId: 'wh_a', stock: 1 },
            { warehouseId: bad, stock: 1 },
          ],
        }),
      );
      expect(r.success, `warehouseId ${JSON.stringify(bad)} should be rejected`).toBe(false);
    }
  });

  test('rejects a negative or fractional stock', () => {
    for (const bad of [-1, 1.5, 0.1, -0.5]) {
      const r = productSchema.safeParse(
        standard({ warehouses: [{ warehouseId: 'wh_a', stock: bad }] }),
      );
      expect(r.success, `stock ${bad} should be rejected`).toBe(false);
    }
  });

  test('accepts an empty warehouse collection', () => {
    // Head-office NULL-warehouse case: no entry, therefore no primary required.
    const r = productSchema.safeParse(standard({ warehouses: [] }));
    expect(r.success).toBe(true);
  });

  test('a service cannot carry warehouses or stock', () => {
    expect(productSchema.safeParse(service()).success).toBe(true);
    // Absent `warehouses` is filled with [] so the pin holds without the UI's help.
    const filled = productSchema.safeParse(service());
    if (filled.success && filled.data.itemType === 'service') {
      expect(filled.data.warehouses).toEqual([]);
    }

    expect(
      productSchema.safeParse(
        service({ warehouses: [{ warehouseId: 'wh_a', stock: 0 }] }),
      ).success,
    ).toBe(false);
    // The pre-existing pins are kept.
    expect(productSchema.safeParse(service({ stock: 3 })).success).toBe(false);
    expect(productSchema.safeParse(service({ warehouse: 'wh_a' })).success).toBe(false);
  });

  test('normalises the legacy single-warehouse shape to one entry', () => {
    expect(normalizeLegacyWarehouseInput({ warehouse: 'wh_a', stock: 7 })).toEqual([
      { warehouseId: 'wh_a', stock: 7, isPrimary: true },
    ]);
    // A legacy payload with a warehouse but no stock opens at zero.
    expect(normalizeLegacyWarehouseInput({ warehouse: 'wh_a' })).toEqual([
      { warehouseId: 'wh_a', stock: 0, isPrimary: true },
    ]);
    // No warehouse at all (head-office NULL warehouse) is the empty collection.
    expect(normalizeLegacyWarehouseInput({ stock: 0 })).toEqual([]);
    expect(normalizeLegacyWarehouseInput({ warehouse: '' })).toEqual([]);
    // The new shape wins when both are present, and is passed through untouched.
    const entries = [{ warehouseId: 'wh_b', stock: 2 }];
    expect(
      normalizeLegacyWarehouseInput({ warehouses: entries, warehouse: 'wh_a', stock: 7 }),
    ).toEqual(entries);
    // A malformed legacy id is carried through, NOT silently dropped, so the
    // downstream id validation can refuse it.
    expect(
      normalizeLegacyWarehouseInput({ warehouse: { foo: 0 } as unknown as string, stock: 1 }),
    ).toEqual([{ warehouseId: { foo: 0 }, stock: 1, isPrimary: true }]);
  });
});
