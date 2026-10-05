import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The secret rules are process-wide and read at module load, so they are
// checked by running a child process per scenario rather than by re-importing.

const repoRoot = path.join(__dirname, '../..');
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');

function runWithEnv(env: Record<string, string | undefined>): { ok: boolean; output: string } {
  const script = `
    require('${path.join(repoRoot, 'lib/auth/session.ts').replace(/\\/g, '/')}');
    const { signSession } = require('${path.join(repoRoot, 'lib/auth/session.ts').replace(/\\/g, '/')}');
    signSession({ uid: 'u', username: 'u', userType: 'Admin', roleId: null, permissions: [] });
    console.log('SIGNED_OK');
  `;
  try {
    // Invoke tsx's CLI through the current node binary rather than `npx` with
    // `shell: true`: on Windows cmd.exe truncates a multi-line argument at the
    // first newline, so the child would run nothing and exit 0 with no output.
    const output = execFileSync(process.execPath, [tsxCli, '-e', script], {
      cwd: repoRoot,
      env: { ...process.env, ...env } as any,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    return { ok: true, output };
  } catch (e: any) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// --- production with no secret must refuse to sign ---

const prodNoSecret = runWithEnv({
  NODE_ENV: 'production',
  SERVER_SESSION_SECRET: undefined,
});
assert.equal(
  prodNoSecret.ok && prodNoSecret.output.includes('SIGNED_OK'),
  false,
  'production with SERVER_SESSION_SECRET unset must NOT sign a session'
);
assert.match(
  prodNoSecret.output,
  /SERVER_SESSION_SECRET/,
  'the production failure names the missing variable so an operator can act on it'
);

// --- production WITH a secret works ---

const prodWithSecret = runWithEnv({
  NODE_ENV: 'production',
  SERVER_SESSION_SECRET: 'a-real-secret',
});
assert.ok(
  prodWithSecret.ok && prodWithSecret.output.includes('SIGNED_OK'),
  'production with the secret set signs normally'
);

// --- development without a secret still works (warns) ---

const devNoSecret = runWithEnv({
  NODE_ENV: 'development',
  SERVER_SESSION_SECRET: undefined,
});
assert.ok(
  devNoSecret.ok && devNoSecret.output.includes('SIGNED_OK'),
  'development without the secret falls back to a per-boot secret'
);

// --- no committed default secret ---

const sessionSource = fs.readFileSync(path.join(repoRoot, 'lib/auth/session.ts'), 'utf-8');
assert.equal(
  /SERVER_SESSION_SECRET\s*(\|\||\?\?)\s*['"`]/.test(sessionSource),
  false,
  'session.ts must not fall back to a hardcoded secret literal — a committed ' +
    'default is how this guard gets defeated'
);

console.log('✓ session-secret');
