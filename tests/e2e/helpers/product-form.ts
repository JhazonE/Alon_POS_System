import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';

/**
 * Pick a category in the combined "Category / Subcategory" field of the
 * Add/Edit Product dialog. The field is a Popover (not a Radix Select), so
 * options are buttons, not role=option, and the popover stays open until
 * "Done" is clicked.
 */
export async function selectCategory(page: Page, dialog: Locator, categoryName: string) {
  await dialog.getByLabel('Category / Subcategory', { exact: true }).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]');
  await popover.getByRole('button', { name: categoryName, exact: true }).click();
  await popover.getByRole('button', { name: 'Done' }).click();
  await expect(popover).toBeHidden();
}
