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

/**
 * The Add/Edit Product dialog's warehouse picker is a multi-select: a product is
 * created in the warehouses you pick, each with its OWN opening stock. There is
 * no single "Initial Stock" field any more — the stock input for a row is named
 * `Initial stock for <warehouse name>`, so a stock value cannot be filled before
 * its warehouse has been picked.
 *
 * `pickWarehouses` opens the picker, ticks each name, then closes it. The picker
 * is an InlineEditableMultiSelect in a Radix popover, so the options portal to
 * the body and the popover stays open across clicks (that is what lets several
 * be ticked in one pass).
 */
export async function pickWarehouses(page: Page, dialog: Locator, names: string[]) {
  await dialog.getByLabel(/^Warehouses/).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]');
  // Wait for the list to arrive — the options are fetched, not static.
  await expect(popover.getByRole('option').first()).toBeVisible();
  for (const name of names) {
    await popover.getByRole('option', { name }).click();
  }
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
}

/**
 * Pick one warehouse and set its opening stock — the replacement for the old
 * single `getByLabel('Initial Stock').fill(...)`. The caller must already be on
 * the Inventory tab.
 */
export async function setWarehouseStock(
  page: Page,
  dialog: Locator,
  warehouseName: string,
  stock: number | string,
) {
  await pickWarehouses(page, dialog, [warehouseName]);
  await dialog
    .getByLabel(`Initial stock for ${warehouseName}`, { exact: true })
    .fill(String(stock));
}

/**
 * The price input of ONE price level inside a selling-unit row.
 *
 * Every active price level used to render its own field labelled
 * `<level name> (₱)`. Price levels are now a TABLE: the level name is a row
 * header and every price input in the row shares the sr-only label
 * "Price (₱)", so `getByLabel('Retail (₱)')` matches nothing. A level is
 * therefore addressed through its own table row, found by the printed level
 * name, which keeps a spec independent of the order `price_levels` happen to
 * be seeded in.
 */
export function priceInput(row: Locator, levelName: string): Locator {
  // Matched on the level-NAME cell, not on the whole table row's text: a level
  // name that is a prefix of another ("Retail" vs "Retail Plus") would match
  // both rows, and the row's own text also contains the entered price.
  //
  // The regex allows the marker to follow with no space because the default
  // level renders it in a nested span separated only by a CSS margin — the DOM
  // text is "Retail(default)", NOT "Retail (default)", so a `:text-is()` or a
  // `(₱)`-style label match on it never succeeds.
  //
  // The `has:` locator is built from `row.page()`, deliberately NOT from `row`:
  // Playwright re-roots a `has:` locator onto each element being filtered only
  // when it is page-rooted. One anchored at `row` stays anchored there, matches
  // nothing inside the child rows, and the filter silently yields zero.
  return priceLevelRow(row, levelName).getByLabel('Price (₱)');
}

/**
 * The Min Qty input of ONE price level inside a selling-unit row. Same story as
 * `priceInput`: the column's label is a shared sr-only "Min Qty", not
 * `<level name> Min Qty`. Min Qty is a BASE-row-only column (the POS prices the
 * base unit, so a minimum on another row would be collected and never applied),
 * so this resolves to nothing on a non-base row — which is itself worth
 * asserting.
 */
export function minQtyInput(row: Locator, levelName: string): Locator {
  return priceLevelRow(row, levelName).getByLabel('Min Qty');
}

/** The table row of one price level inside a selling-unit row. */
function priceLevelRow(row: Locator, levelName: string): Locator {
  const cell = new RegExp(`^${levelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\(default\\))?$`);
  return row.locator('div.rounded-md.border.p-3').filter({
    has: row.page().locator('[data-testid="price-level-name"]').filter({ hasText: cell }),
  });
}
