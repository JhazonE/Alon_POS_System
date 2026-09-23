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

const migration: Migration = {
  name: '118_add_selling_unit_to_purchase_order_items',
  timestamp: '2026-09-21_11-15-00',

  async up(): Promise<void> {
    if (await columnExists('purchase_order_items', 'selling_unit_id')) {
      console.log('⏭️  selling_unit_id already exists on purchase_order_items, skipping');
      return;
    }
    await query(`
      ALTER TABLE purchase_order_items
      ADD COLUMN selling_unit_id VARCHAR(50) DEFAULT NULL,
      ADD COLUMN selling_unit_name VARCHAR(100) DEFAULT NULL,
      ADD COLUMN selling_unit_qty_base DECIMAL(10,4) DEFAULT NULL,
      ADD CONSTRAINT fk_poi_selling_unit FOREIGN KEY (selling_unit_id) REFERENCES product_selling_units (id) ON DELETE SET NULL
    `);
    console.log('✅ selling_unit_id + snapshot columns added to purchase_order_items');
  },

  async down(): Promise<void> {
    if (!(await columnExists('purchase_order_items', 'selling_unit_id'))) {
      console.log('⏭️  selling_unit_id not present on purchase_order_items, skipping');
      return;
    }
    await query('ALTER TABLE purchase_order_items DROP FOREIGN KEY fk_poi_selling_unit');
    await query(`
      ALTER TABLE purchase_order_items
      DROP COLUMN selling_unit_id,
      DROP COLUMN selling_unit_name,
      DROP COLUMN selling_unit_qty_base
    `);
    console.log('✅ selling_unit_id + snapshot columns dropped from purchase_order_items');
  }
};

registerMigration(migration);
