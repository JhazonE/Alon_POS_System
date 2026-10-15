import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Tighten the sale tables' branch_id to NOT NULL with a foreign key.
 *
 * Guarded: aborts with a message naming the table if any row is still NULL,
 * rather than letting MySQL coerce NULLs to ''. A sale with no branch cannot
 * be filed under any establishment.
 *
 * ON DELETE RESTRICT: deleting a branch must never orphan or remove its
 * filed sales.
 */
const TABLES = ['sales_transactions', 'pos_transactions'];

export const migration: Migration = {
  name: '140_tighten_sales_branch_id',
  timestamp: '2026-10-14_10-50-00',

  async up() {
    console.log('Running migration: 140_tighten_sales_branch_id');

    for (const table of TABLES) {
      const rows: any = await query(
        `SELECT COUNT(*) AS c FROM \`${table}\` WHERE branch_id IS NULL`
      );
      if (rows[0].c > 0) {
        throw new Error(
          `Cannot tighten ${table}.branch_id: ${rows[0].c} row(s) still NULL. ` +
          `Run migration 139_backfill_sales_branch_id first.`
        );
      }
      await query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN branch_id VARCHAR(50) NOT NULL`
      );
      console.log(`✅ ${table}.branch_id is NOT NULL`);

      const name = `fk_${table}_branch`;
      try {
        await query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\`
             FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE RESTRICT`
        );
        console.log(`✅ Added ${name}`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_KEYNAME' || e.errno === 1061 || e.errno === 1826) {
          console.log(`⚠️ Constraint ${name} already exists`);
        } else {
          throw e;
        }
      }
    }
  },

  async down() {
    console.log('Rolling back migration: 140_tighten_sales_branch_id');
    for (const table of TABLES) {
      try {
        await query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`fk_${table}_branch\``);
      } catch (e: any) {
        if (e.errno !== 1091) throw e;
      }
      await query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN branch_id VARCHAR(50) NULL DEFAULT NULL`
      );
    }
  }
};

registerMigration(migration);
