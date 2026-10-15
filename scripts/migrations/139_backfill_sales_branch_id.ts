import { registerMigration, Migration } from './runner';
import { query, withTransaction } from '../../lib/mysql';

/**
 * Backfill each sale's branch from the terminal that rang it.
 *
 * Sales with a NULL terminal_id get the main branch. That path exists
 * because app/api/sales/transactions inserts `terminalId || null`, so
 * historical non-POS sales have no terminal to derive from. On a
 * single-store installation the main branch is factually where they were
 * rung, and leaving them NULL would both block 140's NOT NULL tightening and
 * hide them from every branch user — under-reporting a tax figure.
 *
 * Idempotent: only NULL branch_id rows are touched.
 */
export const migration: Migration = {
  name: '139_backfill_sales_branch_id',
  timestamp: '2026-10-14_10-40-00',

  async up() {
    console.log('Running migration: 139_backfill_sales_branch_id');

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
    console.log('Rolling back migration: 139_backfill_sales_branch_id');
    await query(`UPDATE pos_transactions SET branch_id = NULL`);
    await query(`UPDATE sales_transactions SET branch_id = NULL`);
  }
};

registerMigration(migration);
