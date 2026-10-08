// Runs every unit test file. Each test self-executes its assertions on import
// and throws on failure.
//
// Files are required sequentially inside a try/catch rather than with static
// `import` statements: a static import is hoisted and throws out of the whole
// module, so the FIRST failing test aborted the run and silently skipped every
// test after it. Now each file runs regardless, and all failures are reported
// together before exiting non-zero.

const TEST_FILES = [
  'sidebar-search.test',
  'sku.test',
  'import-schemas.test',
  'import-coerce.test',
  'import-automap.test',
  'import-parse.test',
  'import-classify.test',
  'import-csvout.test',
  'aes-gcm.test',
  'license-machine-match.test',
  'si-number.test',
  'drawer-kick.test',
  'receipt-si-number.test',
  'receipt-document-type.test',
  'reprint-watermark.test',
  'z-reading-discount-summary.test',
  'z-reading-or-range.test',
  'reprint-watermark-browser.test',
  'product-tree.test',
  'ejournal-text-format.test',
  'ejournal-text-receipt.test',
  'ejournal-data.test',
  'ejournal-writer.test',
  'product-type.test',
  'manual-screens.test',
  'manual-overlay.test',
  'manual-content.test',
  'manual-build.test',
  'stock-count-baseline.test',
  'sta-lucia-payload.test',
  'sta-lucia-hourly-payload.test',
  'sta-lucia-client-409.test',
  'price-update-math.test',
  'price-list-template.test',
  'seed-default-price-level.test',
  'price-level-calc.test',
  'bir-or-number.test',
  'mixed-cart-validation.test',
  'checkout-si-or-routing.test',
  'x-reading-or-range.test',
  'terminal-lock-check.test',
  'checkout-terminal-lock.test',
  'selling-units-migration.test',
  'selling-unit-min-qty-schema.test',
  'effective-price.test',
  'base-unit-price-level-rows.test',
  'price-level-badge.test',
  'cart-reprice.test',
  'pos-active-price-level.test',
  'auto-quantity-tier.test',
  'pos-auto-tier-gate.test',
  'pos-reprice-trigger.test',
  'base-price-resolution.test',
  'business-date-lock-lifecycle.test',
  'reading-number-local-date.test',
  'price-level-price-calc.test',
  'inline-editable-select-optional-value.test',
  'selling-unit-qty.test',
  'selling-unit-expansion.test',
  'selling-unit-price-line.test',
  'checkout-selling-unit-qty.test',
  'void-selling-unit-restore.test',
];

const failures: { file: string; error: unknown }[] = [];

for (const file of TEST_FILES) {
  try {
    require(`./${file}`);
  } catch (error) {
    failures.push({ file, error });
    console.error(`\n✗ ${file}`);
    console.error(error instanceof Error ? (error.message || error.stack) : error);
  }
}

if (failures.length > 0) {
  console.error(
    `\n${failures.length} of ${TEST_FILES.length} test file(s) failed:\n` +
      failures.map((f) => `  - ${f.file}`).join('\n')
  );
  process.exit(1);
}

console.log(`\nAll ${TEST_FILES.length} unit test files passed.`);
