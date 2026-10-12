import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Tighten branch_id now that 132 has backfilled it.
 *
 * warehouses and pos_terminals become NOT NULL: a warehouse or till with no
 * store is meaningless, and branch-context resolution fails closed on NULL,
 * so allowing it would only produce 403s at runtime instead of a clear
 * schema error here.
 *
 * users.branch_id stays nullable — NULL means head office — and uses
 * ON DELETE SET NULL so deleting a branch cannot delete its staff.
 *
 * Guarded: if any row is still NULL the migration aborts with a message
 * naming the table, rather than letting MySQL coerce NULLs to ''.
 */
export const migration: Migration = {
  name: '133_tighten_branch_id_not_null',
  timestamp: '2026-10-12_10-30-00',

  async up() {
    console.log('Running migration: 133_tighten_branch_id_not_null');

    for (const table of ['warehouses', 'pos_terminals']) {
      const rows: any = await query(
        `SELECT COUNT(*) AS c FROM \`${table}\` WHERE branch_id IS NULL`
      );
      if (rows[0].c > 0) {
        throw new Error(
          `Cannot tighten ${table}.branch_id: ${rows[0].c} row(s) still NULL. ` +
          `Run migration 132_backfill_default_branch first.`
        );
      }
      await query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN branch_id VARCHAR(50) NOT NULL`
      );
      console.log(`✅ ${table}.branch_id is NOT NULL`);
    }

    const fks: Array<[string, string, string]> = [
      ['warehouses', 'fk_warehouses_branch', 'RESTRICT'],
      ['pos_terminals', 'fk_pos_terminals_branch', 'RESTRICT'],
      ['users', 'fk_users_branch', 'SET NULL'],
    ];

    for (const [table, name, onDelete] of fks) {
      try {
        await query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\`
             FOREIGN KEY (branch_id) REFERENCES branches (id)
             ON DELETE ${onDelete}`
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
    console.log('Rolling back migration: 133_tighten_branch_id_not_null');
    for (const [table, name] of [
      ['warehouses', 'fk_warehouses_branch'],
      ['pos_terminals', 'fk_pos_terminals_branch'],
      ['users', 'fk_users_branch'],
    ]) {
      try {
        await query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``);
      } catch (e: any) {
        if (e.errno !== 1091) throw e;
      }
    }
    for (const table of ['warehouses', 'pos_terminals']) {
      await query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN branch_id VARCHAR(50) NULL DEFAULT NULL`
      );
    }
  }
};

registerMigration(migration);
