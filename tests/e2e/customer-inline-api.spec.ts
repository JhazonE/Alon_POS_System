import { test, expect } from '@playwright/test';

/**
 * Customer write-API behavior nga gikinahanglan sa inline add/rename.
 * Tanan API-level (walay UI), batok sa alon_pos_test.
 */

test.describe('Customer inline write API', () => {
  test('POST /api/customers → mo-create ug name-only customer (walay contactNumber)', async ({ request }) => {
    const id = `cust_t${Date.now().toString(36)}`;
    const res = await request.post('/api/customers', {
      data: { customerId: id, name: 'Inline Only Name' },
    });

    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(id);

    // Ang na-create nga row makita sa list ug NULL/empty ang contact number.
    const list = await request.get('/api/customers?limit=200');
    const listBody = await list.json();
    const created = listBody.data.find((c: any) => c.id === id);
    expect(created, 'created customer should appear in list').toBeTruthy();
    expect(created.name).toBe('Inline Only Name');
    expect(created.contactNumber ?? null).toBeNull();
  });

  test('PUT /api/customers/[id] → ang { name } ra mo-ilis sa name, dili mo-wipe sa ubang fields', async ({ request }) => {
    const id = `cust_t${Date.now().toString(36)}r`;
    const created = await request.post('/api/customers', {
      data: {
        customerId: id,
        name: 'Rename Me',
        contactNumber: '0917000222',
        paymentTerms: 'Net 30',
        creditLimit: 5000,
        discount: 10,
        address: 'Cebu City',
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    // Name-only rename.
    const put = await request.put(`/api/customers/${id}`, { data: { name: 'Renamed Inline' } });
    expect(put.ok(), await put.text()).toBeTruthy();

    const list = await request.get('/api/customers?limit=200');
    const row = (await list.json()).data.find((c: any) => c.id === id);
    expect(row.name).toBe('Renamed Inline');
    expect(row.contactNumber).toBe('0917000222');
    expect(row.paymentTerms).toBe('Net 30');
    expect(Number(row.creditLimit)).toBe(5000);
    expect(Number(row.discount)).toBe(10);
    expect(row.address).toBe('Cebu City');
  });

  test('PUT /api/customers/[id] → ang explicit null mo-clear gihapon sa field (backward compat)', async ({ request }) => {
    const id = `cust_t${Date.now().toString(36)}c`;
    const created = await request.post('/api/customers', {
      data: { customerId: id, name: 'Clearable', contactNumber: '0917000333', address: 'Old Address' },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    // Full-payload update nga mo-clear sa address — mao ni ang gibuhat sa Manage dialog.
    const put = await request.put(`/api/customers/${id}`, {
      data: { name: 'Clearable', contactNumber: '0917000333', address: null },
    });
    expect(put.ok(), await put.text()).toBeTruthy();

    const list = await request.get('/api/customers?limit=200');
    const row = (await list.json()).data.find((c: any) => c.id === id);
    expect(row.address ?? null).toBeNull();
    expect(row.contactNumber).toBe('0917000333');
  });
});
