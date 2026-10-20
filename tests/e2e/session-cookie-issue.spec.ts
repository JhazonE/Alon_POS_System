import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-data';
import { verifySession, sessionSecret, SESSION_COOKIE_NAME } from '../../lib/session-cookie';

/**
 * Ang login mo-issue sa signed session cookie; ang verification-only nga tawag
 * (supervisor override sa POS) DILI, aron dili mausab ang identity sa terminal.
 */
function sessionCookies(headers: { name: string; value: string }[]): string[] {
  return headers
    .filter((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(`${SESSION_COOKIE_NAME}=`))
    .map((h) => h.value);
}

const creds = { username: TEST_USERS.admin.username, password: TEST_USERS.admin.password };

test.describe('Session cookie issuance sa /api/auth/login', () => {
  test('ang tinuod nga login mo-set sa signed cookie nga mo-match sa uid', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: creds });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const cookies = sessionCookies(res.headersArray());
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/HttpOnly/i);
    const token = cookies[0].split(';')[0].split('=').slice(1).join('=');
    expect(verifySession(token, sessionSecret())).toBe(body.uid);
  });

  test('ang verifyOnly nga login (supervisor override) dili mo-set sa cookie', async ({ request }) => {
    const res = await request.post('/api/auth/login', { data: { ...creds, verifyOnly: true } });
    expect(res.status()).toBe(200);
    expect(sessionCookies(res.headersArray())).toHaveLength(0);
  });

  test('ang JSON body parehas bisan naay verifyOnly', async ({ request }) => {
    const a = await (await request.post('/api/auth/login', { data: creds })).json();
    const b = await (await request.post('/api/auth/login', { data: { ...creds, verifyOnly: true } })).json();
    expect(Object.keys(b)).toEqual(Object.keys(a));
    expect(Object.keys(a)).toEqual([
      'uid', 'username', 'email', 'userType', 'roleId', 'displayName', 'photoURL', 'permissions',
    ]);
    expect(b).toEqual(a);
  });
});
