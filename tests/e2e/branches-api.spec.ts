import { test, expect } from '@playwright/test';

test.describe('GET /api/branches', () => {
  test('mo-uli sa main branch nga gi-himo sa migration', async ({ request }) => {
    const res = await request.get('/api/branches');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    const main = body.data.find((b: any) => b.isMain);
    expect(main).toBeTruthy();
    expect(main.code).toBe('MAIN');
  });
});

test.describe('POST /api/branches', () => {
  test('mo-himo ug bag-ong branch', async ({ request }) => {
    const code = `B${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Cebu Branch', address: 'Cebu City', tin: '123-456-789-000' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeTruthy();
  });

  test('gi-reject ang duplicate nga code', async ({ request }) => {
    const code = `D${Date.now().toString().slice(-6)}`;
    await request.post('/api/branches', { data: { code, name: 'First' } });
    const res = await request.post('/api/branches', { data: { code, name: 'Second' } });
    expect(res.status()).toBe(409);
  });

  test('gi-reject kung walay code o name', async ({ request }) => {
    const res = await request.post('/api/branches', { data: { name: 'No code' } });
    expect(res.status()).toBe(400);
  });
});
