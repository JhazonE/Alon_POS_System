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
    await conn.query('DELETE FROM user_permissions WHERE user_uid = ?', [seeded.userUid]);
    await conn.query('DELETE FROM users WHERE uid = ?', [seeded.userUid]);
    await conn.query('DELETE FROM pos_terminals WHERE id = ?', [seeded.terminalId]);
    await conn.query('DELETE FROM warehouses WHERE id = ?', [seeded.warehouseId]);
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
