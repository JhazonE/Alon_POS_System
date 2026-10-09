import { test, expect } from '@playwright/test';
import { testQuery } from './helpers/db';
import {
  TEST_WAREHOUSE,
  TRANSFER_TARGET_WAREHOUSE,
  TRANSFER_NULL_SKU_SOURCE,
  TRANSFER_NULL_SKU_TARGET,
  TRANSFER_ORPHAN_PRODUCT,
} from './fixtures/test-data';

/**
 * Bulk stock transfer pinaagi sa POST /api/inventory/adjust/bulk
 * (`adjustmentType: 'transfer'`).
 *
 * Ang endpoint kinahanglan mo-resolve sa produkto sa TARGET warehouse. Ang
 * orihinal nga implementasyon nag-resolve pinaagi RA sa `WHERE sku = ?`, nga
 * naguba sa duha ka paagi:
 *
 *   1. Ang SKU optional sa product form (`sku: formData.sku || null`), ug sa SQL
 *      ang `sku = NULL` dili gyud mo-match — mao nga ang transfer mo-500 bisan
 *      tuod naa na gyud ang produkto sa target warehouse.
 *   2. Kung tinuod nga wala pa ang produkto sa target, mo-throw siya imbes
 *      mo-create sa row — bisan tuod ang canonical nga TransferStockService
 *      mo-auto-create.
 *
 * Ang assertions mo-adto sa DATABASE, dili sa UI: ang stock move ug ang bag-ong
 * product row mao ra ang tinuod nga proof nga nahitabo ang transfer.
 */

/** Stock sa usa ka product row, isip number (DECIMAL ang column, string ang mogawas). */
async function stockOf(productId: string): Promise<number | null> {
  const rows = await testQuery('SELECT stock FROM products WHERE id = ?', [productId]);
  return rows.length ? Number(rows[0].stock) : null;
}

async function postTransfer(request: any, productId: string, quantity: number, reason: string) {
  return request.post('/api/inventory/adjust/bulk', {
    data: {
      adjustments: [{ productId, quantity, reason }],
      adjustmentType: 'transfer',
      warehouseId: TEST_WAREHOUSE.id,
      targetWarehouseId: TRANSFER_TARGET_WAREHOUSE.id,
      notes: reason,
      userId: 'test-admin-uid',
    },
  });
}

test.describe('Bulk stock transfer', () => {
  test('NULL nga SKU: mo-match gihapon ang existing nga produkto sa target warehouse', async ({ request }) => {
    const srcBefore = await stockOf(TRANSFER_NULL_SKU_SOURCE.id);
    const destBefore = await stockOf(TRANSFER_NULL_SKU_TARGET.id);
    expect(srcBefore).not.toBeNull();
    expect(destBefore).not.toBeNull();

    const res = await postTransfer(request, TRANSFER_NULL_SKU_SOURCE.id, 5, 'E2E null-sku transfer');
    expect(res.status(), await res.text()).toBe(200);

    // Ang existing nga row ang dapat ma-increment — walay bag-ong duplicate row.
    expect(await stockOf(TRANSFER_NULL_SKU_SOURCE.id)).toBe(srcBefore! - 5);
    expect(await stockOf(TRANSFER_NULL_SKU_TARGET.id)).toBe(destBefore! + 5);

    const rows = await testQuery(
      'SELECT id FROM products WHERE name = ? AND warehouse_id = ?',
      [TRANSFER_NULL_SKU_SOURCE.name, TRANSFER_TARGET_WAREHOUSE.id],
    );
    expect(rows, 'usa ra ang row sa target — wala mo-create ug duplicate').toHaveLength(1);
  });

  test('wala sa target: mo-auto-create ug product row imbes mo-500', async ({ request }) => {
    const srcBefore = await stockOf(TRANSFER_ORPHAN_PRODUCT.id);
    expect(srcBefore).not.toBeNull();

    const existing = await testQuery(
      'SELECT id FROM products WHERE sku = ? AND warehouse_id = ?',
      [TRANSFER_ORPHAN_PRODUCT.sku, TRANSFER_TARGET_WAREHOUSE.id],
    );
    expect(existing, 'pre-condition: wala pa gyud sa target').toHaveLength(0);

    const res = await postTransfer(request, TRANSFER_ORPHAN_PRODUCT.id, 4, 'E2E auto-create transfer');
    expect(res.status(), await res.text()).toBe(200);

    expect(await stockOf(TRANSFER_ORPHAN_PRODUCT.id)).toBe(srcBefore! - 4);

    const created = await testQuery(
      'SELECT id, name, sku, barcode, stock, price, cost FROM products WHERE sku = ? AND warehouse_id = ?',
      [TRANSFER_ORPHAN_PRODUCT.sku, TRANSFER_TARGET_WAREHOUSE.id],
    );
    expect(created, 'na-create ang row sa target warehouse').toHaveLength(1);
    expect(created[0].name).toBe(TRANSFER_ORPHAN_PRODUCT.name);
    expect(created[0].barcode).toBe(TRANSFER_ORPHAN_PRODUCT.barcode);
    expect(Number(created[0].stock)).toBe(4);
    // Ang identity fields kinahanglan ma-kopya gikan sa source, dili ma-default.
    expect(Number(created[0].price)).toBe(TRANSFER_ORPHAN_PRODUCT.price);
    expect(Number(created[0].cost)).toBe(TRANSFER_ORPHAN_PRODUCT.cost);
  });
});
