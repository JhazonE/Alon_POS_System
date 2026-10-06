import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Source assertions, matching the technique in checkout-terminal-lock.test.ts:
// these routes are the ones where a forged request is irreversible, so every
// mutating handler in each must open with a requirePermission guard that
// returns early. The check is PER HANDLER: a file-level "mentions
// requirePermission" check would pass while a sibling handler sat unguarded.

const repoRoot = path.join(__dirname, '../..');

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf-8');
}

type Guarded = {
  file: string;
  permission: string;
  methods: string[]; // the exact set of mutating handlers the file must export
  why: string;
};

const GUARDED: Guarded[] = [
  { file: 'app/api/users/route.ts', permission: 'manage_users', methods: ['POST', 'PATCH', 'DELETE'], why: 'privilege escalation (POST/PATCH rewrite user_permissions) and user deletion (DELETE ?uid=)' },
  { file: 'app/api/users/[uid]/route.ts', permission: 'manage_users', methods: ['PUT'], why: 'privilege escalation (this file has no DELETE)' },
  { file: 'app/api/auth/signup/route.ts', permission: 'manage_users', methods: ['POST'], why: 'second user-creation door' },
  { file: 'app/api/user-types/route.ts', permission: 'manage_users', methods: ['POST'], why: 'rewrites the permission model' },
  { file: 'app/api/user-types/[id]/route.ts', permission: 'manage_users', methods: ['PATCH', 'DELETE'], why: 'rewrites the permission model' },
  { file: 'app/api/data-management/reset/route.ts', permission: 'manage_settings', methods: ['POST'], why: 'wipes sales; resets BIR SI numbering' },
  { file: 'app/api/sales/z-reading/route.ts', permission: 'view_sales', methods: ['POST'], why: 'legally locked BIR report' },
  { file: 'app/api/license/deactivate/route.ts', permission: 'manage_settings', methods: ['POST'], why: 'removes the license; halts the store' },
];

const HANDLER_RE = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/g;

/** Returns each mutating handler's method and the text from just after its opening `{`. */
function mutatingHandlers(source: string): { method: string; body: string }[] {
  const found: { method: string; body: string }[] = [];
  for (const match of source.matchAll(HANDLER_RE)) {
    const afterName = source.slice(match.index! + match[0].length);
    // End of the parameter list: the first `) {` followed by a newline. Dynamic
    // routes span several lines, and `{ params }: { params: ... }` contains no
    // parentheses, so the first `)` that precedes `{` closes the signature.
    const sig = /\)\s*\{[ \t]*\r?\n/.exec(afterName);
    assert.ok(sig, `could not find the body of ${match[1]}`);
    found.push({ method: match[1], body: afterName.slice(sig.index + sig[0].length) });
  }
  return found;
}

for (const { file, permission, methods, why } of GUARDED) {
  const handlers = mutatingHandlers(read(file));

  assert.deepEqual(
    handlers.map((h) => h.method).sort(),
    [...methods].sort(),
    `${file} exports exactly the mutating handlers this test expects — if a handler was added, guard it and list it here`
  );

  const guard = new RegExp(
    `^\\s*const\\s+(\\w+)\\s*=\\s*requirePermission\\(\\s*request\\s*,\\s*['"]${permission}['"]\\s*\\)\\s*;\\s*\\r?\\n` +
      `\\s*if\\s*\\(\\s*\\1\\s*\\)\\s*return\\s+\\1\\s*;`
  );

  for (const { method, body } of handlers) {
    // The guard must be the FIRST statement (before `try`, before request.json()),
    // and must return early rather than computing a value and ignoring it.
    assert.match(
      body,
      guard,
      `${file} ${method} must open with requirePermission(request, '${permission}') and return the denial early (${why})`
    );
  }
}

// Guards are only meaningful if the import resolves: every guarded file imports it.
for (const { file } of GUARDED) {
  assert.ok(
    read(file).includes(`from '@/lib/auth/require-permission'`),
    `${file} imports requirePermission from '@/lib/auth/require-permission'`
  );
}

// --- login issues a token ---

const loginSource = read('app/api/auth/login/route.ts');
assert.ok(
  loginSource.includes(`import { signSession } from '@/lib/auth/session'`),
  'login imports signSession'
);
assert.match(
  loginSource,
  /const token = signSession\(\{[\s\S]*?permissions: userPermissions,[\s\S]*?\}\);[\s\S]*?return NextResponse\.json\(\{\s*token,/,
  'login signs the session and returns the token as the first field of the response'
);
// The dev-preview identity must carry the 13 real permissions, never the
// 'super_admin' string, which the server deliberately does not treat as a bypass.
assert.ok(!loginSource.includes('super_admin'), 'dev preview does not rely on a super_admin bypass');
assert.match(loginSource, /devPreview === true/, 'login has a dev-preview path');
assert.match(
  loginSource,
  /NODE_ENV !== 'production'[\s\S]*devPreview/,
  'dev-preview path is gated off in production'
);

console.log('✓ destructive-route-guards');
