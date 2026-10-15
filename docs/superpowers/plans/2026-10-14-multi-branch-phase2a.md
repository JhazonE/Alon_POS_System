# Multi-Branch Phase 2a — Per-Branch BIR Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each BIR-registered branch its own SI/OR/MC invoice series so a second branch can be activated, and break the import cycle that makes the test suite unreliable.

**Architecture:** Scheduler startup moves out of `lib/mysql.ts` into a Next `instrumentation.ts` hook, breaking a module cycle. The three BIR counters move from the single global `transaction_references` row into a new per-branch `branch_number_series` table; the other fourteen counters stay where they are. `sales_transactions` and `pos_transactions` gain `branch_id` so the five global UNIQUE constraints on invoice numbers can become composite.

**Tech Stack:** Next.js 16 App Router, raw `mysql2/promise` via `lib/mysql.ts`, numbered TypeScript migrations under `scripts/migrations/`, Playwright E2E on port 3100 against `alon_pos_test`.

**Spec:** [docs/superpowers/specs/2026-10-14-multi-branch-phase2a-numbering-design.md](../specs/2026-10-14-multi-branch-phase2a-numbering-design.md)

**Builds on:** [Phase 1 outcome](2026-10-12-multi-branch-phase1-outcome.md) — read its "Load-bearing contracts" section before starting.

## Scope

Phase 2a of the five-phase multi-branch design. This plan delivers per-branch
BIR numbering, which is what makes activating a second branch legal.

**Explicitly NOT in this plan:**

- **The 29 write routes' branch isolation** — Phase 2b, its own spec. After
  2a a crafted write can still reach another branch's stock.
- **The scheduler single-writer lease** — Phase 3. Task 1 moves *where* the
  scheduler starts; it does not add a lease.
- **Inter-branch transfers, branch-scoped approvals** — Phase 4.
- **Reports, branch management UI, receipt identity** — Phase 5.
- **The nine internal document series** (sales order, purchase order, delivery
  receipt, etc.) and `receipt_number` — they stay company-wide. Do not touch
  `getNextReference()` or `getNextReceiptNumber()`.
- **`app/api/auth/signup/route.ts`** — already broken against this schema.

## Global Constraints

- **MySQL only, raw SQL.** No ORM. All queries go through `query()` /
  `withTransaction()` from `lib/mysql.ts`.
- **Migrations** are numbered TypeScript files in `scripts/migrations/`,
  exporting `const migration: Migration` with `up()` and `down()`, ending with
  `registerMigration(migration)`, and imported in `scripts/migrations/index.ts`.
  **Next free number is 135.** Follow `134_assign_users_to_branches.ts` as the
  current pattern.
- **Migrations must be idempotent on re-run** and have a working `down()`.
- **Never modify an applied migration.** Migrations 084, 085, 091 and 098
  touch these same columns; they are history and must stay untouched.
- **E2E tests run with `workers: 1`.** Never add parallelism.
- **Test descriptions are written in Cebuano**, matching existing specs. Code,
  identifiers and comments stay English.
- `npm run typecheck` must report **no errors from source directories**. Check
  with `npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"` —
  that must return nothing. (It currently also prints parse noise from the
  gitignored stale `.next-test/dev/types/validator.ts`; pre-existing, ignore.)
- **`npm run lint` is broken repo-wide** (`next lint` removed in Next 16) and
  is **waived** for this plan.
- **BIR numbers are legally significant.** A sequence must never gap, reset
  unintentionally, or re-issue a number. When in doubt, stop and escalate
  rather than guess.
- **Do NOT add a `Co-Authored-By: Claude` trailer.** Author as JhazonE.
- **A script importing `lib/mysql` never exits on its own**, so `npm run
  migrate` and any `tsx` one-liner may appear to hang and return exit 124 even
  on full success — **judge by database state, never by the exit code.**
  Verified 2026-10-14 (post-Task-1): a bare
  `tsx -e "query('SELECT 1')"` prints its result and still times out at
  exit 124. **The cause is the connection pool, not the schedulers.** Task 1
  stops the *schedulers* from starting on import — which removes the log noise
  that used to swallow a script's stdout — but nothing in the library closes
  the pool, so the event loop stays open regardless. Every verification
  one-liner must therefore still end with `process.exit(0)`.
  (An earlier draft of this constraint claimed scripts would exit normally
  after Task 1. That was wrong, and testing it is what found the stale
  comments in `scripts/dbq.ts` and `scripts/updater/run-migrate.ts`, whose
  force-exits are load-bearing for exactly this reason.)

## Review Focus

Five conditions the spec implies that no obvious task would exercise. Each
has its test pinned to the task that owns the code.

1. **A data reset must never leave a counter higher than the highest remaining
   invoice.** Both reset paths clear sales but one *truncates*
   `transaction_references`; if `branch_number_series` is not reset in step,
   the next sale re-issues an invoice number already on a filed BIR document.
   → Task 7.
2. **A failed sale must roll its invoice number back**, leaving no gap. The
   number is allocated on the transaction's connection precisely so this
   holds; a branch-scoped `UPDATE` must not break it. → Task 5.
3. **A training-mode sale must still burn no number from either series.**
   `checkout` deliberately skips allocation for training and service sales;
   adding a `branchId` parameter must not change which sales allocate. → Task 5.
4. **A branch with no `branch_number_series` row must fail closed**, not
   silently create one or fall back to the main branch's series — that would
   interleave two establishments' sequences. → Task 3.
5. **A sale with a NULL `terminal_id` must still get a branch** at backfill
   and at write time, or it becomes invisible to every branch user and
   under-reports a tax figure. → Task 4 and Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `instrumentation.ts` | New Next entry point; starts the scheduler once |
| `lib/mysql.ts` | Loses the `./init-scheduler` side-effect import |
| `lib/init-scheduler.ts` | **Deleted** — its `setImmediate` existed only to dodge the cycle |
| `scripts/migrations/135_create_branch_number_series.ts` | The per-branch counter table |
| `scripts/migrations/136_seed_branch_number_series.ts` | Main branch continues; others start at 0 |
| `scripts/migrations/137_add_branch_id_to_sales.ts` | Nullable `branch_id` on both sales tables |
| `scripts/migrations/138_backfill_sales_branch_id.ts` | From the terminal; NULL-terminal → main branch |
| `scripts/migrations/139_tighten_sales_branch_id.ts` | `NOT NULL` + FKs |
| `scripts/migrations/140_composite_bir_unique_keys.ts` | The five constraint swaps |
| `lib/mysql.ts` (counters) | `branchId` becomes a required parameter on three functions |
| `app/api/pos/checkout/route.ts` | Resolves its branch, passes it, stamps `branch_id` |
| `app/api/sales/returns/route.ts` | Same, for the MC series |
| `app/api/sales/transactions/route.ts` | Stamps `branch_id`; fixes the NULL-terminal gap |
| `app/api/data-management/reset/route.ts` | Resets `branch_number_series` in all three paths |
| `app/api/branches/route.ts` | Phase 1's inactive-branch guard removed |
| `tests/e2e/branch-numbering.spec.ts` | Per-branch sequence, constraint and reset tests |

---

### Task 1: Break the import cycle

This task comes first because every later task needs a trustworthy test suite.
Its acceptance test is that `branch-context.spec.ts` passes in a **full-suite**
run, which it currently does not.

**Files:**
- Create: `instrumentation.ts`
- Modify: `lib/mysql.ts` (remove line 10)
- Delete: `lib/init-scheduler.ts`

**Interfaces:**
- Consumes: `initScheduler()` from `lib/scheduler.ts` (already exported, `lib/scheduler.ts:565`).
- Produces: no new exports. The cycle `lib/mysql.ts → init-scheduler → scheduler → lib/mysql.ts` is gone.

- [ ] **Step 1: Confirm the failure exists before fixing it**

Run: `timeout 900 npx playwright test tests/e2e/auth.spec.ts tests/e2e/adjustment-expiration.spec.ts tests/e2e/branch-context.spec.ts --reporter=line`

Expected: FAIL. `branch-context.spec.ts` reports
`Error: Cannot require() ES Module .../lib/mysql.ts in a cycle (from .../lib/branch-context.ts)`.
The spec order matters — running `branch-context.spec.ts` alone passes 29/29,
which is exactly the bug. Record the output in your report.

- [ ] **Step 2: Create the instrumentation hook**

Create `instrumentation.ts` at the repo root:

```typescript
/**
 * Next.js instrumentation hook — the single place background workers start.
 *
 * This used to live in lib/mysql.ts as `import './init-scheduler'`, which
 * created a module cycle: mysql -> init-scheduler -> scheduler -> mysql.
 * Under Playwright's loader that cycle throws
 * "Cannot require() ES Module lib/mysql.ts in a cycle", and it also meant
 * every test worker, script and `tsx -e` one-liner that imported the DB
 * module silently booted cron jobs.
 *
 * register() runs once per server process, after the module graph is loaded,
 * so initScheduler() can query the database safely without the setImmediate
 * deferral the old init-scheduler.ts needed.
 *
 * NOTE: this starts one scheduler per server process. This project runs one
 * server per terminal against a shared DB, so a multi-terminal store still
 * runs N schedulers — the single-writer lease is Phase 3, not this change.
 */
export async function register(): Promise<void> {
  // Guard: only the Node.js runtime can run cron jobs and open DB pools.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { initScheduler } = await import('./lib/scheduler');
  initScheduler();
}
```

- [ ] **Step 3: Remove the side-effect import**

In `lib/mysql.ts`, delete line 10 entirely:

```typescript
import './init-scheduler';
```

Leave every other import and all pool code unchanged.

- [ ] **Step 4: Delete the obsolete shim**

```bash
git rm lib/init-scheduler.ts
```

Its `setImmediate(() => initScheduler())` wrapper existed only to work around
the temporal-dead-zone symptom of the cycle. With the cycle gone and startup
moved to `register()`, it is dead code. If anything else still imports it,
stop and report — nothing should.

- [ ] **Step 5: Verify nothing else imports the deleted file**

Run: `grep -rn "init-scheduler" --include="*.ts" --include="*.js" app/ lib/ src/ scripts/ tests/ main.js`
Expected: no output.

- [ ] **Step 6: Verify a script no longer boots the scheduler**

Run: `timeout 60 npx tsx -e "import {query} from './lib/mysql'; query('SELECT 1 AS ok').then(r=>{console.log('OK='+r[0].ok); process.exit(0)})"`

Expected: prints `OK=1` and **no** `Starting Sta Lucia hourly sales worker`,
`Starting background sync queue worker` or `Backup scheduler initialized`
lines. Before this task those three always appeared.

- [ ] **Step 7: Verify the dev server still starts the scheduler**

Run: `timeout 120 npx next dev -p 3102 > /tmp/t1srv.log 2>&1 &` then after the
server reports ready, `grep -E "Backup scheduler initialized|Starting background sync queue worker" /tmp/t1srv.log`

Expected: the scheduler lines ARE present — startup moved, it did not
disappear. Then stop that server.

- [ ] **Step 8: Verify the original failure is fixed**

Run: `timeout 900 npx playwright test tests/e2e/auth.spec.ts tests/e2e/adjustment-expiration.spec.ts tests/e2e/branch-context.spec.ts --reporter=line`

Expected: PASS, with no "in a cycle" error.

- [ ] **Step 9: Typecheck and commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
git add instrumentation.ts lib/mysql.ts
git rm lib/init-scheduler.ts
git commit -m "fix(scheduler): start the scheduler from instrumentation, breaking the mysql import cycle"
```

---

### Task 2: Create and seed `branch_number_series`

Combined into one task: an empty counter table is not an independently useful
deliverable, and a reviewer would judge the table and its seeding together.

**Files:**
- Create: `scripts/migrations/135_create_branch_number_series.ts`
- Create: `scripts/migrations/136_seed_branch_number_series.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Consumes: `branches` table (Phase 1, migration 130); `transaction_references` current values.
- Produces: table `branch_number_series` with `branch_id VARCHAR(50) PK`, `si_number`/`mc_number`/`bir_or_number` `VARCHAR(20) NOT NULL DEFAULT '000000'`, timestamps, FK to `branches(id)` `ON DELETE RESTRICT`. The `is_main` branch's row carries the values previously in `transaction_references`.

- [ ] **Step 1: Write the table migration**

Create `scripts/migrations/135_create_branch_number_series.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Per-branch BIR invoice counters.
 *
 * Each branch is its own BIR-registered establishment and must file a
 * gapless series of its own, so SI / OR / MC counters cannot live in the
 * single global transaction_references row.
 *
 * A separate table rather than re-keying transaction_references: that table
 * holds 17 counters and 14 of them stay company-wide (sales orders, purchase
 * orders, delivery receipts, receipt_number). Splitting out only the three
 * series BIR cares about makes the legal boundary explicit and leaves
 * getNextReference()'s nine series untouched.
 *
 * ON DELETE RESTRICT: a branch's issued invoice series must not disappear
 * with the branch row.
 */
export const migration: Migration = {
  name: '135_create_branch_number_series',
  timestamp: '2026-10-14_10-00-00',

  async up() {
    console.log('Running migration: 135_create_branch_number_series');
    await query(`
      CREATE TABLE IF NOT EXISTS branch_number_series (
        branch_id VARCHAR(50) NOT NULL,
        si_number VARCHAR(20) NOT NULL DEFAULT '000000',
        mc_number VARCHAR(20) NOT NULL DEFAULT '000000',
        bir_or_number VARCHAR(20) NOT NULL DEFAULT '000000',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (branch_id),
        CONSTRAINT fk_bns_branch FOREIGN KEY (branch_id)
          REFERENCES branches (id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ Created branch_number_series');
  },

  async down() {
    console.log('Rolling back migration: 135_create_branch_number_series');
    await query(`DROP TABLE IF EXISTS branch_number_series`);
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Write the seeding migration**

Create `scripts/migrations/136_seed_branch_number_series.ts`:

```typescript
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
```

- [ ] **Step 3: Register both migrations**

In `scripts/migrations/index.ts`, after the
`'./134_assign_users_to_branches'` line:

```typescript
import './135_create_branch_number_series';
import './136_seed_branch_number_series';
```

- [ ] **Step 4: Record the pre-migration counter values**

Before running the migration, capture what the main branch must continue from:

Run: `timeout 60 npx tsx -e "import {query} from './lib/mysql'; query('SELECT si_number,mc_number,bir_or_number FROM transaction_references WHERE id=1').then(r=>{console.log('BEFORE='+JSON.stringify(r[0])); process.exit(0)})"`

Write the output into your report — Step 6 compares against it.

- [ ] **Step 5: Run the migrations**

Run: `npm run migrate`
Expected: `✅ Created branch_number_series`, then
`✅ Main branch <id> continues at si=... mc=... or=...`.

- [ ] **Step 6: Verify the main branch continued, not reset**

Run: `timeout 60 npx tsx -e "import {query} from './lib/mysql'; query('SELECT b.code,s.si_number,s.mc_number,s.bir_or_number FROM branch_number_series s JOIN branches b ON b.id=s.branch_id').then(r=>{console.log('AFTER='+JSON.stringify(r)); process.exit(0)})"`

Expected: the MAIN row's three values **exactly equal** the `BEFORE` values
from Step 4. If they differ, the sequence was reset — stop and escalate.

- [ ] **Step 7: Verify idempotency and rollback**

Run: `npm run migrate` again (136 is already recorded, so it is skipped), then
`npm run migrate:down` and `npm run migrate`.
Expected: exit without error; after the final run the MAIN values again equal
`BEFORE`.

- [ ] **Step 8: Verify a branch with a series row cannot be deleted**

Run: `timeout 60 npx tsx -e "import {query} from './lib/mysql'; query('SELECT branch_id FROM branch_number_series LIMIT 1').then(async b=>{try{await query('DELETE FROM branches WHERE id=?',[b[0].branch_id]); console.log('UNEXPECTED: delete succeeded')}catch(e:any){console.log('OK rejected: '+e.code)} process.exit(0)})"`

Expected: `OK rejected: ER_ROW_IS_REFERENCED_2`.

- [ ] **Step 9: Typecheck and commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
git add scripts/migrations/135_create_branch_number_series.ts scripts/migrations/136_seed_branch_number_series.ts scripts/migrations/index.ts
git commit -m "feat(branches): add per-branch BIR number series table"
```

---

### Task 3: Make the counter functions branch-scoped

**Files:**
- Modify: `lib/mysql.ts:248` (`getNextSINumber`), `:275` (`getNextMCNumber`), `:304` (`getNextBirOrNumber`)
- Create: `tests/e2e/branch-numbering.spec.ts`

**Interfaces:**
- Consumes: `branch_number_series` from Task 2.
- Produces:
  - `getNextSINumber(branchId: string, connection?: mysql.PoolConnection): Promise<string>`
  - `getNextMCNumber(branchId: string, connection?: mysql.PoolConnection): Promise<string>`
  - `getNextBirOrNumber(branchId: string, connection?: mysql.PoolConnection): Promise<string>`
  - All three throw `Error` when the branch has no `branch_number_series` row.

`branchId` is the **first, required** parameter so every call site fails
typecheck. Do not give it a default.

- [ ] **Step 1: Write the failing tests**

Create `tests/e2e/branch-numbering.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { getNextSINumber, getNextMCNumber, getNextBirOrNumber } from '../../lib/mysql';
import { seedSecondBranch, cleanupSecondBranch } from './helpers/branches';

/**
 * Pure nga tests — walay `page` fixture. Kada branch kay kaugalingong BIR
 * series: dili mag-sagol, dili mag-gap.
 */
test.describe('per-branch BIR counters', () => {
  test('ang duha ka branch adunay independent nga SI series', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    const b = await seedSecondBranch({ withNumberSeries: true });
    try {
      const a1 = await getNextSINumber(a.branchId);
      const b1 = await getNextSINumber(b.branchId);
      const a2 = await getNextSINumber(a.branchId);

      expect(a1).toBe('000001');
      expect(b1).toBe('000001'); // parehas nga numero, lain nga branch
      expect(a2).toBe('000002'); // wala na-apektuhan sa branch B
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('walay gap ang series sa sunod-sunod nga pag-issue', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    try {
      const nums: string[] = [];
      for (let i = 0; i < 5; i++) nums.push(await getNextSINumber(a.branchId));
      expect(nums).toEqual(['000001', '000002', '000003', '000004', '000005']);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('ang MC ug OR series kay independent sab per branch', async () => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    const b = await seedSecondBranch({ withNumberSeries: true });
    try {
      expect(await getNextMCNumber(a.branchId)).toBe('MC-000001');
      expect(await getNextMCNumber(b.branchId)).toBe('MC-000001');
      expect(await getNextBirOrNumber(a.branchId)).toBe('OR-000001');
      expect(await getNextBirOrNumber(b.branchId)).toBe('OR-000001');
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('mo-fail closed ang branch nga walay series row — dili mo-fallback sa main', async () => {
    const a = await seedSecondBranch({ withNumberSeries: false });
    try {
      await expect(getNextSINumber(a.branchId)).rejects.toThrow(
        /no number series/i
      );
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('mo-fail closed sa wala-kaila nga branch id', async () => {
    await expect(getNextSINumber('does-not-exist')).rejects.toThrow(
      /no number series/i
    );
  });
});
```

- [ ] **Step 2: Extend the test helper**

In `tests/e2e/helpers/branches.ts`, add `withNumberSeries` to `SeedOptions`:

```typescript
  /** Mo-himo ug branch_number_series row para niining branch (default: true). */
  withNumberSeries?: boolean;
```

Then, inside `seedSecondBranch`, after the `INSERT INTO branches` statement:

```typescript
    if (opts.withNumberSeries !== false) {
      await conn.query(
        `INSERT INTO branch_number_series (branch_id) VALUES (?)`,
        [branchId]
      );
    }
```

And in `cleanupSecondBranch`, add this line immediately **before** the
`DELETE FROM branches` line (the FK is `ON DELETE RESTRICT`, so the series row
must go first):

```typescript
    await conn.query('DELETE FROM branch_number_series WHERE branch_id = ?', [seeded.branchId]);
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts --reporter=line`
Expected: FAIL — `getNextSINumber` currently takes `(connection?)`, so passing
a branch id is a type error and the values come from the global row.

- [ ] **Step 4: Rewrite the three counter functions**

In `lib/mysql.ts`, replace `getNextSINumber` with:

```typescript
/**
 * Atomically gets and increments a branch's next SI Number.
 *
 * Each branch is a separately BIR-registered establishment with its own
 * gapless series, so the counter lives in branch_number_series, not in the
 * single global transaction_references row.
 *
 * branchId is required and first: every call site must state which
 * establishment is issuing the invoice. There is deliberately no default —
 * defaulting would silently interleave two branches' filed sequences.
 *
 * Pass the SAME connection as the inserting statement so the number rolls
 * back with a failed transaction; a swallowed number is a gap in a filed
 * series.
 *
 * @returns The next SI number (plain sequential digits, e.g. "001234")
 */
export async function getNextSINumber(
  branchId: string,
  connection?: mysql.PoolConnection
): Promise<string> {
  return await onConnection(connection, async (connection) => {
    const [res]: any = await connection.query(
      `UPDATE branch_number_series
       SET si_number = LPAD(IF(si_number IS NULL OR si_number = '', 0, CAST(si_number AS UNSIGNED)) + 1, 6, '0')
       WHERE branch_id = ?`,
      [branchId]
    );
    if (!res || res.affectedRows === 0) {
      throw new Error(`Branch ${branchId} has no number series row`);
    }

    const [rows]: any = await connection.query(
      `SELECT si_number as next_val FROM branch_number_series WHERE branch_id = ?`,
      [branchId]
    );
    if (!rows || rows.length === 0) {
      throw new Error(`Failed to fetch next SI number for branch ${branchId}`);
    }
    return String(rows[0].next_val);
  });
}
```

Apply the identical shape to `getNextMCNumber` (column `mc_number`, returns
`` `MC-${...}` ``) and `getNextBirOrNumber` (column `bir_or_number`, returns
`` `OR-${...}` ``), each keeping its existing doc comment's explanation of what
the number is for and adding the branch note. Keep the `MC-` and `OR-`
prefixes exactly as they are — other code parses them.

The `affectedRows === 0` check is what makes a missing series row fail closed
instead of silently succeeding.

- [ ] **Step 5: Run tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts --reporter=line`
Expected: PASS, 5 tests.

- [ ] **Step 6: Confirm the other counters were NOT changed**

Run: `git diff lib/mysql.ts | grep -E "^[+-].*(getNextReference|getNextReceiptNumber|getNextXReadingNumber|getNextZReadingNumber)"`
Expected: no output. Those four stay company-wide or per-terminal.

- [ ] **Step 7: Typecheck — expect call-site errors, and list them**

Run: `npm run typecheck 2>&1 | grep -E "^(app|lib|src)/"`
Expected: errors at the three call sites (`app/api/pos/checkout/route.ts` ×2,
`app/api/sales/returns/route.ts` ×1). This is intended — Task 5 fixes them.
Record the exact list in your report; if any OTHER file appears, stop and
report it, because the audit said there were only three.

- [ ] **Step 8: Commit**

Committing with known call-site type errors is deliberate here: the signature
change and its call-site fixes are separate reviewable units, and Task 5
closes them immediately.

```bash
git add lib/mysql.ts tests/e2e/branch-numbering.spec.ts tests/e2e/helpers/branches.ts
git commit -m "feat(branches): scope the SI, MC and OR counters to a branch"
```

---

### Task 4: Add and backfill `branch_id` on the sales tables

**Files:**
- Create: `scripts/migrations/137_add_branch_id_to_sales.ts`
- Create: `scripts/migrations/138_backfill_sales_branch_id.ts`
- Create: `scripts/migrations/139_tighten_sales_branch_id.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Consumes: `pos_terminals.branch_id` (Phase 1), `branches.is_main`.
- Produces: `sales_transactions.branch_id` and `pos_transactions.branch_id`, both `VARCHAR(50) NOT NULL` with FK to `branches(id)` `ON DELETE RESTRICT`, fully backfilled.

- [ ] **Step 1: Write the column migration**

Create `scripts/migrations/137_add_branch_id_to_sales.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Add branch_id to the two sale tables.
 *
 * Phase 1 derived a sale's branch through pos_terminals.branch_id. Storing it
 * on the sale instead means a terminal later reassigned to another branch
 * cannot retroactively move its past sales to a different BIR establishment,
 * and it is what the composite (branch_id, si_number) unique keys need.
 *
 * Nullable here; 138 backfills and 139 tightens.
 */
const TABLES = ['sales_transactions', 'pos_transactions'];

export const migration: Migration = {
  name: '137_add_branch_id_to_sales',
  timestamp: '2026-10-14_10-20-00',

  async up() {
    console.log('Running migration: 137_add_branch_id_to_sales');
    for (const table of TABLES) {
      try {
        await query(`ALTER TABLE \`${table}\` ADD COLUMN branch_id VARCHAR(50) NULL DEFAULT NULL`);
        console.log(`✅ Added branch_id to ${table}`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_COLUMN_NAME' || e.errno === 1060) {
          console.log(`⚠️ Column branch_id already exists in ${table}`);
        } else {
          throw e;
        }
      }
      try {
        await query(`CREATE INDEX idx_${table}_branch_id ON \`${table}\` (branch_id)`);
        console.log(`✅ Indexed ${table}.branch_id`);
      } catch (e: any) {
        if (e.code === 'ER_DUP_KEYNAME' || e.errno === 1061) {
          console.log(`⚠️ Index idx_${table}_branch_id already exists`);
        } else {
          throw e;
        }
      }
    }
  },

  async down() {
    console.log('Rolling back migration: 137_add_branch_id_to_sales');
    for (const table of TABLES) {
      await query(`ALTER TABLE \`${table}\` DROP COLUMN branch_id`);
    }
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Write the backfill migration**

Create `scripts/migrations/138_backfill_sales_branch_id.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { query, withTransaction } from '../../lib/mysql';

/**
 * Backfill each sale's branch from the terminal that rang it.
 *
 * Sales with a NULL terminal_id get the main branch. That path exists
 * because app/api/sales/transactions inserts `terminalId || null`, so
 * historical non-POS sales have no terminal to derive from. On a
 * single-store installation the main branch is factually where they were
 * rung, and leaving them NULL would both block 139's NOT NULL tightening and
 * hide them from every branch user — under-reporting a tax figure.
 *
 * Idempotent: only NULL branch_id rows are touched.
 */
export const migration: Migration = {
  name: '138_backfill_sales_branch_id',
  timestamp: '2026-10-14_10-30-00',

  async up() {
    console.log('Running migration: 138_backfill_sales_branch_id');

    await withTransaction(async (connection) => {
      const [main]: any = await connection.query(
        `SELECT id FROM branches WHERE is_main = 1 LIMIT 1`
      );
      if (main.length === 0) {
        throw new Error('Cannot backfill: no is_main branch exists.');
      }
      const mainId = main[0].id;

      // pos_transactions carries terminal_id directly.
      const [pt]: any = await connection.query(
        `UPDATE pos_transactions p
         JOIN pos_terminals t ON t.id = p.terminal_id
         SET p.branch_id = t.branch_id
         WHERE p.branch_id IS NULL AND p.terminal_id IS NOT NULL`
      );
      console.log(`✅ pos_transactions from terminal: ${pt.affectedRows}`);

      // sales_transactions reaches a terminal through its pos_transactions row.
      const [st]: any = await connection.query(
        `UPDATE sales_transactions s
         JOIN pos_transactions p ON p.sale_id = s.id
         JOIN pos_terminals t ON t.id = p.terminal_id
         SET s.branch_id = t.branch_id
         WHERE s.branch_id IS NULL AND p.terminal_id IS NOT NULL`
      );
      console.log(`✅ sales_transactions from terminal: ${st.affectedRows}`);

      const [ptMain]: any = await connection.query(
        `UPDATE pos_transactions SET branch_id = ? WHERE branch_id IS NULL`,
        [mainId]
      );
      const [stMain]: any = await connection.query(
        `UPDATE sales_transactions SET branch_id = ? WHERE branch_id IS NULL`,
        [mainId]
      );
      console.log(
        `✅ NULL-terminal fallback to main branch: ` +
        `${ptMain.affectedRows} pos_transactions, ${stMain.affectedRows} sales_transactions`
      );
    });
  },

  async down() {
    console.log('Rolling back migration: 138_backfill_sales_branch_id');
    await query(`UPDATE pos_transactions SET branch_id = NULL`);
    await query(`UPDATE sales_transactions SET branch_id = NULL`);
  }
};

registerMigration(migration);
```

- [ ] **Step 3: Write the tightening migration**

Create `scripts/migrations/139_tighten_sales_branch_id.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Tighten the sale tables' branch_id to NOT NULL with a foreign key.
 *
 * Guarded: aborts with a message naming the table if any row is still NULL,
 * rather than letting MySQL coerce NULLs to ''. A sale with no branch cannot
 * be filed under any establishment.
 *
 * ON DELETE RESTRICT: deleting a branch must never orphan or remove its
 * filed sales.
 */
const TABLES = ['sales_transactions', 'pos_transactions'];

export const migration: Migration = {
  name: '139_tighten_sales_branch_id',
  timestamp: '2026-10-14_10-40-00',

  async up() {
    console.log('Running migration: 139_tighten_sales_branch_id');

    for (const table of TABLES) {
      const rows: any = await query(
        `SELECT COUNT(*) AS c FROM \`${table}\` WHERE branch_id IS NULL`
      );
      if (rows[0].c > 0) {
        throw new Error(
          `Cannot tighten ${table}.branch_id: ${rows[0].c} row(s) still NULL. ` +
          `Run migration 138_backfill_sales_branch_id first.`
        );
      }
      await query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN branch_id VARCHAR(50) NOT NULL`
      );
      console.log(`✅ ${table}.branch_id is NOT NULL`);

      const name = `fk_${table}_branch`;
      try {
        await query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\`
             FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE RESTRICT`
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
    console.log('Rolling back migration: 139_tighten_sales_branch_id');
    for (const table of TABLES) {
      try {
        await query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`fk_${table}_branch\``);
      } catch (e: any) {
        if (e.errno !== 1091) throw e;
      }
      await query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN branch_id VARCHAR(50) NULL DEFAULT NULL`
      );
    }
  }
};

registerMigration(migration);
```

- [ ] **Step 4: Register all three migrations**

In `scripts/migrations/index.ts`, after the
`'./136_seed_branch_number_series'` line:

```typescript
import './137_add_branch_id_to_sales';
import './138_backfill_sales_branch_id';
import './139_tighten_sales_branch_id';
```

- [ ] **Step 5: Run the migrations**

Run: `npm run migrate`
Expected: the `✅` lines from all three, with the NULL-terminal fallback count
reported separately from the terminal-derived counts.

- [ ] **Step 6: Verify no sale is left without a branch**

Run: `timeout 60 npx tsx -e "import {query} from './lib/mysql'; Promise.all([query('SELECT COUNT(*) c FROM sales_transactions WHERE branch_id IS NULL'),query('SELECT COUNT(*) c FROM pos_transactions WHERE branch_id IS NULL')]).then(r=>{console.log('orphanSales='+r[0][0].c+' orphanPos='+r[1][0].c); process.exit(0)}).catch(e=>{console.log('ERR '+e.message); process.exit(1)})"`

Expected: `orphanSales=0 orphanPos=0`.

- [ ] **Step 7: Verify rollback**

Run: `npm run migrate:down` then `npm run migrate`.
Expected: both succeed; Step 6's check still reports zero orphans afterwards.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
git add scripts/migrations/137_add_branch_id_to_sales.ts scripts/migrations/138_backfill_sales_branch_id.ts scripts/migrations/139_tighten_sales_branch_id.ts scripts/migrations/index.ts
git commit -m "feat(branches): stamp branch_id on the sale tables"
```

---

### Task 5: Pass the branch at the three counter call sites

**Files:**
- Modify: `app/api/pos/checkout/route.ts:161-162`
- Modify: `app/api/sales/returns/route.ts:35`
- Modify: `tests/e2e/branch-numbering.spec.ts`

**Interfaces:**
- Consumes: `getNextSINumber(branchId, connection)`, `getNextMCNumber(branchId, connection)`, `getNextBirOrNumber(branchId, connection)` from Task 3; `resolveTerminalBranch(terminalId)` from Phase 1's `lib/branch-context.ts`.
- Produces: no new exports. Both routes stamp `branch_id` on the rows they insert.

**The ordering constraint that matters:** both call sites run inside
`withTransaction` and pass `connection`. `resolveTerminalBranch` uses the
pool, so calling it *inside* the transaction takes a second connection and can
deadlock — Phase 1 hit exactly this in `POST /api/users`. Resolve the branch
**before** `withTransaction` opens and pass the id in.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/branch-numbering.spec.ts`:

```typescript
import { seedProductInWarehouse } from './helpers/branches';

test.describe('POST /api/pos/checkout — per-branch SI', () => {
  test('ang checkout sa branch A mo-gamit sa series sa branch A', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    try {
      const sku = `NUM-A-${Date.now()}`;
      const productId = await seedProductInWarehouse(a.warehouseId, sku);

      const res = await request.post('/api/pos/checkout', {
        data: {
          terminalId: a.terminalId,
          userId: a.userUid,
          items: [{ productId, quantity: 1, price: 1.0 }],
          paymentMethod: 'CASH',
          amountPaid: 1.0,
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      // Unang invoice sa bag-ong branch kay 000001.
      expect(body.siNumber ?? body.data?.siNumber).toBe('000001');
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang checkout sa terminal nga walay branch series', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: false });
    try {
      const sku = `NUM-B-${Date.now()}`;
      const productId = await seedProductInWarehouse(a.warehouseId, sku);
      const res = await request.post('/api/pos/checkout', {
        data: {
          terminalId: a.terminalId,
          userId: a.userUid,
          items: [{ productId, quantity: 1, price: 1.0 }],
          paymentMethod: 'CASH',
          amountPaid: 1.0,
        },
      });
      // Mo-fail, dili mo-fallback sa series sa main branch.
      expect(res.ok()).toBeFalsy();
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});
```

If the checkout response does not expose the SI number under either key,
read it back from `sales_transactions` by the returned sale id instead, and
say so in your report.

- [ ] **Step 2: Run tests to verify they fail**

Run: `timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts --reporter=line`
Expected: FAIL — checkout does not compile (Task 3 changed the signature).

- [ ] **Step 3: Fix the checkout route**

In `app/api/pos/checkout/route.ts`, add the import:

```typescript
import { resolveTerminalBranch } from '@/lib/branch-context';
```

Immediately **before** the `return await withTransaction(async (connection) => {`
line (around line 128), resolve the branch:

```typescript
    // Resolve the branch OUTSIDE the transaction: resolveTerminalBranch uses
    // the pool, and taking a second connection while the transaction's own
    // connection is held risks a deadlock.
    const { branchId: saleBranchId } = await resolveTerminalBranch(terminalId);
```

Then change lines 161-162 to pass it, leaving the training-mode and
service-sale conditions exactly as they are:

```typescript
      const siNumber = (isTrainingMode || isServiceSale) ? null : await getNextSINumber(saleBranchId, connection);
      const birOrNumber = (isTrainingMode || !isServiceSale) ? null : await getNextBirOrNumber(saleBranchId, connection);
```

Finally, add `branch_id` to the `INSERT INTO sales_transactions` and
`INSERT INTO pos_transactions` statements in this route, supplying
`saleBranchId`. Read each statement's full column list first and keep the
placeholder count aligned with the value array — Phase 1 found this is where
a positional-parameter mistake hides.

- [ ] **Step 4: Fix the returns route**

In `app/api/sales/returns/route.ts`, add the same import. Resolve the branch
before its `withTransaction` opens, preferring the originating sale's branch
and falling back to the terminal:

```typescript
    // The credit belongs to the establishment that made the original sale.
    const originRows: any = await query(
      'SELECT branch_id FROM sales_transactions WHERE id = ?',
      [saleId]
    );
    const returnBranchId: string = originRows?.[0]?.branch_id
      ?? (await resolveTerminalBranch(terminalId)).branchId;
```

Then change line 35:

```typescript
      const mcNumber = await getNextMCNumber(returnBranchId, connection);
```

And add `branch_id` to this route's `INSERT INTO pos_transactions`, supplying
`returnBranchId`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts --reporter=line`
Expected: PASS, 7 tests.

- [ ] **Step 6: Verify training-mode sales still burn no number**

Run: `timeout 540 npx playwright test tests/e2e/pos-checkout.spec.ts --reporter=line`
(If that spec name does not exist, run the POS specs you find with
`ls tests/e2e | grep pos` and name them in your report.)
Expected: PASS. Training-mode and service-sale behaviour is unchanged — the
`? :` conditions were not touched.

- [ ] **Step 7: Verify a failed sale leaves no gap**

Run: `timeout 60 npx tsx -e "import {query,withTransaction,getNextSINumber} from './lib/mysql'; (async()=>{const b:any=await query('SELECT branch_id FROM branch_number_series LIMIT 1'); const id=b[0].branch_id; const before:any=await query('SELECT si_number FROM branch_number_series WHERE branch_id=?',[id]); try{await withTransaction(async(c)=>{await getNextSINumber(id,c); throw new Error('forced rollback')})}catch{} const after:any=await query('SELECT si_number FROM branch_number_series WHERE branch_id=?',[id]); console.log('before='+before[0].si_number+' after='+after[0].si_number+' rolledBack='+(before[0].si_number===after[0].si_number)); process.exit(0)})()"`

Expected: `rolledBack=true` — the number returns to its pre-transaction value,
so a failed sale leaves no gap in the filed series.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
git add app/api/pos/checkout/route.ts app/api/sales/returns/route.ts tests/e2e/branch-numbering.spec.ts
git commit -m "feat(branches): issue invoice numbers from the selling branch's series"
```

---

### Task 6: Stamp `branch_id` on the non-POS sale path

**Files:**
- Modify: `app/api/sales/transactions/route.ts` (the insert around line 513)
- Modify: `tests/e2e/branch-numbering.spec.ts`

**Interfaces:**
- Consumes: `resolveTerminalBranch`, `mainBranchId` from `lib/branch-context.ts`.
- Produces: no new exports. New sales from this route always carry a `branch_id`.

- [ ] **Step 1: Read the current insert**

Run: `sed -n '495,525p' app/api/sales/transactions/route.ts`
Confirm the `terminalId || null` value at line 513 and note the full column
list of the `INSERT INTO sales_transactions` statement it belongs to.

- [ ] **Step 2: Write the failing test**

Append to `tests/e2e/branch-numbering.spec.ts`:

```typescript
test.describe('POST /api/sales/transactions — branch stamping', () => {
  test('ang sale nga walay terminal mo-landing gihapon sa usa ka branch', async ({ request }) => {
    const a = await seedSecondBranch({ withNumberSeries: true });
    try {
      const sku = `NUM-C-${Date.now()}`;
      const productId = await seedProductInWarehouse(a.warehouseId, sku);

      const res = await request.post('/api/sales/transactions', {
        data: {
          // Walay terminalId — mao ni ang path nga naghimo ug NULL terminal_id.
          userId: a.userUid,
          items: [{ productId, quantity: 1, price: 1.0 }],
          paymentMethod: 'CASH',
          amountPaid: 1.0,
        },
      });

      if (res.ok()) {
        const body = await res.json();
        const saleId = body.saleId ?? body.data?.id ?? body.id;
        expect(saleId).toBeTruthy();
        // Bisan walay terminal, kinahanglan naay branch_id — kon NULL,
        // mawala ni sa tanan branch user ug maka-under-report sa buhis.
        const { readSaleBranch } = await import('./helpers/branches');
        expect(await readSaleBranch(String(saleId))).toBeTruthy();
      } else {
        // Kon gi-reject ang walay-terminal nga sale, mao sab na OK —
        // ang importante kay walay sale nga naka-NULL branch.
        expect(res.status()).toBeGreaterThanOrEqual(400);
      }
    } finally {
      await cleanupSecondBranch(a);
    }
  });
});
```

- [ ] **Step 3: Add the helper the test needs**

Append to `tests/e2e/helpers/branches.ts`:

```typescript
/** Mo-uli sa branch_id sa usa ka sale, o null kon wala. */
export async function readSaleBranch(saleId: string): Promise<string | null> {
  const conn = await getConn();
  try {
    const [rows]: any = await conn.query(
      'SELECT branch_id FROM sales_transactions WHERE id = ?',
      [saleId]
    );
    return rows[0]?.branch_id ?? null;
  } finally {
    await conn.end();
  }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts -g "walay terminal" --reporter=line`
Expected: FAIL — the insert supplies no `branch_id`, and after migration 139
the column is `NOT NULL`, so the insert errors.

- [ ] **Step 5: Stamp the branch**

In `app/api/sales/transactions/route.ts`, add:

```typescript
import { resolveTerminalBranch, mainBranchId } from '@/lib/branch-context';
```

Before the insert's transaction opens, resolve a branch, preferring the
terminal and falling back to the main branch:

```typescript
    // A sale must always belong to an establishment. This route accepts a
    // sale with no terminal (terminalId || null below), so fall back to the
    // main branch rather than writing a branchless sale — a NULL branch_id
    // sale is invisible to every branch user and under-reports a tax figure.
    const saleBranchId: string = terminalId
      ? (await resolveTerminalBranch(terminalId)).branchId
      : await mainBranchId();
```

Add `branch_id` to the `INSERT INTO sales_transactions` column list and
`saleBranchId` to its value array, keeping the placeholder count aligned.
Leave the `terminalId || null` value itself as it is — this task gives the
sale a branch, it does not change terminal handling.

- [ ] **Step 6: Run the test to verify it passes**

Run: `timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts --reporter=line`
Expected: PASS, 8 tests.

- [ ] **Step 7: Sweep for any other sale insert**

Run:
```bash
grep -rnE "INSERT INTO (sales_transactions|pos_transactions)" \
  --include="*.ts" --include="*.js" . 2>/dev/null \
  | grep -v node_modules | grep -v "scripts/migrations" | grep -v "\.next"
```

**Search the whole repo, not just `app/ lib/ src/`, and include `.js`.** An
earlier draft of this step searched only those three directories for `.ts`
files and missed four real sites: two in `tests/`, two in `scripts/`, and
`seed_sales_data.js` at the **repo root**. This repo keeps **112 loose
`.ts`/`.js` utilities at the top level**, so a directory-scoped sweep is
never sufficient here. `scripts/migrations/` is excluded because applied
migrations are history and must not be edited.
Every site found must supply `branch_id`. List them all in your report with
their status — Phase 1 learned that a missed insert path fails only at
runtime.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
git add app/api/sales/transactions/route.ts tests/e2e/branch-numbering.spec.ts tests/e2e/helpers/branches.ts
git commit -m "feat(branches): stamp a branch on sales created without a terminal"
```

---

### Task 7: Make all three data-reset paths reset the new series

**This is the most BIR-dangerous task in the plan.** A reset that clears the
sales tables but leaves `branch_number_series` advanced will re-issue invoice
numbers that already appear on filed documents.

**Files:**
- Modify: `app/api/data-management/reset/route.ts:56` and `:287`
- Modify: `tests/e2e/branch-numbering.spec.ts`

**Interfaces:**
- Consumes: `branch_number_series` from Task 2.
- Produces: no new exports. Both reset paths zero the per-branch series.

- [ ] **Step 1: Read all THREE reset paths**

The route dispatches on `body.action`, with five values: `clear_sales`,
`reset_references`, `clear_inventory`, `clear_master_data`, `factory_reset`.
**Three of them touch the BIR counters** (verified 2026-10-14):

| Action | Line | Mechanic |
|---|---|---|
| `clear_sales` | ~56 | `UPDATE transaction_references SET si_number = '000000' WHERE id = 1` |
| `reset_references` | ~68 | `TRUNCATE TABLE transaction_references` + re-seeding `INSERT` |
| `factory_reset` | ~287 | `TRUNCATE TABLE transaction_references` + re-seeding `INSERT` |

Run: `sed -n '50,60p;66,80p;283,296p' app/api/data-management/reset/route.ts`
and confirm all three before editing. All three need the same addition; the
two `TRUNCATE` paths are the dangerous ones, because truncating
`transaction_references` leaves `branch_number_series` completely untouched.

- [ ] **Step 2: Write the failing tests**

Append to `tests/e2e/branch-numbering.spec.ts`:

```typescript
test.describe('data reset — ang series kinahanglan mo-reset sab', () => {
  // Ang tulo ka action nga naghilabot sa BIR counters.
  for (const action of ['clear_sales', 'reset_references', 'factory_reset']) {
    test(`ang ${action} mo-reset sa branch_number_series`, async ({ request }) => {
      const { advanceSeries, readSeries } = await import('./helpers/branches');
      await advanceSeries(); // i-advance aron makita kon mo-reset ba gyud

      const res = await request.post('/api/data-management/reset', {
        data: { action },
      });
      expect(res.ok()).toBeTruthy();

      const after = await readSeries();
      expect(after.length).toBeGreaterThan(0);
      for (const row of after) {
        // Kon dili mo-reset, mo-re-issue ug invoice number nga naka-file na.
        expect(row.si_number).toBe('000000');
      }
    });
  }
});
```

The request body is `{ action }` — the route destructures `const { action } =
body` at line 8. `factory_reset` is destructive to the whole test database by
design; it runs last in this describe block and the suite's global setup
rebuilds the DB for the next run, so no cleanup is needed. If `factory_reset`
leaves the test DB unusable for later specs in the same run, say so in your
report and move that one case to its own spec file.

- [ ] **Step 3: Add the helpers**

Append to `tests/e2e/helpers/branches.ts`:

```typescript
/** Mo-uli sa tanan branch_number_series rows. */
export async function readSeries(): Promise<Array<{ branch_id: string; si_number: string }>> {
  const conn = await getConn();
  try {
    const [rows]: any = await conn.query(
      'SELECT branch_id, si_number FROM branch_number_series'
    );
    return rows;
  } finally {
    await conn.end();
  }
}

/** I-advance ang tanan SI counters aron matestingan kon mo-reset ba. */
export async function advanceSeries(): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query("UPDATE branch_number_series SET si_number = '000042'");
  } finally {
    await conn.end();
  }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts -g "mo-reset sa branch_number_series" --reporter=line`
Expected: FAIL (all 3 cases) — the counter stays at `000042` because each
reset only touches `transaction_references`.

- [ ] **Step 5: Add the same reset to all three paths**

In `app/api/data-management/reset/route.ts`, add this statement immediately
after the existing `transaction_references` reset in **each** of the three
actions — `clear_sales` (~line 56), `reset_references` (~line 68) and
`factory_reset` (~line 287):

```typescript
          // Reset the per-branch BIR series too. transaction_references no
          // longer holds the series the system issues from, so resetting only
          // that row (or truncating it) would leave each branch's counter
          // advanced and re-issue invoice numbers already on filed documents.
          // UPDATE, not TRUNCATE: branch_number_series has an ON DELETE
          // RESTRICT FK to branches and its rows must survive, or no branch
          // can issue an invoice at all.
          await connection.query(
            "UPDATE branch_number_series SET si_number = '000000', mc_number = '000000', bir_or_number = '000000'"
          );
```

Use the connection variable each block already has in scope — do not
introduce a new transaction. The statement is identical in all three places;
this is deliberate duplication rather than a shared helper, because each
block runs on its own connection inside its own action branch, and a helper
taking a connection would add indirection for three one-line calls. If you
find the route already has a local helper that takes a connection, use it.

- [ ] **Step 6: Verify all three paths were covered**

Run: `grep -c "UPDATE branch_number_series SET si_number" app/api/data-management/reset/route.ts`
Expected: `3`. If it is fewer, a reset path still leaves the series stale —
which is the exact BIR hazard this task exists to close.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts --reporter=line`
Expected: PASS, 11 tests (8 from Tasks 3-6, plus 3 reset cases).

- [ ] **Step 8: Verify no destructive statement was altered**

Run: `git diff app/api/data-management/reset/route.ts | grep -iE "^[+-].*(TRUNCATE|DELETE FROM|DROP)"`
Expected: **no output** — this task only adds `UPDATE branch_number_series`
statements. Any change to an existing truncate or delete is out of scope and
must be reverted.

- [ ] **Step 9: Typecheck and commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
git add app/api/data-management/reset/route.ts tests/e2e/branch-numbering.spec.ts tests/e2e/helpers/branches.ts
git commit -m "fix(branches): reset the per-branch BIR series on both data resets"
```

---

### Task 8: Convert the five UNIQUE constraints to composite

**Files:**
- Create: `scripts/migrations/140_composite_bir_unique_keys.ts`
- Modify: `scripts/migrations/index.ts`
- Modify: `tests/e2e/branch-numbering.spec.ts`

**Interfaces:**
- Consumes: `branch_id NOT NULL` on both sale tables (Task 4).
- Produces: five composite unique keys; the same invoice number is accepted in two branches and rejected within one.

- [ ] **Step 1: Confirm the five constraints still exist as named**

Run: `timeout 60 npx tsx -e "import {query} from './lib/mysql'; query(\"SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND NON_UNIQUE=0 AND COLUMN_NAME IN ('si_number','bir_or_number','mc_number') ORDER BY TABLE_NAME,INDEX_NAME\").then(r=>{console.log(JSON.stringify(r,null,1)); process.exit(0)})"`

Expected: five rows — `si_number` on `sales_transactions` and
`pos_transactions`, `idx_sales_transactions_bir_or_number`,
`idx_pos_transactions_bir_or_number`, `idx_pos_transactions_mc_number`.
If the set differs, stop and report before writing the migration.

- [ ] **Step 2: Write the migration**

Create `scripts/migrations/140_composite_bir_unique_keys.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { withTransaction, query } from '../../lib/mysql';

/**
 * Make the BIR invoice-number unique keys per-branch.
 *
 * Each branch files its own series, so two establishments legitimately both
 * issue 000001. A global UNIQUE rejects the second one. The composite key
 * still enforces what BIR requires — no duplicate within an establishment.
 *
 * One transaction per table: a half-applied swap would leave a window with
 * no uniqueness guarantee at all, during which a duplicate invoice number
 * could be written.
 */
const SWAPS: Array<{ table: string; column: string; oldIndex: string; newIndex: string }> = [
  { table: 'sales_transactions', column: 'si_number', oldIndex: 'si_number', newIndex: 'uq_sales_tx_branch_si' },
  { table: 'pos_transactions', column: 'si_number', oldIndex: 'si_number', newIndex: 'uq_pos_tx_branch_si' },
  { table: 'sales_transactions', column: 'bir_or_number', oldIndex: 'idx_sales_transactions_bir_or_number', newIndex: 'uq_sales_tx_branch_or' },
  { table: 'pos_transactions', column: 'bir_or_number', oldIndex: 'idx_pos_transactions_bir_or_number', newIndex: 'uq_pos_tx_branch_or' },
  { table: 'pos_transactions', column: 'mc_number', oldIndex: 'idx_pos_transactions_mc_number', newIndex: 'uq_pos_tx_branch_mc' },
];

export const migration: Migration = {
  name: '140_composite_bir_unique_keys',
  timestamp: '2026-10-14_10-50-00',

  async up() {
    console.log('Running migration: 140_composite_bir_unique_keys');
    for (const s of SWAPS) {
      await withTransaction(async (connection) => {
        try {
          await connection.query(`ALTER TABLE \`${s.table}\` DROP INDEX \`${s.oldIndex}\``);
          console.log(`✅ Dropped ${s.table}.${s.oldIndex}`);
        } catch (e: any) {
          if (e.errno === 1091) {
            console.log(`⚠️ Index ${s.oldIndex} already absent on ${s.table}`);
          } else {
            throw e;
          }
        }
        try {
          await connection.query(
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
      });
    }
  },

  async down() {
    console.log('Rolling back migration: 140_composite_bir_unique_keys');
    for (const s of SWAPS) {
      await withTransaction(async (connection) => {
        try {
          await connection.query(`ALTER TABLE \`${s.table}\` DROP INDEX \`${s.newIndex}\``);
        } catch (e: any) {
          if (e.errno !== 1091) throw e;
        }
        try {
          await connection.query(
            `ALTER TABLE \`${s.table}\` ADD UNIQUE KEY \`${s.oldIndex}\` (\`${s.column}\`)`
          );
        } catch (e: any) {
          if (e.code === 'ER_DUP_KEYNAME' || e.errno === 1061) return;
          throw e;
        }
      });
    }
  }
};

registerMigration(migration);
```

`down()` restoring a global unique key can fail if two branches have by then
each issued the same number. That is expected and correct: the rollback must
not silently drop a uniqueness guarantee. Report it if it happens.

- [ ] **Step 3: Register the migration**

In `scripts/migrations/index.ts`, after `'./139_tighten_sales_branch_id'`:

```typescript
import './140_composite_bir_unique_keys';
```

- [ ] **Step 4: Write the failing tests**

Append to `tests/e2e/branch-numbering.spec.ts`:

```typescript
test.describe('composite BIR unique keys', () => {
  test('parehas nga si_number OK sa duha ka branch, pero dili sulod sa usa', async () => {
    const { insertRawSale, cleanupRawSales } = await import('./helpers/branches');
    const a = await seedSecondBranch({ withNumberSeries: true });
    const b = await seedSecondBranch({ withNumberSeries: true });
    const si = `9${Date.now()}`.slice(-6);
    try {
      // Parehas nga numero, lain nga branch — kinahanglan OK.
      await insertRawSale(a.branchId, si);
      await insertRawSale(b.branchId, si);

      // Parehas nga numero, parehas nga branch — kinahanglan gi-reject.
      await expect(insertRawSale(a.branchId, si)).rejects.toThrow(/duplicate/i);
    } finally {
      await cleanupRawSales(si);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});
```

- [ ] **Step 5: Add the raw-insert helpers**

Append to `tests/e2e/helpers/branches.ts`:

```typescript
/**
 * Mo-insert ug minimal nga sales_transactions row direkta, aron matestingan
 * ang unique key mismo (dili ang checkout flow).
 */
export async function insertRawSale(branchId: string, siNumber: string): Promise<void> {
  const conn = await getConn();
  try {
    // `id` ug `total` ra ang NOT NULL nga walay default sa sales_transactions
    // (gi-verify 2026-10-14) — ang column kay `total`, DILI `total_amount`.
    await conn.query(
      `INSERT INTO sales_transactions (id, branch_id, si_number, total)
       VALUES (?, ?, ?, 0)`,
      [uuidv4(), branchId, siNumber]
    );
  } finally {
    await conn.end();
  }
}

export async function cleanupRawSales(siNumber: string): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query('DELETE FROM sales_transactions WHERE si_number = ?', [siNumber]);
  } finally {
    await conn.end();
  }
}
```

If `sales_transactions` has other `NOT NULL` columns without defaults, add
them to the insert with minimal values and note which in your report.

- [ ] **Step 6: Run the migration and the tests**

Run: `npm run migrate` then
`timeout 540 npx playwright test tests/e2e/branch-numbering.spec.ts --reporter=line`
Expected: five `✅ Added uq_...` lines, then PASS, 12 tests (11 from
Tasks 3-7, plus this task's composite-key case).

- [ ] **Step 7: Verify the constraint set changed as intended**

Re-run Step 1's query.
Expected: the five `uq_*` composite keys, each listing `branch_id` **and** its
number column; the old single-column unique keys are gone.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
git add scripts/migrations/140_composite_bir_unique_keys.ts scripts/migrations/index.ts tests/e2e/branch-numbering.spec.ts tests/e2e/helpers/branches.ts
git commit -m "feat(branches): make the BIR invoice unique keys per-branch"
```

---

### Task 9: Let a second branch go active, and document the phase

**Files:**
- Modify: `app/api/branches/route.ts` (the POST guard)
- Modify: `tests/e2e/branches-api.spec.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `branch_number_series` from Task 2.
- Produces: `POST /api/branches` creates a branch **active**, with its own series row, and no `warning` field.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/branches-api.spec.ts`, replace the two `Phase 2 guard` tests
(which assert `isActive === 0` and a warning) with:

```typescript
test.describe('POST /api/branches — per-branch numbering landed', () => {
  test('ang bag-ong branch kay ACTIVE na, kay naa nay kaugalingong series', async ({ request }) => {
    const code = `A${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Active Branch' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.warning).toBeUndefined();

    const list = await (await request.get('/api/branches')).json();
    const created = list.data.find((b: any) => b.code === code);
    expect(created.isActive).toBe(1);
  });

  test('ang bag-ong branch adunay series row nga nagsugod sa 000000', async ({ request }) => {
    const code = `S${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Series Branch' },
    });
    const { id } = (await res.json()).data;

    const { readSeries } = await import('./helpers/branches');
    const row = (await readSeries()).find((r) => r.branch_id === id);
    expect(row).toBeTruthy();
    expect(row!.si_number).toBe('000000');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `timeout 540 npx playwright test tests/e2e/branches-api.spec.ts --reporter=line`
Expected: FAIL — branches are still created inactive with a warning, and no
series row is created.

- [ ] **Step 3: Replace the guard**

In `app/api/branches/route.ts`, remove the `transaction_references` row count
and the `numberingIsPerBranch` flag entirely, and create the branch active
with its series row in one transaction:

```typescript
    // Per-branch numbering is in place (branch_number_series), so a new
    // branch no longer shares the main branch's BIR series and can be
    // created active. Its series row is created in the same transaction:
    // a branch without one cannot issue invoices at all, because
    // getNextSINumber fails closed on a missing row.
    await withTransaction(async (connection) => {
      await connection.query(
        `INSERT INTO branches
           (id, code, name, business_name, address, tin, contact_number,
            permit_no, min_number, serial_number, operated_by, is_main, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [
          id,
          code,
          name,
          body.businessName ?? null,
          body.address ?? null,
          body.tin ?? null,
          body.contactNumber ?? null,
          body.permitNo ?? null,
          body.minNumber ?? null,
          body.serialNumber ?? null,
          body.operatedBy ?? null,
        ]
      );
      await connection.query(
        `INSERT INTO branch_number_series (branch_id) VALUES (?)`,
        [id]
      );
    });

    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
```

Add `withTransaction` to the file's `lib/mysql` import. Keep the existing
400-on-missing-fields and 409-on-duplicate-code handling exactly as it is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `timeout 540 npx playwright test tests/e2e/branches-api.spec.ts --reporter=line`
Expected: PASS, 6 tests.

- [ ] **Step 5: Update CLAUDE.md**

In the **Branches** section, replace the sentence beginning
"**Phase 1 isolates reads only:**" with:

```markdown
**Phase 2a landed per-branch BIR numbering.** Each branch has a
`branch_number_series` row holding its own `si_number` / `mc_number` /
`bir_or_number`; `getNextSINumber(branchId, connection)` and its MC/OR
siblings take a required `branchId` and fail closed if the branch has no
series row. The main branch continued its original sequence; new branches
start at 000001. The BIR invoice unique keys are composite
`(branch_id, si_number)` etc., so two branches may each issue 000001.
`sales_transactions` and `pos_transactions` now carry `branch_id` directly.
**All three data-reset actions (`clear_sales`, `reset_references`,
`factory_reset`) must reset `branch_number_series`** — resetting only
`transaction_references` would re-issue invoice numbers already on filed
documents. The nine internal document series and `receipt_number` remain
company-wide via `getNextReference()`.

**Still reads-only isolation:** the 21 GET routes are branch-filtered, but
write-bearing routes are deferred to Phase 2b, so a write can still reach
another branch. `app/api/approvals/queue` and `app/api/reports/soa`
deliberately read across branches (reasons commented in those files).
```

- [ ] **Step 6: Run the full branch suite**

Run: `timeout 900 npx playwright test tests/e2e/branch-numbering.spec.ts tests/e2e/branch-context.spec.ts tests/e2e/branches-api.spec.ts tests/e2e/branch-isolation-api.spec.ts --reporter=line`
Expected: PASS — 10 + 29 + 6 + the isolation suite's count.

- [ ] **Step 7: Run the FULL suite**

Run: `timeout 2700 npx playwright test --reporter=line`

Expected: roughly 22 pre-existing failures and **zero** `ECONNREFUSED`.
Report the pass/fail counts and name every failure, saying for each whether
this phase caused it. Known pre-existing: stale `Retail (₱)` selectors
(`add-product`, `price-level-tiers`, `purchase-order-add-product`,
`selling-units`) and UI drift (`pricing`, `import-wizard`, `login`,
`dashboard-matte`, `sidebar-panel`).

**Before starting this run**, check free memory — orphaned dev servers from
earlier runs will starve the server and produce a cascade of
`ECONNREFUSED` failures that look like real breakage:
`powershell -c "(Get-Process node -ErrorAction SilentlyContinue).Count"` and
`powershell -c "$o=Get-CimInstance Win32_OperatingSystem; [math]::Round($o.FreePhysicalMemory/1MB,2)"`.
If several node processes are running and free memory is under ~3 GB, stop
them before running the suite.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck 2>&1 | grep -E "^(app|lib|src|tests|scripts)/"
git add app/api/branches/route.ts tests/e2e/branches-api.spec.ts CLAUDE.md
git commit -m "feat(branches): allow a second branch to go active now that numbering is per-branch"
```

---

## Phase 2a completion criteria

- [ ] `npm run migrate` and `npm run migrate:down` both succeed from a clean DB
- [ ] `npm run typecheck` reports no source-directory errors
- [ ] `branch-context.spec.ts` passes in a **full-suite** run (the cycle fix)
- [ ] A script importing `lib/mysql` no longer boots the scheduler
- [ ] The main branch's SI sequence continued across the migration, unreset
- [ ] Two branches issue independent, gapless SI/MC/OR series
- [ ] The same `si_number` is accepted in two branches, rejected within one
- [ ] A failed sale rolls its number back, leaving no gap
- [ ] All three data-reset paths (clear_sales, reset_references, factory_reset) zero `branch_number_series`
- [ ] A second branch can be created **active** with its own series row
- [ ] Full suite shows only the ~22 pre-existing failures, no `ECONNREFUSED`
