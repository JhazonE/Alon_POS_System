import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { toLocalYmd } from '../../lib/fiscal-utils';

// X/Z reading numbers embed the business date (X-YYYYMMDD-NNN). That date must
// be the LOCAL calendar day, not the UTC one.
//
// Philippine stores run at UTC+8, so a Z-reading generated at 07:00 on Oct 5
// local is still Oct 4 in UTC. Formatting via toISOString() stamped the prior
// day onto a locked BIR report — the exact hazard lib/fiscal-utils.ts warns
// about and provides toLocalYmd() for.

// --- The underlying hazard: toISOString() moves the day at UTC+8 ---

// 2026-10-05 07:00 local time in UTC+8 == 2026-10-04T23:00Z.
const morningInManila = new Date('2026-10-04T23:00:00.000Z');
const utcDay = morningInManila.toISOString().split('T')[0];

// Guard: this assertion documents WHY the fix matters, and only holds when the
// test host is actually east of UTC (as a Philippine deployment is). Skip the
// comparison elsewhere rather than failing on an unrelated machine's timezone.
if (morningInManila.getHours() >= 7) {
  assert.equal(
    utcDay,
    '2026-10-04',
    'toISOString() yields the PREVIOUS calendar day for a UTC+8 morning'
  );
  assert.equal(
    toLocalYmd(morningInManila),
    '2026-10-05',
    'toLocalYmd() yields the correct LOCAL calendar day'
  );
  assert.notEqual(
    toLocalYmd(morningInManila),
    utcDay,
    'the two differ — which is why reading numbers must not use toISOString()'
  );
}

// --- The reading-number builders must use the local-date helper ---

const mysqlSource = fs.readFileSync(
  path.join(__dirname, '../../lib/mysql.ts'),
  'utf-8'
);

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start !== -1, `lib/mysql.ts declares ${name}`);
  const openIndex = source.indexOf('{', start);
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`could not find end of ${name}`);
}

// Strip comments before asserting: the fix's own comment names toISOString()
// to explain why it is not used, and a naive source grep would read that
// mention as a violation.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

for (const fnName of ['getNextXReadingNumber', 'getNextZReadingNumber']) {
  const fnSource = stripComments(extractFunction(mysqlSource, fnName));

  assert.ok(
    !/toISOString\(\)/.test(fnSource),
    `${fnName} must not build its date with toISOString() — it shifts the ` +
      `calendar day for UTC+8 stores and stamps the wrong business date on a ` +
      `BIR reading`
  );
  assert.ok(
    /toLocalYmd\(/.test(fnSource),
    `${fnName} builds its date with toLocalYmd() from lib/fiscal-utils`
  );
}

console.log('✓ reading-number-local-date');
