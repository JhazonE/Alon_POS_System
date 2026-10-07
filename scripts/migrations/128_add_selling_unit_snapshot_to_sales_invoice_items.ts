import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

// Copied verbatim from 117, which defines its own local helper rather than
// importing a shared one. Keep the shape identical.
async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any = await query(`
    SELECT COUNT(*) as cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  return rows[0]?.cnt > 0;
}

/**
 * Migration 122 gave `sales_invoice_items` only `selling_unit_id`, not the
 * `selling_unit_name` / `selling_unit_qty_base` snapshot pair that migration
 * 117 gave `sale_items`.
 *
 * Without the snapshot, the invoice void path cannot convert a unit quantity
 * back to base units from the row alone, and resolving it through a join to
 * `product_selling_units` would read the unit's CURRENT ratio — restoring the
 * wrong quantity for any unit re-ratioed after the sale. A void that restores
 * the wrong quantity destroys real inventory, so the snapshot is required.
 */
const migration: Migration = {
  name: '128_add_selling_unit_snapshot_to_sales_invoice_items',
  timestamp: '2026-10-07_10-00-00',

  async up(): Promise<void> {
    if (await columnExists('sales_invoice_items', 'selling_unit_qty_base')) {
      console.log('⏭️  selling_unit snapshot already exists on sales_invoice_items, skipping');
      return;
    }
    await query(`
      ALTER TABLE sales_invoice_items
      ADD COLUMN selling_unit_name VARCHAR(100) DEFAULT NULL,
      ADD COLUMN selling_unit_qty_base DECIMAL(10,4) DEFAULT NULL
    `);
    console.log('✅ selling_unit snapshot columns added to sales_invoice_items');
  },

  async down(): Promise<void> {
    if (!(await columnExists('sales_invoice_items', 'selling_unit_qty_base'))) {
      console.log('⏭️  selling_unit snapshot not present on sales_invoice_items, skipping');
      return;
    }
    await query(`
      ALTER TABLE sales_invoice_items
      DROP COLUMN selling_unit_name,
      DROP COLUMN selling_unit_qty_base
    `);
    console.log('✅ selling_unit snapshot columns dropped from sales_invoice_items');
  }
};

registerMigration(migration);
