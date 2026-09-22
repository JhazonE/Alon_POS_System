import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any = await query(`
    SELECT COUNT(*) as cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  return rows[0]?.cnt > 0;
}

// Migration 120 collapses child products into their root and deletes the child
// `products` rows. Every table with a product_id FK must be re-pointed off the
// child first, otherwise the row is destroyed (ON DELETE CASCADE) or the delete
// is blocked outright (stock_count_items has no ON DELETE clause, so RESTRICT).
// This nullable selling_unit_id tag records which unit the re-pointed row
// originally belonged to, so 120's down() can reverse the move precisely.
// No unit_name/qty_base snapshot columns here: this is an audit tag, not a
// priced line item (same rationale as inventory_batches in migration 119).
const migration: Migration = {
  name: '122_add_selling_unit_to_sales_invoice_items',
  timestamp: '2026-09-21_11-22-00',

  async up(): Promise<void> {
    if (await columnExists('sales_invoice_items', 'selling_unit_id')) {
      console.log('⏭️  selling_unit_id already exists on sales_invoice_items, skipping');
      return;
    }
    await query(`
      ALTER TABLE sales_invoice_items
      ADD COLUMN selling_unit_id VARCHAR(50) DEFAULT NULL,
      ADD CONSTRAINT fk_sii_selling_unit FOREIGN KEY (selling_unit_id) REFERENCES product_selling_units (id) ON DELETE SET NULL
    `);
    console.log('✅ selling_unit_id added to sales_invoice_items');
  },

  async down(): Promise<void> {
    if (!(await columnExists('sales_invoice_items', 'selling_unit_id'))) {
      console.log('⏭️  selling_unit_id not present on sales_invoice_items, skipping');
      return;
    }
    await query('ALTER TABLE sales_invoice_items DROP FOREIGN KEY fk_sii_selling_unit');
    await query('ALTER TABLE sales_invoice_items DROP COLUMN selling_unit_id');
    console.log('✅ selling_unit_id dropped from sales_invoice_items');
  }
};

registerMigration(migration);
