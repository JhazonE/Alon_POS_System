import { query } from '@/lib/mysql';

/**
 * Schema of the Sta. Lucia submission-claim table, and the self-heal that keeps
 * it in the shape the sender needs.
 *
 * The claim is keyed (terminal_id, z_reading_id): two terminals may hold the
 * same Z-reading number (migration 142), so a claim on the bare number would
 * mask the second terminal's submission and its sales would silently never reach
 * the mall. Migration 143 owns the swap on existing installs - and calls THIS
 * function to do it, so the migration and the runtime heal are the same code and
 * cannot drift.
 *
 * Why the runtime also heals: the sender's INSERT names terminal_id. If the new
 * code ever runs before `npm run migrate` has applied 143 (a normal deploy
 * ordering accident), every claim would throw "Unknown column" before any
 * external_api_logs row exists, and the sale would be unreported with nothing for
 * the retry sweep to pick up. Healing on first use removes that window rather
 * than merely making it recoverable.
 *
 * Every step is idempotent and safe to run concurrently - from several terminals,
 * or against migration 143 running at the same moment:
 *  - CREATE TABLE IF NOT EXISTS.
 *  - ADD COLUMN is guarded by INFORMATION_SCHEMA and tolerates errno 1060.
 *  - The backfill only touches rows still at '' and is the same statement
 *    whoever runs it.
 *  - The key swap is ONE ALTER (DROP PRIMARY KEY, ADD PRIMARY KEY ...), atomic in
 *    MySQL 8, guarded by a check of the current key. Two concurrent swaps
 *    serialise on the table's metadata lock; the second finds the key already
 *    right (or re-applies the identical key, which is harmless), and errno
 *    1068/1091 are tolerated if the key is by then correct.
 * Uniqueness is never absent: the old primary key stays in force until the single
 * statement that replaces it with a strictly wider one.
 *
 * Legacy claims (terminal_id '') are backfilled from z_readings, only where the
 * reading number maps to exactly one terminal. This matters at runtime too: a
 * legacy SUCCEEDED claim left at '' would not collide with its terminal's new
 * claim and the day would be re-sent. A reading number that matches several
 * terminals, or none, stays '' - harmless, nothing claims with ''.
 *
 * Comparisons use CAST ... AS BINARY: z_readings.reading_number and the claim
 * column have drifted between utf8mb4_unicode_ci and utf8mb4_0900_ai_ci on real
 * installs and a direct comparison throws "Illegal mix of collations". A reading
 * number is an ASCII identifier, so byte equality is the right equality.
 */
export const CLAIMS_TABLE = 'sta_lucia_submissions';

export interface ClaimsSchemaResult {
  addedColumn: boolean;
  backfilled: number;
  swappedKey: boolean;
}

const WANT_KEY = ['terminal_id', 'z_reading_id'];

function assertIdent(name: string) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Invalid table name: ${name}`);
}

async function hasTerminalColumn(table: string): Promise<boolean> {
  const rows: any = await query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'terminal_id'`,
    [table],
  );
  return rows.length > 0;
}

/** Columns of the PRIMARY KEY in key order; empty when the table has none. */
export async function claimsPrimaryKey(table: string = CLAIMS_TABLE): Promise<string[]> {
  const rows: any = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY'
      ORDER BY SEQ_IN_INDEX`,
    [table],
  );
  return rows.map((r: any) => r.COLUMN_NAME);
}

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/** Create/upgrade the claim table to the (terminal_id, z_reading_id) shape. */
export async function ensureClaimsSchema(table: string = CLAIMS_TABLE): Promise<ClaimsSchemaResult> {
  assertIdent(table);
  const result: ClaimsSchemaResult = { addedColumn: false, backfilled: 0, swappedKey: false };

  await query(`
    CREATE TABLE IF NOT EXISTS \`${table}\` (
      z_reading_id VARCHAR(50) NOT NULL,
      terminal_id  VARCHAR(50) NOT NULL DEFAULT '',
      claimed_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      succeeded    TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (terminal_id, z_reading_id)
    )
  `);

  // 1. Column. The old primary key stays in force.
  if (!(await hasTerminalColumn(table))) {
    try {
      await query(
        `ALTER TABLE \`${table}\` ADD COLUMN terminal_id VARCHAR(50) NOT NULL DEFAULT '' AFTER z_reading_id`,
      );
      result.addedColumn = true;
    } catch (e: any) {
      if (!(e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060)) throw e;
    }
  }

  // 2. Backfill legacy claims from z_readings; unambiguous matches only.
  const res: any = await query(
    `UPDATE \`${table}\` s
       JOIN (SELECT reading_number, MIN(terminal_id) AS tid
               FROM z_readings
              WHERE terminal_id IS NOT NULL AND terminal_id <> ''
              GROUP BY reading_number
             HAVING COUNT(DISTINCT terminal_id) = 1) z
         ON CAST(z.reading_number AS BINARY) = CAST(s.z_reading_id AS BINARY)
        SET s.terminal_id = z.tid
      WHERE s.terminal_id = ''`,
  );
  result.backfilled = res?.affectedRows ?? 0;

  // 3. Swap the key in one atomic statement.
  const pk = await claimsPrimaryKey(table);
  if (!same(pk, WANT_KEY)) {
    try {
      await query(
        pk.length > 0
          ? `ALTER TABLE \`${table}\` DROP PRIMARY KEY, ADD PRIMARY KEY (terminal_id, z_reading_id)`
          : `ALTER TABLE \`${table}\` ADD PRIMARY KEY (terminal_id, z_reading_id)`,
      );
      result.swappedKey = true;
    } catch (e: any) {
      // 1068 multiple primary key / 1091 cannot drop: a concurrent run already swapped it.
      const raced = (e.errno === 1068 || e.errno === 1091) && same(await claimsPrimaryKey(table), WANT_KEY);
      if (!raced) throw e;
    }
  }
  return result;
}

let ready: Promise<void> | null = null;

/**
 * ensureClaimsSchema() once per process, then free. A failure is not cached, so
 * a transient DB error is retried on the next send instead of wedging the sender.
 */
export function ensureClaimsSchemaOnce(): Promise<void> {
  if (!ready) {
    ready = ensureClaimsSchema().then(
      () => undefined,
      (e) => {
        ready = null;
        throw e;
      },
    );
  }
  return ready;
}
