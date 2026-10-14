import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Per-branch BIR invoice counters.
 *
 * Each branch is its own BIR-registered establishment and must file a
 * gapless series of its own, so SI / OR / MC counters cannot live in the
 * single global transaction_references row.
 *
 * A separate table rather than re-keying transaction_references: that table
 * holds 17 counters and 14 of them stay company-wide (sales orders, purchase
 * orders, delivery receipts, receipt_number). Splitting out only the three
 * series BIR cares about makes the legal boundary explicit and leaves
 * getNextReference()'s nine series untouched.
 *
 * ON DELETE RESTRICT: a branch's issued invoice series must not disappear
 * with the branch row.
 */
export const migration: Migration = {
  name: '135_create_branch_number_series',
  timestamp: '2026-10-14_10-00-00',

  async up() {
    console.log('Running migration: 135_create_branch_number_series');
    await query(`
      CREATE TABLE IF NOT EXISTS branch_number_series (
        branch_id VARCHAR(50) NOT NULL,
        si_number VARCHAR(20) NOT NULL DEFAULT '000000',
        mc_number VARCHAR(20) NOT NULL DEFAULT '000000',
        bir_or_number VARCHAR(20) NOT NULL DEFAULT '000000',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (branch_id),
        CONSTRAINT fk_bns_branch FOREIGN KEY (branch_id)
          REFERENCES branches (id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ Created branch_number_series');
  },

  async down() {
    console.log('Rolling back migration: 135_create_branch_number_series');
    await query(`DROP TABLE IF EXISTS branch_number_series`);
  }
};

registerMigration(migration);
