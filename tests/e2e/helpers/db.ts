import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Test-DB helpers para sa per-test isolation.
 *
 * Gi-target ang `alon_pos_test` (hardcoded) — DILI ang dev `alon_pos`. Gamiton sa
 * beforeEach aron limpyo ang transactional state (shifts/sales) kada test, kay ang
 * POS mo-resume ug existing active shift nga makaguba sa test isolation.
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

// FK-safe nga order: anak una sa ginikanan.
const TRANSACTIONAL_TABLES = [
  'pos_transaction_items',
  'pos_transactions',
  'sale_items',
  'sales_transactions',
  'shifts',
];

/** I-clear ang tanan shift/sale state para pristine ang sunod nga test. */
export async function resetPosState(): Promise<void> {
  const conn = await getConn();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of TRANSACTIONAL_TABLES) {
      try {
        await conn.query(`DELETE FROM \`${table}\``);
      } catch (err: any) {
        // I-ignore ra ang "table doesn't exist" — defensive lang.
        if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
      }
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally {
    await conn.end();
  }
}

/** Modagan ug usa ka statement batok sa `alon_pos_test`. Para sa seed/assert sa specs. */
export async function testQuery(sql: string, params: any[] = []): Promise<any> {
  const conn = await getConn();
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}
