import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Make the BIR invoice-number unique keys per-branch.
 *
 * Each branch files its own series, so two establishments legitimately both
 * issue 000001. A global UNIQUE rejects the second one. The composite key
 * still enforces what BIR requires — no duplicate within an establishment.
 *
 * ORDERING, not transactions, is what keeps uniqueness continuous. MySQL DDL
 * implicitly commits, so a transaction around ALTER TABLE is NOT atomic and
 * would be misleading; plain query() calls are used on purpose. Each swap
 * ADDs the new key BEFORE it DROPs the old one, so at every instant at least
 * one uniqueness guarantee is in force and a concurrent sale can never slip a
 * duplicate invoice number through. Adding the composite key first can never
 * fail on existing data: anything the stricter single-column key allowed is
 * already unique on (branch_id, column). down() mirrors this — it re-adds the
 * single-column key first, which can legitimately FAIL if two branches have by
 * then each issued the same number; the rollback must not silently drop a
 * uniqueness guarantee.
 */
const SWAPS: Array<{ table: string; column: string; oldIndex: string; newIndex: string }> = [
  { table: 'sales_transactions', column: 'si_number', oldIndex: 'si_number', newIndex: 'uq_sales_tx_branch_si' },
  { table: 'pos_transactions', column: 'si_number', oldIndex: 'si_number', newIndex: 'uq_pos_tx_branch_si' },
  { table: 'sales_transactions', column: 'bir_or_number', oldIndex: 'idx_sales_transactions_bir_or_number', newIndex: 'uq_sales_tx_branch_or' },
  { table: 'pos_transactions', column: 'bir_or_number', oldIndex: 'idx_pos_transactions_bir_or_number', newIndex: 'uq_pos_tx_branch_or' },
  { table: 'pos_transactions', column: 'mc_number', oldIndex: 'idx_pos_transactions_mc_number', newIndex: 'uq_pos_tx_branch_mc' },
];

export const migration: Migration = {
  name: '141_composite_bir_unique_keys',
  timestamp: '2026-10-14_11-00-00',

  async up() {
    console.log('Running migration: 141_composite_bir_unique_keys');
    for (const s of SWAPS) {
      // 1. ADD the composite key first — uniqueness is never absent.
      try {
        await query(
          `ALTER TABLE \`${s.table}\` ADD UNIQUE KEY \`${s.newIndex}\` (branch_id, \`${s.column}\`)`
        );
        console.log(`✅ Added ${s.newIndex} on ${s.table} (branch_id, ${s.column})`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_KEYNAME' || e.errno === 1061) {
          console.log(`⚠️ ${s.newIndex} already exists on ${s.table}`);
        } else {
          throw e;
        }
      }
      // 2. Only then DROP the old single-column key.
      try {
        await query(`ALTER TABLE \`${s.table}\` DROP INDEX \`${s.oldIndex}\``);
        console.log(`✅ Dropped ${s.table}.${s.oldIndex}`);
      } catch (e: any) {
        if (e.errno === 1091) {
          console.log(`⚠️ Index ${s.oldIndex} already absent on ${s.table}`);
        } else {
          throw e;
        }
      }
    }
  },

  async down() {
    console.log('Rolling back migration: 141_composite_bir_unique_keys');
    for (const s of SWAPS) {
      // 1. Re-add the single-column key first. Fails (correctly) if two
      //    branches have issued the same number by now.
      try {
        await query(
          `ALTER TABLE \`${s.table}\` ADD UNIQUE KEY \`${s.oldIndex}\` (\`${s.column}\`)`
        );
      } catch (e: any) {
        if (!(e.code === 'ER_DUP_KEYNAME' || e.errno === 1061)) throw e;
      }
      // 2. Only then drop the composite key.
      try {
        await query(`ALTER TABLE \`${s.table}\` DROP INDEX \`${s.newIndex}\``);
      } catch (e: any) {
        if (e.errno !== 1091) throw e;
      }
    }
  }
};

registerMigration(migration);
