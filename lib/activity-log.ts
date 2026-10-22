import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/mysql';

/**
 * Server-side writer for the existing `user_activity_logs` audit trail.
 *
 * `logActivity` in lib/client-activity-logger.ts is a CLIENT helper: it reads
 * the user from localStorage and POSTs to /api/user-activity-logs, so it cannot
 * run in a route handler, and an audit row that depends on the browser making a
 * second request could be skipped. This writes the same row, with the same
 * column semantics, directly. It takes a connection so the audit row can commit
 * in the SAME transaction as the change it describes.
 */

/**
 * The table has no migration: /api/user-activity-logs creates it lazily on
 * first use. This is the identical DDL, so whichever path runs first wins and
 * the other is a no-op. DDL implicitly commits in MySQL, so call this BEFORE
 * opening a transaction, never inside one.
 */
export async function ensureActivityLogTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS user_activity_logs (
      id VARCHAR(36) PRIMARY KEY,
      user_uid VARCHAR(255) NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      action VARCHAR(100) NOT NULL,
      module VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      reference_id VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_uid (user_uid),
      INDEX idx_module (module),
      INDEX idx_action (action),
      INDEX idx_created_at (created_at)
    )
  `);
}

export interface ActivityLogEntry {
  userUid: string;
  userName: string;
  action: string;
  module: string;
  description: string;
  referenceId?: string | null;
}

/** Insert one audit row using the caller's connection (transaction-aware). */
export async function writeActivityLog(
  connection: { query: (sql: string, params: any[]) => Promise<any> },
  entry: ActivityLogEntry
): Promise<void> {
  await connection.query(
    `INSERT INTO user_activity_logs (id, user_uid, user_name, action, module, description, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      entry.userUid,
      entry.userName,
      entry.action,
      entry.module,
      entry.description,
      entry.referenceId ?? null,
    ]
  );
}
