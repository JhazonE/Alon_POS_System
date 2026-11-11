import { test, expect } from '@playwright/test';
import { TEST_USERS, TEST_PRODUCTS } from './fixtures/test-data';
import { resetPosState } from './helpers/db';

/**
 * F9 product search focus.
 *
 * Ang Radix Sheet mo-focus sa UNANG tabbable element sa DOM order pag-abli. Ang
 * Category/Brand visibility toggles naa sa header, nag-una sa CommandInput — mao
 * nga ang focus mo-dagan didto ug dili sa search field. Kini nga test nag-lock sa
 * saktong behavior: pag-F9, ang cursor naa dayon sa search input ug ready mo-type.
 *
 * Mo-reproduce ra ang bug kung naay categories/brands ang seeded products (naa).
 */

const cashier = TEST_USERS.cashier;
const product = TEST_PRODUCTS[0];

async function posLogin(page: import('@playwright/test').Page) {
  await page.goto('/pos');
  await expect(page.getByRole('heading', { name: /cashier login/i })).toBeVisible();
  await page.getByLabel('Username').fill(cashier.username);
  await page.getByLabel('Password').fill(cashier.password);
  await page.getByRole('button', { name: /login to pos/i }).click();
}

async function startShift(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: /start new shift/i })).toBeVisible();
  await page.getByRole('button', { name: /start shift/i }).click();
  await expect(page.getByPlaceholder(/scan barcode or search product/i)).toBeVisible();
}

const searchInput = (page: import('@playwright/test').Page) =>
  page.getByPlaceholder(/search by name or barcode/i);

test.describe('POS F9 product search focus', () => {
  test.beforeEach(async () => {
    await resetPosState();
  });

  test('F9 → ang search input mao ang naka-focus', async ({ page }) => {
    await posLogin(page);
    await startShift(page);

    await page.keyboard.press('F9');

    const search = searchInput(page);
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();
  });

  test('F9 → makatype dayon nga walay click, mo-filter ang list', async ({ page }) => {
    await posLogin(page);
    await startShift(page);

    await page.keyboard.press('F9');
    await expect(searchInput(page)).toBeVisible();

    // Walay click — direkta ug type. Kung sayop ang focus, mawala ang mga letra.
    await page.keyboard.type(product.name.slice(0, 6));

    await expect(searchInput(page)).toHaveValue(product.name.slice(0, 6));
    await expect(page.getByText(product.name).first()).toBeVisible();
  });

  test('F9 → ang Category toggle DILI maoy naka-focus', async ({ page }) => {
    await posLogin(page);
    await startShift(page);

    await page.keyboard.press('F9');
    await expect(searchInput(page)).toBeVisible();

    // Kini ang tinuod nga root cause: ang header toggle nga nag-una sa DOM order.
    await expect(page.getByTitle(/hide category/i)).not.toBeFocused();
  });
});
