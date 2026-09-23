import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

const migration: Migration = {
  name: '036_create_supplier_product_mapping',
  timestamp: '2026-01-16_10-00-00',

  async up(): Promise<void> {
    const createTable = `
      CREATE TABLE IF NOT EXISTS supplier_product_mapping (
        id VARCHAR(50) PRIMARY KEY,
        product_id VARCHAR(50) NOT NULL,
        supplier_id VARCHAR(50) NOT NULL,
        supplier_sku VARCHAR(100),
        supplier_lead_time INT DEFAULT 0 COMMENT 'Lead time in days',
        supplier_specific_rop INT DEFAULT 0 COMMENT 'Reorder Point specific to this supplier',
        supplier_cost DECIMAL(10,2),
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
        UNIQUE KEY unique_product_supplier (product_id, supplier_id)
      )
    `;

    await query(createTable);
    console.log('✅ Supplier_Product_Mapping table created');
  },

  async down(): Promise<void> {
    await query('DROP TABLE IF EXISTS supplier_product_mapping');
    console.log('✅ Supplier_Product_Mapping table dropped');
  }
};

registerMigration(migration);
