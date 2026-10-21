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
// Sta. Lucia claim section: distinct from READING_Z so the two sections never share a row.
const READING_CLAIM = 'Z-99991231-002';
const API_ID = `ut_rdg_api_${RUN}`;

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
  await query(`DELETE FROM sta_lucia_submissions WHERE terminal_id IN (?, ?)`, [T1, T2]);
  await query(`DELETE FROM sta_lucia_submissions WHERE z_reading_id = ?`, [READING_CLAIM]);
  await query(
    `DELETE FROM external_api_logs WHERE transaction_type = 'STA_LUCIA_SALES' AND (transaction_id LIKE ? OR transaction_id LIKE ? OR id IN (?, ?))`,
    [`${T1}|%`, `${T2}|%`, `ut_lg_u_${RUN}`, `ut_lg_a_${RUN}`]
  );
  await query(`DELETE FROM external_api_sessions WHERE api_id = ?`, [API_ID]);
  await query(`DELETE FROM external_apis WHERE id = ?`, [API_ID]);
  await query(`DROP TABLE IF EXISTS ut_sta_claims_${process.pid}`);
  await query(`DELETE FROM pos_terminals WHERE id IN (?, ?)`, [T1, T2]);
}

// The Sta. Lucia sender claims each Z-reading in sta_lucia_submissions before it
// posts to the mall. That claim used to be keyed on the bare reading_number, so
// once two terminals may legally share a number the second terminal's claim
// collided, was read as "already submitted", and that terminal's sales were
// silently never reported to the mall (mall rent is commonly a percentage of
// reported sales). The claim must be unique per (terminal, reading number).
async function staLuciaClaims() {
  const { claimZReading } = await import('../../lib/integrations/sta-lucia/send-z-reading');
  const claimFor = async (terminalId: string, readingNumber: string) =>
    (await claimZReading(terminalId, readingNumber)).claimed;

  assert.equal(await claimFor(T1, READING_CLAIM), true, 'claim: terminal 1 claims');
  assert.equal(
    await claimFor(T2, READING_CLAIM),
    true,
    'claim: terminal 2 claims the same number too, not "already submitted" (its sales would never reach the mall)'
  );
  // Negative cases: dropping the constraint altogether must not pass.
  assert.equal(await claimFor(T1, READING_CLAIM), false, 'claim: a repeat claim by terminal 1 is refused');
  assert.equal(await claimFor(T2, READING_CLAIM), false, 'claim: a repeat claim by terminal 2 is refused');

  // The Z-reading lookup must hand back the terminal that was asked for, never
  // whichever row LIMIT 1 happens to return, and must refuse to guess when the
  // bare number is shared. (READING_Z rows for T1 and T2 exist at this point.)
  const { resolveZReadingRow, zReadingRef } = await import('../../lib/integrations/sta-lucia/send-z-reading');
  for (const t of [T1, T2]) {
    const found = await resolveZReadingRow(zReadingRef(t, READING_Z));
    assert.equal(found.kind, 'found', `lookup: ${t} resolves`);
    assert.equal(found.kind === 'found' && found.row.terminal_id, t, `lookup: ${t}'s ref returns ${t}'s row, not the other terminal's`);
  }
  assert.equal((await resolveZReadingRow(READING_Z)).kind, 'ambiguous', 'lookup: a bare number shared by two terminals is ambiguous, not a guess');
  assert.equal((await resolveZReadingRow(zReadingRef(T1, 'Z-99991231-777'))).kind, 'missing', 'lookup: unknown reading is missing');

  // Stale takeover still works, and is scoped to the terminal that owns the claim.
  await query(
    `UPDATE sta_lucia_submissions SET claimed_at = NOW() - INTERVAL 20 MINUTE
      WHERE z_reading_id = ? AND terminal_id = ?`,
    [READING_CLAIM, T1]
  );
  assert.equal(await claimFor(T2, READING_CLAIM), false, 'claim: terminal 1 being stale does not free terminal 2');
  assert.equal(await claimFor(T1, READING_CLAIM), true, 'claim: terminal 1 retakes its own stale claim');
  assert.equal(await claimFor(T1, READING_CLAIM), false, 'claim: the retaken claim is fresh again');

  // A succeeded claim is never taken over, however old.
  await query(
    `UPDATE sta_lucia_submissions SET succeeded = 1, claimed_at = NOW() - INTERVAL 20 MINUTE
      WHERE z_reading_id = ? AND terminal_id = ?`,
    [READING_CLAIM, T2]
  );
  assert.equal(await claimFor(T2, READING_CLAIM), false, 'claim: a succeeded claim is not retaken');
}

// Terminal 1's SUCCESS log must not mask terminal 2's send. Before the log key was
// qualified, external_api_logs rows were keyed on the bare reading number, so the
// sender's "already succeeded" fast path answered "skipped" for terminal 2 before
// it ever reached the claim table - the same silent under-report one layer up.
// This drives the real sender against a local stand-in for the mall's API.
async function staLuciaSendsPerTerminal() {
  const http = await import('node:http');
  let sales = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/login') return void res.end(JSON.stringify({ status: 1, token: 't', owner_token: 'o' }));
      if (req.url === '/api/get-sales') { sales++; return void res.end(JSON.stringify({ ok: true })); }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  try {
    const port = (server.address() as any).port;
    await query(
      `INSERT INTO external_apis
         (id, name, description, enabled, api_endpoint, auth_type, allowed_methods,
          timeout, retry_attempts, retry_delay, sync_mode, on_error_action, role,
          provider, login_email, login_password)
       VALUES (?, 'ut sta lucia', '', 1, ?, 'none', 'send_only', 10000, 1, 500, 'realtime',
               'log_only', 'general', 'sta_lucia', 'tenant@example.com', 'secret')`,
      [API_ID, `http://127.0.0.1:${port}`]
    );
    const { sendZReadingToStaLucia, zReadingRef } = await import('../../lib/integrations/sta-lucia/send-z-reading');
    const ref1 = zReadingRef(T1, READING_Z);
    const ref2 = zReadingRef(T2, READING_Z);

    const r1 = await sendZReadingToStaLucia(ref1, API_ID);
    assert.equal(r1.success && !r1.skipped, true, `send: terminal 1 sends (${r1.error ?? ''})`);
    assert.equal(sales, 1, 'send: one submission reached the mall');

    const r2 = await sendZReadingToStaLucia(ref2, API_ID);
    assert.equal(
      r2.success && !r2.skipped,
      true,
      `send: terminal 1's success log must not mask terminal 2 - it would never be reported (${r2.error ?? 'skipped'})`
    );
    assert.equal(sales, 2, 'send: terminal 2 reached the mall too');

    const r1b = await sendZReadingToStaLucia(ref1, API_ID);
    assert.equal(r1b.skipped, true, 'send: a repeat for terminal 1 is skipped');
    assert.equal(sales, 2, 'send: the repeat did not reach the mall');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

// A pre-143 FAILED log row carries a bare reading number. Retried after another
// terminal files the same number it would be "ambiguous" forever, and no UI can
// supply a terminal. Migration 143 qualifies the unambiguous ones and leaves the
// genuinely ambiguous alone.
async function legacyLogKeysQualified() {
  const READING_UNIQUE = 'Z-99991231-003';
  await query(`INSERT INTO z_readings (reading_number, report_date, terminal_id) VALUES (?, NOW(), ?)`, [READING_UNIQUE, T1]);
  const seed = async (id: string, txn: string) =>
    query(
      `INSERT INTO external_api_logs (id, transaction_type, transaction_id, endpoint, payload, status, error_message, retry_count)
       VALUES (?, 'STA_LUCIA_SALES', ?, 'http://x/api/get-sales', '{}', 'failed', 'seeded', 0)`,
      [id, txn]
    );
  await seed(`ut_lg_u_${RUN}`, READING_UNIQUE);
  await seed(`ut_lg_a_${RUN}`, READING_Z);
  const { migration } = await import('../../scripts/migrations/143_per_terminal_sta_lucia_claim');
  await migration.up();
  await migration.up(); // idempotent
  const keyOf = async (id: string) => ((await query(`SELECT transaction_id FROM external_api_logs WHERE id = ?`, [id])) as any[])[0].transaction_id;
  assert.equal(await keyOf(`ut_lg_u_${RUN}`), `${T1}|${READING_UNIQUE}`, 'legacy: an unambiguous bare log key is qualified with its terminal');
  assert.equal(await keyOf(`ut_lg_a_${RUN}`), READING_Z, 'legacy: a bare key shared by two terminals is left alone, not guessed');
}

// The sender must not depend on migration 143 having run first: new code on an old
// table would otherwise throw "Unknown column terminal_id" before any log row
// exists, silently losing the submission. Runs on a scratch table in the legacy shape.
async function claimsSchemaSelfHeals() {
  const { ensureClaimsSchema, claimsPrimaryKey } = await import('../../lib/integrations/sta-lucia/claims-schema');
  const scratch = `ut_sta_claims_${process.pid}`;
  const num = 'Z-99991231-009';
  await query(`DROP TABLE IF EXISTS ${scratch}`);
  await query(`CREATE TABLE ${scratch} (z_reading_id VARCHAR(50) PRIMARY KEY, claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, succeeded TINYINT(1) NOT NULL DEFAULT 0)`);
  try {
    await query(`INSERT INTO ${scratch} (z_reading_id, succeeded) VALUES (?, 1)`, [num]);
    await query(`INSERT INTO z_readings (reading_number, report_date, terminal_id) VALUES (?, NOW(), ?)`, [num, T1]);
    const first = await ensureClaimsSchema(scratch);
    assert.deepEqual([first.addedColumn, first.swappedKey, first.backfilled], [true, true, 1], 'heal: legacy table gets the column, the key and a backfill');
    assert.deepEqual(await claimsPrimaryKey(scratch), ['terminal_id', 'z_reading_id'], 'heal: key is (terminal_id, z_reading_id)');
    const rows = (await query(`SELECT terminal_id, succeeded FROM ${scratch}`)) as any[];
    assert.deepEqual([rows[0].terminal_id, Number(rows[0].succeeded)], [T1, 1], 'heal: a legacy succeeded claim is backfilled to its terminal, not left at "" (that would re-send the day)');
    const second = await ensureClaimsSchema(scratch);
    assert.deepEqual([second.addedColumn, second.swappedKey, second.backfilled], [false, false, 0], 'heal: second run is a no-op');
    await Promise.all([ensureClaimsSchema(scratch), ensureClaimsSchema(scratch), ensureClaimsSchema(scratch)]);
    assert.deepEqual(await claimsPrimaryKey(scratch), ['terminal_id', 'z_reading_id'], 'heal: concurrent runs leave the key intact');
  } finally {
    await query(`DROP TABLE IF EXISTS ${scratch}`);
  }
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

    await staLuciaClaims();
    await staLuciaSendsPerTerminal();
    await legacyLogKeysQualified();
    await claimsSchemaSelfHeals();
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
