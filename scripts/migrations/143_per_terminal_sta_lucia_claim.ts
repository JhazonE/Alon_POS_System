import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';
import { ensureClaimsSchema, claimsPrimaryKey, CLAIMS_TABLE } from '../../lib/integrations/sta-lucia/claims-schema';

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
 * SHARED WITH THE RUNTIME. The column / backfill / key-swap steps live in
 * lib/integrations/sta-lucia/claims-schema.ts (ensureClaimsSchema) and are called
 * from here AND lazily by the sender on first use, so new code running before this
 * migration self-heals instead of throwing "Unknown column" with no log row (which
 * would be a silent under-report). One implementation, idempotent and safe to run
 * concurrently, so the two can never drift or fight.
 *
 * LEGACY LOG KEYS. external_api_logs.transaction_id for STA_LUCIA_SALES rows is
 * now `<terminalId>|<readingNumber>` (see zReadingRef in send-z-reading.ts). A
 * pre-deploy row carries the bare number; if a second terminal later files that
 * number, the sweep and the Retry button would feed the bare id back, get
 * "ambiguous", and retry forever with no UI path able to supply a terminal. So
 * up() rewrites bare ids to the qualified form WHERE the number maps to exactly
 * one terminal in z_readings (and the result fits the 50-char column). The
 * ambiguous remainder (several terminals, or no z_readings row / no terminal) is
 * left untouched: the data does not say which terminal it belonged to, and
 * guessing would resend another terminal's sales. Those rows stay failed and
 * visible in Sync Logs; they can only exist if the number was shared before this
 * migration ran, i.e. 142 shipped without 143. down() strips the prefix again so
 * the previous code (which looks readings up by bare number) can still resolve
 * every row instead of abandoning it as "not found".
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
const LOG_TYPE = 'STA_LUCIA_SALES';

export const migration: Migration = {
  name: '143_per_terminal_sta_lucia_claim',
  timestamp: '2026-10-21_11-00-00',

  async up() {
    console.log('Running migration: 143_per_terminal_sta_lucia_claim');

    // Column, backfill and key swap: shared with the sender's runtime self-heal.
    const r = await ensureClaimsSchema();
    console.log(r.addedColumn ? `✅ Added ${CLAIMS_TABLE}.terminal_id` : `⚠️ ${CLAIMS_TABLE}.terminal_id already present`);
    console.log(`✅ Backfilled terminal_id on ${r.backfilled} claim(s)`);
    console.log(r.swappedKey
      ? `✅ ${CLAIMS_TABLE} PRIMARY KEY is now (terminal_id, z_reading_id)`
      : `⚠️ ${CLAIMS_TABLE} already keyed on (terminal_id, z_reading_id)`);

    // Qualify legacy bare log keys where unambiguous (see LEGACY LOG KEYS).
    const logs: any = await query(
      `UPDATE external_api_logs l
         JOIN (SELECT reading_number, MIN(terminal_id) AS tid
                 FROM z_readings
                GROUP BY reading_number
               HAVING COUNT(*) = 1 AND MAX(terminal_id IS NOT NULL AND terminal_id <> '') = 1) z
           ON CAST(l.transaction_id AS BINARY) = CAST(z.reading_number AS BINARY)
          SET l.transaction_id = CONCAT(z.tid, '|', z.reading_number)
        WHERE l.transaction_type = ?
          AND l.transaction_id NOT LIKE '%|%'
          AND CHAR_LENGTH(z.tid) + 1 + CHAR_LENGTH(z.reading_number) <= 50`,
      [LOG_TYPE]
    );
    console.log(`✅ Qualified ${logs?.affectedRows ?? 0} legacy ${LOG_TYPE} log key(s)`);
    const left: any = await query(
      `SELECT COUNT(*) AS n FROM external_api_logs
        WHERE transaction_type = ? AND transaction_id NOT LIKE '%|%'`,
      [LOG_TYPE]
    );
    console.log(`ℹ️ ${left?.[0]?.n ?? 0} bare ${LOG_TYPE} log key(s) left as-is (ambiguous, or no terminal on record)`);
  },

  async down() {
    console.log('Rolling back migration: 143_per_terminal_sta_lucia_claim');

    // 1. Restore the old key FIRST. THROWS (by design) if two terminals have
    //    claimed the same reading number - see the note above - leaving
    //    everything exactly as it was.
    const pk = await claimsPrimaryKey();
    if (!(pk.length === 1 && pk[0] === 'z_reading_id')) {
      await query(
        pk.length > 0
          ? `ALTER TABLE ${CLAIMS_TABLE} DROP PRIMARY KEY, ADD PRIMARY KEY (z_reading_id)`
          : `ALTER TABLE ${CLAIMS_TABLE} ADD PRIMARY KEY (z_reading_id)`
      );
    }

    // 2. Strip the terminal prefix from log keys so the previous code resolves them.
    await query(
      `UPDATE external_api_logs
          SET transaction_id = SUBSTRING_INDEX(transaction_id, '|', -1)
        WHERE transaction_type = ? AND transaction_id LIKE '%|%'`,
      [LOG_TYPE]
    );

    // 3. Only then drop the column.
    const col: any = await query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'terminal_id'`,
      [CLAIMS_TABLE]
    );
    if (col.length > 0) {
      await query(`ALTER TABLE ${CLAIMS_TABLE} DROP COLUMN terminal_id`);
    }
  }
};

registerMigration(migration);
