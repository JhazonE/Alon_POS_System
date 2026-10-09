import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { TEST_SUPPLIER, TEST_WAREHOUSE, TEST_PAYMENT_METHOD, PO_PRODUCT } from './fixtures/test-data';

/**
 * Purchase Order (DB-backed) batok sa alon_pos_test.
 *
 * Coverage:
 *  1. PO creation pinaagi sa API (POST /api/purchase-orders) → na-persist sa DB.
 *  2. UI smoke sa Add Purchase Order page: mo-abli ug ma-fill ang header selects.
 *
 * Note: ang in-dialog ProductSelector (custom scan-input nga naka-filter by supplier)
 * dili lig-on i-drive sa e2e — mao nga ang line-item creation gi-test sa API level.
 */

async function selectOption(page: Page, dialog: Locator, label: string, optionName: string) {
  await dialog.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: optionName }).click();
}

test.describe('Purchase order', () => {
  test('PO creation via API → na-persist ug makita sa list', async ({ request }) => {
    const reference = `PO-E2E-${Date.now()}`;

    const res = await request.post('/api/purchase-orders', {
      data: {
        supplierId: TEST_SUPPLIER.id,
        supplierName: TEST_SUPPLIER.name,
        date: new Date().toISOString(),
        paymentMethod: TEST_PAYMENT_METHOD.name,
        purchaseType: 'Order',
        status: 'Pending',
        reference,
        receiveToWarehouse: TEST_WAREHOUSE.id,
        receiveToWarehouseName: TEST_WAREHOUSE.name,
        shipping: 0,
        orderedBy: DEFAULT_ADMIN.displayName,
        items: [
          {
            productId: PO_PRODUCT.id,
            productName: PO_PRODUCT.name,
            quantity: 5,
            cost: PO_PRODUCT.cost,
            sellingPrice: PO_PRODUCT.price,
            discount: 0,
            discountType: 'amount',
            vatSubject: false,
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBeTruthy();

    // I-verify nga makita ang PO sa list (gi-pangita pinaagi sa reference).
    await expect(async () => {
      const listRes = await request.get(`/api/purchase-orders?search=${reference}&limit=50`);
      const listBody = await listRes.json();
      const match = (listBody.data ?? []).find((po: any) => po.referenceNumber === reference);
      expect(match, 'PO makita sa list pinaagi sa reference').toBeTruthy();
      expect(match.supplierName).toBe(TEST_SUPPLIER.name);
    }).toPass({ timeout: 10_000 });
  });

  test('Receive PO: "highest wins" rule sa cost ug retail price', async ({ request }) => {
    // Dedicated product para dili ma-coupled sa laing test nga mo-mutate sa PO_PRODUCT.
    const productId = `hw-prod-${Date.now()}`;
    const sku = `HW-${Date.now()}`;
    const startCost = 50;
    const startPrice = 100;

    const createRes = await request.post('/api/products', {
      data: {
        id: productId,
        name: `Highest-Wins Item ${Date.now()}`,
        sku,
        price: startPrice,
        cost: startCost,
        stock: 0,
        supplierId: TEST_SUPPLIER.id,
      },
    });
    expect(createRes.ok(), 'product created').toBeTruthy();

    // Helper: auto-receive a PO (purchaseType 'Receive' → processPurchaseOrderReceipt fires)
    // ug ibalik ang na-persist nga product cost/price.
    const receiveAndRead = async (cost: number, sellingPrice: number) => {
      const res = await request.post('/api/purchase-orders', {
        data: {
          supplierId: TEST_SUPPLIER.id,
          supplierName: TEST_SUPPLIER.name,
          date: new Date().toISOString(),
          paymentMethod: TEST_PAYMENT_METHOD.name,
          purchaseType: 'Receive',
          status: 'Received',
          reference: `PO-HW-${Date.now()}`,
          receiveToWarehouse: TEST_WAREHOUSE.id,
          receiveToWarehouseName: TEST_WAREHOUSE.name,
          shipping: 0,
          orderedBy: DEFAULT_ADMIN.displayName,
          items: [
            {
              productId,
              productName: 'Highest-Wins Item',
              quantity: 1,
              cost,
              sellingPrice,
              discount: 0,
              discountType: 'amount',
              vatSubject: false,
            },
          ],
        },
      });
      expect(res.ok(), 'PO received').toBeTruthy();
      expect((await res.json()).success).toBeTruthy();

      const listRes = await request.get(`/api/products?search=${sku}&limit=5`);
      const listBody = await listRes.json();
      const prod = (listBody.data ?? []).find((p: any) => p.id === productId);
      expect(prod, 'product makita sa list').toBeTruthy();
      return { cost: Number(prod.cost), price: Number(prod.price) };
    };

    // 1. Higher cost + higher price → mo-saka ang duha.
    const afterHigher = await receiveAndRead(70, 130);
    expect(afterHigher.cost).toBe(70);
    expect(afterHigher.price).toBe(130);

    // 2. Lower cost + lower price → dili mo-ubos (highest wins). Magpabilin sa 70 / 130.
    const afterLower = await receiveAndRead(40, 90);
    expect(afterLower.cost).toBe(70);
    expect(afterLower.price).toBe(130);
  });

  test('UI smoke: Add Purchase Order page mo-abli ug ma-fill ang header', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/purchases');

    // Ang /purchases mo-load nga walay infinite-loop crash (useProducts stable-array fix).
    await page.getByRole('link', { name: 'Add New Purchase Order' }).click();
    await expect(page).toHaveURL(/\/purchases\/new/);
    // The form is a page now (/purchases/new), not a drawer.
    const dialog = page.getByRole('main');
    await expect(dialog.getByRole('button', { name: 'Create Order' })).toBeVisible();

    // Header selects molihok (supplier/payment/warehouse).
    await selectOption(page, dialog, 'Supplier', TEST_SUPPLIER.name);
    await selectOption(page, dialog, 'Payment Method', TEST_PAYMENT_METHOD.name);
    await selectOption(page, dialog, 'Receive To', TEST_WAREHOUSE.name);

    await expect(dialog.getByRole('combobox', { name: 'Supplier' })).toContainText(TEST_SUPPLIER.name);
    await expect(dialog.getByRole('combobox', { name: 'Payment Method' })).toContainText(TEST_PAYMENT_METHOD.name);
    await expect(dialog.getByRole('combobox', { name: 'Receive To' })).toContainText(TEST_WAREHOUSE.name);
  });
});
