import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

const migration: Migration = {
  name: '116_create_product_selling_unit_prices',
  timestamp: '2026-09-21_11-05-00',

  async up(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS product_selling_unit_prices (
        selling_unit_id VARCHAR(50) NOT NULL,
        price_level_id VARCHAR(50) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        min_quantity DECIMAL(10,2) DEFAULT NULL,
        PRIMARY KEY (selling_unit_id, price_level_id),
        KEY idx_psup_price_level_id (price_level_id),
        CONSTRAINT fk_psup_selling_unit FOREIGN KEY (selling_unit_id) REFERENCES product_selling_units (id) ON DELETE CASCADE,
        CONSTRAINT fk_psup_price_level FOREIGN KEY (price_level_id) REFERENCES price_levels (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ product_selling_unit_prices table created');
  },

  async down(): Promise<void> {
    await query('DROP TABLE IF EXISTS product_selling_unit_prices');
    console.log('✅ product_selling_unit_prices table dropped');
  }
};

registerMigration(migration);
