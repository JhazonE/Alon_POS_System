import { test, expect } from './helpers/authed-test';

/**
 * Supplier write-API behavior nga gikinahanglan sa inline add/rename.
 */

test.describe('Supplier inline write API', () => {
  test('POST + PUT { name } ra → mo-rename nga dili mo-wipe sa ubang fields', async ({ request }) => {
    const id = `sup_t${Date.now().toString(36)}`;
    const created = await request.post('/api/suppliers', {
      data: {
        id,
        name: 'Inline Supplier',
        contactNumber: '0917111222',
        email: 'sup@example.com',
        address: 'Mandaue',
        paymentTerms: 'Net 15',
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    // Ang POST route walay telephone/company/tin/markup — i-set nato via full PUT
    // aron matestingan nga ang name-only PUT dili mo-wipe niini.
    const seed = await request.put(`/api/suppliers/${id}`, {
      data: { telephone: '032-1234', company: 'Inline Trading', tin: '123-456-789', markupPercentage: 15 },
    });
    expect(seed.ok(), await seed.text()).toBeTruthy();

    // Name-only rename — kini ang gipadala sa InlineSupplierSelect.
    const put = await request.put(`/api/suppliers/${id}`, { data: { name: 'Inline Supplier R' } });
    expect(put.ok(), await put.text()).toBeTruthy();

    const get = await request.get(`/api/suppliers/${id}`);
    expect(get.ok()).toBeTruthy();
    const row = (await get.json()).data;

    expect(row.name).toBe('Inline Supplier R');
    expect(row.contactNumber).toBe('0917111222');
    expect(row.email).toBe('sup@example.com');
    expect(row.address).toBe('Mandaue');
    expect(row.paymentTerms).toBe('Net 15');
    expect(row.telephone).toBe('032-1234');
    expect(row.company).toBe('Inline Trading');
    expect(row.tin).toBe('123-456-789');
    expect(Number(row.markupPercentage)).toBe(15);
  });
});
