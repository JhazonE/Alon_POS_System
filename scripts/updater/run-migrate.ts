// Dedicated entrypoint for the update installer (VendixUpdater.iss).
//
// Not `npm run migrate` (scripts/migrations/index.ts) directly. Importing
// lib/mysql.ts opens a MySQL connection pool, and nothing in the migration path
// closes it, so the plain migration CLI does not exit on its own (verified: it
// is still alive after 90s once migrateUp() resolves; ending the pool lets it
// exit). An unattended installer .bat waiting on that would hang indefinitely.
// This wrapper runs the same migrateUp() and then force-exits once it resolves,
// so the force-exit is load-bearing. (Before startup moved to instrumentation.ts,
// lib/mysql.ts also started node-cron jobs via init-scheduler; that is gone, but
// the pool alone is enough to need the exit.)
//
// This file lives under {app}\updater (its own node_modules/tsconfig.json,
// kept separate from the app's real node_modules — see run_update.bat), but
// the real .env is one level up at {app}\.env. lib/mysql.ts's own
// dotenv.config() resolves relative to process.cwd(), which run_update.bat
// deliberately sets to {app}\updater (tsx's tsconfig-paths resolution for
// the @/* aliases used throughout lib/ needs cwd there, not {app}). So load
// the real .env explicitly here, first — dotenv.config() defaults to
// non-destructive (default `override: false`), so lib/mysql.ts's later
// no-args call just no-ops for keys already set here.
//
// migrations/index (and lib/mysql.ts transitively) is loaded via require(),
// not a static import: static imports are hoisted and run before this file's
// own top-level code, which would call lib/mysql.ts's dotenv.config() (cwd-
// relative, finding nothing useful) before the explicit call below ever
// executes — and since dotenv doesn't override already-set keys, that first,
// wrong call would win. require() below runs strictly after line 22.
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { migrateUp } = require('../migrations/index') as typeof import('../migrations/index');

migrateUp()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('❌ Update migration failed:', error);
    process.exit(1);
  });
