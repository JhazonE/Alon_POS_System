import { test, expect } from '@playwright/test';
import { PO_PRODUCT, TEST_SUPPLIER } from './fixtures/test-data';

/**
 * `/api/products` kinahanglan mo-uli sa primary supplier sa produkto.
 *
 * Ang `Product.supplier` naa na sa type ug ang `products.supplier_id` column
 * naa'y sulod, apan ang SELECT list sa MySqlProductRepository.findAll wala
 * gyud nagkuha niini — mao nga `prefillProduct.supplier` kanunay `undefined`
 * ug ang Restock flow (purchase-order-add-product.spec.ts) hilom nga wala
 * mo-prefill sa supplier. Usa ka hilom nga `undefined`, dili usa ka error,
 * mao nga ang UI daw nagtrabaho — gawas nga blangko ang Supplier.
 *
 * Ang `supplier` mao ang primary mapping (`supplier_product_mapping` nga
 * `is_primary = 1`), nga mo-fallback sa legacy `products.supplier_id`, parehas
 * sa `getProducts` sa app/(app)/products/actions.ts.
 */
test.describe('/api/products — supplier', () => {
  test('ang produkto mo-dala sa iyang supplier id', async ({ request }) => {
    const res = await request.get(
      `/api/products?search=${encodeURIComponent(PO_PRODUCT.name)}&limit=50`,
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const match = (body.data ?? []).find((p: any) => p.id === PO_PRODUCT.id);
    expect(match, 'makita ang PO fixture product').toBeTruthy();
    expect(match.supplier).toBe(TEST_SUPPLIER.id);
  });
});
