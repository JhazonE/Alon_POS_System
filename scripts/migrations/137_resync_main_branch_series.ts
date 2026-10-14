import { registerMigration, Migration } from './runner';
import { withTransaction } from '../../lib/mysql';

/**
 * Close the cutover window between migration 136 and the counter rewrite.
 *
 * Migration 136 COPIED the BIR counters from transaction_references into
 * branch_number_series. Until the branch-scoped getNextSINumber /
 * getNextMCNumber / getNextBirOrNumber deploy, live sales keep advancing the
 * OLD transaction_references counters while branch_number_series stays frozen
 * at the copied values. Any invoice issued in that window would leave the new
 * series BEHIND the real filed sequence, re-issuing numbers that already
 * appear on filed BIR documents.
 *
 * For the is_main branch only, this sets each counter to the GREATER of its
 * current branch_number_series value and the current transaction_references
 * value. Values are compared as numbers (the columns are zero-padded strings)
 * and written back zero-padded to 6 characters. A counter is never lowered.
 *
 * Idempotent: taking a max is naturally repeatable. Read-only against
 * transaction_references. On an install where no invoice was issued during the
 * cutover this is a no-op.
 */
export const migration: Migration = {
  name: '137_resync_main_branch_series',
  timestamp: '2026-10-14_10-20-00',

  async up() {
    console.log('Running migration: 137_resync_main_branch_series');

    await withTransaction(async (connection) => {
      const [res]: any = await connection.query(
        `UPDATE branch_number_series s
         JOIN branches b ON b.id = s.branch_id AND b.is_main = 1
         JOIN transaction_references t ON t.id = 1
         SET
           s.si_number = LPAD(GREATEST(
             CAST(IF(s.si_number IS NULL OR s.si_number = '', '0', s.si_number) AS UNSIGNED),
             CAST(IF(t.si_number IS NULL OR t.si_number = '', '0', t.si_number) AS UNSIGNED)
           ), 6, '0'),
           s.mc_number = LPAD(GREATEST(
             CAST(IF(s.mc_number IS NULL OR s.mc_number = '', '0', s.mc_number) AS UNSIGNED),
             CAST(IF(t.mc_number IS NULL OR t.mc_number = '', '0', t.mc_number) AS UNSIGNED)
           ), 6, '0'),
           s.bir_or_number = LPAD(GREATEST(
             CAST(IF(s.bir_or_number IS NULL OR s.bir_or_number = '', '0', s.bir_or_number) AS UNSIGNED),
             CAST(IF(t.bir_or_number IS NULL OR t.bir_or_number = '', '0', t.bir_or_number) AS UNSIGNED)
           ), 6, '0')`
      );
      console.log(`✅ Main branch series resynced (${res.changedRows} row changed)`);
    });
  },

  async down() {
    console.log('Rolling back migration: 137_resync_main_branch_series');
    console.log(
      'ℹ️  No-op: a resync cannot be undone meaningfully. Lowering a filed ' +
      'BIR counter would risk re-issuing used invoice numbers, and the prior ' +
      'value is not recorded.'
    );
  }
};

registerMigration(migration);
