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
  /** Mo-himo ug branch_number_series row para niining branch (default: true). */
  withNumberSeries?: boolean;
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
    if (opts.withNumberSeries !== false) {
      await conn.query(
        `INSERT INTO branch_number_series (branch_id) VALUES (?)`,
        [branchId]
      );
    }
    await conn.query(
      `INSERT INTO warehouses (id, name, is_active, branch_id)
       VALUES (?, ?, 1, ?)`,
      [warehouseId, `Test WH ${suffix}`, branchId]
    );
    await conn.query(
      `INSERT INTO pos_terminals (id, name, is_active, branch_id)
       VALUES (?, ?, 1, ?)`,
      [terminalId, `Test Term ${suffix}`, opts.terminalBranchId ?? branchId]
    );
    if (opts.terminalBranchId === null) {
      // Migration 133 made pos_terminals.branch_id NOT NULL with a FK, so a
      // genuine NULL can no longer be stored. Simulate an unassigned terminal
      // the way a backfill gap would leave one: with strict mode and FK checks
      // off, MySQL coerces the NULL to '' (an unassigned, falsy branch_id that
      // the resolver's `!branchId` guard must still reject). Both session
      // settings are restored afterwards.
      await conn.query('SET FOREIGN_KEY_CHECKS=0');
      await conn.query("SET SESSION sql_mode=''");
      await conn.query('UPDATE pos_terminals SET branch_id = NULL WHERE id = ?', [
        terminalId,
      ]);
      await conn.query('SET SESSION sql_mode=DEFAULT');
      await conn.query('SET FOREIGN_KEY_CHECKS=1');
    }
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
    await conn.query('DELETE FROM user_permissions WHERE user_uid = ?', [seeded.userUid]);
    await conn.query('DELETE FROM users WHERE uid = ?', [seeded.userUid]);
    await conn.query('DELETE FROM pos_terminals WHERE id = ?', [seeded.terminalId]);
    await conn.query('DELETE FROM products WHERE warehouse_id = ?', [seeded.warehouseId]);
    await conn.query('DELETE FROM warehouses WHERE id = ?', [seeded.warehouseId]);
    await conn.query('DELETE FROM branch_number_series WHERE branch_id = ?', [seeded.branchId]);
    await conn.query('DELETE FROM branches WHERE id = ?', [seeded.branchId]);
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally {
    await conn.end();
  }
}

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

/**
 * Isa ka POS sale sa usa ka terminal: sales_transactions + pos_transactions.
 * Ang sale mapunta sa branch sa terminal, mao nga kini ang paagi sa pag-seed
 * ug sale para sa isolation tests. Ibalik ang sale id para ma-cleanup.
 */
export async function seedSaleOnTerminal(
  terminalId: string,
  userUid: string,
  opts: { status?: string } = {}
): Promise<string> {
  const conn = await getConn();
  const saleId = uuidv4();
  const status = opts.status ?? 'Paid';
  try {
    // branch_id is NOT NULL (migration 140): a sale belongs to the branch of
    // the terminal that rang it.
    const [termRows]: any = await conn.query(
      'SELECT branch_id FROM pos_terminals WHERE id = ?',
      [terminalId]
    );
    const branchId: string = termRows[0].branch_id;
    await conn.query(
      `INSERT INTO sales_transactions (id, reference, date, invoice_date, total, status, branch_id, created_at, updated_at)
       VALUES (?, ?, CURDATE(), CURDATE(), 100.00, ?, ?, NOW(), NOW())`,
      [saleId, `ISO-${saleId.slice(0, 8)}`, status, branchId]
    );
    await conn.query(
      `INSERT INTO pos_transactions
         (id, sale_id, user_id, terminal_id, transaction_type, subtotal, total_amount, branch_id, transaction_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'sale', 100.00, 100.00, ?, NOW(), NOW(), NOW())`,
      [`pt-${saleId}`, saleId, userUid, terminalId, branchId]
    );
  } finally {
    await conn.end();
  }
  return saleId;
}

export async function cleanupSale(saleId: string): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query('DELETE FROM pos_transactions WHERE sale_id = ?', [saleId]);
    await conn.query('DELETE FROM sales_transactions WHERE id = ?', [saleId]);
  } finally {
    await conn.end();
  }
}

/** Tangtangon ang mga warehouse sa branch aron mahimo kining branch nga walay warehouse. */
export async function removeBranchWarehouses(branchId: string): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    await conn.query(
      'DELETE FROM products WHERE warehouse_id IN (SELECT id FROM warehouses WHERE branch_id = ?)',
      [branchId]
    );
    await conn.query('DELETE FROM warehouses WHERE branch_id = ?', [branchId]);
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally {
    await conn.end();
  }
}

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

/** Mo-uli sa branch_id sa usa ka pos_transactions row (by id), o null kon wala. */
export async function readPosTransactionBranch(
  posTransactionId: string
): Promise<string | null> {
  const conn = await getConn();
  try {
    const [rows]: any = await conn.query(
      'SELECT branch_id FROM pos_transactions WHERE id = ?',
      [posTransactionId]
    );
    return rows[0]?.branch_id ?? null;
  } finally {
    await conn.end();
  }
}

/** Ang id sa main branch sa test DB. */
export async function readMainBranchId(): Promise<string> {
  const conn = await getConn();
  try {
    const [rows]: any = await conn.query(
      'SELECT id FROM branches WHERE is_main = 1 LIMIT 1'
    );
    return rows[0].id as string;
  } finally {
    await conn.end();
  }
}

/** Tangtangon ang usa ka pos_transactions row (by id). */
export async function cleanupPosTransaction(posTransactionId: string): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query('DELETE FROM pos_transactions WHERE id = ?', [posTransactionId]);
  } finally {
    await conn.end();
  }
}

/** Mo-uli sa tanan branch_number_series rows (SI, MC ug OR counters). */
export async function readSeries(): Promise<
  Array<{ branch_id: string; si_number: string; mc_number: string; bir_or_number: string }>
> {
  const conn = await getConn();
  try {
    const [rows]: any = await conn.query(
      'SELECT branch_id, si_number, mc_number, bir_or_number FROM branch_number_series'
    );
    return rows;
  } finally {
    await conn.end();
  }
}

/** I-advance ang tanan SI/MC/OR counters aron matestingan kon mo-reset ba. */
export async function advanceSeries(): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query(
      "UPDATE branch_number_series SET si_number = '000042', mc_number = '000042', bir_or_number = '000042'"
    );
  } finally {
    await conn.end();
  }
}

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
