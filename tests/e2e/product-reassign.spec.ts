import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import {
  REASSIGN_PARENT_A,
  REASSIGN_PARENT_B,
  REASSIGN_CHILD,
  REASSIGN_TOP_MOVER,
  REASSIGN_TOP_TARGET,
  REASSIGN_TOP_MOVER_CHILD,
  REASSIGN_AUTO_MOVER,
  REASSIGN_AUTO_MATCH,
  REASSIGN_AUTO_NOMATCH,
} from './fixtures/test-data';

/**
 * Child reassignment (DB-backed) — i-drive ang view-product dialog "Reassign Parent"
 * batok sa alon_pos_test. Verify pinaagi sa API nga na-usab ang parent_id.
 */

/**
 * Ablihi ang view-product dialog para sa child pinaagi sa row menu ("View Details"
 * dropdown item — parehas sa pattern nga gigamit sa edit/delete spec).
 *
 * IMPORTANTE: DILI mag-search/filter dinhi. Ang ReassignParentDialog's legal-target
 * list gikan ra sa `products` prop nga gipasa sa products page — kana kay ang
 * KASAMTANGAN nga (paginated/filtered) na-load nga listahan. Kung mag-search ta sa
 * child's SKU, Parent B dili na maapil sa result set ug mahanaw sa dropdown.
 */
async function openViewDialog(page: Page, name: string, parentName?: string) {
  if (parentName) {
    // The child ships nested under its parent in the tree table — expand the
    // parent row first (chevron button in the "Expand" column) para mo-appear ang child row.
    const parentRow = page.getByRole('row', { name: new RegExp(parentName) });
    await expect(parentRow).toBeVisible();
    await parentRow.getByRole('button').first().click();
  }
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'View Details' }).click();
}

async function fetchParentId(request: any, sku: string): Promise<string | null> {
  const res = await request.get(`/api/products?search=${sku}&limit=50`);
  const body = await res.json();
  const match = (body.data ?? []).find((p: any) => p.sku === sku);
  return match ? (match.parentId ?? match.parent_id ?? null) : null;
}

test.describe('Child reassignment', () => {
  test('admin mo-reassign sa child ngadto sa bag-ong parent', async ({ page, request }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    // The tree table's default page size of 10 rows can push Parent A past page 1
    // once enough dedicated fixtures exist in the DB — bump rows-per-page so it's
    // always visible, same pattern used by the other tests in this file.
    await page.getByLabel('Rows per page:').click();
    await page.getByRole('option', { name: '50' }).click();

    // Precondition: child starts under Parent A.
    expect(await fetchParentId(request, REASSIGN_CHILD.sku)).toBe(REASSIGN_PARENT_A.id);

    await openViewDialog(page, REASSIGN_CHILD.name, REASSIGN_PARENT_A.name);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Reassign Parent' }).click();

    // The ReassignParentDialog is a nested Dialog — its own dialog role is now on top.
    const reassignDialog = page.getByRole('dialog', { name: 'Reassign Parent' });
    await expect(reassignDialog).toBeVisible();

    // Pick the new parent, set a factor, save.
    await reassignDialog.getByLabel('New parent').click();
    await page.getByRole('option', { name: REASSIGN_PARENT_B.name }).click();
    await reassignDialog.getByLabel(/Conversion factor/).fill('24');
    await reassignDialog.getByRole('button', { name: 'Reassign' }).click();

    // Verify parent_id moved to Parent B.
    await expect(async () => {
      expect(await fetchParentId(request, REASSIGN_CHILD.sku)).toBe(REASSIGN_PARENT_B.id);
    }).toPass({ timeout: 10_000 });
  });
});

test.describe('Top-level reassignment', () => {
  test('admin mo-move sa top-level mother ngadto sa bag-ong parent', async ({ page, request }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    // Precondition: the mover is top-level, its child nests under it.
    expect(await fetchParentId(request, REASSIGN_TOP_MOVER.sku)).toBeNull();
    expect(await fetchParentId(request, REASSIGN_TOP_MOVER_CHILD.sku)).toBe(REASSIGN_TOP_MOVER.id);

    // The ReassignParentDialog's legal-target list comes only from the CURRENT page's
    // loaded `products` prop (same constraint documented on openViewDialog above). With
    // the default page size of 10, REASSIGN_TOP_TARGET (an 11th+ product) can land on
    // page 2 and be invisible to the picker — bump rows-per-page so everything is loaded.
    await page.getByLabel('Rows per page:').click();
    await page.getByRole('option', { name: '50' }).click();

    // Open the mover's view dialog (top-level row — no parent expansion).
    await openViewDialog(page, REASSIGN_TOP_MOVER.name);

    const dialog = page.getByRole('dialog');
    // NEW behavior: the Reassign button is present for a top-level product.
    await dialog.getByRole('button', { name: 'Reassign Parent' }).click();

    const reassignDialog = page.getByRole('dialog', { name: 'Reassign Parent' });
    await expect(reassignDialog).toBeVisible();

    // Detach must be HIDDEN for an already top-level product.
    await reassignDialog.getByLabel('New parent').click();
    await expect(page.getByRole('option', { name: 'Detach (no parent)' })).toHaveCount(0);

    // Pick the target, set a factor, save.
    await page.getByRole('option', { name: REASSIGN_TOP_TARGET.name }).click();
    await reassignDialog.getByLabel(/Conversion factor/).fill('10');
    await reassignDialog.getByRole('button', { name: 'Reassign' }).click();

    // The mover now nests under the target...
    await expect(async () => {
      expect(await fetchParentId(request, REASSIGN_TOP_MOVER.sku)).toBe(REASSIGN_TOP_TARGET.id);
    }).toPass({ timeout: 10_000 });

    // ...and its own child still nests under the mover (subtree moved intact).
    expect(await fetchParentId(request, REASSIGN_TOP_MOVER_CHILD.sku)).toBe(REASSIGN_TOP_MOVER.id);
  });
});

test.describe('Reassign factor auto-detect', () => {
  test('auto-fills the factor from a parent that already knows the unit', async ({ page }) => {
    await seedSession(page, DEFAULT_ADMIN);
    await page.goto('/products');

    // Load all products into the page so both targets appear in the picker.
    await page.getByLabel('Rows per page:').click();
    await page.getByRole('option', { name: '50' }).click();

    // REASSIGN_AUTO_MOVER is a DEDICATED fixture that no other test in this file
    // touches — it stays genuinely top-level regardless of test execution order,
    // so this test can run standalone (e.g. via --grep) without depending on the
    // preceding "Top-level reassignment" test having run first.
    await openViewDialog(page, REASSIGN_AUTO_MOVER.name);

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Reassign Parent' }).click();

    const reassignDialog = page.getByRole('dialog', { name: 'Reassign Parent' });
    await expect(reassignDialog).toBeVisible();

    const factorInput = reassignDialog.getByLabel(/Conversion factor/);

    // 1) Pick the target that already has a Box factor → input auto-fills "4.00" + hint shows.
    await reassignDialog.getByLabel('New parent').click();
    await page.getByRole('option', { name: REASSIGN_AUTO_MATCH.name }).click();
    await expect(factorInput).toHaveValue('4.00');
    await expect(reassignDialog.getByText(/Auto-detected from/)).toBeVisible();

    // 2) Switch to a target with NO matching factor → input clears + hint gone.
    // REASSIGN_AUTO_NOMATCH is dedicated to this test and never reassigned onto by
    // any other test, so it genuinely never has a conversion_factors row.
    await reassignDialog.getByLabel('New parent').click();
    await page.getByRole('option', { name: REASSIGN_AUTO_NOMATCH.name }).click();
    await expect(factorInput).toHaveValue('');
    await expect(reassignDialog.getByText(/Auto-detected from/)).toHaveCount(0);
  });
});
