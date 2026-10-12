import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Add branch_id to warehouses, pos_terminals and users.
 *
 * Nullable at this stage so the migration can run on a live database before
 * the backfill. 133 tightens warehouses and pos_terminals to NOT NULL.
 *
 * users.branch_id stays nullable permanently: NULL means head office, a user
 * not tied to one store.
 */
const TARGETS: Array<{ table: string }> = [
  { table: 'warehouses' },
  { table: 'pos_terminals' },
  { table: 'users' },
];

export const migration: Migration = {
  name: '131_add_branch_id_columns',
  timestamp: '2026-10-12_10-10-00',

  async up() {
    console.log('Running migration: 131_add_branch_id_columns');
    for (const { table } of TARGETS) {
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
    console.log('Rolling back migration: 131_add_branch_id_columns');
    for (const { table } of TARGETS) {
      await query(`ALTER TABLE \`${table}\` DROP COLUMN branch_id`);
    }
  }
};

registerMigration(migration);
