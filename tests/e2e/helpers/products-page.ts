import type { Page } from '@playwright/test';

/**
 * Ang products table mo-land sa default warehouse sa user (dili "All"). Ang tests
 * nga kinahanglan makakita ug produkto sa LAING warehouse/branch (hostile-UI
 * isolation tests) kinahanglan mopili ug "All Warehouses" una.
 */
export async function showAllWarehouses(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open filters' }).click();
  await page.locator('#warehouse-filter').click();
  await page.getByRole('option', { name: 'All Warehouses' }).click();
  await page.getByRole('button', { name: 'Apply Filters' }).click();
}
