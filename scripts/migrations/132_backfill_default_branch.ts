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
