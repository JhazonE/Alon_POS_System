import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { query } from '../../lib/mysql';

// Z/X reading numbers are generated per terminal (Z-YYYYMMDD-NNN, counter kept
// on pos_terminals) and carry no terminal identifier. Two registers in the same
// store therefore both reach "...-001" on the same day. z_readings and
// x_readings used to carry a GLOBAL unique key on reading_number, so the second
// register's INSERT failed with a duplicate key (errno 1062) and that register
// could not file its BIR end-of-day Z-reading.
//
// The uniqueness BIR actually needs is per terminal: (terminal_id,
// reading_number). Migration 142 swaps the key. This test needs the migrated
// dev database (npm run migrate) and cleans up every row it seeds.
//
// The ids are namespaced with a run-unique suffix so the test can never collide
// with real data, and the reading number is a far-future date no real terminal
// will ever produce.

const RUN = `${process.pid}_${Date.now()}`;
const T1 = `ut_rdg_t1_${RUN}`;
const T2 = `ut_rdg_t2_${RUN}`;
const READING_Z = 'Z-99991231-001';
const READING_X = 'X-99991231-001';

let lastError = '';

/** true = inserted; false = refused as a duplicate key (errno 1062). Anything else throws. */
async function insertReading(table: 'z_readings' | 'x_readings', terminalId: string, readingNumber: string): Promise<boolean> {
  try {
    await query(
      `INSERT INTO ${table} (reading_number, report_date, terminal_id) VALUES (?, NOW(), ?)`,
      [readingNumber, terminalId]
    );
    return true;
  } catch (e: any) {
    if (e.errno === 1062) {
      lastError = `errno 1062 ${e.sqlMessage}`;
      return false;
    }
    throw e;
  }
}

async function cleanup() {
  for (const table of ['z_readings', 'x_readings']) {
    await query(`DELETE FROM ${table} WHERE terminal_id IN (?, ?)`, [T1, T2]);
  }
  await query(`DELETE FROM pos_terminals WHERE id IN (?, ?)`, [T1, T2]);
}

async function main() {
  const mainRows: any = await query(`SELECT id FROM branches WHERE is_main = 1 LIMIT 1`);
  assert.ok(mainRows.length > 0, 'an is_main branch exists');
  const branchId: string = mainRows[0].id;

  try {
    for (const id of [T1, T2]) {
      await query(`INSERT INTO pos_terminals (id, name, branch_id) VALUES (?, ?, ?)`, [id, `unit test ${id}`, branchId]);
    }

    for (const [table, num] of [['z_readings', READING_Z], ['x_readings', READING_X]] as const) {
      // Two terminals, same day, same number: both must INSERT.
      assert.equal(await insertReading(table, T1, num), true, `${table}: terminal 1 inserts`);
      assert.equal(
        await insertReading(table, T2, num),
        true,
        `${table}: terminal 2 inserts the same number too (got ${lastError})`
      );
      // The same terminal reusing its own number is still a duplicate.
      assert.equal(await insertReading(table, T1, num), false, `${table}: same terminal is refused`);
    }
  } finally {
    await cleanup();
  }

  console.log('✓ reading-number-uniqueness');
}

// tests/unit/run.ts require()s each file and only catches SYNCHRONOUS throws,
// and other DB tests in the suite call process.exit(0) when THEY finish — which
// can land mid-way through a floating async test and skip its assertions while
// the run still exits 0. So the real work runs in a child process that this
// file waits on synchronously: a failure is thrown here, attributed to this
// file by the runner, and cannot be cut short by a sibling test.
if (process.env.READING_UNIQUENESS_CHILD === '1') {
  main().then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    }
  );
} else {
  const r = spawnSync(process.execPath, ['--import', 'tsx', __filename], {
    env: { ...process.env, READING_UNIQUENESS_CHILD: '1' },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`reading-number-uniqueness failed (exit ${r.status}):
${r.stdout}${r.stderr}`);
  }
  process.stdout.write(r.stdout);
}
