import { test as base, expect } from '@playwright/test';
import { DEFAULT_ADMIN, mintSessionToken } from './auth';

/**
 * `test` whose `request` fixture is authenticated as DEFAULT_ADMIN.
 *
 * Specs call the API directly from test code (`request.get('/api/products')`,
 * `request.post('/api/pos-settings')`, ...) for setup and verification. Every
 * API route now needs a bearer token, so those calls would 401 without this.
 *
 * Only `request` is affected - the browser `page` is not given the header, so
 * app behaviour under test still goes through the real seeded session. Specs
 * that must exercise the UNauthenticated boundary (api-auth.spec.ts) import
 * `test` from '@playwright/test' instead.
 */
export const test = base.extend({
  request: async ({ playwright, baseURL }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${mintSessionToken(DEFAULT_ADMIN)}` },
    });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect };
