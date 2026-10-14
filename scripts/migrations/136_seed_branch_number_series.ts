import { registerMigration, Migration } from './runner';
import { query, withTransaction } from '../../lib/mysql';

/**
 * Seed one counter row per branch.
 *
 * The main branch CONTINUES its existing sequence: its values are copied
 * from transaction_references, never reset. Resetting or gapping a filed BIR
 * series is a violation, so this migration must not renumber anything.
 *
 * Every other branch starts at '000000', because the counters are
 * increment-then-read: the first invoice a new establishment issues is
 * 000001, matching a fresh Permit to Use.
 *
 * Idempotent: INSERT IGNORE against the primary key, so a re-run neither
 * duplicates nor overwrites a counter that has since advanced.
 */
export const migration: Migration = {
  name: '136_seed_branch_number_series',
  timestamp: '2026-10-14_10-10-00',

  async up() {
    console.log('Running migration: 136_seed_branch_number_series');

    await withTransaction(async (connection) => {
      const [refs]: any = await connection.query(
        `SELECT si_number, mc_number, bir_or_number
         FROM transaction_references WHERE id = 1`
      );
      const r = refs[0] || {};
      const si = r.si_number || '000000';
      const mc = r.mc_number || '000000';
      const or = r.bir_or_number || '000000';

      const [main]: any = await connection.query(
        `SELECT id FROM branches WHERE is_main = 1 LIMIT 1`
      );
      if (main.length === 0) {
        throw new Error(
          'Cannot seed branch_number_series: no is_main branch exists. ' +
          'Run migration 132_backfill_default_branch first.'
        );
      }
      const mainId = main[0].id;

      const [ins]: any = await connection.query(
        `INSERT IGNORE INTO branch_number_series
           (branch_id, si_number, mc_number, bir_or_number)
         VALUES (?, ?, ?, ?)`,
        [mainId, si, mc, or]
      );
      console.log(
        `✅ Main branch ${mainId} continues at si=${si} mc=${mc} or=${or} ` +
        `(${ins.affectedRows} row inserted)`
      );

      const [others]: any = await connection.query(
        `INSERT IGNORE INTO branch_number_series (branch_id)
         SELECT id FROM branches WHERE is_main = 0`
      );
      console.log(`✅ Seeded ${others.affectedRows} non-main branch(es) at 000000`);
    });
  },

  async down() {
    console.log('Rolling back migration: 136_seed_branch_number_series');
    await query(`DELETE FROM branch_number_series`);
  }
};

registerMigration(migration);
