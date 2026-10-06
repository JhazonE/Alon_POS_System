import { test, expect } from './helpers/authed-test';
import path from 'node:path';
import { seedSession, DEFAULT_ADMIN } from './helpers/auth';

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

  // Every exported row already exists -> all classify as updates, none new, none skipped.
  await expect(page.getByText('0 new')).toBeVisible();
  await expect(page.getByText('0 skipped')).toBeVisible();
  await expect(page.getByText(/[1-9]\d* update/)).toBeVisible();
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
