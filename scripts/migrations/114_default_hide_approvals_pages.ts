import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

// Approvals Board and Workflow Settings stay reachable (still listed and
// toggleable in Developer Options > Page Visibility) but start hidden from
// the sidebar for new and existing installs.
const DEFAULT_HIDDEN_KEYS = ['approvals', 'approvals_settings'];

const migration: Migration = {
  name: '114_default_hide_approvals_pages',
  timestamp: '2026-09-21_10-00-00',

  async up(): Promise<void> {
    await query(`
      CREATE TABLE IF NOT EXISTS disabled_pages (
        page_key VARCHAR(100) NOT NULL PRIMARY KEY,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    for (const key of DEFAULT_HIDDEN_KEYS) {
      await query('INSERT IGNORE INTO disabled_pages (page_key) VALUES (?)', [key]);
    }
    console.log('✅ Approvals Board and Workflow Settings hidden by default');
  },

  async down(): Promise<void> {
    await query(
      `DELETE FROM disabled_pages WHERE page_key IN (${DEFAULT_HIDDEN_KEYS.map(() => '?').join(',')})`,
      DEFAULT_HIDDEN_KEYS,
    );
  }
};

registerMigration(migration);
