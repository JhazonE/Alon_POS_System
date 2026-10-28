import type { Page } from '@playwright/test';

/**
 * Ang products table mo-land sa default warehouse sa user (dili "All"). Ang tests
 * nga kinahanglan makakita ug produkto sa LAING warehouse/branch (hostile-UI
 * isolation tests) kinahanglan mopili ug "All warehouses" una.
 *
 * Ang warehouse dili na usa ka filter sa dialog — usa na siya ka tab strip sa
 * ibabaw sa table, mao nga usa ra ka click.
 */
export async function showAllWarehouses(page: Page): Promise<void> {
  await page
    .getByRole('tablist', { name: 'Warehouse' })
    .getByRole('tab', { name: 'All warehouses', exact: true })
    .click();
}
