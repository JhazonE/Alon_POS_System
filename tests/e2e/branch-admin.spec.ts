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
  removeBranchWarehouses,
  readMainBranchId,
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

  test('ang is_main dili ma-set pinaagi sa PATCH (ang is_active naay kaugalingong guard, tan-awa sa ubos)', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      const before = await readBranch(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, name: 'Flags Test', is_main: 1 },
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

/**
 * Task 5 — activate / deactivate nga naay attached-rows guard.
 * Ang matag refusal test mo-verify sa DB (dili status ra): kon ang write
 * nahitabo una sa refusal, ang status-only assertion mopasar gihapon.
 */
test.describe('PATCH /api/branches/[id] — is_active', () => {
  /** Himoong walay attached rows ang seeded branch (walay warehouse/user/terminal). */
  async function emptyOut(seeded: Awaited<ReturnType<typeof seedSecondBranch>>) {
    await removeBranchWarehouses(seeded.branchId);
    await testQuery('DELETE FROM user_permissions WHERE user_uid = ?', [seeded.userUid]);
    await testQuery('DELETE FROM users WHERE uid = ?', [seeded.userUid]);
    await testQuery('DELETE FROM pos_terminals WHERE id = ?', [seeded.terminalId]);
  }

  async function readSeriesRow(branchId: string): Promise<any> {
    const rows = await testQuery('SELECT * FROM branch_number_series WHERE branch_id = ?', [branchId]);
    return rows[0];
  }

  async function restoreMainActive(): Promise<void> {
    await testQuery('UPDATE branches SET is_active = 1 WHERE is_main = 1');
  }

  test('ang branch nga naay warehouse, user ug terminal dili ma-deactivate — gi-name ang counts UG wala mausab ang DB', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      const before = await readBranch(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, is_active: 0 },
      });
      expect(res.status()).toBe(409);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/1 warehouse/);
      expect(body.error).toMatch(/1 user/);
      expect(body.error).toMatch(/1 terminal/);

      const after = await readBranch(seeded.branchId);
      expect(Number(after.is_active)).toBe(1);
      expect(after).toEqual(before);
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  for (const attached of ['warehouse', 'user', 'terminal'] as const) {
    test(`ang usa ra ka active ${attached} igo na aron dili ma-deactivate, ug wala mausab ang is_active`, async ({ request }) => {
      const seeded = await seedSecondBranch();
      try {
        // Tanggala ang duha pa, ibilin ang usa ra.
        if (attached !== 'warehouse') await removeBranchWarehouses(seeded.branchId);
        if (attached !== 'user') {
          await testQuery('DELETE FROM user_permissions WHERE user_uid = ?', [seeded.userUid]);
          await testQuery('DELETE FROM users WHERE uid = ?', [seeded.userUid]);
        }
        if (attached !== 'terminal') {
          await testQuery('DELETE FROM pos_terminals WHERE id = ?', [seeded.terminalId]);
        }

        const res = await request.patch(`/api/branches/${seeded.branchId}`, {
          data: { uid: DEFAULT_ADMIN.uid, is_active: 0 },
        });
        expect(res.status()).toBe(409);
        expect((await res.json()).error).toMatch(new RegExp(`1 ${attached}`));
        expect(Number((await readBranch(seeded.branchId)).is_active)).toBe(1);
      } finally {
        await cleanupAudit(seeded.branchId);
        await cleanupSecondBranch(seeded);
      }
    });
  }

  test('ang inactive nga warehouse, user ug terminal dili blocker — ma-deactivate ang branch', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      await testQuery('UPDATE warehouses SET is_active = 0 WHERE id = ?', [seeded.warehouseId]);
      await testQuery('UPDATE pos_terminals SET is_active = 0 WHERE id = ?', [seeded.terminalId]);
      await testQuery('UPDATE users SET disabled = 1 WHERE uid = ?', [seeded.userUid]);

      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, is_active: 0 },
      });
      expect(res.status()).toBe(200);
      expect(Number((await readBranch(seeded.branchId)).is_active)).toBe(0);
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang main branch dili gyud ma-deactivate, ug wala mausab ang DB', async ({ request }) => {
    const mainId = await readMainBranchId();
    try {
      const before = await readBranch(mainId);
      const res = await request.patch(`/api/branches/${mainId}`, {
        data: { uid: DEFAULT_ADMIN.uid, is_active: 0 },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).error).toMatch(/main branch/i);
      expect(await readBranch(mainId)).toEqual(before);
      expect(Number((await readBranch(mainId)).is_active)).toBe(1);
    } finally {
      await restoreMainActive();
      await cleanupAudit(mainId);
    }
  });

  test('ang empty nga non-main branch ma-deactivate, mo-audit, ug ma-reactivate', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      await emptyOut(seeded);

      const off = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, is_active: 0 },
      });
      expect(off.status()).toBe(200);
      expect(Number((await readBranch(seeded.branchId)).is_active)).toBe(0);

      const audit = await auditRows(seeded.branchId);
      expect(audit).toHaveLength(1);
      expect(audit[0].description).toMatch(/deactivated/i);

      const on = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, is_active: 1 },
      });
      expect(on.status()).toBe(200);
      expect(Number((await readBranch(seeded.branchId)).is_active)).toBe(1);
      expect(await auditRows(seeded.branchId)).toHaveLength(2);
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang pag-deactivate ug reactivate dili mo-usab sa branch_number_series', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      await emptyOut(seeded);
      // I-advance ang counters aron ang pag-reset (000001) dili ma-mask.
      await testQuery(
        "UPDATE branch_number_series SET si_number = '000123', mc_number = '000045', bir_or_number = '000067' WHERE branch_id = ?",
        [seeded.branchId]
      );
      const snapshot = await readSeriesRow(seeded.branchId);
      expect(snapshot.si_number).toBe('000123');

      for (const flag of [0, 1]) {
        const res = await request.patch(`/api/branches/${seeded.branchId}`, {
          data: { uid: DEFAULT_ADMIN.uid, is_active: flag },
        });
        expect(res.status()).toBe(200);
        expect(Number((await readBranch(seeded.branchId)).is_active)).toBe(flag);
        expect(await readSeriesRow(seeded.branchId)).toEqual(snapshot);
      }
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang branch-scoped user nga walay grant dili maka-toggle sa is_active, bisan ang branch empty', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      // Walay attached rows nga mo-block (gawas sa user mismo, nga dili na i-count
      // kay ang auth mo-refuse una): ang auth ra ang rason sa refusal.
      await removeBranchWarehouses(seeded.branchId);
      await testQuery('DELETE FROM pos_terminals WHERE id = ?', [seeded.terminalId]);
      const before = await readBranch(seeded.branchId);

      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: seeded.userUid, is_active: 0 },
      });
      expect(res.status()).toBe(403);
      expect(await readBranch(seeded.branchId)).toEqual(before);
      expect(Number((await readBranch(seeded.branchId)).is_active)).toBe(1);
      expect(await auditRows(seeded.branchId)).toHaveLength(0);

      // Ug ang inactive nga branch dili ma-reactivate sa branch-scoped user.
      await testQuery('UPDATE branches SET is_active = 0 WHERE id = ?', [seeded.branchId]);
      const res2 = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: seeded.userUid, is_active: 1 },
      });
      expect(res2.status()).toBe(403);
      expect(Number((await readBranch(seeded.branchId)).is_active)).toBe(0);
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang crafted nga is_active value gi-400 ug wala mausab ang row', async ({ request }) => {
    const seeded = await seedSecondBranch();
    try {
      await emptyOut(seeded);
      const before = await readBranch(seeded.branchId);
      for (const bad of ['0', 'false', 2, -1, null, { x: 0 }, [0]]) {
        const res = await request.patch(`/api/branches/${seeded.branchId}`, {
          data: { uid: DEFAULT_ADMIN.uid, is_active: bad },
        });
        expect(res.status(), `is_active=${JSON.stringify(bad)}`).toBe(400);
        expect((await res.json()).error).toMatch(/is_active/);
        expect(await readBranch(seeded.branchId)).toEqual(before);
      }
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });

  test('ang refused nga deactivation dili mo-apply sa uban nga fields sa parehas nga request', async ({ request }) => {
    const seeded = await seedSecondBranch(); // naay warehouse nga mo-block
    try {
      const before = await readBranch(seeded.branchId);
      const res = await request.patch(`/api/branches/${seeded.branchId}`, {
        data: { uid: DEFAULT_ADMIN.uid, name: 'Rename Alongside', is_active: 0 },
      });
      expect(res.status()).toBe(409);
      expect(await readBranch(seeded.branchId)).toEqual(before);
    } finally {
      await cleanupAudit(seeded.branchId);
      await cleanupSecondBranch(seeded);
    }
  });
});
