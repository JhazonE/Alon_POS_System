import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Create the branches table — the store identity above warehouses.
 *
 * BIR identity (permit_no, min_number, serial_number, tin, business_name,
 * address) lives here because each branch is its own registered
 * establishment. pos_terminals keeps its own copies of permit/MIN/serial as
 * per-machine values; the branch supplies the default. Philippine practice
 * is a per-machine serial under a branch permit, so both levels are real.
 *
 * `code` is the short label that prints on receipts and heads report
 * columns, so it is required and unique.
 */
export const migration: Migration = {
  name: '130_create_branches',
  timestamp: '2026-10-12_10-00-00',

  async up() {
    console.log('Running migration: 130_create_branches');
    await query(`
      CREATE TABLE IF NOT EXISTS branches (
        id VARCHAR(50) NOT NULL,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        business_name VARCHAR(255) DEFAULT NULL,
        address TEXT,
        tin VARCHAR(50) DEFAULT NULL,
        contact_number VARCHAR(50) DEFAULT NULL,
        permit_no VARCHAR(100) DEFAULT NULL,
        min_number VARCHAR(100) DEFAULT NULL,
        serial_number VARCHAR(100) DEFAULT NULL,
        operated_by VARCHAR(255) DEFAULT NULL,
        is_main TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_branches_code (code),
        KEY idx_branches_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ Created branches table');
  },

  async down() {
    console.log('Rolling back migration: 130_create_branches');
    await query(`DROP TABLE IF EXISTS branches`);
  }
};

registerMigration(migration);
