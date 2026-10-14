/**
 * Next.js instrumentation hook — the single place background workers start.
 *
 * This used to live in lib/mysql.ts as `import './init-scheduler'`, which
 * created a module cycle: mysql -> init-scheduler -> scheduler -> mysql.
 * Under Playwright's loader that cycle throws
 * "Cannot require() ES Module lib/mysql.ts in a cycle", and it also meant
 * every test worker, script and `tsx -e` one-liner that imported the DB
 * module silently booted cron jobs.
 *
 * register() runs once per server process, after the module graph is loaded,
 * so initScheduler() can query the database safely without the setImmediate
 * deferral the old init-scheduler.ts needed.
 *
 * NOTE: this starts one scheduler per server process. This project runs one
 * server per terminal against a shared DB, so a multi-terminal store still
 * runs N schedulers — the single-writer lease is Phase 3, not this change.
 */
export async function register(): Promise<void> {
  // Guard: only the Node.js runtime can run cron jobs and open DB pools.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { initScheduler } = await import('./lib/scheduler');
  initScheduler();
}
