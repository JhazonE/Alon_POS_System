import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Make the Sta. Lucia submission claim unique per (terminal, Z-reading number)
 * instead of per bare Z-reading number.
 *
 * Migration 142 let two terminals both hold the same Z-reading number (the
 * number is Z-YYYYMMDD-NNN with a per-terminal counter and no terminal
 * identifier). sta_lucia_submissions was keyed PRIMARY KEY (z_reading_id), filled
 * with that bare number. With 142 alone, the second terminal's claim INSERT hit
 * a duplicate key, the sender read that as "already submitted", and the
 * terminal's sales were silently never reported to the mall. Mall rent is
 * commonly a percentage of reported sales, so that is an under-report, and it is
 * strictly worse than the loud duplicate-key error 142 removed. 142 and 143 must
 * ship together.
 *
 * THE KEY: PRIMARY KEY (terminal_id, z_reading_id). It is a primary key rather
 * than a secondary UNIQUE index on purpose:
 *  - terminal_id is added NOT NULL DEFAULT ''. MySQL treats NULLs in a UNIQUE
 *    index as distinct, so a nullable terminal_id would leave NULL-terminal rows
 *    (legacy readings written before terminals were tracked) with no uniqueness
 *    at all - the exact hole this migration closes. '' is a real value and
 *    collides with itself, so those rows stay protected.
 *  - It keeps the table with a primary key.
 * z_reading_id keeps its name and meaning (the reading number), and
 * `succeeded` / `claimed_at` are untouched, so the 15-minute stale-claim
 * takeover and its at-least-once semantics are unchanged.
 *
 * ORDERING. Uniqueness must never be absent. The swap is ONE ALTER TABLE
 * (DROP PRIMARY KEY, ADD PRIMARY KEY (terminal_id, z_reading_id)); MySQL 8 DDL is
 * atomic per statement, so the table has either the old key or the new one and
 * never neither. The new key is strictly wider, so the existing rows cannot
 * violate it. This is the single-statement equivalent of 141/142's
 * ADD-before-DROP, which cannot be used here: a table can hold only one primary
 * key, so "add the new one first" is not expressible. The steps before it
 * (add column, backfill) leave the old primary key in force throughout.
 *
 * Re-runnable after a crash at any point: each step checks INFORMATION_SCHEMA
 * first, and the backfill only touches rows still at ''.
 *
 * BACKFILL. Legacy claims get their terminal from z_readings by reading number.
 * Before 142 reading_number was globally unique, so the match is unambiguous; a
 * number that now matches more than one terminal is deliberately left at ''
 * rather than guessed. A claim whose Z-reading no longer exists (data reset) also
 * stays at '' - harmless: no terminal will ever claim with ''.
 *
 * down() restores PRIMARY KEY (z_reading_id) FIRST, then drops the column. That
 * restore is IMPOSSIBLE once two terminals have claimed the same number - which
 * is exactly what this migration makes legal - and it is meant to throw then.
 * It must not silently delete one terminal's claim: dropping a claim row lets
 * the sender re-send (double-reporting revenue) or, if it was the only record
 * of a success, lose that fact.
 *
 * COLLATION DRIFT: z_readings.reading_number and sta_lucia_submissions.z_reading_id
 * have drifted between utf8mb4_unicode_ci and utf8mb4_0900_ai_ci on real installs
 * (see 142 and scripts/fix_z_readings_schema.ts), and comparing them directly throws
 * "Illegal mix of collations". The backfill join therefore compares the raw bytes
 * (CAST ... AS BINARY), which is exact and collation-free; a reading number is
 * an ASCII identifier, so byte equality is the right equality. terminal_id
 * inherits the table default.
 */
const TABLE = 'sta_lucia_submissions';

async function hasTerminalColumn(): Promise<boolean> {
  const rows: any = await query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'terminal_id'`,
    [TABLE]
  );
  return rows.length > 0;
}

/** Columns of the PRIMARY KEY in key order; empty when the table has none. */
async function primaryKeyColumns(): Promise<string[]> {
  const rows: any = await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY'
      ORDER BY SEQ_IN_INDEX`,
    [TABLE]
  );
  return rows.map((r: any) => r.COLUMN_NAME);
}

function sameColumns(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

export const migration: Migration = {
  name: '143_per_terminal_sta_lucia_claim',
  timestamp: '2026-10-21_11-00-00',

  async up() {
    console.log('Running migration: 143_per_terminal_sta_lucia_claim');

    // 1. Column. The old primary key stays in force.
    if (await hasTerminalColumn()) {
      console.log(`⚠️ ${TABLE}.terminal_id already exists`);
    } else {
      try {
        await query(
          `ALTER TABLE \`${TABLE}\` ADD COLUMN terminal_id VARCHAR(50) NOT NULL DEFAULT '' AFTER z_reading_id`
        );
        console.log(`✅ Added ${TABLE}.terminal_id`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060) {
          console.log(`⚠️ ${TABLE}.terminal_id already exists`);
        } else {
          throw e;
        }
      }
    }

    // 2. Backfill legacy claims from z_readings; only unambiguous matches.
    const res: any = await query(
      `UPDATE \`${TABLE}\` s
         JOIN (SELECT reading_number, MIN(terminal_id) AS tid
                 FROM z_readings
                WHERE terminal_id IS NOT NULL AND terminal_id <> ''
                GROUP BY reading_number
               HAVING COUNT(DISTINCT terminal_id) = 1) z
           ON CAST(z.reading_number AS BINARY) = CAST(s.z_reading_id AS BINARY)
          SET s.terminal_id = z.tid
        WHERE s.terminal_id = ''`
    );
    console.log(`✅ Backfilled terminal_id on ${res?.affectedRows ?? 0} claim(s)`);

    // 3. Swap the key in one atomic statement (see ORDERING above).
    const want = ['terminal_id', 'z_reading_id'];
    const pk = await primaryKeyColumns();
    if (sameColumns(pk, want)) {
      console.log(`⚠️ ${TABLE} is already keyed on (terminal_id, z_reading_id)`);
      return;
    }
    try {
      await query(
        pk.length > 0
          ? `ALTER TABLE \`${TABLE}\` DROP PRIMARY KEY, ADD PRIMARY KEY (terminal_id, z_reading_id)`
          : `ALTER TABLE \`${TABLE}\` ADD PRIMARY KEY (terminal_id, z_reading_id)`
      );
      console.log(`✅ ${TABLE} PRIMARY KEY is now (terminal_id, z_reading_id)`);
    } catch (e: any) {
      // 1068 multiple primary key / 1091 cannot drop: a concurrent or earlier run already swapped it.
      if ((e.errno === 1068 || e.errno === 1091) && sameColumns(await primaryKeyColumns(), want)) {
        console.log(`⚠️ ${TABLE} key already swapped`);
      } else {
        throw e;
      }
    }
  },

  async down() {
    console.log('Rolling back migration: 143_per_terminal_sta_lucia_claim');

    // 1. Restore the old key FIRST. THROWS (by design) if two terminals have
    //    claimed the same reading number - see the note above.
    const pk = await primaryKeyColumns();
    if (!sameColumns(pk, ['z_reading_id'])) {
      await query(
        pk.length > 0
          ? `ALTER TABLE \`${TABLE}\` DROP PRIMARY KEY, ADD PRIMARY KEY (z_reading_id)`
          : `ALTER TABLE \`${TABLE}\` ADD PRIMARY KEY (z_reading_id)`
      );
    }

    // 2. Only then drop the column.
    if (await hasTerminalColumn()) {
      await query(`ALTER TABLE \`${TABLE}\` DROP COLUMN terminal_id`);
    }
  }
};

registerMigration(migration);
