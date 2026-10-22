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

// ---------------------------------------------------------------------------
// Task 6 — POST /api/branches/reassign + branchId sa POST /api/pos-terminals
// ---------------------------------------------------------------------------
import { v4 as uuidv4 } from 'uuid';
import {
  seedSaleOnTerminal,
  cleanupSale,
  readSaleBranch,
  seedProductInWarehouse,
} from './helpers/branches';

const REASSIGN = '/api/branches/reassign';

async function readWarehouseBranch(id: string): Promise<string | null> {
  const rows = await testQuery('SELECT branch_id FROM warehouses WHERE id = ?', [id]);
  return rows[0]?.branch_id ?? null;
}
async function readUserBranch(uid: string): Promise<string | null> {
  const rows = await testQuery('SELECT branch_id FROM users WHERE uid = ?', [uid]);
  return rows[0]?.branch_id ?? null;
}
async function readTerminalBranch(id: string): Promise<string | null> {
  const rows = await testQuery('SELECT branch_id FROM pos_terminals WHERE id = ?', [id]);
  return rows[0]?.branch_id ?? null;
}

/** Snapshot sa (id, branch_id) sa tanan rows, aron mapamatud-an nga walay na-match nga lain. */
async function snapshotAssignments(): Promise<string> {
  const [w, u, t] = await Promise.all([
    testQuery('SELECT id, branch_id FROM warehouses ORDER BY id'),
    testQuery('SELECT uid, branch_id FROM users ORDER BY uid'),
    testQuery('SELECT id, branch_id FROM pos_terminals ORDER BY id'),
  ]);
  return JSON.stringify({ w, u, t });
}

async function countGrants(): Promise<number> {
  const rows = await testQuery(
    'SELECT COUNT(*) AS n FROM user_permissions WHERE permission = ?',
    [ALL_BRANCHES_PERMISSION]
  );
  return Number(rows[0].n);
}

type Kind = 'warehouse' | 'user' | 'terminal';
function idOf(kind: Kind, s: { warehouseId: string; userUid: string; terminalId: string }) {
  return kind === 'warehouse' ? s.warehouseId : kind === 'user' ? s.userUid : s.terminalId;
}
async function readBranchOf(kind: Kind, id: string) {
  return kind === 'warehouse'
    ? readWarehouseBranch(id)
    : kind === 'user'
      ? readUserBranch(id)
      : readTerminalBranch(id);
}

test.describe('POST /api/branches/reassign', () => {
  // Ang route mo-audit sa matag molampos nga move; limpyohan aron dili mo-tapok.
  test.afterEach(async () => {
    if (!(await auditTableExists())) return;
    await testQuery("DELETE FROM user_activity_logs WHERE description LIKE 'Reassigned %'");
  });

  for (const kind of ['warehouse', 'user', 'terminal'] as const) {
    test(`ang branch-scoped user gi-403 sa ${kind} UG wala mausab ang row sa DB`, async ({ request }) => {
      const a = await seedSecondBranch();
      const b = await seedSecondBranch();
      try {
        const id = idOf(kind, b);
        const before = await snapshotAssignments();
        const res = await request.post(REASSIGN, {
          data: { uid: a.userUid, kind, id, branchId: a.branchId },
        });
        expect(res.status()).toBe(403);
        expect(await readBranchOf(kind, id)).toBe(b.branchId);
        expect(await snapshotAssignments()).toBe(before);
      } finally {
        await cleanupSecondBranch(b);
        await cleanupSecondBranch(a);
      }
    });
  }

  test('ang request nga walay uid gi-403 ug wala mausab ang row', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const before = await snapshotAssignments();
      const res = await request.post(REASSIGN, {
        data: { kind: 'terminal', id: b.terminalId, branchId: a.branchId },
      });
      expect(res.status()).toBe(403);
      expect(await snapshotAssignments()).toBe(before);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang head office mo-reassign sa user ngadto sa laing branch', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const res = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'user', id: b.userUid, branchId: a.branchId },
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(await readUserBranch(b.userUid)).toBe(a.branchId);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang user nga walay branch (branch_id NULL) gi-reject, wala mausab ang row', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const before = await snapshotAssignments();
      for (const bad of [null, '', undefined]) {
        const res = await request.post(REASSIGN, {
          data: { uid: DEFAULT_ADMIN.uid, kind: 'user', id: a.userUid, branchId: bad },
        });
        expect(res.status(), `branchId=${JSON.stringify(bad)}`).toBe(400);
        expect(await readUserBranch(a.userUid)).toBe(a.branchId);
      }
      expect(await snapshotAssignments()).toBe(before);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('ang pag-reassign sa user dili mo-usab sa grants, busa ang last-administrator invariant dili ma-guba', async ({ request }) => {
    // Ang reassignment mo-usab ra sa users.branch_id. assertHeadOffice mo-basa
    // sa grant ra (dili sa branch), busa ang pag-move sa admin padulong sa branch
    // dili makapakunhod sa numero sa all_branches holders: walay guard nga
    // makalihok, ug dili ma-lockout ang branch page.
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      await grantPermission(b.userUid, ALL_BRANCHES_PERMISSION);
      await setUserBranch(b.userUid, null);
      const grantsBefore = await countGrants();
      const res = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'user', id: b.userUid, branchId: a.branchId },
      });
      expect(res.status()).toBe(200);
      expect(await readUserBranch(b.userUid)).toBe(a.branchId);
      expect(await countGrants()).toBe(grantsBefore);
      await expect(assertHeadOffice(b.userUid)).resolves.toBeUndefined();
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang warehouse nga naay pending approval gi-409 nga naghisgot sa count, wala mausab ang row', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const queueId = uuidv4();
    try {
      // Ang STOCK_ADJUSTMENT approval mo-dala ra sa productId, dili sa warehouse id.
      const productId = await seedProductInWarehouse(b.warehouseId, `RA-${Date.now()}`);
      await testQuery(
        `INSERT INTO approval_queue (id, transaction_type, transaction_data, created_by, status)
         VALUES (?, 'STOCK_ADJUSTMENT', ?, ?, 'Pending')`,
        [queueId, JSON.stringify({ productId, quantity: 1, reason: 'test' }), b.userUid]
      );
      const res = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'warehouse', id: b.warehouseId, branchId: a.branchId },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).error).toMatch(/1 pending approval/);
      expect(await readWarehouseBranch(b.warehouseId)).toBe(b.branchId);
      const prod = await testQuery('SELECT warehouse_id FROM products WHERE id = ?', [productId]);
      expect(prod[0].warehouse_id).toBe(b.warehouseId);

      // Control: kung ma-approve na, mo-lusot ang parehas nga move.
      await testQuery("UPDATE approval_queue SET status = 'Approved' WHERE id = ?", [queueId]);
      const ok = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'warehouse', id: b.warehouseId, branchId: a.branchId },
      });
      expect(ok.status()).toBe(200);
      expect(await readWarehouseBranch(b.warehouseId)).toBe(a.branchId);
    } finally {
      await testQuery('DELETE FROM approval_queue WHERE id = ?', [queueId]);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang warehouse nga naay active shift sa iyang branch gi-409 nga naghisgot sa count', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const shiftId = uuidv4();
    try {
      await testQuery(
        `INSERT INTO shifts (id, user_id, terminal_id, status) VALUES (?, ?, ?, 'active')`,
        [shiftId, b.userUid, b.terminalId]
      );
      const res = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'warehouse', id: b.warehouseId, branchId: a.branchId },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).error).toMatch(/1 open shift/);
      expect(await readWarehouseBranch(b.warehouseId)).toBe(b.branchId);
    } finally {
      await testQuery('DELETE FROM shifts WHERE id = ?', [shiftId]);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang warehouse nga naay open sales order gi-409 nga naghisgot sa count', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    const orderId = uuidv4();
    try {
      await testQuery(
        `INSERT INTO sales_orders (id, order_date, total, warehouse_id, status)
         VALUES (?, CURDATE(), 10.00, ?, 'Pending')`,
        [orderId, b.warehouseId]
      );
      const res = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'warehouse', id: b.warehouseId, branchId: a.branchId },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).error).toMatch(/1 open order/);
      expect(await readWarehouseBranch(b.warehouseId)).toBe(b.branchId);
    } finally {
      await testQuery('DELETE FROM sales_orders WHERE id = ?', [orderId]);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  test('ang main branch dili makuha sa iyang katapusan nga active warehouse', async ({ request }) => {
    const b = await seedSecondBranch();
    const mainId = await readMainBranchId();
    const lastId = `wh-last-${uuidv4().slice(0, 8)}`;
    let deactivated: string[] = [];
    try {
      await testQuery(
        'INSERT INTO warehouses (id, name, is_active, branch_id) VALUES (?, ?, 1, ?)',
        [lastId, `Last WH ${lastId}`, mainId]
      );
      const others = (await testQuery(
        'SELECT id FROM warehouses WHERE branch_id = ? AND id <> ? AND (is_active IS NULL OR is_active <> 0)',
        [mainId, lastId]
      )) as any[];
      deactivated = others.map((r) => r.id);
      for (const id of deactivated) {
        await testQuery('UPDATE warehouses SET is_active = 0 WHERE id = ?', [id]);
      }

      const res = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'warehouse', id: lastId, branchId: b.branchId },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).error).toMatch(/last warehouse/i);
      expect(await readWarehouseBranch(lastId)).toBe(mainId);

      // Control: kung naay lain nga active nga warehouse ang main, dili na kini
      // ang rason sa refusal.
      for (const id of deactivated) {
        await testQuery('UPDATE warehouses SET is_active = 1 WHERE id = ?', [id]);
      }
      deactivated = [];
      const ok = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'warehouse', id: lastId, branchId: b.branchId },
      });
      expect(JSON.stringify(await ok.json())).not.toMatch(/last warehouse/i);
    } finally {
      for (const id of deactivated) {
        await testQuery('UPDATE warehouses SET is_active = 1 WHERE id = ?', [id]);
      }
      await testQuery('DELETE FROM warehouses WHERE id = ?', [lastId]);
      await cleanupSecondBranch(b);
    }
  });

  test('ang terminal mo-move ug makahimo na ug Z-reading sa bag-ong branch, ug ang past sale nagpabilin sa daan', async ({ request }) => {
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    let saleId: string | null = null;
    try {
      saleId = await seedSaleOnTerminal(a.terminalId, a.userUid);
      expect(await readSaleBranch(saleId)).toBe(a.branchId);

      // Sa wala pa ang move, ang user sa branch b dili makahimo Z-reading sa terminal sa a.
      const refused = await request.post('/api/sales/z-reading', {
        data: { uid: b.userUid, terminalId: a.terminalId, cashierName: 'Test' },
      });
      expect(refused.status()).toBe(403);

      const move = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'terminal', id: a.terminalId, branchId: b.branchId },
      });
      expect(move.status()).toBe(200);
      expect(await readTerminalBranch(a.terminalId)).toBe(b.branchId);

      // Karon ang user sa b makahimo na ug Z-reading sa gi-move nga terminal...
      const z = await request.post('/api/sales/z-reading', {
        data: { uid: b.userUid, terminalId: a.terminalId, cashierName: 'Test' },
      });
      expect(z.status(), await z.text()).toBe(200);
      expect((await z.json()).success).toBe(true);
      // ...ug ang user sa daan nga branch dili na.
      const stale = await request.post('/api/sales/z-reading', {
        data: { uid: a.userUid, terminalId: a.terminalId, cashierName: 'Test' },
      });
      expect(stale.status()).toBe(403);

      // Ang past sale nagpabilin sa BIR establishment nga nag-issue niini.
      expect(await readSaleBranch(saleId)).toBe(a.branchId);
    } finally {
      if (saleId) await cleanupSale(saleId);
      await testQuery('DELETE FROM z_readings WHERE terminal_id = ?', [a.terminalId]);
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });

  for (const kind of ['warehouse', 'user', 'terminal'] as const) {
    test(`ang pag-reassign sa ${kind} padulong sa inactive nga branch gi-409, wala mausab ang row`, async ({ request }) => {
      const src = await seedSecondBranch();
      const inactive = await seedSecondBranch({ branchActive: false });
      try {
        const id = idOf(kind, src);
        const before = await snapshotAssignments();
        const res = await request.post(REASSIGN, {
          data: { uid: DEFAULT_ADMIN.uid, kind, id, branchId: inactive.branchId },
        });
        expect(res.status()).toBe(409);
        expect((await res.json()).error).toMatch(/inactive/i);
        expect(await readBranchOf(kind, id)).toBe(src.branchId);
        expect(await snapshotAssignments()).toBe(before);
      } finally {
        await cleanupSecondBranch(inactive);
        await cleanupSecondBranch(src);
      }
    });

    test(`ang pag-reassign sa ${kind} padulong sa branch nga wala gyud gi-404, wala mausab ang row`, async ({ request }) => {
      const src = await seedSecondBranch();
      try {
        const id = idOf(kind, src);
        const before = await snapshotAssignments();
        const res = await request.post(REASSIGN, {
          data: { uid: DEFAULT_ADMIN.uid, kind, id, branchId: 'no-such-branch' },
        });
        expect(res.status()).toBe(404);
        expect(await snapshotAssignments()).toBe(before);
      } finally {
        await cleanupSecondBranch(src);
      }
    });
  }

  test('ang wala-kaila nga kind gi-400 ug ang wala-kaila nga id gi-404, wala mausab', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const before = await snapshotAssignments();
      const badKind = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'branch', id: a.warehouseId, branchId: a.branchId },
      });
      expect(badKind.status()).toBe(400);
      const missing = await request.post(REASSIGN, {
        data: { uid: DEFAULT_ADMIN.uid, kind: 'terminal', id: 'no-such-terminal', branchId: a.branchId },
      });
      expect(missing.status()).toBe(404);
      expect(await snapshotAssignments()).toBe(before);
    } finally {
      await cleanupSecondBranch(a);
    }
  });

  test('ang non-string (object) nga id/branchId/uid gi-reject, dili mo-match ug row', async ({ request }) => {
    // pool.query mo-escape sa object ingon `key` = value: {branch_id: 0} mahimong
    // match-many predicate. Kinahanglan i-reject sa wala pa ang query.
    const a = await seedSecondBranch();
    const b = await seedSecondBranch();
    try {
      const before = await snapshotAssignments();
      const grantsBefore = await countGrants();
      const evil: unknown[] = [{ branch_id: 0 }, { uid: 1 }, { id: 0 }, 0, 1, true, ['x'], ['a', 'b']];
      for (const kind of ['warehouse', 'user', 'terminal'] as const) {
        for (const bad of evil) {
          const badId = await request.post(REASSIGN, {
            data: { uid: DEFAULT_ADMIN.uid, kind, id: bad, branchId: a.branchId },
          });
          expect(badId.status(), `${kind} id=${JSON.stringify(bad)}`).toBe(400);
          const badBranch = await request.post(REASSIGN, {
            data: { uid: DEFAULT_ADMIN.uid, kind, id: idOf(kind, b), branchId: bad },
          });
          expect(badBranch.status(), `${kind} branchId=${JSON.stringify(bad)}`).toBe(400);
        }
      }
      for (const bad of evil) {
        const badUid = await request.post(REASSIGN, {
          data: { uid: bad, kind: 'user', id: b.userUid, branchId: a.branchId },
        });
        expect(badUid.status(), `uid=${JSON.stringify(bad)}`).toBe(403);
      }
      expect(await snapshotAssignments()).toBe(before);
      expect(await countGrants()).toBe(grantsBefore);
    } finally {
      await cleanupSecondBranch(b);
      await cleanupSecondBranch(a);
    }
  });
});

test.describe('POST /api/pos-terminals — branchId', () => {
  async function task6TerminalIds(): Promise<string[]> {
    const rows = (await testQuery(
      "SELECT id FROM pos_terminals WHERE name LIKE 'Task6 Term %'"
    )) as any[];
    return rows.map((r) => r.id);
  }
  async function dropTask6Terminals() {
    await testQuery("DELETE FROM pos_terminals WHERE name LIKE 'Task6 Term %'");
  }

  test('ang branchId nga gi-supply mo-assign sa bag-ong terminal ngadto sa maong branch', async ({ request }) => {
    const a = await seedSecondBranch();
    try {
      const res = await request.post('/api/pos-terminals', {
        data: { uid: DEFAULT_ADMIN.uid, branchId: a.branchId, terminalDescription: `Task6 Term ${Date.now()}` },
      });
      expect(res.status(), await res.text()).toBe(200);
      const id = (await res.json()).data.id;
      expect(await readTerminalBranch(id)).toBe(a.branchId);
    } finally {
      await dropTask6Terminals();
      await cleanupSecondBranch(a);
    }
  });

  test('kung walay branchId, mo-default gihapon sa main branch (existing callers wala maguba)', async ({ request }) => {
    try {
      const res = await request.post('/api/pos-terminals', {
        data: { terminalDescription: `Task6 Term ${Date.now()}` },
      });
      expect(res.status(), await res.text()).toBe(200);
      const id = (await res.json()).data.id;
      expect(await readTerminalBranch(id)).toBe(await readMainBranchId());
    } finally {
      await dropTask6Terminals();
    }
  });

  test('ang branchId gi-refuse kung dili head office ang caller, o inactive/wala ang branch, ug walay terminal nga nahimo', async ({ request }) => {
    const a = await seedSecondBranch();
    const inactive = await seedSecondBranch({ branchActive: false });
    try {
      const noAuth = await request.post('/api/pos-terminals', {
        data: { uid: a.userUid, branchId: a.branchId, terminalDescription: `Task6 Term ${Date.now()}` },
      });
      expect(noAuth.status()).toBe(403);
      const inactiveRes = await request.post('/api/pos-terminals', {
        data: { uid: DEFAULT_ADMIN.uid, branchId: inactive.branchId, terminalDescription: `Task6 Term ${Date.now()}` },
      });
      expect(inactiveRes.status()).toBe(409);
      const missing = await request.post('/api/pos-terminals', {
        data: { uid: DEFAULT_ADMIN.uid, branchId: 'no-such-branch', terminalDescription: `Task6 Term ${Date.now()}` },
      });
      expect(missing.status()).toBe(404);
      const objectId = await request.post('/api/pos-terminals', {
        data: { uid: DEFAULT_ADMIN.uid, branchId: { id: 0 }, terminalDescription: `Task6 Term ${Date.now()}` },
      });
      expect(objectId.status()).toBe(400);
      expect(await task6TerminalIds()).toHaveLength(0);
    } finally {
      await dropTask6Terminals();
      await cleanupSecondBranch(inactive);
      await cleanupSecondBranch(a);
    }
  });
});
