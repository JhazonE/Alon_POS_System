import { test, expect } from '@playwright/test';
import { readSeries } from './helpers/branches';

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

test.describe('POST /api/branches — per-branch numbering landed', () => {
  test('ang bag-ong branch kay ACTIVE na, kay naa nay kaugalingong series', async ({ request }) => {
    const code = `A${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Active Branch' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.warning).toBeUndefined();

    const list = await (await request.get('/api/branches')).json();
    const created = list.data.find((b: any) => b.code === code);
    expect(created).toBeTruthy();
    expect(created.isActive).toBe(1);
  });

  test('ang bag-ong branch adunay series row nga nagsugod sa 000000', async ({ request }) => {
    const code = `S${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Series Branch' },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()).data;

    const row = (await readSeries()).find((r) => r.branch_id === id);
    expect(row).toBeTruthy();
    expect(row!.si_number).toBe('000000');
    expect(row!.mc_number).toBe('000000');
    expect(row!.bir_or_number).toBe('000000');
  });

  test('ang gi-reject nga duplicate code walay mabilin nga series row', async ({ request }) => {
    const code = `R${Date.now().toString().slice(-6)}`;
    const first = await request.post('/api/branches', { data: { code, name: 'First' } });
    const { id } = (await first.json()).data;
    const before = (await readSeries()).length;

    const dup = await request.post('/api/branches', { data: { code, name: 'Second' } });
    expect(dup.status()).toBe(409);

    const rows = await readSeries();
    expect(rows.length).toBe(before);
    expect(rows.filter((r) => r.branch_id === id)).toHaveLength(1);
  });
});
