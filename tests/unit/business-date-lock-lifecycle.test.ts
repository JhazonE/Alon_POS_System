import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Source-assertion tests for the business-date lock lifecycle (BIR Annex F
// checklist item #29): a Z-reading SETS the lock, and both ways of resuming
// work on a terminal — starting a fresh shift (POST) and taking over an
// already-active shift (PUT) — must CLEAR it. This mirrors the technique
// checkout-terminal-lock.test.ts already uses (reading route source and
// asserting expected SQL fragments) instead of re-implementing DB logic
// here, per this plan's established anti-mirroring approach.
//
// The PUT-takeover assertion is the important one: before this test existed,
// the takeover branch only transferred shift ownership and never cleared the
// lock, so a terminal Z-read mid-shift (Task 6 made this possible) would
// stay locked forever across a takeover. This test would have caught that.

const zReadingSource = fs.readFileSync(
  path.join(__dirname, '../../app/api/sales/z-reading/route.ts'),
  'utf-8'
);
const shiftsSource = fs.readFileSync(
  path.join(__dirname, '../../app/api/pos/shifts/route.ts'),
  'utf-8'
);

// --- Z-reading generation SETS the lock ---

assert.ok(
  zReadingSource.includes('business_date_locked_at'),
  'z-reading route.ts references business_date_locked_at'
);
assert.ok(
  /UPDATE\s+pos_terminals\s+SET\s+business_date_locked_at\s*=\s*NOW\(\)/.test(zReadingSource),
  'z-reading route.ts sets business_date_locked_at = NOW() on the terminal when generating a reading'
);

// --- Shift start (POST) CLEARS the lock ---

const postHandlerMatch = shiftsSource.match(/export async function POST[\s\S]*?(?=export async function PUT|$)/);
assert.ok(postHandlerMatch, 'shifts route.ts has a POST handler');
const postHandlerSource = postHandlerMatch![0];

assert.ok(
  postHandlerSource.includes('business_date_locked_at'),
  'shifts POST handler references business_date_locked_at'
);
assert.ok(
  /UPDATE\s+pos_terminals\s+SET\s+business_date_locked_at\s*=\s*NULL/.test(postHandlerSource),
  'shifts POST handler clears business_date_locked_at (sets it to NULL) when a new shift starts'
);

// --- Shift takeover (PUT, takeoverUserId branch) CLEARS the lock ---

const putHandlerMatch = shiftsSource.match(/export async function PUT[\s\S]*$/);
assert.ok(putHandlerMatch, 'shifts route.ts has a PUT handler');
const putHandlerSource = putHandlerMatch![0];

// Extract the takeoverUserId branch by counting braces rather than with a
// lazy-quantifier regex. A regex like /if \(takeoverUserId\) \{[\s\S]*?\n\s*\}/
// stops at the FIRST nested closing brace — here the inner `if (lockoutEnforced)`
// guard — so it captured only the lock *read* and never reached the
// `business_date_locked_at = NULL` unlock below it, failing against correct
// production code.
function extractBraceBlock(source: string, startPattern: RegExp): string | null {
  const start = source.match(startPattern);
  if (!start || start.index === undefined) return null;
  const openIndex = source.indexOf('{', start.index);
  if (openIndex === -1) return null;

  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start.index, i + 1);
    }
  }
  return null;
}

const takeoverBranchSource = extractBraceBlock(
  putHandlerSource,
  /if\s*\(\s*takeoverUserId\s*\)\s*\{/
);
assert.ok(takeoverBranchSource, 'PUT handler has a takeoverUserId branch');

assert.ok(
  takeoverBranchSource!.includes('business_date_locked_at'),
  'PUT takeover branch references business_date_locked_at (Critical fix: takeover must clear the lock, not just transfer ownership)'
);
assert.ok(
  /business_date_locked_at\s*=\s*NULL/.test(takeoverBranchSource!),
  'PUT takeover branch sets business_date_locked_at = NULL, clearing the lock on the terminal the taken-over shift belongs to'
);
assert.ok(
  /WHERE\s+s\.id\s*=\s*\?/.test(takeoverBranchSource!) || /WHERE\s+id\s*=\s*\?/.test(takeoverBranchSource!),
  'PUT takeover branch scopes the unlock to the specific shift/terminal (not store-wide)'
);

console.log('✓ business-date-lock-lifecycle');
