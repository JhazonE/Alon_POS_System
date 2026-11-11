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
 * no single "Initial Stock" field any more — the stock input for a warehouse is
 * named `Initial stock for <warehouse name>` and lives INSIDE that warehouse's
 * row in the picker popover, so it exists only while the popover is open and
 * only for a warehouse that is ticked.
 *
 * Every warehouse of the user's branch starts ticked, so `pickWarehouses` sets
 * the selection to exactly `names`: it unticks everything else rather than
 * assuming an empty start. The picker is an InlineEditableMultiSelect in a
 * Radix popover, so the options portal to the body and the popover stays open
 * across clicks (that is what lets several be changed in one pass).
 */
export async function pickWarehouses(page: Page, dialog: Locator, names: string[]) {
  await setWarehouseSelection(page, dialog, names);
}

/** Open the warehouse picker and wait for its (fetched) options to arrive. */
export async function openWarehousePicker(page: Page, dialog: Locator): Promise<Locator> {
  await dialog.getByLabel(/^Warehouses/).click();
  const popover = page.locator('[data-radix-popper-content-wrapper]');
  await expect(popover.getByRole('option').first()).toBeVisible();
  return popover;
}

export async function closeWarehousePicker(page: Page, popover: Locator) {
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
}

/**
 * Create the product in EXACTLY this one warehouse, with this opening stock.
 *
 * Every warehouse of the caller's branch is selected by default, so this
 * unticks the others: a caller that names one warehouse means one, and its
 * assertions count rows (`product_price_levels`, `products`) that a second
 * warehouse would legitimately double. Narrowing lives here, in the helper, so
 * a spec reads as "this product, this warehouse" without each one having to
 * know what the picker defaults to.
 *
 * Use `setWarehouseStocks` for a genuinely multi-warehouse product.
 */
export async function setWarehouseStock(
  page: Page,
  dialog: Locator,
  warehouseName: string,
  stock: number | string,
) {
  await setWarehouseStocks(page, dialog, { [warehouseName]: stock });
}

/**
 * Create the product in exactly the named warehouses, each with its own opening
 * stock. Anything not named is unticked.
 *
 * The stock inputs live INSIDE the picker rows, so the whole selection and
 * every number is set in one opening of the popover.
 */
export async function setWarehouseStocks(
  page: Page,
  dialog: Locator,
  stockByWarehouse: Record<string, number | string>,
) {
  const popover = await setWarehouseSelection(
    page,
    dialog,
    Object.keys(stockByWarehouse),
    { keepOpen: true },
  );
  for (const [name, stock] of Object.entries(stockByWarehouse)) {
    await popover
      .getByLabel(`Initial stock for ${name}`, { exact: true })
      .fill(String(stock));
  }
  await closeWarehousePicker(page, popover);
}

/**
 * Tick exactly `names` and untick everything else, returning the open popover.
 *
 * `data-ticked` is read rather than `aria-selected`, which cmdk owns for its
 * keyboard highlight: a highlighted row is not a chosen one. Names are matched
 * as substrings because a head-office option prints as
 * `<warehouse> · <branch>`.
 */
async function setWarehouseSelection(
  page: Page,
  dialog: Locator,
  names: string[],
  opts: { keepOpen?: boolean } = {},
): Promise<Locator> {
  const popover = await openWarehousePicker(page, dialog);
  const options = popover.getByRole('option');
  for (let i = 0; i < (await options.count()); i++) {
    const option = options.nth(i);
    const text = (await option.textContent())?.trim() ?? '';
    const ticked = (await option.getAttribute('data-ticked')) === 'true';
    const wanted = names.some((n) => text.includes(n));
    if (ticked !== wanted) await option.click();
  }
  if (!opts.keepOpen) await closeWarehousePicker(page, popover);
  return popover;
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

/**
 * The table row of one price level inside a selling-unit row.
 *
 * Matched on the level-NAME cell, not on the whole row's text: a level name that
 * is a prefix of another ("Retail" vs "Retail Plus") would match both rows, and
 * a row's own text also contains the entered price.
 *
 * Two traps, both of which fail SILENTLY (an empty match, not an error):
 *
 * 1. The regex allows the marker to follow with no space, because the default
 *    level renders it in a nested span separated only by a CSS margin — the DOM
 *    text is "Retail(default)", NOT "Retail (default)", so a
 *    `:text-is("Retail (default)")` never matches.
 * 2. The `has:` locator is built from `row.page()`, deliberately NOT from `row`:
 *    Playwright re-roots a `has:` locator onto each element being filtered only
 *    when that locator is page-rooted. One anchored at `row` stays anchored
 *    there, matches nothing inside the child rows, and the filter yields zero.
 */
function priceLevelRow(row: Locator, levelName: string): Locator {
  const cell = new RegExp(`^${levelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\(default\\))?$`);
  return row.locator('div.rounded-md.border.p-3').filter({
    has: row.page().locator('[data-testid="price-level-name"]').filter({ hasText: cell }),
  });
}
