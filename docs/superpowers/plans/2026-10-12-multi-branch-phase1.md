# Multi-Branch Phase 1 — Schema and Branch Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `branches` table above `warehouses`, bind terminals and users to branches, and enforce branch isolation server-side so a request can never reach another branch's stock.

**Architecture:** A `branches` row is the store. `warehouses`, `pos_terminals` and `users` gain `branch_id`. A new `lib/branch-context.ts` resolves the active branch from server-side state only — the terminal's registered IP for POS requests, and a per-request `users.branch_id` lookup for back-office requests — then every core route derives its warehouse filter from that resolved branch instead of trusting a caller-supplied `warehouse_id`.

**Tech Stack:** Next.js 16 App Router, raw `mysql2/promise` via `lib/mysql.ts`, numbered TypeScript migrations under `scripts/migrations/`, Playwright E2E on port 3100 against `alon_pos_test`.

**Spec:** [docs/superpowers/specs/2026-10-12-multi-branch-design.md](../specs/2026-10-12-multi-branch-design.md)

## Scope of this plan

Phase 1 of five. This plan delivers branch identity and isolation. After it
lands, a single-branch install behaves exactly as it does today, and a
second branch can be created and is fully isolated.

**Deferred to later phases, deliberately — do not implement here:**

- Per-branch SI/MC/OR numbering and the composite `si_number` unique
  constraint (Phase 2). `transaction_references` is **not touched** in this
  plan; it keeps its single `id = 1` row.
- `scheduler_leases` and the single-writer guard (Phase 3).
- Two-sided inter-branch transfers and branch-scoped approvers (Phase 4).
- The branch dimension on report endpoints, branch management UI, the
  sidebar switcher, and receipt/e-journal identity (Phase 5).
- Moving identity fields off `pos_settings` (Phase 5). `pos_settings` keeps
  every column it has today; this plan only *reads* it, in Task 2.

Because numbering is Phase 2, a second branch must not take live sales until
Phase 2 lands — it would draw from the shared sequence. Task 10 enforces this
with a guard so the half-built state cannot be misused.

## Global Constraints

- **MySQL only, raw SQL.** No ORM, no query builder. All queries go through
  `query()` / `withTransaction()` from `lib/mysql.ts`.
- **Migrations are numbered TypeScript files** in `scripts/migrations/`,
  exporting `const migration: Migration` with `up()` and `down()`, ending
  with `registerMigration(migration)`, and imported in
  `scripts/migrations/index.ts`. Next free number is **130**.
- **Migrations must be idempotent on re-run**: catch `ER_DUP_COLUMN_NAME` /
  `errno === 1060` for added columns and log a warning instead of throwing,
  matching `110_add_business_date_lock.ts`.
- **Every migration has a working `down()`.**
- **E2E tests run with `workers: 1`.** Never add parallelism.
- **Test descriptions are written in Cebuano**, matching the existing specs
  (see `tests/e2e/dashboard-stats-api.spec.ts`). Code, identifiers and
  comments-explaining-why may be English.
- **`CLOUD_DB_*` is optional.** Never throw or crash when cloud is
  unreachable.
- **BIR SI numbers are legally significant.** This plan does not touch
  numbering at all; if a task appears to require it, stop and escalate.
- **Do not reset or renumber any existing sequence.**
- `npm run typecheck` and `npm run lint` must pass before every commit.
- **Importing `lib/mysql` has scheduler side effects.** Verified 2026-10-12:
  a bare `npx tsx -e "import {query} from './lib/mysql'"` prints
  `Starting Sta Lucia hourly sales worker (:05 past every hour)` and
  `Backup scheduler initialized.`, and the process does not exit on its own.
  Every verification one-liner in this plan therefore ends with
  `process.exit(0)`. Do not remove those calls, and do not treat the
  scheduler log lines as failures. Fixing the side effect itself is Phase 3.
- `products.type` is `ENUM('standard','service') NOT NULL DEFAULT 'standard'`
  (migration 101). Seeded test products inherit `'standard'`, which matters
  because the Task 8 exemplar route filters on `p.type = 'standard'`.

## Review Focus

Five conditions the spec implies but that no obvious task would exercise.
Each has its test pinned to the task that owns the code.

1. **A spoofed `x-forwarded-for` header must not grant another branch's
   terminal.** IP resolution is the POS branch source, and the header is
   client-controlled on a LAN. Expected: resolution falls back to a
   registered binding, never silently trusts an arbitrary claimed IP.
   → Task 3.
2. **A head-office user passing `viewBranchId` without the `all_branches`
   capability must be rejected, not silently scoped to their own branch.**
   Expected: 403, so a privilege probe is visible rather than quietly
   downgraded. → Task 4.
3. **A `warehouse_id` belonging to another branch must be rejected with 403,
   including when it is valid and active.** Expected: ownership is checked,
   not just existence. → Task 5.
4. **A user with `branch_id` pointing at a deleted or inactive branch must
   fail closed.** Expected: request denied, not defaulted to the main
   branch. → Task 4.
5. **An unassigned terminal (`branch_id` NULL before backfill completes, or
   a newly inserted row) must fail closed rather than defaulting to branch
   one.** Expected: explicit error naming the terminal. → Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `scripts/migrations/130_create_branches.ts` | Create `branches` table |
| `scripts/migrations/131_add_branch_id_columns.ts` | Add nullable `branch_id` to `warehouses`, `pos_terminals`, `users` |
| `scripts/migrations/132_backfill_default_branch.ts` | Create the main branch from `pos_settings`, backfill all three tables |
| `scripts/migrations/133_tighten_branch_id_not_null.ts` | `warehouses.branch_id` and `pos_terminals.branch_id` → `NOT NULL` + FKs |
| `lib/branch-context.ts` | Resolve the active branch from server-side state; validate warehouse ownership |
| `app/api/branches/route.ts` | List and create branches |
| `tests/e2e/helpers/branches.ts` | Seed and tear down a second branch for tests |
| `tests/e2e/branch-context.spec.ts` | Unit tests for resolution and validation |
| `tests/e2e/branch-isolation-api.spec.ts` | API-level isolation assertions |

---

### Task 1: Create the `branches` table

**Files:**
- Create: `scripts/migrations/130_create_branches.ts`
- Modify: `scripts/migrations/index.ts` (add the import at the end of the import block)

**Interfaces:**
- Consumes: nothing.
- Produces: table `branches` with columns `id VARCHAR(50) PK`, `code VARCHAR(20) NOT NULL UNIQUE`, `name VARCHAR(255) NOT NULL`, `business_name VARCHAR(255)`, `address TEXT`, `tin VARCHAR(50)`, `contact_number VARCHAR(50)`, `permit_no VARCHAR(100)`, `min_number VARCHAR(100)`, `serial_number VARCHAR(100)`, `operated_by VARCHAR(255)`, `is_main TINYINT(1) DEFAULT 0`, `is_active TINYINT(1) DEFAULT 1`, `created_at`, `updated_at`.

- [ ] **Step 1: Write the migration**

Create `scripts/migrations/130_create_branches.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Create the branches table — the store identity above warehouses.
 *
 * BIR identity (permit_no, min_number, serial_number, tin, business_name,
 * address) lives here because each branch is its own registered
 * establishment. pos_terminals keeps its own copies of permit/MIN/serial as
 * per-machine values; the branch supplies the default. Philippine practice
 * is a per-machine serial under a branch permit, so both levels are real.
 *
 * `code` is the short label that prints on receipts and heads report
 * columns, so it is required and unique.
 */
export const migration: Migration = {
  name: '130_create_branches',
  timestamp: '2026-10-12_10-00-00',

  async up() {
    console.log('Running migration: 130_create_branches');
    await query(`
      CREATE TABLE IF NOT EXISTS branches (
        id VARCHAR(50) NOT NULL,
        code VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        business_name VARCHAR(255) DEFAULT NULL,
        address TEXT,
        tin VARCHAR(50) DEFAULT NULL,
        contact_number VARCHAR(50) DEFAULT NULL,
        permit_no VARCHAR(100) DEFAULT NULL,
        min_number VARCHAR(100) DEFAULT NULL,
        serial_number VARCHAR(100) DEFAULT NULL,
        operated_by VARCHAR(255) DEFAULT NULL,
        is_main TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_branches_code (code),
        KEY idx_branches_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✅ Created branches table');
  },

  async down() {
    console.log('Rolling back migration: 130_create_branches');
    await query(`DROP TABLE IF EXISTS branches`);
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register the migration**

In `scripts/migrations/index.ts`, add after the `'./129_add_price_level_switch_to_pos_settings'` import line:

```typescript
import './130_create_branches';
```

- [ ] **Step 3: Run the migration**

Run: `npm run migrate`
Expected: `✅ Created branches table`, exit 0.

- [ ] **Step 4: Verify the table shape**

Run: `npx tsx -e "import {query} from './lib/mysql'; query('DESCRIBE branches').then(r=>{console.table(r); process.exit(0)})"`
Expected: 15 columns; `code` shows `UNI`; `id` shows `PRI`.

- [ ] **Step 5: Verify rollback works**

Run: `npm run migrate:down` then `npm run migrate`
Expected: table drops, then is recreated. Exit 0 both times.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add scripts/migrations/130_create_branches.ts scripts/migrations/index.ts
git commit -m "feat(branches): add branches table"
```

---

### Task 2: Add nullable `branch_id` columns and backfill the main branch

Combined into one task because a nullable column with nothing in it is not an
independently useful deliverable — the backfill is what makes it meaningful,
and a reviewer would judge them together.

**Files:**
- Create: `scripts/migrations/131_add_branch_id_columns.ts`
- Create: `scripts/migrations/132_backfill_default_branch.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Consumes: table `branches` from Task 1.
- Produces: `warehouses.branch_id`, `pos_terminals.branch_id`, `users.branch_id`, all `VARCHAR(50) NULL`; exactly one `branches` row with `is_main = 1`, whose id every existing warehouse and terminal references.

- [ ] **Step 1: Write the column migration**

Create `scripts/migrations/131_add_branch_id_columns.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Add branch_id to warehouses, pos_terminals and users.
 *
 * Nullable at this stage so the migration can run on a live database before
 * the backfill. 133 tightens warehouses and pos_terminals to NOT NULL.
 *
 * users.branch_id stays nullable permanently: NULL means head office, a user
 * not tied to one store.
 */
const TARGETS: Array<{ table: string }> = [
  { table: 'warehouses' },
  { table: 'pos_terminals' },
  { table: 'users' },
];

export const migration: Migration = {
  name: '131_add_branch_id_columns',
  timestamp: '2026-10-12_10-10-00',

  async up() {
    console.log('Running migration: 131_add_branch_id_columns');
    for (const { table } of TARGETS) {
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
    console.log('Rolling back migration: 131_add_branch_id_columns');
    for (const { table } of TARGETS) {
      await query(`ALTER TABLE \`${table}\` DROP COLUMN branch_id`);
    }
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Write the backfill migration**

Create `scripts/migrations/132_backfill_default_branch.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { query, withTransaction } from '../../lib/mysql';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create the main branch from existing pos_settings identity, then point
 * every existing warehouse and terminal at it.
 *
 * Users are deliberately NOT backfilled: users.branch_id NULL means head
 * office, and guessing a branch for every existing account would silently
 * grant or remove access. Assigning users is an explicit admin action.
 *
 * Idempotent: if a row with is_main = 1 already exists it is reused rather
 * than duplicated, so a re-run cannot create two main branches.
 */
export const migration: Migration = {
  name: '132_backfill_default_branch',
  timestamp: '2026-10-12_10-20-00',

  async up() {
    console.log('Running migration: 132_backfill_default_branch');

    await withTransaction(async (connection) => {
      const [existing]: any = await connection.query(
        `SELECT id FROM branches WHERE is_main = 1 LIMIT 1`
      );

      let branchId: string;
      if (existing.length > 0) {
        branchId = existing[0].id;
        console.log(`⚠️ Main branch already exists (${branchId}) — reusing`);
      } else {
        const [settings]: any = await connection.query(
          `SELECT business_name, address, tin, contact_number, min_number,
                  serial_number, operated_by
           FROM pos_settings LIMIT 1`
        );
        const s = settings[0] || {};
        branchId = uuidv4();
        await connection.query(
          `INSERT INTO branches
             (id, code, name, business_name, address, tin, contact_number,
              min_number, serial_number, operated_by, is_main, is_active)
           VALUES (?, 'MAIN', ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            branchId,
            s.business_name || 'Main Branch',
            s.business_name || null,
            s.address || null,
            s.tin || null,
            s.contact_number || null,
            s.min_number || null,
            s.serial_number || null,
            s.operated_by || null,
          ]
        );
        console.log(`✅ Created main branch ${branchId}`);
      }

      const [wh]: any = await connection.query(
        `UPDATE warehouses SET branch_id = ? WHERE branch_id IS NULL`,
        [branchId]
      );
      console.log(`✅ Assigned ${wh.affectedRows} warehouse(s) to the main branch`);

      const [term]: any = await connection.query(
        `UPDATE pos_terminals SET branch_id = ? WHERE branch_id IS NULL`,
        [branchId]
      );
      console.log(`✅ Assigned ${term.affectedRows} terminal(s) to the main branch`);
    });
  },

  async down() {
    console.log('Rolling back migration: 132_backfill_default_branch');
    await query(`UPDATE warehouses SET branch_id = NULL`);
    await query(`UPDATE pos_terminals SET branch_id = NULL`);
    await query(`DELETE FROM branches WHERE is_main = 1`);
  }
};

registerMigration(migration);
```

- [ ] **Step 3: Register both migrations**

In `scripts/migrations/index.ts`, after the `'./130_create_branches'` line:

```typescript
import './131_add_branch_id_columns';
import './132_backfill_default_branch';
```

- [ ] **Step 4: Run the migrations**

Run: `npm run migrate`
Expected: `✅ Added branch_id to warehouses` (×3 tables), `✅ Created main branch <uuid>`, and a non-zero warehouse/terminal assignment count.

- [ ] **Step 5: Verify no orphans remain**

Run: `npx tsx -e "import {query} from './lib/mysql'; Promise.all([query('SELECT COUNT(*) c FROM warehouses WHERE branch_id IS NULL'),query('SELECT COUNT(*) c FROM pos_terminals WHERE branch_id IS NULL'),query('SELECT COUNT(*) c FROM branches WHERE is_main=1')]).then(([w,t,b])=>{console.log('orphan warehouses',w[0].c,'orphan terminals',t[0].c,'main branches',b[0].c); process.exit(0)})"`
Expected: `orphan warehouses 0 orphan terminals 0 main branches 1`.

- [ ] **Step 6: Verify re-running does not duplicate the main branch**

Run: `npx tsx -e "import('./scripts/migrations/132_backfill_default_branch').then(async m=>{await m.migration.up(); const {query}=await import('./lib/mysql'); const r=await query('SELECT COUNT(*) c FROM branches WHERE is_main=1'); console.log('main branches after re-run', r[0].c); process.exit(0)})"`
Expected: `main branches after re-run 1`, and a `⚠️ Main branch already exists` log line.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add scripts/migrations/131_add_branch_id_columns.ts scripts/migrations/132_backfill_default_branch.ts scripts/migrations/index.ts
git commit -m "feat(branches): add branch_id columns and backfill the main branch"
```

---

### Task 3: Resolve a terminal's branch server-side

**Files:**
- Create: `lib/branch-context.ts`
- Create: `tests/e2e/branch-context.spec.ts`

**Interfaces:**
- Consumes: `branches`, `pos_terminals.branch_id` from Tasks 1–2.
- Produces:
  - `type BranchScope = { branchId: string; scope: 'single' } | { branchId: null; scope: 'all' }`
  - `class BranchResolutionError extends Error { readonly status: number }`
  - `async function resolveTerminalBranch(terminalId: string): Promise<BranchScope>`
  - `function clientIpFrom(request: Request): string`

**Honest limitation this task must respect:** `clientIp` is derived from the
`x-forwarded-for` / `x-real-ip` headers, which a LAN client can set freely
(see `app/api/pos-terminals/route.ts:158`). IP is therefore **not** a
cryptographic binding. This task resolves the branch from the *terminal
record* in the database, so a spoofed IP can at worst select a different
**registered** terminal — it can never invent a branch or reach an
unregistered one. Making terminal identity unforgeable needs the API
authentication phase; that is explicitly out of scope and must be recorded
in the file's header comment rather than papered over.

- [ ] **Step 1: Write the failing tests**

Create `tests/e2e/branch-context.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import {
  resolveTerminalBranch,
  clientIpFrom,
  BranchResolutionError,
} from '../../lib/branch-context';
import { seedSecondBranch, cleanupSecondBranch } from './helpers/branches';

/**
 * Pure nga tests — walay `page` fixture. Ang branch kay gikan sa DB nga
 * terminal record, dili gikan sa gi-claim sa client.
 */
test.describe('resolveTerminalBranch', () => {
  test('mo-uli sa branch sa registered terminal', async () => {
    const seeded = await seedSecondBranch();
    try {
      const result = await resolveTerminalBranch(seeded.terminalId);
      expect(result.scope).toBe('single');
      expect(result.branchId).toBe(seeded.branchId);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed kung wala pa ma-assign ang terminal sa branch', async () => {
    const seeded = await seedSecondBranch({ terminalBranchId: null });
    try {
      await expect(resolveTerminalBranch(seeded.terminalId)).rejects.toThrow(
        /not assigned to a branch/i
      );
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed kung inactive ang branch sa terminal', async () => {
    const seeded = await seedSecondBranch({ branchActive: false });
    try {
      await expect(resolveTerminalBranch(seeded.terminalId)).rejects.toThrow(
        /inactive/i
      );
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed sa wala-kaila nga terminal id', async () => {
    await expect(resolveTerminalBranch('does-not-exist')).rejects.toThrow(
      /unknown terminal/i
    );
  });

  test('ang error kay 403, dili 500', async () => {
    const err = await resolveTerminalBranch('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(BranchResolutionError);
    expect(err.status).toBe(403);
  });
});

test.describe('clientIpFrom — spoofing', () => {
  test('gi-gamit ang x-forwarded-for pero DILI kini mahimong branch source', () => {
    // Gi-dokumento nga limitation: spoofable ang header. Ang branch kay
    // gikan gihapon sa terminal record sa DB, dili sa IP.
    const req = new Request('http://localhost/api/x', {
      headers: { 'x-forwarded-for': '10.0.0.99, 10.0.0.1' },
    });
    expect(clientIpFrom(req)).toBe('10.0.0.99');
  });

  test('mo-fallback sa 127.0.0.1 kung walay header', () => {
    const req = new Request('http://localhost/api/x');
    expect(clientIpFrom(req)).toBe('127.0.0.1');
  });
});
```

- [ ] **Step 2: Write the test helper**

Create `tests/e2e/helpers/branches.ts`:

```typescript
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

/**
 * Branch seeding helpers para sa isolation tests.
 *
 * Gi-target ang `alon_pos_test` (hardcoded) — DILI ang dev `alon_pos`,
 * parehas sa `helpers/db.ts`.
 */
const TEST_DB = 'alon_pos_test';

async function getConn() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: TEST_DB,
  });
}

export interface SeededBranch {
  branchId: string;
  warehouseId: string;
  terminalId: string;
  userUid: string;
}

export interface SeedOptions {
  /** `null` mo-biya sa terminal nga wala ma-assign, para sa fail-closed tests. */
  terminalBranchId?: string | null;
  branchActive?: boolean;
}

export async function seedSecondBranch(
  opts: SeedOptions = {}
): Promise<SeededBranch> {
  const conn = await getConn();
  const branchId = uuidv4();
  const warehouseId = uuidv4();
  const terminalId = uuidv4();
  const userUid = uuidv4();
  const suffix = branchId.slice(0, 8);

  try {
    await conn.query(
      `INSERT INTO branches (id, code, name, is_main, is_active)
       VALUES (?, ?, ?, 0, ?)`,
      [branchId, `T${suffix.slice(0, 6)}`, `Test Branch ${suffix}`,
       opts.branchActive === false ? 0 : 1]
    );
    await conn.query(
      `INSERT INTO warehouses (id, name, is_active, branch_id)
       VALUES (?, ?, 1, ?)`,
      [warehouseId, `Test WH ${suffix}`, branchId]
    );
    await conn.query(
      `INSERT INTO pos_terminals (id, name, is_active, branch_id)
       VALUES (?, ?, 1, ?)`,
      [terminalId, `Test Term ${suffix}`,
       opts.terminalBranchId === null ? null : (opts.terminalBranchId ?? branchId)]
    );
    await conn.query(
      `INSERT INTO users (uid, username, password, user_type, branch_id)
       VALUES (?, ?, 'x', 'User', ?)`,
      [userUid, `testuser_${suffix}`, branchId]
    );
  } finally {
    await conn.end();
  }

  return { branchId, warehouseId, terminalId, userUid };
}

export async function cleanupSecondBranch(seeded: SeededBranch): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    await conn.query('DELETE FROM users WHERE uid = ?', [seeded.userUid]);
    await conn.query('DELETE FROM pos_terminals WHERE id = ?', [seeded.terminalId]);
    await conn.query('DELETE FROM warehouses WHERE id = ?', [seeded.warehouseId]);
    await conn.query('DELETE FROM branches WHERE id = ?', [seeded.branchId]);
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally {
    await conn.end();
  }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/branch-context.spec.ts`
Expected: FAIL — cannot resolve module `lib/branch-context`.

- [ ] **Step 4: Write the implementation**

Create `lib/branch-context.ts`:

```typescript
import { query } from './mysql';

/**
 * Server-side branch resolution.
 *
 * The client never asserts its own branch. A POS request names a terminal;
 * the branch comes from that terminal's row. A back-office request names a
 * user; the branch is re-read from users.branch_id on every request.
 *
 * LIMITATION — terminal identity is not yet unforgeable. clientIpFrom()
 * reads x-forwarded-for / x-real-ip, which a LAN client can set freely, and
 * the POS also keeps a `pos_terminal_id` value in localStorage. So a caller
 * can choose *which registered terminal* it claims to be. What it cannot do
 * is invent a branch or reach an unregistered one, because the branch is
 * looked up from the terminal row rather than taken from the request.
 * Making identity unforgeable is the API authentication phase's job; see
 * docs/superpowers/specs/2026-10-05-api-authentication-design.md.
 *
 * Every failure here is fail-closed and surfaces as 403, never a silent
 * fallback to the main branch.
 */

export type BranchScope =
  | { branchId: string; scope: 'single' }
  | { branchId: null; scope: 'all' };

export class BranchResolutionError extends Error {
  readonly status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = 'BranchResolutionError';
    this.status = status;
  }
}

/**
 * Best-effort client IP. Kept separate from branch resolution on purpose:
 * it informs terminal auto-matching in the UI but is never the source of
 * truth for a branch.
 */
export function clientIpFrom(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

export async function resolveTerminalBranch(
  terminalId: string
): Promise<BranchScope> {
  if (!terminalId) {
    throw new BranchResolutionError('Unknown terminal: no terminal id supplied');
  }

  const rows = (await query(
    `SELECT t.branch_id AS branchId, b.is_active AS branchActive
     FROM pos_terminals t
     LEFT JOIN branches b ON b.id = t.branch_id
     WHERE t.id = ?`,
    [terminalId]
  )) as any[];

  if (rows.length === 0) {
    throw new BranchResolutionError(`Unknown terminal: ${terminalId}`);
  }

  const { branchId, branchActive } = rows[0];

  if (!branchId) {
    throw new BranchResolutionError(
      `Terminal ${terminalId} is not assigned to a branch`
    );
  }
  if (!branchActive) {
    throw new BranchResolutionError(
      `Terminal ${terminalId} belongs to an inactive branch`
    );
  }

  return { branchId, scope: 'single' };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/branch-context.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck
npm run lint
git add lib/branch-context.ts tests/e2e/branch-context.spec.ts tests/e2e/helpers/branches.ts
git commit -m "feat(branches): resolve a terminal's branch server-side"
```

---

### Task 4: Resolve a back-office user's branch, with head-office scope

**Files:**
- Modify: `lib/branch-context.ts`
- Modify: `tests/e2e/branch-context.spec.ts`

**Interfaces:**
- Consumes: `BranchScope`, `BranchResolutionError` from Task 3.
- Produces: `async function resolveUserBranch(uid: string, viewBranchId?: string | null): Promise<BranchScope>` and the exported constant `ALL_BRANCHES_PERMISSION = 'all_branches'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/branch-context.spec.ts`:

```typescript
import { resolveUserBranch, ALL_BRANCHES_PERMISSION } from '../../lib/branch-context';
import { grantPermission, setUserBranch } from './helpers/branches';

test.describe('resolveUserBranch', () => {
  test('mo-uli sa assigned branch sa user', async () => {
    const seeded = await seedSecondBranch();
    try {
      const result = await resolveUserBranch(seeded.userUid);
      expect(result).toEqual({ branchId: seeded.branchId, scope: 'single' });
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang head office (NULL branch + all_branches) mo-uli ug scope "all"', async () => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(seeded.userUid, null);
      const result = await resolveUserBranch(seeded.userUid);
      expect(result).toEqual({ branchId: null, scope: 'all' });
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang head office makahimo mo-switch pinaagi sa viewBranchId', async () => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      const result = await resolveUserBranch(seeded.userUid, seeded.branchId);
      expect(result).toEqual({ branchId: seeded.branchId, scope: 'single' });
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('gi-REJECT ang viewBranchId kung walay all_branches — dili hilom nga i-downgrade', async () => {
    const seeded = await seedSecondBranch();
    const other = await seedSecondBranch();
    try {
      await expect(
        resolveUserBranch(seeded.userUid, other.branchId)
      ).rejects.toThrow(/not permitted to view other branches/i);
    } finally {
      await cleanupSecondBranch(other);
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed kung inactive ang branch sa user', async () => {
    const seeded = await seedSecondBranch({ branchActive: false });
    try {
      await expect(resolveUserBranch(seeded.userUid)).rejects.toThrow(/inactive/i);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-fail closed kung NULL ang branch pero walay all_branches', async () => {
    const seeded = await seedSecondBranch();
    try {
      await setUserBranch(seeded.userUid, null);
      await expect(resolveUserBranch(seeded.userUid)).rejects.toThrow(
        /not assigned to a branch/i
      );
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });
});
```

- [ ] **Step 2: Add the helpers the tests need**

Append to `tests/e2e/helpers/branches.ts`:

```typescript
export async function grantPermission(
  userUid: string,
  permission: string
): Promise<void> {
  const conn = await getConn();
  try {
    // user_permissions.id is VARCHAR(50) NOT NULL with no default, so it must
    // be supplied explicitly — omitting it fails with ER_NO_DEFAULT_FOR_FIELD.
    await conn.query(
      `INSERT INTO user_permissions (id, user_uid, permission) VALUES (?, ?, ?)`,
      [uuidv4(), userUid, permission]
    );
  } finally {
    await conn.end();
  }
}

export async function setUserBranch(
  userUid: string,
  branchId: string | null
): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query('UPDATE users SET branch_id = ? WHERE uid = ?', [
      branchId,
      userUid,
    ]);
  } finally {
    await conn.end();
  }
}
```

Also extend `cleanupSecondBranch` to remove granted permissions — add this
line immediately before the `DELETE FROM users` line:

```typescript
    await conn.query('DELETE FROM user_permissions WHERE user_uid = ?', [seeded.userUid]);
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/branch-context.spec.ts -g "resolveUserBranch"`
Expected: FAIL — `resolveUserBranch` is not exported.

- [ ] **Step 4: Write the implementation**

Append to `lib/branch-context.ts`:

```typescript
export const ALL_BRANCHES_PERMISSION = 'all_branches';

/**
 * Resolve a back-office request's branch from the database, keyed by uid.
 *
 * users.branch_id is re-read on every call rather than trusted from the
 * session, so a tampered localStorage session cannot change which branch an
 * identity belongs to.
 *
 * A viewBranchId from a user without all_branches is rejected outright. It
 * is deliberately not downgraded to the user's own branch: a silent
 * downgrade hides a privilege probe that an operator should see.
 */
export async function resolveUserBranch(
  uid: string,
  viewBranchId?: string | null
): Promise<BranchScope> {
  if (!uid) {
    throw new BranchResolutionError('Unknown user: no uid supplied');
  }

  const rows = (await query(
    `SELECT u.branch_id AS branchId,
            b.is_active AS branchActive,
            EXISTS (
              SELECT 1 FROM user_permissions p
              WHERE p.user_uid = u.uid AND p.permission = ?
            ) AS allBranches
     FROM users u
     LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.uid = ?`,
    [ALL_BRANCHES_PERMISSION, uid]
  )) as any[];

  if (rows.length === 0) {
    throw new BranchResolutionError(`Unknown user: ${uid}`);
  }

  const { branchId, branchActive } = rows[0];
  const allBranches = Number(rows[0].allBranches) === 1;

  if (viewBranchId) {
    if (!allBranches) {
      throw new BranchResolutionError(
        `User ${uid} is not permitted to view other branches`
      );
    }
    const target = (await query(
      `SELECT is_active AS isActive FROM branches WHERE id = ?`,
      [viewBranchId]
    )) as any[];
    if (target.length === 0) {
      throw new BranchResolutionError(`Unknown branch: ${viewBranchId}`);
    }
    if (!target[0].isActive) {
      throw new BranchResolutionError(`Branch ${viewBranchId} is inactive`);
    }
    return { branchId: viewBranchId, scope: 'single' };
  }

  if (!branchId) {
    if (allBranches) {
      return { branchId: null, scope: 'all' };
    }
    throw new BranchResolutionError(`User ${uid} is not assigned to a branch`);
  }

  if (!branchActive) {
    throw new BranchResolutionError(
      `User ${uid} belongs to an inactive branch`
    );
  }

  return { branchId, scope: 'single' };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/branch-context.spec.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck
npm run lint
git add lib/branch-context.ts tests/e2e/branch-context.spec.ts tests/e2e/helpers/branches.ts
git commit -m "feat(branches): resolve a user's branch with head-office scope"
```

---

### Task 5: Validate warehouse ownership against the resolved branch

**Files:**
- Modify: `lib/branch-context.ts`
- Modify: `tests/e2e/branch-context.spec.ts`

**Interfaces:**
- Consumes: `BranchScope`, `BranchResolutionError`.
- Produces:
  - `async function assertWarehouseInBranch(warehouseId: string, scope: BranchScope): Promise<void>`
  - `async function warehouseIdsForBranch(scope: BranchScope): Promise<string[] | null>` — returns `null` for `scope: 'all'`, meaning "do not filter".

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/branch-context.spec.ts`:

```typescript
import {
  assertWarehouseInBranch,
  warehouseIdsForBranch,
} from '../../lib/branch-context';

test.describe('assertWarehouseInBranch', () => {
  test('mo-pass kung ang warehouse sakop sa resolved branch', async () => {
    const seeded = await seedSecondBranch();
    try {
      await expect(
        assertWarehouseInBranch(seeded.warehouseId, {
          branchId: seeded.branchId,
          scope: 'single',
        })
      ).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('gi-REJECT ang warehouse sa laing branch bisan active ug valid kini', async () => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      await expect(
        assertWarehouseInBranch(b.warehouseId, {
          branchId: a.branchId,
          scope: 'single',
        })
      ).rejects.toThrow(/does not belong to branch/i);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office (scope "all") makasulod sa bisan unsang warehouse', async () => {
    const seeded = await seedSecondBranch();
    try {
      await expect(
        assertWarehouseInBranch(seeded.warehouseId, {
          branchId: null,
          scope: 'all',
        })
      ).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('gi-reject ang wala-kaila nga warehouse', async () => {
    await expect(
      assertWarehouseInBranch('nope', { branchId: 'x', scope: 'single' })
    ).rejects.toThrow(/unknown warehouse/i);
  });
});

test.describe('warehouseIdsForBranch', () => {
  test('mo-uli sa warehouse ids sa branch', async () => {
    const seeded = await seedSecondBranch();
    try {
      const ids = await warehouseIdsForBranch({
        branchId: seeded.branchId,
        scope: 'single',
      });
      expect(ids).toEqual([seeded.warehouseId]);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('mo-uli ug null para sa scope "all" — pasabot walay filter', async () => {
    const ids = await warehouseIdsForBranch({ branchId: null, scope: 'all' });
    expect(ids).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/branch-context.spec.ts -g "WarehouseInBranch|warehouseIdsForBranch"`
Expected: FAIL — functions are not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/branch-context.ts`:

```typescript
/**
 * Reject a warehouse that does not belong to the resolved branch.
 *
 * Existence is not enough: a valid, active warehouse in another branch must
 * be refused. This is the check that stops a crafted request carrying
 * someone else's warehouse_id from reaching their stock.
 */
export async function assertWarehouseInBranch(
  warehouseId: string,
  scope: BranchScope
): Promise<void> {
  if (scope.scope === 'all') return;

  const rows = (await query(
    `SELECT branch_id AS branchId FROM warehouses WHERE id = ?`,
    [warehouseId]
  )) as any[];

  if (rows.length === 0) {
    throw new BranchResolutionError(`Unknown warehouse: ${warehouseId}`);
  }
  if (rows[0].branchId !== scope.branchId) {
    throw new BranchResolutionError(
      `Warehouse ${warehouseId} does not belong to branch ${scope.branchId}`
    );
  }
}

/**
 * The warehouse ids a scope may read.
 *
 * Returns null for head office, meaning "apply no warehouse filter". Callers
 * must treat null as no-filter rather than as an empty set — an empty array
 * would silently hide every row.
 */
export async function warehouseIdsForBranch(
  scope: BranchScope
): Promise<string[] | null> {
  if (scope.scope === 'all') return null;

  const rows = (await query(
    `SELECT id FROM warehouses WHERE branch_id = ?`,
    [scope.branchId]
  )) as any[];

  return rows.map((r) => r.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/branch-context.spec.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npm run typecheck
npm run lint
git add lib/branch-context.ts tests/e2e/branch-context.spec.ts
git commit -m "feat(branches): validate warehouse ownership against the resolved branch"
```

---

### Task 6: Add FKs and tighten `branch_id` to NOT NULL

**Files:**
- Create: `scripts/migrations/133_tighten_branch_id_not_null.ts`
- Modify: `scripts/migrations/index.ts`

**Interfaces:**
- Consumes: backfilled columns from Task 2.
- Produces: `warehouses.branch_id` and `pos_terminals.branch_id` are `NOT NULL` with FKs to `branches(id)`; `users.branch_id` keeps a FK but stays nullable with `ON DELETE SET NULL`.

- [ ] **Step 1: Write the migration**

Create `scripts/migrations/133_tighten_branch_id_not_null.ts`:

```typescript
import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

/**
 * Tighten branch_id now that 132 has backfilled it.
 *
 * warehouses and pos_terminals become NOT NULL: a warehouse or till with no
 * store is meaningless, and branch-context resolution fails closed on NULL,
 * so allowing it would only produce 403s at runtime instead of a clear
 * schema error here.
 *
 * users.branch_id stays nullable — NULL means head office — and uses
 * ON DELETE SET NULL so deleting a branch cannot delete its staff.
 *
 * Guarded: if any row is still NULL the migration aborts with a message
 * naming the table, rather than letting MySQL coerce NULLs to ''.
 */
export const migration: Migration = {
  name: '133_tighten_branch_id_not_null',
  timestamp: '2026-10-12_10-30-00',

  async up() {
    console.log('Running migration: 133_tighten_branch_id_not_null');

    for (const table of ['warehouses', 'pos_terminals']) {
      const rows: any = await query(
        `SELECT COUNT(*) AS c FROM \`${table}\` WHERE branch_id IS NULL`
      );
      if (rows[0].c > 0) {
        throw new Error(
          `Cannot tighten ${table}.branch_id: ${rows[0].c} row(s) still NULL. ` +
          `Run migration 132_backfill_default_branch first.`
        );
      }
      await query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN branch_id VARCHAR(50) NOT NULL`
      );
      console.log(`✅ ${table}.branch_id is NOT NULL`);
    }

    const fks: Array<[string, string, string]> = [
      ['warehouses', 'fk_warehouses_branch', 'RESTRICT'],
      ['pos_terminals', 'fk_pos_terminals_branch', 'RESTRICT'],
      ['users', 'fk_users_branch', 'SET NULL'],
    ];

    for (const [table, name, onDelete] of fks) {
      try {
        await query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\`
             FOREIGN KEY (branch_id) REFERENCES branches (id)
             ON DELETE ${onDelete}`
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
    console.log('Rolling back migration: 133_tighten_branch_id_not_null');
    for (const [table, name] of [
      ['warehouses', 'fk_warehouses_branch'],
      ['pos_terminals', 'fk_pos_terminals_branch'],
      ['users', 'fk_users_branch'],
    ]) {
      try {
        await query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``);
      } catch (e: any) {
        if (e.errno !== 1091) throw e;
      }
    }
    for (const table of ['warehouses', 'pos_terminals']) {
      await query(
        `ALTER TABLE \`${table}\` MODIFY COLUMN branch_id VARCHAR(50) NULL DEFAULT NULL`
      );
    }
  }
};

registerMigration(migration);
```

- [ ] **Step 2: Register the migration**

In `scripts/migrations/index.ts`, after the `'./132_backfill_default_branch'` line:

```typescript
import './133_tighten_branch_id_not_null';
```

- [ ] **Step 3: Run the migration**

Run: `npm run migrate`
Expected: `✅ warehouses.branch_id is NOT NULL`, `✅ pos_terminals.branch_id is NOT NULL`, three `✅ Added fk_*` lines.

- [ ] **Step 4: Verify a branch with warehouses cannot be deleted**

Run: `npx tsx -e "import {query} from './lib/mysql'; query('SELECT id FROM branches WHERE is_main=1').then(async b=>{try{await query('DELETE FROM branches WHERE id=?',[b[0].id]); console.log('UNEXPECTED: delete succeeded')}catch(e){console.log('OK rejected:', e.code)} process.exit(0)})"`
Expected: `OK rejected: ER_ROW_IS_REFERENCED_2`.

- [ ] **Step 5: Verify rollback**

Run: `npm run migrate:down` then `npm run migrate`
Expected: exit 0 both times.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add scripts/migrations/133_tighten_branch_id_not_null.ts scripts/migrations/index.ts
git commit -m "feat(branches): enforce branch_id with FKs and NOT NULL"
```

---

### Task 7: Branches API endpoint

**Files:**
- Create: `app/api/branches/route.ts`
- Create: `tests/e2e/branches-api.spec.ts`

**Interfaces:**
- Consumes: `branches` table; `BranchResolutionError` for status mapping.
- Produces: `GET /api/branches` → `{ success: true, data: Branch[] }`; `POST /api/branches` → `{ success: true, data: { id } }`, status 201.

- [ ] **Step 1: Write the failing tests**

Create `tests/e2e/branches-api.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('GET /api/branches', () => {
  test('mo-uli sa main branch nga gi-himo sa migration', async ({ request }) => {
    const res = await request.get('/api/branches');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    const main = body.data.find((b: any) => b.isMain);
    expect(main).toBeTruthy();
    expect(main.code).toBe('MAIN');
  });
});

test.describe('POST /api/branches', () => {
  test('mo-himo ug bag-ong branch', async ({ request }) => {
    const code = `B${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Cebu Branch', address: 'Cebu City', tin: '123-456-789-000' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeTruthy();
  });

  test('gi-reject ang duplicate nga code', async ({ request }) => {
    const code = `D${Date.now().toString().slice(-6)}`;
    await request.post('/api/branches', { data: { code, name: 'First' } });
    const res = await request.post('/api/branches', { data: { code, name: 'Second' } });
    expect(res.status()).toBe(409);
  });

  test('gi-reject kung walay code o name', async ({ request }) => {
    const res = await request.post('/api/branches', { data: { name: 'No code' } });
    expect(res.status()).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/branches-api.spec.ts`
Expected: FAIL — 404 on `/api/branches`.

- [ ] **Step 3: Write the implementation**

Create `app/api/branches/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql';

/**
 * Branch CRUD. Listing is intentionally unfiltered: the branch switcher and
 * the branch management page both need the full list, and a branch's name
 * and code are not sensitive. Per-branch *data* is what branch-context
 * guards; this endpoint only exposes store identity.
 */
export async function GET() {
  try {
    const rows = await query(
      `SELECT id, code, name, business_name AS businessName, address, tin,
              contact_number AS contactNumber, permit_no AS permitNo,
              min_number AS minNumber, serial_number AS serialNumber,
              operated_by AS operatedBy,
              is_main AS isMain, is_active AS isActive
       FROM branches
       ORDER BY is_main DESC, name ASC`
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('Error fetching branches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch branches' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name } = body;

    if (!code || !name) {
      return NextResponse.json(
        { success: false, error: 'code and name are required' },
        { status: 400 }
      );
    }

    const id = uuidv4();
    await query(
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

    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      return NextResponse.json(
        { success: false, error: 'A branch with that code already exists' },
        { status: 409 }
      );
    }
    console.error('Error creating branch:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create branch' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/branches-api.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npm run typecheck
npm run lint
git add app/api/branches/route.ts tests/e2e/branches-api.spec.ts
git commit -m "feat(branches): add branches list and create endpoint"
```

---

### Task 8: Apply branch filtering to the inventory report endpoint

This task establishes the pattern that the remaining core routes follow. It
is deliberately one endpoint, fully done, rather than all 57 at once — the
reviewer gates the pattern here before it is replicated.

`app/api/reports/inventory/route.ts` is the exemplar because it is
structurally typical: it imports `query` from `@/lib/mysql` directly and
builds `conditions` / `params` arrays against alias `p` on `products`. An
audit on 2026-10-12 found **57 routes with inline SQL on the core tables, 9
routes using the `src/` repository + use-case layer, and 3 doing both** — so
inline SQL is the dominant shape and the one worth standardising first.

**Do not use `app/api/products/route.ts` as the exemplar.** It delegates to
`MySqlProductRepository` / `GetProductsUseCase` and has no local
`conditions` array, so the pattern below does not fit it. Repository-backed
routes are handled separately in Task 9 Step 3.

**Files:**
- Modify: `app/api/reports/inventory/route.ts`
- Create: `tests/e2e/branch-isolation-api.spec.ts`

**Interfaces:**
- Consumes: `resolveUserBranch`, `warehouseIdsForBranch`, `assertWarehouseInBranch`, `BranchResolutionError`.
- Produces: the convention later routes copy — read `uid` and optional `viewBranchId` from the query string, resolve a scope, and filter by `warehouseIdsForBranch`.

- [ ] **Step 1: Read the existing route before changing it**

Run: `sed -n '1,60p' app/api/reports/inventory/route.ts`
Confirm it declares `const conditions = []` and `const params = []` around
lines 19–20 and aliases `products` as `p`. The branch filter must compose
with the existing `conditions` rather than replace them.

- [ ] **Step 2: Write the failing tests**

Create `tests/e2e/branch-isolation-api.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  seedProductInWarehouse,
} from './helpers/branches';

/**
 * Isolation kay gi-assert direkta batok sa API, dili pinaagi sa UI.
 * Gi-pamatuod nga ang branch kay server-derived: bisan mag-ilis ang client
 * sa gi-claim niyang branch, dili siya makakita sa laing branch.
 */
test.describe('GET /api/reports/inventory — branch isolation', () => {
  test('ang user sa branch A dili makakita sa produkto sa branch B', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const skuB = `ISO-B-${Date.now()}`;
      await seedProductInWarehouse(b.warehouseId, skuB);

      const res = await request.get(`/api/reports/inventory?uid=${a.userUid}&limit=200`);
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const skus = (body.data ?? []).map((p: any) => p.sku);
      expect(skus).not.toContain(skuB);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('makakita ang user sa branch A sa kaugalingon niyang produkto', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const skuA = `ISO-A-${Date.now()}`;
      await seedProductInWarehouse(a.warehouseId, skuA);

      const res = await request.get(`/api/reports/inventory?uid=${a.userUid}&limit=200`);
      const body = await res.json();
      const skus = (body.data ?? []).map((p: any) => p.sku);
      expect(skus).toContain(skuA);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('gi-403 ang warehouseId sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const res = await request.get(
        `/api/reports/inventory?uid=${a.userUid}&warehouseId=${b.warehouseId}`
      );
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang gi-pilit nga viewBranchId walay kalabutan kung walay all_branches', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const res = await request.get(
        `/api/reports/inventory?uid=${a.userUid}&viewBranchId=${b.branchId}`
      );
      expect(res.status()).toBe(403);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});
```

- [ ] **Step 3: Add the product seeding helper**

Append to `tests/e2e/helpers/branches.ts`:

```typescript
export async function seedProductInWarehouse(
  warehouseId: string,
  sku: string
): Promise<string> {
  const conn = await getConn();
  const id = uuidv4();
  try {
    await conn.query(
      `INSERT INTO products (id, name, price, sku, stock, warehouse_id)
       VALUES (?, ?, 1.00, ?, 10, ?)`,
      [id, `Test Product ${sku}`, sku, warehouseId]
    );
  } finally {
    await conn.end();
  }
  return id;
}
```

Extend `cleanupSecondBranch` to remove seeded products — add before the
`DELETE FROM warehouses` line:

```typescript
    await conn.query('DELETE FROM products WHERE warehouse_id = ?', [seeded.warehouseId]);
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/branch-isolation-api.spec.ts`
Expected: FAIL — branch B's product is visible, and the cross-branch
`warehouse_id` returns 200 instead of 403.

- [ ] **Step 5: Add a reusable scope helper for routes**

Append to `lib/branch-context.ts`:

```typescript
/**
 * Resolve a back-office request's scope from its query string or body.
 *
 * Centralised so every route reads the same two parameters the same way,
 * and so the uid-from-request weakness has exactly one place to be fixed
 * when API authentication lands.
 */
export async function resolveScopeFromRequest(
  params: URLSearchParams,
  bodyUid?: string
): Promise<BranchScope> {
  const uid = params.get('uid') || bodyUid || '';
  const viewBranchId = params.get('viewBranchId');
  return resolveUserBranch(uid, viewBranchId);
}

/** Map a BranchResolutionError to its JSON response shape. */
export function branchErrorResponse(error: unknown): {
  body: { success: false; error: string };
  status: number;
} | null {
  if (error instanceof BranchResolutionError) {
    return { body: { success: false, error: error.message }, status: error.status };
  }
  return null;
}
```

- [ ] **Step 6: Apply branch filtering to the inventory report route**

In `app/api/reports/inventory/route.ts`, add the import below the existing
`query` import:

```typescript
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '@/lib/branch-context';
```

Then, immediately after the `conditions.push("p.type = 'standard'")` line
and before the `if (category && category !== 'all')` block, insert:

```typescript
    // Branch isolation. The scope comes from the database via uid, never
    // from a branch the caller claims. A warehouseId that belongs to
    // another branch is refused outright rather than quietly ignored.
    let branchWarehouseIds: string[] | null;
    try {
      const scope = await resolveScopeFromRequest(searchParams);
      const requestedWarehouseId =
        searchParams.get('warehouseId') || searchParams.get('warehouse_id');
      if (requestedWarehouseId) {
        await assertWarehouseInBranch(requestedWarehouseId, scope);
      }
      branchWarehouseIds = await warehouseIdsForBranch(scope);
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }

    // null means head office — apply no warehouse filter. An empty array
    // means a branch with no warehouses, which must return nothing rather
    // than everything.
    if (branchWarehouseIds !== null) {
      if (branchWarehouseIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { total: 0, page, limit, hasMore: false },
        });
      }
      conditions.push(
        `p.warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})`
      );
      params.push(...branchWarehouseIds);
    }
```

Both query-string spellings are accepted because the codebase uses
`warehouseId` in `app/api/products/route.ts:22` and `warehouse_id`
elsewhere. Use the route's own variable names (`conditions`, `params`) — do
not rename a route's existing variables to match this snippet.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/branch-isolation-api.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Verify nothing regressed for a single-branch install**

Run: `npx playwright test tests/e2e/inventory-adjust.spec.ts tests/e2e/add-product.spec.ts`
Expected: PASS — the main-branch install behaves as before.

- [ ] **Step 9: Typecheck, lint and commit**

```bash
npm run typecheck
npm run lint
git add lib/branch-context.ts app/api/products/route.ts tests/e2e/branch-isolation-api.spec.ts tests/e2e/helpers/branches.ts
git commit -m "feat(branches): scope the products endpoint to the resolved branch"
```

---

### Task 9: Replicate the filtering pattern across the remaining core routes

**Files:**
- Modify: the routes listed by the audit command in Step 1
- Modify: `tests/e2e/branch-isolation-api.spec.ts`

**Interfaces:**
- Consumes: the exact pattern committed in Task 8.
- Produces: no new interfaces. Every route that reads `products`, `sales`, or `inventory_batches` filters by the resolved branch.

- [ ] **Step 1: Produce the authoritative route list**

Run:
```bash
grep -rl "FROM products\|FROM sales\|FROM inventory_batches" app/api --include="route.ts" | sort > /tmp/branch-routes.txt
wc -l /tmp/branch-routes.txt
cat /tmp/branch-routes.txt
```
Expected: 57 paths. Work through them in sorted order so progress is
resumable.

- [ ] **Step 2: For each inline-SQL route, apply the Task 8 pattern**

For every path in the list, insert the same block committed in Task 8,
adapting only:

- the table alias on the warehouse column (`p.`, `pr.`, or none),
- the names of the route's own condition/param arrays,
- the early-return shape for the empty-array case, so it matches that
  route's existing success response.

Do not invent per-route variations beyond those three. A route that
genuinely has no warehouse-bearing column — for example one matched by the
grep but reading only lookup tables — gets a one-line comment saying why it
is exempt:

```typescript
// No branch filter: this route reads only company-wide master data (D8).
```

- [ ] **Step 3: Handle the repository-backed routes separately**

Run:
```bash
comm -12 <(grep -rl "Repository\|UseCase" app/api --include="route.ts" | sort) \
         <(grep -rl "FROM products\|FROM sales\|FROM inventory_batches" app/api --include="route.ts" | sort)
```
Expected: 3 paths. These, plus the 9 repository-backed routes overall
(`grep -rl "Repository\|UseCase" app/api --include="route.ts"`), have no
local `conditions` array, so the Task 8 snippet does not apply.

For each, thread the branch filter through the existing filter object rather
than pasting SQL into the route. In `app/api/products/route.ts` that means
adding to the `filters` object built at line 19:

```typescript
      branchWarehouseIds,   // string[] | null — null means no filter
```

resolved by the same `resolveScopeFromRequest` / `warehouseIdsForBranch`
calls as Task 8, then honouring it inside
`src/infrastructure/repositories/MySqlProductRepository.ts` where the other
filters are already turned into SQL. Read that repository before editing it
and follow whatever condition-building idiom it already uses.

Treat `null` as no-filter and `[]` as match-nothing, exactly as in Task 8 —
a repository that silently drops an empty array would expose every branch.

- [ ] **Step 4: Extend the isolation test to cover the highest-risk routes**

Each endpoint below was confirmed on 2026-10-12 to have a `route.ts`. Do not
add `/api/inventory` — it has no route file of its own, only subpaths such as
`/api/inventory/adjust/bulk`, so it would return 404 and the assertion would
pass for the wrong reason.

Append to `tests/e2e/branch-isolation-api.spec.ts`:

```typescript
test.describe('branch isolation — dugang nga endpoints', () => {
  const endpoints = [
    '/api/products',
    '/api/reports/inventory',
    '/api/reports/movements',
    '/api/reports/cost-vs-retail',
  ];

  for (const endpoint of endpoints) {
    test(`gi-403 ang cross-branch warehouseId sa ${endpoint}`, async ({ request }) => {
      const a = await seedSecondBranch();
      const b = await seedSecondBranch();
      try {
        const res = await request.get(
          `${endpoint}?uid=${a.userUid}&warehouseId=${b.warehouseId}`
        );
        expect(res.status()).toBe(403);
      } finally {
        await cleanupSecondBranch(b);
        await cleanupSecondBranch(a);
      }
    });
  }
});
```

`/api/products` is in this list on purpose: it is the repository-backed route
from Step 3, so this test is what proves the filter was threaded through
`MySqlProductRepository` rather than skipped.

- [ ] **Step 5: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS. A failure here is usually a route whose filter was applied to
the wrong table alias, or a repository that treated an empty array as
no-filter — fix the route or repository, not the test.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck
npm run lint
git add app/api tests/e2e/branch-isolation-api.spec.ts
git commit -m "feat(branches): scope remaining core endpoints to the resolved branch"
```

---

### Task 10: Guard a second branch from taking sales before Phase 2

**Files:**
- Modify: `app/api/branches/route.ts`
- Modify: `tests/e2e/branches-api.spec.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the branches endpoint from Task 7.
- Produces: a non-main branch is created `is_active = 0` and cannot be activated while `transaction_references` is still a single global row.

**Why this task exists:** numbering is Phase 2. A second *active* branch
would draw SI numbers from the shared `transaction_references` row at
`id = 1`, producing one interleaved sequence across two BIR-registered
establishments. That is a tax-filing defect, not a cosmetic one. Phase 1
therefore ships the isolation but refuses to let a second branch go live.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/branches-api.spec.ts`:

```typescript
test.describe('POST /api/branches — Phase 2 guard', () => {
  test('ang bag-ong branch kay inactive samtang shared pa ang SI counter', async ({ request }) => {
    const code = `G${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Guarded Branch' },
    });
    expect(res.status()).toBe(201);

    const list = await (await request.get('/api/branches')).json();
    const created = list.data.find((b: any) => b.code === code);
    expect(created.isActive).toBe(0);
  });

  test('gi-explain sa response nganong inactive', async ({ request }) => {
    const code = `W${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Warned Branch' },
    });
    const body = await res.json();
    expect(body.warning).toMatch(/per-branch numbering/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/e2e/branches-api.spec.ts -g "Phase 2 guard"`
Expected: FAIL — the branch is created active and no warning is returned.

- [ ] **Step 3: Implement the guard**

In `app/api/branches/route.ts`, replace the `INSERT` and its response with:

```typescript
    // Phase 2 guard. transaction_references is still a single global row
    // (id = 1), so a second ACTIVE branch would draw SI/MC/OR numbers from
    // the same sequence as the main branch. Two BIR-registered
    // establishments sharing one invoice series is a filing defect, so a new
    // branch is created inactive until per-branch numbering lands.
    const refRows = (await query(
      `SELECT COUNT(*) AS c FROM transaction_references`
    )) as any[];
    const numberingIsPerBranch = refRows[0].c > 1;

    await query(
      `INSERT INTO branches
         (id, code, name, business_name, address, tin, contact_number,
          permit_no, min_number, serial_number, operated_by, is_main, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
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
        numberingIsPerBranch ? 1 : 0,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        data: { id },
        ...(numberingIsPerBranch
          ? {}
          : {
              warning:
                'Branch created inactive: per-branch numbering (Phase 2) is not yet ' +
                'in place, so an active second branch would share the main branch\'s ' +
                'BIR invoice series.',
            }),
      },
      { status: 201 }
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/e2e/branches-api.spec.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Document the branch layer in CLAUDE.md**

In `CLAUDE.md`, under **Key Domain Patterns**, add after the
**Stock / Inventory** block:

```markdown
**Branches** — `branches` is the store identity above `warehouses`.
`warehouses`, `pos_terminals` and `users` all carry `branch_id`
(`users.branch_id` NULL = head office, paired with the `all_branches`
permission). `lib/branch-context.ts` is the only place a branch is resolved,
and it resolves from server-side state — `pos_terminals.branch_id` for POS,
a per-request `users.branch_id` lookup for back-office — so a tampered
`localStorage` session cannot change which branch an identity belongs to.
Routes filter by `warehouseIdsForBranch()`, where `null` means head office
and no filter, and an empty array means a branch with no warehouses and must
return nothing. A cross-branch `warehouse_id` is a 403, not a silent ignore.
**Phase 1 only:** `transaction_references` is still one global row, so
`POST /api/branches` creates additional branches inactive until per-branch
numbering lands. Do not activate a second branch before that.
```

- [ ] **Step 6: Run the full suite, typecheck, lint and commit**

```bash
npm run test:e2e
npm run typecheck
npm run lint
git add app/api/branches/route.ts tests/e2e/branches-api.spec.ts CLAUDE.md
git commit -m "feat(branches): keep additional branches inactive until per-branch numbering"
```

---

## Phase 1 completion criteria

- [ ] `npm run migrate` and `npm run migrate:down` both succeed from a clean DB
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:e2e` passes in full
- [ ] A single-branch install behaves exactly as before
- [ ] A second branch can be created, is isolated, and is inactive
- [ ] `transaction_references` is untouched — still one row at `id = 1`
