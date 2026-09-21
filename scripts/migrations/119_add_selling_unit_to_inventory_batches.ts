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
  name: '119_add_selling_unit_to_inventory_batches',
  timestamp: '2026-09-21_11-20-00',

  async up(): Promise<void> {
    if (await columnExists('inventory_batches', 'selling_unit_id')) {
      console.log('⏭️  selling_unit_id already exists on inventory_batches, skipping');
      return;
    }
    await query(`
      ALTER TABLE inventory_batches
      ADD COLUMN selling_unit_id VARCHAR(50) DEFAULT NULL,
      ADD CONSTRAINT fk_ib_selling_unit FOREIGN KEY (selling_unit_id) REFERENCES product_selling_units (id) ON DELETE SET NULL
    `);
    console.log('✅ selling_unit_id added to inventory_batches');
  },

  async down(): Promise<void> {
    if (!(await columnExists('inventory_batches', 'selling_unit_id'))) {
      console.log('⏭️  selling_unit_id not present on inventory_batches, skipping');
      return;
    }
    await query('ALTER TABLE inventory_batches DROP FOREIGN KEY fk_ib_selling_unit');
    await query('ALTER TABLE inventory_batches DROP COLUMN selling_unit_id');
    console.log('✅ selling_unit_id dropped from inventory_batches');
  }
};

registerMigration(migration);
