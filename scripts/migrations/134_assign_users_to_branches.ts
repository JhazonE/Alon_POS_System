import { registerMigration, Migration } from './runner';
import { query, withTransaction } from '../../lib/mysql';
import { v4 as uuidv4 } from 'uuid';

/**
 * Assign existing users to branches so an upgraded single-store install
 * behaves exactly as it did before multi-branch.
 *
 * Migration 132 leaves users.branch_id NULL, and a user with no branch and
 * no all_branches permission is refused (403) by every branch-filtered route.
 *
 *  - Admin-type users stay head office (branch_id NULL) and are granted
 *    'all_branches'. "Admin" is matched the way the codebase does it:
 *    user_type 'Admin' / 'Super Admin' (case-insensitive, since the repo
 *    stores 'ADMIN', 'Admin' and 'Super Admin'), or username 'admin'
 *    (data-management reset uses the same fallback).
 *  - Everyone else with branch_id NULL joins the main branch.
 *
 * Idempotent: only NULL branch_id rows are touched and the grant uses
 * INSERT IGNORE against UNIQUE (user_uid, permission).
 *
 * down() cannot know which rows were assigned by hand before, so it
 * reverses by rule: admin-type users lose the grant, and non-admin users
 * on the main branch go back to NULL.
 */
const ADMIN_PREDICATE =
  `(LOWER(TRIM(user_type)) IN ('admin', 'super admin') OR LOWER(username) = 'admin')`;

export const migration: Migration = {
  name: '134_assign_users_to_branches',
  timestamp: '2026-10-12_10-40-00',

  async up() {
    console.log('Running migration: 134_assign_users_to_branches');

    await withTransaction(async (connection) => {
      const [main]: any = await connection.query(
        `SELECT id FROM branches WHERE is_main = 1 LIMIT 1`
      );
      if (main.length === 0) {
        throw new Error('No main branch found. Run migration 132_backfill_default_branch first.');
      }
      const mainId = main[0].id;

      const [admins]: any = await connection.query(
        `SELECT uid FROM users WHERE branch_id IS NULL AND ${ADMIN_PREDICATE}`
      );
      let granted = 0;
      for (const a of admins) {
        const [r]: any = await connection.query(
          `INSERT IGNORE INTO user_permissions (id, user_uid, permission)
           VALUES (?, ?, 'all_branches')`,
          [uuidv4(), a.uid]
        );
        granted += r.affectedRows;
      }
      console.log(`✅ ${admins.length} admin user(s) kept as head office (${granted} new all_branches grant(s))`);

      const [res]: any = await connection.query(
        `UPDATE users SET branch_id = ? WHERE branch_id IS NULL AND NOT ${ADMIN_PREDICATE}`,
        [mainId]
      );
      console.log(`✅ Assigned ${res.affectedRows} user(s) to the main branch`);
    });
  },

  async down() {
    console.log('Rolling back migration: 134_assign_users_to_branches');
    await query(
      `DELETE FROM user_permissions
       WHERE permission = 'all_branches'
         AND user_uid IN (SELECT uid FROM users WHERE ${ADMIN_PREDICATE})`
    );
    await query(
      `UPDATE users SET branch_id = NULL
       WHERE NOT ${ADMIN_PREDICATE}
         AND branch_id IN (SELECT id FROM branches WHERE is_main = 1)`
    );
  }
};

registerMigration(migration);
