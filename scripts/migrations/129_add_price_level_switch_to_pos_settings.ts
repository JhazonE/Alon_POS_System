import { registerMigration, Migration } from './runner';
import { query } from '../../lib/mysql';

export const migration: Migration = {
  name: '129_add_price_level_switch_to_pos_settings',
  timestamp: '2026-10-08_09-00-00',

  async up() {
    console.log('Running migration: 129_add_price_level_switch_to_pos_settings');

    // Defaults to FALSE: letting a cashier change the price level is a pricing
    // control, so an existing store must opt in rather than find the switcher
    // already live in the POS header after an update.
    const alterTableSQL = `
      ALTER TABLE pos_settings
      ADD COLUMN enable_price_level_switch BOOLEAN DEFAULT FALSE
    `;

    await query(alterTableSQL);
    console.log('✅ pos_settings table altered: added enable_price_level_switch');
  },

  async down() {
    console.log('Rolling back migration: 129_add_price_level_switch_to_pos_settings');

    const alterTableSQL = `
      ALTER TABLE pos_settings
      DROP COLUMN enable_price_level_switch
    `;

    await query(alterTableSQL);
    console.log('✅ pos_settings table altered: dropped enable_price_level_switch');
  }
};

registerMigration(migration);
