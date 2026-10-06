import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Source assertions for the POS login re-fetch (the hook cannot be rendered in
 * this plain-tsx unit runner). They pin the two ways that code can go wrong:
 *
 *  1. handlePosLoginSuccess is a plain function closing over the render's
 *     `businessSettings`, which is still null on a cold terminal whose mount
 *     fetch 401'd. Reading `businessSettings?.posMode` there blocks every
 *     pharmacy frontliner, permanently. The mode must come from fetchSettings'
 *     return value.
 *  2. The active-shift lookup must not swallow a failure into "no shift", or
 *     StartShiftDialog invites a second shift over a live one.
 */

const src = fs
  .readFileSync(path.join(__dirname, '../../app/(app)/pos/pos-content/use-pos.ts'), 'utf-8')
  .replace(/\r\n/g, '\n');

const start = src.indexOf('const handlePosLoginSuccess');
const end = src.indexOf('const handleContinueShift');
assert.ok(start > -1 && end > start, 'handlePosLoginSuccess is present');
const login = src.slice(start, end);

// --- fetchSettings hands its result back ---
const fetchStart = src.indexOf('const fetchSettings = useCallback');
const fetchBody = src.slice(fetchStart, src.indexOf('}, []);', fetchStart));
assert.match(fetchBody, /Promise<SystemSettings \| null>/, 'fetchSettings returns the settings or null');
assert.match(fetchBody, /return merged;/, 'fetchSettings returns the merged settings');

// --- the frontliner gate reads the fetched value, not the stale state ---
assert.match(
  login,
  /const settings = businessSettings \?\? \(await fetchSettings\(\)\);/,
  'login success obtains settings from fetchSettings when the state is empty'
);
assert.match(
  login,
  /userIsFrontliner && settings\?\.posMode !== 'pharmacy'/,
  'the frontliner gate reads the value derived from fetchSettings'
);
assert.equal(
  login.includes('businessSettings?.posMode'),
  false,
  'the frontliner gate must not read the stale businessSettings state'
);
assert.match(
  login,
  /setFrontlinerBlockReason\(settings \? 'default-mode' : 'unverified'\)/,
  'a failed settings fetch is reported as unverified, not as Default Mode'
);

// --- the active-shift lookup does not swallow failures ---
assert.equal(/catch\s*\{\s*\}\s*finally/.test(login), false, 'no bare `catch {} finally` around the shift lookup');
const shiftCatch = login.slice(login.indexOf('active-shift lookup failed'));
assert.match(shiftCatch, /setIsPosLoggedIn\(false\)/, 'a failed shift lookup returns to the login overlay');

console.log('✓ pos-login-reload');
