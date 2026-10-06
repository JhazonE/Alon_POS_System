/**
 * One-shot migration: bare fetch -> authFetch for this app's own API calls.
 *
 * Run from the repo root:  npx tsx scripts/codemod/auth-fetch.ts
 * Pass --check to report what WOULD change without writing anything.
 *
 * Only the two mechanical shapes are rewritten:
 *    fetch(getApiUrl(...))        -> authFetch(getApiUrl(...))
 *    fetch('/api/...')            -> authFetch('/api/...')
 * Anything indirect (fetch(url), fetch(fullUrl)) is REPORTED, never rewritten:
 * the script cannot tell our API from a third party's through a variable.
 *
 * Deliberately excluded, mechanically (never "revert it by hand afterwards"):
 *
 *  1. Directories
 *     - app/api/**                     server-side route handlers
 *     - lib/integrations/sta-lucia/**  THIRD-PARTY mall API. It uses /api/ paths
 *                                      (/api/login, /api/get-sales, ...) but they
 *                                      belong to the mall; sending our session
 *                                      token there would leak a credential.
 *     - lib/api-config.ts              defines authFetch itself
 *
 *  2. Pre-token call sites (PRE_TOKEN_SITES below), matched by file AND line
 *     content. They call routes on the public allowlist
 *     (lib/auth/public-routes.ts) before any token exists. authFetch redirects
 *     to /login on a 401 and a failed login IS a 401, so migrating them would
 *     replace the "invalid credentials" message with a redirect loop and break
 *     the activation screen before any user exists.
 *
 * The script exits non-zero if any PRE_TOKEN_SITES entry does not match exactly
 * once, so the list cannot silently rot.
 */
import fs from 'node:fs';
import path from 'node:path';

const CHECK_ONLY = process.argv.includes('--check');

const ROOTS = ['app', 'lib', 'hooks', 'components'];

const EXCLUDED_DIRS = ['app/api/', 'lib/integrations/sta-lucia/'];
const EXCLUDED_FILES = ['lib/api-config.ts'];

const PRE_TOKEN_SITES: { file: string; needle: string }[] = [
  { file: 'app/(app)/pos/admin-auth/use-admin-auth.ts', needle: "fetch(getApiUrl('/auth/login')" },
  { file: 'app/(app)/pos/login-form/use-login-form.ts', needle: "fetch(getApiUrl('/auth/login')" },
  { file: 'app/(app)/use-app-layout.ts', needle: "fetch(getApiUrl('/auth/login')" },
  { file: 'app/(app)/use-license-heartbeat.ts', needle: "fetch('/api/license/heartbeat'" },
  { file: 'app/activate/page.tsx', needle: "fetch('/api/license/status')" },
  { file: 'app/activate/page.tsx', needle: "fetch('/api/license/activate-online'" },
  { file: 'app/activate/page.tsx', needle: "fetch('/api/license/activate'" },
  { file: 'app/login/page.tsx', needle: "fetch('/api/license/status')" },
  { file: 'app/login/page.tsx', needle: "fetch(getApiUrl('/auth/login')" },
  { file: 'components/license-gate.tsx', needle: "fetch('/api/license/status'" },
  { file: 'components/license-gate.tsx', needle: "fetch('/api/license/heartbeat'" },
  { file: 'components/license-gate.tsx', needle: "fetch('/api/license/activate'" },
  { file: 'components/license-gate.tsx', needle: "fetch('/api/license/activate-online'" },
];

const preTokenHits = PRE_TOKEN_SITES.map(() => 0);

function isPreTokenLine(file: string, line: string): boolean {
  let hit = false;
  PRE_TOKEN_SITES.forEach((site, i) => {
    if (site.file === file && line.includes(site.needle)) {
      preTokenHits[i]++;
      hit = true;
    }
  });
  return hit;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const MECHANICAL = /\bfetch\((getApiUrl\(|(['"`])\/api\/)/g;
// A fetch( whose first argument is neither of the mechanical shapes nor an
// absolute URL literal: the target cannot be known statically.
const INDIRECT = /\bfetch\(\s*(?!getApiUrl\(|['"`]\/api\/|['"`]https?:)/;

function addImport(source: string): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';

  // Extend an existing import from the api-config module (alias or relative).
  const existing = /import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]*\/api-config)\2/;
  const m = existing.exec(source);
  if (m) {
    if (/\bauthFetch\b/.test(m[1])) return source;
    return source.replace(
      existing,
      (_full, names: string, q: string, spec: string) =>
        `import {${names.replace(/\s*$/, '')}, authFetch } from ${q}${spec}${q}`
    );
  }

  // Otherwise add a new import AFTER any leading directive ('use client'),
  // because a directive is only honoured as the very first statement.
  const directive = /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)?(['"]use (?:client|server)['"];?[ \t]*\r?\n)/;
  const d = directive.exec(source);
  const line = `import { authFetch } from '@/lib/api-config';${eol}`;
  if (d) {
    const end = d[0].length;
    return source.slice(0, end) + line + source.slice(end);
  }
  return line + source;
}

const manual: string[] = [];
let rewritten = 0;
const changedFiles: string[] = [];

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;

  for (const file of walk(root)) {
    const rel = file.split(path.sep).join('/');
    if (EXCLUDED_DIRS.some((ex) => rel.startsWith(ex))) continue;
    if (EXCLUDED_FILES.includes(rel)) continue;

    const original = fs.readFileSync(file, 'utf-8');
    // Split on \n only so CRLF files keep their \r at the end of each line.
    const lines = original.split('\n');
    let fileRewrites = 0;

    const out = lines.map((line, i) => {
      if (isPreTokenLine(rel, line)) return line; // excluded by path + content

      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return line;

      if (INDIRECT.test(line)) manual.push(`${rel}:${i + 1}: ${trimmed.slice(0, 110)}`);

      return line.replace(MECHANICAL, (_full, tail: string) => {
        fileRewrites++;
        return `authFetch(${tail}`;
      });
    });

    if (fileRewrites === 0) continue;

    let source = addImport(out.join('\n'));
    rewritten += fileRewrites;
    changedFiles.push(rel);
    if (!CHECK_ONLY) fs.writeFileSync(file, source);
  }
}

const unmatched = PRE_TOKEN_SITES.filter((_s, i) => preTokenHits[i] !== 1);
if (unmatched.length > 0) {
  console.error('PRE_TOKEN_SITES entries that did not match exactly once:');
  for (const s of unmatched) console.error(`  ${s.file}  ${s.needle}`);
  process.exitCode = 1;
}

console.log(
  `${CHECK_ONLY ? '[check] Would rewrite' : 'Rewrote'} ${rewritten} call site(s) across ${changedFiles.length} file(s).`
);
console.log(`Skipped ${PRE_TOKEN_SITES.length} pre-token call site(s) (public routes, plain fetch by design).`);
if (manual.length > 0) {
  console.log(`\n${manual.length} call site(s) need MANUAL review (indirect URL):`);
  for (const m of manual) console.log(`  ${m}`);
}
