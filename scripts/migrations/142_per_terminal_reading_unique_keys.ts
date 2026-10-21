import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Make Z/X reading numbers unique per terminal instead of globally.
 *
 * getNextZReadingNumber / getNextXReadingNumber count PER TERMINAL
 * (pos_terminals.z_counter / x_counter) and the number they format —
 * Z-YYYYMMDD-NNN / X-YYYYMMDD-NNN — carries no terminal identifier. Two
 * registers in one store both reach 001 on the same day and mint the same
 * reading_number. z_readings and x_readings each had a GLOBAL UNIQUE KEY on
 * reading_number, so the second register's INSERT failed with a duplicate key
 * and it could not file its BIR end-of-day Z-reading.
 *
 * The fix is the constraint, not the generators: the number format is on
 * already-filed documents and is read by lib/ejournal/* (the BIR audit journal)
 * and its printed output, so it must not change. (terminal_id, reading_number)
 * is the uniqueness BIR actually needs — a register's own series never repeats.
 *
 * No branch_id column is added: the terminal already determines the branch via
 * pos_terminals.branch_id, and a denormalised copy on a filed document would be
 * a second source of truth.
 *
 * NULL terminal_id: terminal_id is nullable, and MySQL does not treat NULLs in
 * a UNIQUE index as equal. Legacy rows with no terminal therefore never collide
 * with anything, but the composite key also does not constrain them — two
 * NULL-terminal rows could share a number. Accepted: those rows predate
 * terminal tracking and the generators always supply a terminal now.
 *
 * ORDERING, not transactions, keeps uniqueness continuous (same reasoning as
 * migration 141): MySQL DDL implicitly commits, so a transaction around
 * ALTER TABLE would not be atomic. Each swap ADDs the new key BEFORE it DROPs
 * the old one, so at every instant at least one uniqueness guarantee is in
 * force. Adding the composite key first cannot fail on existing data — anything
 * the stricter single-column key allowed is already unique on
 * (terminal_id, reading_number).
 *
 * No collation is assumed in the DDL: terminal_id has drifted between
 * utf8mb4_unicode_ci and utf8mb4_0900_ai_ci on these tables (see
 * scripts/fix_z_readings_schema.ts), and the index simply uses whatever each
 * column already has.
 *
 * down() re-adds the global key first. That is IMPOSSIBLE once two terminals
 * have filed the same reading_number — which is exactly what this migration
 * makes legal — and it is meant to throw then. It must not silently
 * de-duplicate or renumber filed BIR documents. A rollback that hits this needs
 * a human decision about which filed reading keeps its number.
 */
const SWAPS: Array<{ table: string; newIndex: string }> = [
  { table: 'z_readings', newIndex: 'uq_z_readings_terminal_number' },
  { table: 'x_readings', newIndex: 'uq_x_readings_terminal_number' },
];

/**
 * Name of the existing UNIQUE index that is on reading_number alone, or null.
 * Resolved from INFORMATION_SCHEMA rather than assumed.
 */
async function findGlobalUniqueIndex(table: string): Promise<string | null> {
  const rows: any = await query(
    `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND NON_UNIQUE = 0
        AND INDEX_NAME <> 'PRIMARY'
      GROUP BY INDEX_NAME
     HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME = 'reading_number') = 1`,
    [table]
  );
  return rows.length > 0 ? rows[0].INDEX_NAME : null;
}

export const migration: Migration = {
  name: '142_per_terminal_reading_unique_keys',
  timestamp: '2026-10-21_10-00-00',

  async up() {
    console.log('Running migration: 142_per_terminal_reading_unique_keys');
    for (const s of SWAPS) {
      // 1. ADD the composite key first — uniqueness is never absent.
      try {
        await query(
          `ALTER TABLE \`${s.table}\` ADD UNIQUE KEY \`${s.newIndex}\` (terminal_id, reading_number)`
        );
        console.log(`✅ Added ${s.newIndex} on ${s.table} (terminal_id, reading_number)`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_KEYNAME' || e.errno === 1061) {
          console.log(`⚠️ ${s.newIndex} already exists on ${s.table}`);
        } else {
          throw e;
        }
      }
      // 2. Only then DROP the old global key, if it is still there.
      const oldIndex = await findGlobalUniqueIndex(s.table);
      if (!oldIndex) {
        console.log(`⚠️ No single-column unique index on ${s.table}.reading_number (already dropped)`);
        continue;
      }
      try {
        await query(`ALTER TABLE \`${s.table}\` DROP INDEX \`${oldIndex}\``);
        console.log(`✅ Dropped ${s.table}.${oldIndex}`);
      } catch (e: any) {
        if (e.errno === 1091) {
          console.log(`⚠️ Index ${oldIndex} already absent on ${s.table}`);
        } else {
          throw e;
        }
      }
    }
  },

  async down() {
    console.log('Rolling back migration: 142_per_terminal_reading_unique_keys');
    for (const s of SWAPS) {
      // 1. Re-add the global key first. THROWS (by design) if two terminals have
      //    filed the same reading_number — see the note above.
      if (!(await findGlobalUniqueIndex(s.table))) {
        try {
          await query(`ALTER TABLE \`${s.table}\` ADD UNIQUE KEY \`reading_number\` (reading_number)`);
        } catch (e: any) {
          if (!(e.code === 'ER_DUP_KEYNAME' || e.errno === 1061)) throw e;
        }
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
