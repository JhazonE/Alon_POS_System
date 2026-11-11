import { test, expect } from '@playwright/test';
import path from 'node:path';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';
import { testQuery } from './helpers/db';

const fixture = (f: string) => path.join(__dirname, 'fixtures', f);

test('products import wizard — happy path adds products', async ({ page }) => {
  await seedSession(page, DEFAULT_ADMIN);
  await page.goto('/settings/data-management');
  await page.getByRole('tab', { name: 'Import & Export' }).click();

  // Open the products wizard (first "Import from file" button).
  await page.getByRole('button', { name: 'Import from file' }).first().click();

  // Upload step -> choose file (hidden input).
  await page.setInputFiles('input[type="file"]', fixture('products-good.csv'));

  // Map step auto-maps required name; go to preview.
  await page.getByRole('button', { name: /Next: Preview/i }).click();

  // Preview shows 2 new.
  await expect(page.getByText('2 new')).toBeVisible();

  await page.getByRole('button', { name: /Import 2 rows/i }).click();

  // Result.
  await expect(page.getByText(/Added: 2/)).toBeVisible();
});

test('products export round-trips through the import wizard as updates', async ({ page }) => {
  await seedSession(page, DEFAULT_ADMIN);
  await page.goto('/settings/data-management');
  await page.getByRole('tab', { name: 'Import & Export' }).click();

  // Export the current product catalog (first "Export CSV" button).
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).first().click();
  const download = await downloadPromise;
  const exportPath = await download.path();

  // Feed the exported file straight back into the products import wizard.
  await page.getByRole('button', { name: 'Import from file' }).first().click();
  await page.setInputFiles('input[type="file"]', exportPath!);
  await page.getByRole('button', { name: /Next: Preview/i }).click();

  // Every exported row already exists, so nothing is new. The export writes one
  // CSV row per warehouse row and has no warehouse column, so a product held in
  // several warehouses exports as several rows with the same barcode. The wizard
  // matches on barcode (name when there is none) and flags every repeat after the
  // first as a duplicate. That skip is correct for this importer: an update
  // touches catalogue fields only and never stock, so the repeat adds nothing.
  // What must hold is that the ONLY skips are those repeats -- compute how many
  // there are from the DB rather than hard-coding the fixture's count, so a
  // skip for any other reason (missing identifier, bad number) still fails this.
  const [{ total, uniq }]: any[] = await testQuery(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT LOWER(TRIM(COALESCE(NULLIF(TRIM(barcode), ''), name)))) AS uniq
       FROM products`,
  );
  const repeats = Number(total) - Number(uniq);

  await expect(page.getByText(/^0 new$/)).toBeVisible();
  await expect(page.getByText(new RegExp(`^${uniq} update$`))).toBeVisible();
  await expect(page.getByText(new RegExp(`^${repeats} skipped$`))).toBeVisible();

  // Every skipped row is a barcode/name repeat, and nothing else is skipped.
  const skippedRows = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'error', exact: true }) });
  await expect(skippedRows).toHaveCount(repeats);
  await expect(page.getByText(/Duplicate of another row/)).toHaveCount(repeats);
});

test('products import wizard — mixed rows skips invalid', async ({ page }) => {
  await seedSession(page, DEFAULT_ADMIN);
  await page.goto('/settings/data-management');
  await page.getByRole('tab', { name: 'Import & Export' }).click();
  await page.getByRole('button', { name: 'Import from file' }).first().click();
  await page.setInputFiles('input[type="file"]', fixture('products-mixed.csv'));
  await page.getByRole('button', { name: /Next: Preview/i }).click();

  // 1 good, 2 skipped (missing name, bad price).
  await expect(page.getByText('1 new')).toBeVisible();
  await expect(page.getByText('2 skipped')).toBeVisible();

  await page.getByRole('button', { name: /Import 1 rows/i }).click();
  await expect(page.getByText(/Added: 1/)).toBeVisible();
  await expect(page.getByText(/Skipped: 2/)).toBeVisible();
});
