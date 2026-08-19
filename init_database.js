'use strict';
// Alon POS - Database Initializer
// Creates the database (if missing) and applies schema.sql, which contains
// CREATE TABLE IF NOT EXISTS for every table. Safe to run on both fresh and
// existing installs: it never drops tables and never touches existing data.
// Runs BEFORE migrate.js (see run_migration.bat).

const fs = require('fs');
const path = require('path');

// Parse .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

// Resolve mysql2 from standalone build or node_modules
let mysql;
try {
  mysql = require('./node_modules/mysql2/promise');
} catch {
  mysql = require('mysql2/promise');
}

async function run() {
  console.log('Alon POS - Database Initialization');
  console.log('=======================================');

  const dbName = process.env.DB_NAME || 'alon_pos';

  const schemaPath = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`[fail] schema.sql not found at ${schemaPath}`);
    process.exit(1);
  }
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Connect WITHOUT selecting a database so we can create it if needed.
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` ` +
      `CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
    console.log(`[ok]   database "${dbName}" ready`);

    await conn.query(`USE \`${dbName}\``);

    // schema.sql wraps statements with FOREIGN_KEY_CHECKS=0, so create order
    // is irrelevant; every CREATE TABLE is IF NOT EXISTS, so existing tables
    // (and their data) are left untouched.
    await conn.query(schema);
    console.log('[ok]   schema applied (CREATE TABLE IF NOT EXISTS for all tables)');

    console.log('=======================================');
    console.log('Database initialization complete.');
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('Initialization failed:', err.message);
  process.exit(1);
});
