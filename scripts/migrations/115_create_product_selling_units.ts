import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

const migration: Migration = {
  name: '115_create_product_selling_units',
  timestamp: '2026-09-21_11-00-00',

  async up(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS product_selling_units (
        id VARCHAR(50) NOT NULL,
        product_id VARCHAR(50) NOT NULL,
        unit_name VARCHAR(100) NOT NULL,
        qty_base DECIMAL(10,4) NOT NULL,
        barcode VARCHAR(100) NOT NULL,
        cost DECIMAL(10,2) DEFAULT NULL,
        price DECIMAL(10,2) NOT NULL,
        is_base TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_selling_unit_barcode (barcode),
        UNIQUE KEY unique_product_unit_name (product_id, unit_name),
        KEY idx_psu_product_id (product_id),
        CONSTRAINT fk_psu_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ product_selling_units table created');
  },

  async down(): Promise<void> {
    await query('DROP TABLE IF EXISTS product_selling_units');
    console.log('✅ product_selling_units table dropped');
  }
};

registerMigration(migration);
