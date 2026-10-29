import { test, expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import {
  TEST_MAIN_WAREHOUSE,
  TEST_WAREHOUSE,
  TRANSFER_TARGET_WAREHOUSE,
} from './fixtures/test-data';

/**
 * Ang warehouse picker sa Add Product dialog.
 *
 * Duha ka kinaiya ang gi-assert dinhi, ug pareho silang nag-agi sa usa ka
 * desisyon: ang opening stock gi-type SULOD sa popover row, tupad sa pangalan
 * sa warehouse, ug WALA na ang bulag nga lamesa sa ilawom sa field.
 *
 *  1. Ang stock input anaa sa popover, dili sa dialog body. Mao nga ang
 *     `setWarehouseStock` helper nangita niini sa page level — kon mobalik ang
 *     input sa usa ka row sa ilawom sa field, kini nga file mopakyas.
 *  2. Default nga TANAN nga warehouse sa branch sa user ang napili, matag usa
 *     naa sa 0. Dili kinahanglan nga ablihan ang picker aron makapili.
 *
 * Ang primary WALAY control: ang unang napili ang primary. Gi-assert kini nga
 * dili pinaagi sa UI (wala nay makita) kondili pinaagi sa pagsiguro nga walay
 * radio o star nga nagpabilin sa field.
 */
test.describe('Add product — warehouse picker', () => {
  // Parehas nga budget sa add-product.spec.ts: kini nga file mahimong mahiuna
  // sa suite, mao nga mobayad kini sa cold compile sa /products ug sa dev
  // server nga busy pa. Ang 30s nga default mahurot sa usa ka `goto` — usa ka
  // timeout, DILI usa ka assertion nga napakyas. Mag-isa, mo-pass kini sulod
  // sa 30s; kini nga budget para sa suite order lang.
  test.setTimeout(120_000);

  async function openInventoryTab(page: Page): Promise<Locator> {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');
    await page.getByRole('button', { name: 'Add Product' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add New Product')).toBeVisible();
    await dialog.getByRole('tab', { name: 'Inventory' }).click();
    return dialog;
  }

  test('tanang warehouse napili na by default, matag usa sa 0', async ({ page }) => {
    const dialog = await openInventoryTab(page);

    // Ang closed field nagdala sa pangalan sa matag warehouse. Gihuwat ang
    // una kay gi-fetch ang listahan, dili static.
    const field = dialog.getByLabel(/^Warehouses/);
    await expect(field).toContainText(TEST_MAIN_WAREHOUSE.name);
    await expect(field).toContainText(TEST_WAREHOUSE.name);
    await expect(field).toContainText(TRANSFER_TARGET_WAREHOUSE.name);

    // Matag napili nga warehouse naay stock input sa popover, nag-sugod sa 0.
    await field.click();
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    for (const w of [TEST_MAIN_WAREHOUSE, TEST_WAREHOUSE, TRANSFER_TARGET_WAREHOUSE]) {
      await expect(
        popover.getByLabel(`Initial stock for ${w.name}`, { exact: true }),
      ).toHaveValue('0');
    }
  });

  test('ang stock input anaa sa popover row, dili sa dialog body', async ({ page }) => {
    const dialog = await openInventoryTab(page);
    const label = `Initial stock for ${TEST_MAIN_WAREHOUSE.name}`;

    // Sirado ang picker: walay stock input bisan asa — WALA nay lamesa sa ilawom.
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);

    await dialog.getByLabel(/^Warehouses/).click();
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    const input = popover.getByLabel(label, { exact: true });
    await expect(input).toBeVisible();
    await input.fill('42');
    await expect(input).toHaveValue('42');

    // Ang pag-type sa stock dili mosira sa popover — ang ubang warehouse
    // mahimo pang i-type sa parehas nga pag-abli.
    await expect(
      popover.getByLabel(`Initial stock for ${TEST_WAREHOUSE.name}`, { exact: true }),
    ).toBeVisible();

    // Human sirado, nagpabilin ang value — ang chip walay gipakita nga numero,
    // apan wala kini nawala.
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await dialog.getByLabel(/^Warehouses/).click();
    await expect(popover.getByLabel(label, { exact: true })).toHaveValue('42');
  });

  test('ang wala napili nga warehouse walay stock input', async ({ page }) => {
    const dialog = await openInventoryTab(page);
    await dialog.getByLabel(/^Warehouses/).click();
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    const label = `Initial stock for ${TEST_WAREHOUSE.name}`;
    await expect(popover.getByLabel(label, { exact: true })).toBeVisible();

    // I-untick: mawala ang stock box uban niini.
    await popover.getByRole('option', { name: TEST_WAREHOUSE.name }).click();
    await expect(popover.getByLabel(label, { exact: true })).toHaveCount(0);

    // I-tick balik: mobalik sa 0, dili sa kanhing value — ang numero nagpuyo
    // sa row, mao nga walay tinago nga mabawi.
    await popover.getByRole('option', { name: TEST_WAREHOUSE.name }).click();
    await expect(popover.getByLabel(label, { exact: true })).toHaveValue('0');
  });

  test('walay primary control — ang unang napili ang primary', async ({ page }) => {
    const dialog = await openInventoryTab(page);

    // Ang kanhing lamesa naay radio kada row. Wala nay radio sa Inventory tab.
    await expect(dialog.getByRole('radio')).toHaveCount(0);
    await expect(dialog.getByRole('radiogroup')).toHaveCount(0);
    await expect(page.getByLabel(/^Primary warehouse/)).toHaveCount(0);
  });
});
