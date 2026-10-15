import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Add branch_id to the two sale tables.
 *
 * Phase 1 derived a sale's branch through pos_terminals.branch_id. Storing it
 * on the sale instead means a terminal later reassigned to another branch
 * cannot retroactively move its past sales to a different BIR establishment,
 * and it is what the composite (branch_id, si_number) unique keys need.
 *
 * Nullable here; 139 backfills and 140 tightens.
 */
const TABLES = ['sales_transactions', 'pos_transactions'];

export const migration: Migration = {
  name: '138_add_branch_id_to_sales',
  timestamp: '2026-10-14_10-30-00',

  async up() {
    console.log('Running migration: 138_add_branch_id_to_sales');
    for (const table of TABLES) {
      try {
        await query(`ALTER TABLE \`${table}\` ADD COLUMN branch_id VARCHAR(50) NULL DEFAULT NULL`);
        console.log(`✅ Added branch_id to ${table}`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_COLUMN_NAME' || e.errno === 1060) {
          console.log(`⚠️ Column branch_id already exists in ${table}`);
        } else {
          throw e;
        }
      }
      try {
        await query(`CREATE INDEX idx_${table}_branch_id ON \`${table}\` (branch_id)`);
        console.log(`✅ Indexed ${table}.branch_id`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_KEYNAME' || e.errno === 1061) {
          console.log(`⚠️ Index idx_${table}_branch_id already exists`);
        } else {
          throw e;
        }
      }
    }
  },

  async down() {
    console.log('Rolling back migration: 138_add_branch_id_to_sales');
    for (const table of TABLES) {
      await query(`ALTER TABLE \`${table}\` DROP COLUMN branch_id`);
    }
  }
};

registerMigration(migration);
