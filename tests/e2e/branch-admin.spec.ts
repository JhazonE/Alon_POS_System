import { test, expect } from '@playwright/test';
import {
  assertHeadOffice,
  BranchResolutionError,
  ALL_BRANCHES_PERMISSION,
} from '../../lib/branch-context';
import {
  seedSecondBranch,
  cleanupSecondBranch,
  grantPermission,
  setUserBranch,
  insertRawSale,
  cleanupRawSales,
} from './helpers/branches';
import { testQuery } from './helpers/db';
import { DEFAULT_ADMIN } from './helpers/auth';

/**
 * Branch administration — pure nga tests sa authorisation helper, walay `page`.
 * Ang Tasks 4-7 mo-append niini nga file.
 */
test.describe('assertHeadOffice', () => {
  test('ang head office (all_branches, walay branch) pasar', async () => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(seeded.userUid, null);
      await expect(assertHeadOffice(seeded.userUid)).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang user nga naay branch UG all_branches pasar gihapon — ang grant ra ang gi-check', async () => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      await expect(assertHeadOffice(seeded.userUid)).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang branch-scoped user nga walay grant gi-reject ug 403', async () => {
    const seeded = await seedSecondBranch();
    try {
      const err = await assertHeadOffice(seeded.userUid).catch((e) => e);
      expect(err).toBeInstanceOf(BranchResolutionError);
      expect(err.status).toBe(403);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang wala-kaila nga uid gi-reject ug 403', async () => {
    const err = await assertHeadOffice('does-not-exist').catch((e) => e);
    expect(err).toBeInstanceOf(BranchResolutionError);
    expect(err.status).toBe(403);
  });

  test('ang empty-string nga uid gi-reject', async () => {
    const err = await assertHeadOffice('').catch((e) => e);
    expect(err).toBeInstanceOf(BranchResolutionError);
    expect(err.status).toBe(403);
  });

  test('ang non-string nga uid (object) gi-reject, dili mo-match ug row', async () => {
    // pool.query mo-escape sa object ingon `key` = value, mao nga ang {branch_id: 0}
    // mahimong match-many predicate. Kinahanglan i-reject sa wala pa ang query.
    // Aduna'y head-office user sa DB aron kung mo-leak ang check, mo-pass kini.
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      for (const bad of [{ branch_id: 0 }, { uid: 1 }, 0, 1, null, undefined, ['x']]) {
        const err = await assertHeadOffice(bad as unknown as string).catch((e) => e);
        expect(err, `uid=${JSON.stringify(bad)}`).toBeInstanceOf(BranchResolutionError);
        expect(err.status).toBe(403);
      }
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });
});

const BIR_FIELDS_BEFORE = {
  business_name: 'Old Biz Inc',
  tin: '111-111-111-000',
  permit_no: 'FP-OLD-001',
  min_number: 'MIN-OLD-001',
  serial_number: 'SN-OLD-001',
};

async function readBranch(branchId: string): Promise<any> {
  const rows = await testQuery('SELECT * FROM branches WHERE id = ?', [branchId]);
  return rows[0];
}

async function auditTableExists(): Promise<boolean> {
  // Ang table kay gi-create nga lazy sa unang write, mao nga posible nga wala pa.
  const exists = await testQuery(
    `SELECT COUNT(*) AS n FROM information_schema.tables
     WHERE table_schema = 'alon_pos_test' AND table_name = 'user_activity_logs'`
  );
  return Number(exists[0].n) > 0;
}

async function auditRows(branchId: string): Promise<any[]> {
  if (!(await auditTableExists())) return [];
  return testQuery(
    'SELECT * FROM user_activity_logs WHERE reference_id = ? ORDER BY created_at, id',
    [branchId]
  );
}

async function cleanupAudit(branchId: string): Promise<void> {
  if (!(await auditTableExists())) return;
  await testQuery('DELETE FROM user_activity_logs WHERE reference_id = ?', [branchId]);
}

async function seedBirIdentity(branchId: string): Promise<void> {
  await testQuery(
    `UPDATE branches SET business_name = ?, tin = ?, permit_no = ?, min_number = ?,
            serial_number = ? WHERE id = ?`,
    [
      BIR_FIELDS_BEFORE.business_name,
      BIR_FIELDS_BEFORE.tin,
      BIR_FIELDS_BEFORE.permit_no,
      BIR_FIELDS_BEFORE.min_number,
      BIR_FIELDS_BEFORE.serial_number,
      branchId,
    ]
  );
}

test.describe('PATCH /api/branches/[id]', () => {
  test('ang head office mo-edit ug molampos', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: {
          uid: DEFAULT_ADMIN.uid,
          name: 'Renamed Branch',
          address: '1 New Street',
          contact_number: '09170000000',
          operated_by: 'Juan Dela Cruz',
        },
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).success).toBe(true);

      const row = await readBranch(seeded.branchId);
      expect(row.name).toBe('Renamed Branch');
      expect(row.address).toBe('1 New Street');
      expect(row.contact_number).toBe('09170000000');
      expect(row.operated_by).toBe('Juan Dela Cruz');
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang branch-scoped user nga walay grant gi-403 UG ang row wala mausab sa DB', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      await seedBirIdentity(seeded.branchId);
      const before = await readBranch(seeded.branchId);

      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: {
          uid: seeded.userUid,
          name: 'Hijacked Name',
          permit_no: 'FP-HIJACKED',
          tin: '999-999-999-999',
        },
      });
      expect(res.status()).toBe(403);

      // Ang status ra kulang: kinahanglan i-verify nga wala gyud na-write.
      const after = await readBranch(seeded.branchId);
      expect(after).toEqual(before);
      expect(after.name).not.toBe('Hijacked Name');
      expect(after.permit_no).toBe(BIR_FIELDS_BEFORE.permit_no);
      expect(await auditRows(seeded.branchId)).toHaveLength(0);
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang request nga walay uid gi-403 ug wala mausab ang row', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      const before = await readBranch(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { name: 'Anonymous Rename' },
      });
      expect(res.status()).toBe(403);
      expect(await readBranch(seeded.branchId)).toEqual(before);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang user nga naay branch UG all_branches grant pwede mo-edit', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      await grantPermission(seeded.userUid, ALL_BRANCHES_PERMISSION);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: seeded.userUid, name: 'Manager Rename' },
      });
      expect(res.status()).toBe(200);
      expect((await readBranch(seeded.branchId)).name).toBe('Manager Rename');
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang code dili mausab — gi-400 ug wala ma-apply bisan ang ubang fields', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      const before = await readBranch(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, code: 'CHANGED', name: 'Should Not Apply' },
      });
      expect(res.status()).toBe(400);

      const after = await readBranch(seeded.branchId);
      expect(after.code).toBe(before.code);
      expect(after).toEqual(before);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang parehas nga code (wala mausab) dili ma-reject', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      const before = await readBranch(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, code: before.code, name: 'Same Code Rename' },
      });
      expect(res.status()).toBe(200);
      const after = await readBranch(seeded.branchId);
      expect(after.code).toBe(before.code);
      expect(after.name).toBe('Same Code Rename');
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang pag-edit sa BIR identity fields mo-sulat ug audit row nga naay old ug new', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      await seedBirIdentity(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: {
          uid: DEFAULT_ADMIN.uid,
          permit_no: 'FP-NEW-002',
          min_number: 'MIN-NEW-002',
          serial_number: 'SN-NEW-002',
          tin: '222-222-222-000',
          business_name: 'New Biz Inc',
        },
      });
      expect(res.status()).toBe(200);

      const rows = await auditRows(seeded.branchId);
      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.module).toBe('BRANCHES');
        expect(row.action).toBe('UPDATE');
        expect(row.user_uid).toBe(DEFAULT_ADMIN.uid);
        expect(row.reference_id).toBe(seeded.branchId);
      }
      const pairs: Array<[string, string, string]> = [
        ['permit_no', BIR_FIELDS_BEFORE.permit_no, 'FP-NEW-002'],
        ['min_number', BIR_FIELDS_BEFORE.min_number, 'MIN-NEW-002'],
        ['serial_number', BIR_FIELDS_BEFORE.serial_number, 'SN-NEW-002'],
        ['tin', BIR_FIELDS_BEFORE.tin, '222-222-222-000'],
        ['business_name', BIR_FIELDS_BEFORE.business_name, 'New Biz Inc'],
      ];
      for (const [field, oldValue, newValue] of pairs) {
        const hit = rows.find((r) => r.description.startsWith(`Changed ${field} of `));
        expect(hit, `audit row for ${field}`).toBeTruthy();
        expect(hit.description).toContain(oldValue);
        expect(hit.description).toContain(newValue);
      }
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang BIR field nga wala mausab (parehas ang value) walay audit row', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      await seedBirIdentity(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: {
          uid: DEFAULT_ADMIN.uid,
          permit_no: BIR_FIELDS_BEFORE.permit_no,
          name: 'Only Name Changed',
        },
      });
      expect(res.status()).toBe(200);
      expect(await auditRows(seeded.branchId)).toHaveLength(0);
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('dili ma-block ang pag-edit sa permit_no bisan naa nay invoice, pero naay audit', async ({ request }) => {
    const seeded = await seedSecondBranch();
    const siNumber = `ED${Date.now().toString().slice(-6)}`;
    try {
      await seedBirIdentity(seeded.branchId);
      await insertRawSale(seeded.branchId, siNumber);

      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, permit_no: 'FP-TYPO-FIXED' },
      });
      expect(res.status()).toBe(200);
      expect((await readBranch(seeded.branchId)).permit_no).toBe('FP-TYPO-FIXED');

      const rows = await auditRows(seeded.branchId);
      expect(rows).toHaveLength(1);
      expect(rows[0].description).toContain(BIR_FIELDS_BEFORE.permit_no);
      expect(rows[0].description).toContain('FP-TYPO-FIXED');
    } finally {
      await cleanupRawSales(siNumber);
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang wala-kaila nga branch id mo-404', async ({ request }) => {
    const res = await request.patch('/api/branches/does-not-exist', {
      data: { uid: DEFAULT_ADMIN.uid, name: 'Ghost' },
    });
    expect(res.status()).toBe(404);
  });

  test('ang is_main ug is_active dili ma-set pinaagi sa PATCH', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      const before = await readBranch(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, name: 'Flags Test', is_main: 1, is_active: 0 },
      });
      expect(res.status()).toBe(200);
      const after = await readBranch(seeded.branchId);
      expect(after.is_main).toBe(before.is_main);
      expect(after.is_active).toBe(before.is_active);
      expect(after.name).toBe('Flags Test');
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });
});

test.describe('POST /api/branches — head office ra', () => {
  test('ang request nga walay uid gi-403 ug walay branch nga na-himo', async ({ request }) => {
    const code = `U${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { code, name: 'Anonymous Branch' },
    });
    expect(res.status()).toBe(403);

    const rows = await testQuery('SELECT id FROM branches WHERE code = ?', [code]);
    expect(rows).toHaveLength(0);
  });

  test('ang branch-scoped user nga walay grant gi-403 ug walay branch ug series row nga na-himo', async ({ request }) => {
    const seeded = await seedSecondBranch();
    const code = `V${Date.now().toString().slice(-6)}`;
    try {
      const seriesBefore = await testQuery('SELECT COUNT(*) AS n FROM branch_number_series');
      const res = await request.post('/api/branches', {
        data: { uid: seeded.userUid, code, name: 'Unauthorised Branch' },
      });
      expect(res.status()).toBe(403);

      expect(await testQuery('SELECT id FROM branches WHERE code = ?', [code])).toHaveLength(0);
      const seriesAfter = await testQuery('SELECT COUNT(*) AS n FROM branch_number_series');
      expect(seriesAfter[0].n).toBe(seriesBefore[0].n);
    } finally {
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang head office mo-himo gihapon ug branch UG series row sa usa ka transaction', async ({ request }) => {
    const code = `W${Date.now().toString().slice(-6)}`;
    const res = await request.post('/api/branches', {
      data: { uid: DEFAULT_ADMIN.uid, code, name: 'Authorised Branch' },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()).data;

    const series = await testQuery(
      'SELECT si_number FROM branch_number_series WHERE branch_id = ?',
      [id]
    );
    expect(series).toHaveLength(1);
    expect(series[0].si_number).toBe('000000');
  });
});
